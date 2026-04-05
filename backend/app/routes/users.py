from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.db import get_db
from app.models.branch import Branch
from app.models.roles import Role
from app.models.users import User
from app.models.bulk_import_log import BulkImportLog
from app.schemas.users import UserCreate, UserUpdate, UserResponse
from app.utils.passwords import encode_password
from app.services.audit_service import log_action
from app.utils.permissions import require_permission


class UserBulkRow(BaseModel):
    user_name: str
    full_name: Optional[str] = None
    password: Optional[str] = None
    role_name: str
    branch_name: Optional[str] = None


class UserBulkImport(BaseModel):
    filename: Optional[str] = ""
    rows: list[UserBulkRow]

router = APIRouter(prefix="/users", tags=["Users"])


def _role_lower(user) -> str:
    return str(getattr(user, "role_name", "") or "").strip().lower()


def _is_admin(user) -> bool:
    return _role_lower(user) == "admin"


# ------------------------------------------------
# LIST USERS (USED BY REPORTS PAGE)
# ------------------------------------------------
@router.get("/", response_model=list[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("users", "read")),
):
    q = (
        db.query(User)
        .filter(User.status == True, User.shop_id == current_user.shop_id)  # noqa: E712
        .order_by(User.user_name)
    )

    # Managers can only see users in their own branch.
    if not _is_admin(current_user) and getattr(current_user, "branch_id", None):
        q = q.filter(User.branch_id == int(current_user.branch_id))

    return q.all()


# ------------------------------------------------
# CREATE USER (WITH BRANCH)
# ------------------------------------------------
@router.post("/", response_model=UserResponse)
def create_user(
    request: UserCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("users", "write")),
):
    is_admin = _is_admin(current_user)

    role = (
        db.query(Role)
        .filter(Role.role_id == request.role, Role.status == True)  # noqa: E712
        .first()
    )
    if not role:
        raise HTTPException(400, "Invalid or inactive role")

    role_lower = str(role.role_name or "").strip().lower()
    if not is_admin and role_lower == "admin":
        raise HTTPException(403, "Only Admin can assign Admin role")

    exists = db.query(User).filter(
        User.user_name == request.user_name,
        User.shop_id == current_user.shop_id
    ).first()

    if exists:
        raise HTTPException(400, "Username already exists")

    branch_id = request.branch_id
    if not is_admin:
        # Force managers to create users only under their own branch.
        branch_id = getattr(current_user, "branch_id", None)

    user = User(
        shop_id=current_user.shop_id,
        user_name=request.user_name,
        password=encode_password(request.password),
        name=request.name,
        role=request.role,
        status=request.status,
        login_status=False,
        created_by=current_user.user_id,
        branch_id=branch_id,
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    log_action(
        db,
        shop_id=current_user.shop_id,
        module="Users",
        action="CREATE",
        record_id=user.user_id,
        new={
            "user_name": user.user_name,
            "name": user.name,
            "role": user.role,
            "status": user.status,
            "branch_id": user.branch_id,
        },
        user_id=current_user.user_id,
    )

    return user


# ------------------------------------------------
# UPDATE USER
# ------------------------------------------------
@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    request: UserUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("users", "write")),
):
    is_admin = _is_admin(current_user)

    user = db.query(User).filter(
        User.user_id == user_id,
        User.shop_id == current_user.shop_id
    ).first()

    if not user:
        raise HTTPException(404, "User not found")

    old = {
        "user_name": user.user_name,
        "name": user.name,
        "role": user.role,
        "status": user.status,
        "branch_id": user.branch_id,
    }

    payload = request.dict(exclude_unset=True)

    if not is_admin:
        # Managers can only edit users in their own branch.
        if getattr(current_user, "branch_id", None) and int(user.branch_id or 0) != int(current_user.branch_id):
            raise HTTPException(403, "Access denied for user branch")

        # Managers cannot move users across branches.
        payload.pop("branch_id", None)

    if "role" in payload:
        role = (
            db.query(Role)
            .filter(Role.role_id == payload.get("role"), Role.status == True)  # noqa: E712
            .first()
        )
        if not role:
            raise HTTPException(400, "Invalid or inactive role")
        if not is_admin and str(role.role_name or "").strip().lower() == "admin":
            raise HTTPException(403, "Only Admin can assign Admin role")

    for field, value in payload.items():
        if field == "password" and value:
            setattr(user, field, encode_password(value))
        else:
            setattr(user, field, value)

    db.commit()
    db.refresh(user)

    log_action(
        db,
        shop_id=current_user.shop_id,
        module="Users",
        action="UPDATE",
        record_id=user.user_id,
        old=old,
        new={
            "user_name": user.user_name,
            "name": user.name,
            "role": user.role,
            "status": user.status,
            "branch_id": user.branch_id,
        },
        user_id=current_user.user_id,
    )

    return user


