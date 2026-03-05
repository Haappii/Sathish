from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.roles import Role
from app.models.role_permission import RolePermission
from app.schemas.permissions import PermissionModule, RolePermissionUpsert, RolePermissionResponse
from app.utils.auth_user import AdminOnly, get_current_user
from app.utils.permissions import (
    PERMISSION_MODULES,
    DEFAULT_ROLE_PERMISSIONS,
    MANAGER_DENY_MODULES,
    permissions_enabled,
)


router = APIRouter(prefix="/permissions", tags=["Permissions"])


@router.get("/modules", response_model=list[PermissionModule])
def list_modules(user=Depends(AdminOnly)):
    return PERMISSION_MODULES


@router.get("/my")
def get_my_permissions(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    role_lower = str(getattr(user, "role_name", "") or "").strip().lower()
    enabled = permissions_enabled(db, shop_id=int(user.shop_id))

    # Build module -> permissions map
    by_module: dict[str, dict[str, bool]] = {}

    if role_lower == "admin":
        by_module = {m["key"]: {"can_read": True, "can_write": True} for m in PERMISSION_MODULES}
    elif enabled:
        rows = (
            db.query(RolePermission)
            .filter(
                RolePermission.shop_id == user.shop_id,
                RolePermission.role_id == user.role,
            )
            .all()
        )
        for r in rows:
            by_module[str(r.module or "").strip().lower()] = {
                "can_read": bool(r.can_read),
                "can_write": bool(r.can_write),
            }
    else:
        if role_lower == "manager":
            by_module = {
                m["key"]: {
                    "can_read": m["key"] not in MANAGER_DENY_MODULES,
                    "can_write": m["key"] not in MANAGER_DENY_MODULES,
                }
                for m in PERMISSION_MODULES
            }
        else:
            for m in PERMISSION_MODULES:
                key = m["key"]
                rules = DEFAULT_ROLE_PERMISSIONS.get(key, {})
                by_module[key] = {
                    "can_read": role_lower in (rules.get("read") or set()),
                    "can_write": role_lower in (rules.get("write") or set()),
                }

    modules = []
    for m in PERMISSION_MODULES:
        key = m["key"]
        row = by_module.get(key) or {"can_read": False, "can_write": False}
        modules.append(
            {
                "key": key,
                "label": m["label"],
                "can_read": bool(row.get("can_read")),
                "can_write": bool(row.get("can_write")),
            }
        )

    return {
        "enabled": enabled,
        "role_id": int(getattr(user, "role", 0) or 0),
        "role_name": str(getattr(user, "role_name", "") or ""),
        "modules": modules,
    }


@router.get("/enabled")
def get_permissions_enabled(
    db: Session = Depends(get_db),
    user=Depends(AdminOnly),
):
    enabled = permissions_enabled(db, shop_id=int(user.shop_id))
    return {"enabled": enabled}


@router.get("/", response_model=list[RolePermissionResponse])
def list_permissions(
    db: Session = Depends(get_db),
    user=Depends(AdminOnly),
):
    role_map = {
        int(r.role_id): (r.role_name or "")
        for r in db.query(Role).filter(Role.status == True).all()  # noqa: E712
    }
    rows = (
        db.query(RolePermission)
        .filter(RolePermission.shop_id == user.shop_id)
        .order_by(RolePermission.module, RolePermission.role_id)
        .all()
    )
    return [
        {
            "id": r.id,
            "shop_id": r.shop_id,
            "role_id": r.role_id,
            "role_name": role_map.get(int(r.role_id)),
            "module": r.module,
            "can_read": bool(r.can_read),
            "can_write": bool(r.can_write),
        }
        for r in rows
    ]


@router.post("/upsert", response_model=RolePermissionResponse)
def upsert_permission(
    payload: RolePermissionUpsert,
    db: Session = Depends(get_db),
    user=Depends(AdminOnly),
):
    module = (payload.module or "").strip().lower()
    if not module:
        raise HTTPException(400, "Module is required")

    # Validate role exists
    role = db.query(Role).filter(Role.role_id == int(payload.role_id), Role.status == True).first()  # noqa: E712
    if not role:
        raise HTTPException(400, "Invalid role")

    row = (
        db.query(RolePermission)
        .filter(
            RolePermission.shop_id == user.shop_id,
            RolePermission.role_id == int(payload.role_id),
            RolePermission.module == module,
        )
        .first()
    )
    if not row:
        row = RolePermission(
            shop_id=user.shop_id,
            role_id=int(payload.role_id),
            module=module,
            can_read=bool(payload.can_read),
            can_write=bool(payload.can_write),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    else:
        row.can_read = bool(payload.can_read)
        row.can_write = bool(payload.can_write)
        db.commit()
        db.refresh(row)

    return {
        "id": row.id,
        "shop_id": row.shop_id,
        "role_id": row.role_id,
        "role_name": role.role_name,
        "module": row.module,
        "can_read": bool(row.can_read),
        "can_write": bool(row.can_write),
    }


@router.post("/bootstrap")
def bootstrap_default_permissions(
    db: Session = Depends(get_db),
    user=Depends(AdminOnly),
):
    if permissions_enabled(db, shop_id=int(user.shop_id)):
        raise HTTPException(400, "Permissions already enabled")

    roles = db.query(Role).filter(Role.status == True).all()  # noqa: E712
    modules = [m["key"] for m in PERMISSION_MODULES]

    existing = {
        (rp.role_id, rp.module)
        for rp in db.query(RolePermission.role_id, RolePermission.module)
        .filter(RolePermission.shop_id == user.shop_id)
        .all()
    }

    created = 0
    for role in roles:
        role_lower = str(role.role_name or "").strip().lower()
        for mod in modules:
            if (role.role_id, mod) in existing:
                continue
            rules = DEFAULT_ROLE_PERMISSIONS.get(mod, {})
            if role_lower == "admin":
                can_read = True
                can_write = True
            elif role_lower == "manager":
                can_read = mod not in MANAGER_DENY_MODULES
                can_write = mod not in MANAGER_DENY_MODULES
            else:
                can_read = role_lower in (rules.get("read") or set())
                can_write = role_lower in (rules.get("write") or set())
            db.add(RolePermission(
                shop_id=user.shop_id,
                role_id=int(role.role_id),
                module=mod,
                can_read=bool(can_read),
                can_write=bool(can_write),
            ))
            created += 1

    db.commit()
    return {"enabled": True, "created": created}


@router.post("/disable")
def disable_permissions(
    db: Session = Depends(get_db),
    user=Depends(AdminOnly),
):
    deleted = (
        db.query(RolePermission)
        .filter(RolePermission.shop_id == user.shop_id)
        .delete()
    )
    db.commit()
    return {"enabled": False, "deleted": int(deleted or 0)}
