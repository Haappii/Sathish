from fastapi import APIRouter, Depends, HTTPException, Header, UploadFile, File
from sqlalchemy.orm import Session
from app.db import get_db
from app.utils.auth_user import get_current_user
from app.models.branch import Branch
from app.models.shop_details import ShopDetails
from app.models.system_parameters import SystemParameter
from app.schemas.shop import ShopDetailsBase, ShopDetailsResponse
from app.utils.head_office import get_head_office_branch
from app.utils.shop_logo import SHOP_LOGOS_DIR, build_logo_filename, save_shop_logo_file

router = APIRouter(prefix="/shop", tags=["Shop"])

BOOL_PARAM_KEYS = {
    "inventory_enabled",
    "items_branch_wise",
}
INT_PARAM_KEYS: set = set()
TEXT_PARAM_KEYS = {
    "inventory_cost_method",
}
SHOP_PARAM_KEYS = BOOL_PARAM_KEYS | INT_PARAM_KEYS | TEXT_PARAM_KEYS


def require_super_admin(role: str | None):
    role_l = (role or "").strip().lower()
    if role_l not in {"admin", "super admin"}:
        raise HTTPException(403, "Only Admin can modify protected shop settings")


def _get_param(db: Session, shop_id: int, key: str):
    return (
        db.query(SystemParameter)
        .filter(SystemParameter.shop_id == shop_id, SystemParameter.param_key == key)
        .first()
    )


def _set_param(db: Session, shop_id: int, key: str, value: str):
    row = _get_param(db, shop_id, key)
    if not row:
        row = SystemParameter(shop_id=shop_id, param_key=key)
    row.param_value = value
    db.add(row)


@router.get("/details")
def get_shop_details(
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):

    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == user.shop_id).first()
    shop_data = {}
    if shop:
        for column in ShopDetails.__table__.columns:
            shop_data[column.name] = getattr(shop, column.name)

    params = (
        db.query(SystemParameter)
        .filter(
            SystemParameter.shop_id == user.shop_id,
            SystemParameter.param_key.in_(list(SHOP_PARAM_KEYS)),
        )
        .all()
    )
    pmap = {str(r.param_key): (r.param_value or "") for r in params}
    head_office_branch = get_head_office_branch(db, shop_id=user.shop_id, shop=shop)

    return {
        **shop_data,
        "head_office_branch_id": int(head_office_branch.branch_id) if head_office_branch else None,
        "head_office_branch_name": head_office_branch.branch_name if head_office_branch else None,
        "inventory_enabled":   str(pmap.get("inventory_enabled",   "NO")).upper() == "YES",
        "inventory_cost_method": (pmap.get("inventory_cost_method") or "LAST").strip().upper(),
        "items_branch_wise":   str(pmap.get("items_branch_wise",   "NO")).upper() == "YES",
    }


@router.post("/", response_model=ShopDetailsResponse)
def save_shop_details(
    data: ShopDetailsBase,
    db: Session = Depends(get_db),
    x_user_role: str | None = Header(None),
    user=Depends(get_current_user)
):
    # Ensure core roles exist for this installation (idempotent).
    # This keeps role dropdowns consistent for newly provisioned shops.
    try:
        from app.services.role_service import ensure_core_roles

        ensure_core_roles(db)
    except Exception:
        # Never block shop updates due to role seeding issues.
        pass

    payload = data.dict(exclude_unset=True)
    shop_payload = {k: v for k, v in payload.items() if k not in SHOP_PARAM_KEYS}

    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == user.shop_id).first() or ShopDetails(shop_id=user.shop_id)

    prev_shop_name = shop.shop_name
    prev_billing_type = (getattr(shop, "billing_type", None) or "").strip().lower()

    # Business type (billing_type) is immutable after it is first set.
    # Allow setting it only when it's empty/null in DB.
    if "billing_type" in shop_payload:
        incoming = (shop_payload.get("billing_type") or "").strip().lower()
        if incoming == "":
            shop_payload.pop("billing_type", None)
        elif prev_billing_type and incoming != prev_billing_type:
            raise HTTPException(400, "Business type cannot be changed after creation")
        elif prev_billing_type and incoming == prev_billing_type:
            # Ignore no-op updates (frontend should not send billing_type on edit).
            shop_payload.pop("billing_type", None)

    if "head_office_branch_id" in shop_payload:
        require_super_admin(getattr(user, "role_name", None) or x_user_role)
        raw_branch_id = shop_payload.get("head_office_branch_id")
        if raw_branch_id in ("", None, 0, "0"):
            shop_payload["head_office_branch_id"] = None
        else:
            try:
                head_office_branch_id = int(raw_branch_id)
            except (TypeError, ValueError):
                raise HTTPException(400, "Invalid head office branch")

            branch = (
                db.query(Branch)
                .filter(
                    Branch.shop_id == user.shop_id,
                    Branch.branch_id == head_office_branch_id,
                )
                .first()
            )
            if not branch:
                raise HTTPException(400, "Selected head office branch not found")
            if str(branch.status or "ACTIVE").upper() != "ACTIVE":
                raise HTTPException(400, "Head office branch must be active")
            shop_payload["head_office_branch_id"] = head_office_branch_id

    for k, v in shop_payload.items():
        setattr(shop, k, v)

    db.add(shop)

    # Keep logo filename aligned with shop_name changes
    if prev_shop_name and shop.shop_name and prev_shop_name.strip() != shop.shop_name.strip():
        try:
            SHOP_LOGOS_DIR.mkdir(parents=True, exist_ok=True)
            new_filename = build_logo_filename(shop.shop_name, shop.shop_id)
            new_path = SHOP_LOGOS_DIR / new_filename

            if not new_path.exists():
                existing = next(SHOP_LOGOS_DIR.glob(f"logo_*_{shop.shop_id}.png"), None)
                if existing and existing.exists():
                    existing.rename(new_path)

            if new_path.exists():
                shop.logo_url = new_filename
        except Exception:
            pass

    # handle shop-level param flags (inventory_enabled, inventory_cost_method)
    if any(k in payload for k in SHOP_PARAM_KEYS):
        require_super_admin(x_user_role)
        for key in SHOP_PARAM_KEYS:
            if key not in payload:
                continue
            value = payload.get(key)
            if key in BOOL_PARAM_KEYS:
                _set_param(db, user.shop_id, key, "YES" if bool(value) else "NO")
            else:
                _set_param(db, user.shop_id, key, str(value or "").strip())

    db.commit()
    db.refresh(shop)
    return shop


@router.post("/logo")
def upload_shop_logo(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    shop = (
        db.query(ShopDetails)
        .filter(ShopDetails.shop_id == user.shop_id)
        .first()
        or ShopDetails(shop_id=user.shop_id)
    )

    filename = save_shop_logo_file(
        shop_id=user.shop_id,
        shop_name=shop.shop_name,
        file=file
    )

    shop.logo_url = filename
    db.add(shop)
    db.commit()
    db.refresh(shop)

    return {
        "message": "Logo uploaded",
        "shop_id": shop.shop_id,
        "logo_url": shop.logo_url
    }
