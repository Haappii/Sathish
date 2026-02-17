from __future__ import annotations

import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.table_billing import TableMaster
from app.models.table_qr import TableQrToken
from app.utils.permissions import require_permission
from app.utils.shop_type import ensure_hotel_billing_type


router = APIRouter(prefix="/table-qr", tags=["Table QR"])


def _new_token() -> str:
    # URL-safe and short enough for QR usage
    return secrets.token_urlsafe(24)


def _ensure_table_access(*, user, table: TableMaster) -> None:
    if not table:
        raise HTTPException(404, "Table not found")
    if table.shop_id != user.shop_id:
        raise HTTPException(404, "Table not found")
    role = str(getattr(user, "role_name", "") or "").strip().lower()
    if role != "admin" and int(table.branch_id) != int(user.branch_id):
        raise HTTPException(403, "Not allowed")


@router.get("/token/by-table/{table_id}")
def get_or_create_table_qr_token(
    table_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("setup", "read")),
):
    ensure_hotel_billing_type(db, int(user.shop_id))
    table = (
        db.query(TableMaster)
        .filter(TableMaster.table_id == table_id)
        .first()
    )
    _ensure_table_access(user=user, table=table)

    tok = (
        db.query(TableQrToken)
        .filter(
            TableQrToken.shop_id == user.shop_id,
            TableQrToken.branch_id == table.branch_id,
            TableQrToken.table_id == table_id,
            TableQrToken.active == True,
        )
        .first()
    )

    if not tok:
        for _ in range(6):
            candidate = _new_token()
            exists = db.query(TableQrToken.id).filter(TableQrToken.token == candidate).first()
            if exists:
                continue
            tok = TableQrToken(
                shop_id=user.shop_id,
                branch_id=table.branch_id,
                table_id=table_id,
                token=candidate,
                active=True,
            )
            db.add(tok)
            db.commit()
            db.refresh(tok)
            break

    if not tok:
        raise HTTPException(500, "Failed to generate token")

    return {
        "table_id": table.table_id,
        "table_name": table.table_name,
        "branch_id": table.branch_id,
        "token": tok.token,
        "active": bool(tok.active),
        "created_at": tok.created_at,
    }


@router.post("/token/regenerate/{table_id}")
def regenerate_table_qr_token(
    table_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("setup", "write")),
):
    ensure_hotel_billing_type(db, int(user.shop_id))
    table = (
        db.query(TableMaster)
        .filter(TableMaster.table_id == table_id)
        .first()
    )
    _ensure_table_access(user=user, table=table)

    existing = (
        db.query(TableQrToken)
        .filter(
            TableQrToken.shop_id == user.shop_id,
            TableQrToken.branch_id == table.branch_id,
            TableQrToken.table_id == table_id,
            TableQrToken.active == True,
        )
        .first()
    )
    if existing:
        existing.active = False
        existing.rotated_at = datetime.utcnow()
        db.commit()

    tok = None
    for _ in range(6):
        candidate = _new_token()
        exists = db.query(TableQrToken.id).filter(TableQrToken.token == candidate).first()
        if exists:
            continue
        tok = TableQrToken(
            shop_id=user.shop_id,
            branch_id=table.branch_id,
            table_id=table_id,
            token=candidate,
            active=True,
        )
        db.add(tok)
        db.commit()
        db.refresh(tok)
        break

    if not tok:
        raise HTTPException(500, "Failed to generate token")

    return {
        "table_id": table.table_id,
        "table_name": table.table_name,
        "branch_id": table.branch_id,
        "token": tok.token,
        "active": True,
        "created_at": tok.created_at,
    }

