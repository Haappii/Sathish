from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.roles import Role


CORE_ROLES: tuple[str, ...] = ("Admin", "Manager")


def ensure_role(db: Session, *, role_name: str) -> Role:
    name = str(role_name or "").strip()
    if not name:
        raise ValueError("role_name is required")

    existing = (
        db.query(Role)
        .filter(func.lower(Role.role_name) == name.lower())
        .first()
    )
    if existing:
        if existing.role_name != name:
            existing.role_name = name
            db.commit()
            db.refresh(existing)
        if existing.status is not True:
            existing.status = True
            db.commit()
            db.refresh(existing)
        return existing

    role = Role(role_name=name, status=True)
    db.add(role)
    db.commit()
    db.refresh(role)
    return role


def ensure_core_roles(db: Session) -> dict[str, Role]:
    out: dict[str, Role] = {}
    for name in CORE_ROLES:
        out[name.lower()] = ensure_role(db, role_name=name)
    return out

