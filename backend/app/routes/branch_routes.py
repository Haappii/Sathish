from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.db import SessionLocal
from app.models.branch import Branch
from app.models.system_parameters import SystemParameter
from app.schemas.branch_schema import BranchCreate, BranchUpdate, BranchOut
from app.services.branch_service import (
    get_all_branches,
    get_active_branches,
    create_branch,
    update_branch,
    set_branch_status
)
from app.utils.auth_user import get_current_user, AdminOnly
from app.services.audit_service import log_action


router = APIRouter(prefix="/branch", tags=["Branch"])


def _discount_param_keys(branch_id: int) -> dict[str, str]:
    return {
        "enabled": f"branch:{branch_id}:default_discount_enabled",
        "type": f"branch:{branch_id}:default_discount_type",
        "value": f"branch:{branch_id}:default_discount_value",
    }


def _print_param_keys(branch_id: int) -> dict[str, str]:
    return {
        "kot_required": f"branch:{branch_id}:kot_required",
        "receipt_required": f"branch:{branch_id}:receipt_required",
    }


def _normalize_discount_type(raw: str | None) -> str:
    t = str(raw or "").strip().lower()
    if t in {"percent", "percentage", "%", "pct"}:
        return "percent"
    return "flat"


def _read_branch_discount_from_params(pmap: dict[str, str], branch_id: int) -> dict:
    keys = _discount_param_keys(branch_id)
    enabled = str(pmap.get(keys["enabled"], "NO") or "NO").strip().upper() == "YES"
    dtype = _normalize_discount_type(pmap.get(keys["type"], "flat"))
    try:
        dval = float(pmap.get(keys["value"], "0") or 0)
    except Exception:
        dval = 0.0
    if dval < 0:
        dval = 0.0
    return {
        "discount_enabled": bool(enabled),
        "discount_type": dtype,
        "discount_value": float(dval),
    }


def _read_branch_print_from_params(pmap: dict[str, str], branch_id: int) -> dict:
    keys = _print_param_keys(branch_id)

    # Default YES when missing.
    kot = str(pmap.get(keys["kot_required"], "YES") or "YES").strip().upper() == "YES"
    receipt = str(pmap.get(keys["receipt_required"], "YES") or "YES").strip().upper() == "YES"
    return {
        "kot_required": bool(kot),
        "receipt_required": bool(receipt),
    }


def _upsert_param(db: Session, *, shop_id: int, key: str, value: str):
    row = (
        db.query(SystemParameter)
        .filter(SystemParameter.shop_id == shop_id, SystemParameter.param_key == key)
        .first()
    )
    if not row:
        row = SystemParameter(shop_id=shop_id, param_key=key, param_value=value)
    else:
        row.param_value = value
    db.add(row)


def _save_branch_discount(db: Session, *, shop_id: int, branch_id: int, payload: BranchCreate | BranchUpdate):
    # Persist only when any of these fields are explicitly present in the payload.
    has_any = any(
        getattr(payload, k, None) is not None for k in ("discount_enabled", "discount_type", "discount_value")
    )
    if not has_any:
        return

    enabled = bool(getattr(payload, "discount_enabled", False))
    dtype = _normalize_discount_type(getattr(payload, "discount_type", "flat"))
    try:
        dval = float(getattr(payload, "discount_value", 0) or 0)
    except Exception:
        dval = 0.0
    if dval < 0:
        dval = 0.0

    keys = _discount_param_keys(branch_id)
    _upsert_param(db, shop_id=shop_id, key=keys["enabled"], value=("YES" if enabled else "NO"))
    _upsert_param(db, shop_id=shop_id, key=keys["type"], value=dtype.upper())
    _upsert_param(db, shop_id=shop_id, key=keys["value"], value=str(dval))
    db.commit()


def _save_branch_print_settings(db: Session, *, shop_id: int, branch_id: int, payload: BranchCreate | BranchUpdate):
    has_any = any(getattr(payload, k, None) is not None for k in ("kot_required", "receipt_required"))
    if not has_any:
        return

    kot_required = bool(getattr(payload, "kot_required", True))
    receipt_required = bool(getattr(payload, "receipt_required", True))

    keys = _print_param_keys(branch_id)
    _upsert_param(db, shop_id=shop_id, key=keys["kot_required"], value=("YES" if kot_required else "NO"))
    _upsert_param(db, shop_id=shop_id, key=keys["receipt_required"], value=("YES" if receipt_required else "NO"))
    db.commit()


def _load_branch_params(db: Session, *, shop_id: int, branch_ids: list[int]) -> dict[str, str]:
    if not branch_ids:
        return {}

    # Fetch only relevant discount keys for the given branches.
    ors = []
    for bid in branch_ids:
        keys = _discount_param_keys(bid)
        ors.extend([
            SystemParameter.param_key == keys["enabled"],
            SystemParameter.param_key == keys["type"],
            SystemParameter.param_key == keys["value"],
        ])
        pkeys = _print_param_keys(bid)
        ors.extend([
            SystemParameter.param_key == pkeys["kot_required"],
            SystemParameter.param_key == pkeys["receipt_required"],
        ])

    rows = (
        db.query(SystemParameter.param_key, SystemParameter.param_value)
        .filter(SystemParameter.shop_id == shop_id)
        .filter(or_(*ors))
        .all()
    )
    return {str(k): (str(v) if v is not None else "") for k, v in rows}