# ------------------------------------------------
# SOFT DEACTIVATE USER
# ------------------------------------------------
@router.delete("/{user_id}")
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("users", "write")),
):
    is_admin = _is_admin(current_user)

    user = db.query(User).filter(
        User.user_id == user_id,
        User.shop_id == current_user.shop_id
    ).first()

    if not user:
        raise HTTPException(404, "User not found")

    if not is_admin and getattr(current_user, "branch_id", None):
        if int(user.branch_id or 0) != int(current_user.branch_id):
            raise HTTPException(403, "Access denied for user branch")

    if user.login_status:
        raise HTTPException(
            400,
            "Cannot deactivate a user who is currently logged in"
        )

    old_status = user.status
    user.status = False
    db.commit()

    log_action(
        db,
        shop_id=current_user.shop_id,
        module="Users",
        action="DEACTIVATE",
        record_id=user.user_id,
        old={"status": old_status},
        new={"status": False},
        user_id=current_user.user_id,
    )

    return {"message": "User marked inactive"}


# ------------------------------------------------
# BULK IMPORT (upsert by username)
# ------------------------------------------------
@router.post("/bulk-import")
def bulk_import_users(
    body: UserBulkImport,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("users", "write")),
):
    is_admin = _is_admin(current_user)

    # Build lookup maps
    role_map = {
        str(r.role_name).strip().lower(): r.role_id
        for r in db.query(Role).filter(Role.status == True).all()  # noqa: E712
    }
    branch_map = {
        str(b.branch_name).strip().lower(): b.branch_id
        for b in db.query(Branch).filter(Branch.shop_id == current_user.shop_id).all()
    }

    inserted = 0
    updated = 0
    errors = []

    for i, row in enumerate(body.rows):
        uname = (row.user_name or "").strip()
        if not uname:
            errors.append({"row": i + 1, "error": "user_name is required"})
            continue

        role_id = role_map.get((row.role_name or "").strip().lower())
        if not role_id:
            errors.append({"row": i + 1, "error": f"Role '{row.role_name}' not found"})
            continue

        branch_id = branch_map.get((row.branch_name or "").strip().lower()) if row.branch_name else None
        if not is_admin:
            branch_id = getattr(current_user, "branch_id", None)

        try:
            existing = db.query(User).filter(
                User.user_name == uname,
                User.shop_id == current_user.shop_id,
            ).first()
            if existing:
                existing.name = row.full_name or existing.name
                existing.role = role_id
                if branch_id is not None:
                    existing.branch_id = branch_id
                if row.password:
                    existing.password = encode_password(row.password)
                existing.status = True
                updated += 1
            else:
                if not row.password:
                    errors.append({"row": i + 1, "error": f"User '{uname}': password is required for new users"})
                    continue
                db.add(User(
                    shop_id=current_user.shop_id,
                    user_name=uname,
                    password=encode_password(row.password),
                    name=row.full_name,
                    role=role_id,
                    branch_id=branch_id,
                    status=True,
                    login_status=False,
                    created_by=current_user.user_id,
                ))
                inserted += 1
        except Exception as e:
            errors.append({"row": i + 1, "error": str(e)})

    db.add(BulkImportLog(
        shop_id=current_user.shop_id,
        upload_type="users",
        filename=body.filename or "",
        uploaded_by=current_user.user_id,
        uploaded_by_name=getattr(current_user, "name", None) or getattr(current_user, "user_name", ""),
        total_rows=len(body.rows),
        inserted=inserted,
        updated=updated,
        error_count=len(errors),
        errors_json=errors if errors else None,
        rows_json=[r.model_dump() for r in body.rows],
    ))
    db.commit()
    return {"inserted": inserted, "updated": updated, "errors": errors}
