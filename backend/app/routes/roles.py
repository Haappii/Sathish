from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.roles import Role
from app.models.role_permission import RolePermission
from app.models.users import User
from app.schemas.roles import RoleCreate, RoleUpdate, RoleResponse
from app.utils.auth_user import AdminOnly

router = APIRouter(prefix="/roles", tags=["Roles"])

RESERVED_ADMIN_ROLE = "admin"


def _clean_role_name(value: str | None) -> str:
    return str(value or "").strip()


@router.get("/", response_model=list[RoleResponse])
def list_roles(
    db: Session = Depends(get_db),
    user=Depends(AdminOnly),
):
    return db.query(Role).order_by(Role.status.desc(), Role.role_name).all()


@router.post("/", response_model=RoleResponse)
def create_role(
    request: RoleCreate,
    db: Session = Depends(get_db),
    user=Depends(AdminOnly),
):
    role_name = _clean_role_name(request.role_name)
    if not role_name:
        raise HTTPException(status_code=400, detail="Role name is required")

    exists = (
        db.query(Role)
        .filter(func.lower(Role.role_name) == role_name.lower())
        .first()
    )
    if exists:
        if bool(exists.status):
            raise HTTPException(status_code=400, detail="Role already exists")
        exists.status = bool(request.status)
        exists.role_name = role_name
        db.commit()
        db.refresh(exists)
        return exists

    role = Role(role_name=role_name, status=bool(request.status))
    db.add(role)
    db.commit()
    db.refresh(role)
    return role


@router.put("/{role_id}", response_model=RoleResponse)
def update_role(
    role_id: int,
    request: RoleUpdate,
    db: Session = Depends(get_db),
    user=Depends(AdminOnly),
):
    role = db.query(Role).filter(Role.role_id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    is_admin_role = str(role.role_name or "").strip().lower() == RESERVED_ADMIN_ROLE

    if request.role_name is not None:
        next_name = _clean_role_name(request.role_name)
        if not next_name:
            raise HTTPException(status_code=400, detail="Role name is required")
        if is_admin_role and next_name.lower() != RESERVED_ADMIN_ROLE:
            raise HTTPException(status_code=400, detail="Admin role cannot be renamed")

        dup = (
            db.query(Role)
            .filter(
                Role.role_id != role_id,
                func.lower(Role.role_name) == next_name.lower(),
            )
            .first()
        )
        if dup:
            raise HTTPException(status_code=400, detail="Role name already exists")
        role.role_name = next_name

    if request.status is not None:
        next_status = bool(request.status)
        if is_admin_role and not next_status:
            raise HTTPException(status_code=400, detail="Admin role cannot be disabled")

        if not next_status:
            assigned_user = (
                db.query(User.user_id)
                .filter(User.role == role_id, User.status == True)  # noqa: E712
                .first()
            )
            if assigned_user:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot disable a role assigned to active users",
                )

        role.status = next_status

    db.commit()
    db.refresh(role)
    return role


@router.delete("/{role_id}")
def delete_role(
    role_id: int,
    db: Session = Depends(get_db),
    user=Depends(AdminOnly),
):
    role = db.query(Role).filter(Role.role_id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    role_lower = str(role.role_name or "").strip().lower()
    if role_lower == RESERVED_ADMIN_ROLE:
        raise HTTPException(status_code=400, detail="Admin role cannot be deleted")

    assigned_user = (
        db.query(User.user_id)
        .filter(User.role == role_id, User.status == True)  # noqa: E712
        .first()
    )
    if assigned_user:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete a role assigned to active users",
        )

    role.status = False
    deleted_permissions = (
        db.query(RolePermission)
        .filter(RolePermission.role_id == role_id)
        .delete()
    )

    db.commit()
    return {
        "message": "Role deleted",
        "role_id": int(role_id),
        "permissions_deleted": int(deleted_permissions or 0),
    }