def _branch_out_with_discount(branch, pmap: dict[str, str]) -> dict:
    out = BranchOut.from_orm(branch).dict()
    out.update(_read_branch_discount_from_params(pmap, int(branch.branch_id)))
    out.update(_read_branch_print_from_params(pmap, int(branch.branch_id)))
    return out


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# =========================================================
# 🔹 ADMIN — List all branches
# =========================================================
@router.get("/list", response_model=list[BranchOut], dependencies=[Depends(AdminOnly)])
def list_branches(db: Session = Depends(get_db), user=Depends(get_current_user)):
    branches = get_all_branches(db, user.shop_id)
    pmap = _load_branch_params(db, shop_id=user.shop_id, branch_ids=[int(b.branch_id) for b in branches])
    return [_branch_out_with_discount(b, pmap) for b in branches]


# =========================================================
# 🔹 Public — Only ACTIVE branches (for dropdowns)
# =========================================================
@router.get("/active", response_model=list[BranchOut])
def active_branches(db: Session = Depends(get_db), user=Depends(get_current_user)):
    branches = get_active_branches(db, user.shop_id)
    pmap = _load_branch_params(db, shop_id=user.shop_id, branch_ids=[int(b.branch_id) for b in branches])
    return [_branch_out_with_discount(b, pmap) for b in branches]


# =========================================================
# 🔹 NEW — Get single branch (Footer address & details)
# =========================================================
@router.get("/{branch_id}", response_model=BranchOut)
def get_branch(branch_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):

    branch = (
        db.query(Branch)
        .filter(Branch.branch_id == branch_id, Branch.shop_id == user.shop_id)
        .first()
    )

    if not branch:
        raise HTTPException(404, "Branch not found")

    pmap = _load_branch_params(db, shop_id=user.shop_id, branch_ids=[int(branch.branch_id)])
    return _branch_out_with_discount(branch, pmap)


# =========================================================
# 🔹 Create Branch (Admin Only)
# =========================================================
@router.post("/create", response_model=BranchOut, dependencies=[Depends(AdminOnly)])
def create(
    data: BranchCreate,
    db: Session = Depends(get_db),
    user = Depends(get_current_user)
):
    branch = create_branch(db, data, user.user_id, user.shop_id)
    _save_branch_discount(db, shop_id=user.shop_id, branch_id=int(branch.branch_id), payload=data)
    _save_branch_print_settings(db, shop_id=user.shop_id, branch_id=int(branch.branch_id), payload=data)

    log_action(
        db,
        shop_id=user.shop_id,
        module="Branch",
        action="CREATE",
        record_id=branch.branch_id,
        new={
            "branch_name": branch.branch_name,
            "type": branch.type,
            "status": branch.status,
        },
        user_id=user.user_id,
    )

    pmap = _load_branch_params(db, shop_id=user.shop_id, branch_ids=[int(branch.branch_id)])
    return _branch_out_with_discount(branch, pmap)


# =========================================================
# 🔹 Update Branch (Admin Only)
# =========================================================
@router.put("/{branch_id}", response_model=BranchOut, dependencies=[Depends(AdminOnly)])
def update(branch_id: int, data: BranchUpdate,
           db: Session = Depends(get_db),
           user=Depends(get_current_user)):

    existing = (
        db.query(Branch)
        .filter(Branch.branch_id == branch_id, Branch.shop_id == user.shop_id)
        .first()
    )
    if not existing:
        raise HTTPException(404, "Branch not found")

    old = {
        "branch_name": existing.branch_name,
        "type": existing.type,
        "status": existing.status,
    }

    branch = update_branch(db, user.shop_id, branch_id, data)
    if not branch:
        raise HTTPException(404, "Branch not found")

    _save_branch_discount(db, shop_id=user.shop_id, branch_id=int(branch.branch_id), payload=data)
    _save_branch_print_settings(db, shop_id=user.shop_id, branch_id=int(branch.branch_id), payload=data)

    log_action(
        db,
        shop_id=user.shop_id,
        module="Branch",
        action="UPDATE",
        record_id=branch.branch_id,
        old=old,
        new={
            "branch_name": branch.branch_name,
            "type": branch.type,
            "status": branch.status,
        },
        user_id=user.user_id,
    )

    pmap = _load_branch_params(db, shop_id=user.shop_id, branch_ids=[int(branch.branch_id)])
    return _branch_out_with_discount(branch, pmap)


# =========================================================
# 🔹 Change Branch Status (Activate / Deactivate)
# =========================================================
@router.post("/{branch_id}/status", dependencies=[Depends(AdminOnly)])
def change_status(branch_id: int, status: str,
                  db: Session = Depends(get_db),
                  user=Depends(get_current_user)):

    existing = (
        db.query(Branch)
        .filter(Branch.branch_id == branch_id, Branch.shop_id == user.shop_id)
        .first()
    )
    if not existing:
        raise HTTPException(404, "Branch not found")

    old_status = existing.status

    branch = set_branch_status(db, user.shop_id, branch_id, status)
    if not branch:
        raise HTTPException(404, "Branch not found")

    log_action(
        db,
        shop_id=user.shop_id,
        module="Branch",
        action="STATUS",
        record_id=branch.branch_id,
        old={"status": old_status},
        new={"status": branch.status},
        user_id=user.user_id,
    )

    return {"message": "Updated", "status": status}
