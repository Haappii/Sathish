"""
Kitchen Display System (KDS) — read-only live feed for kitchen screens.
Polls every few seconds from the frontend.
No auth token required for the KDS screen itself (uses shop_id + branch_id params).
"""
from __future__ import annotations
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.kot import KOT
from app.models.table_billing import TableMaster
from app.utils.shop_type import ensure_hotel_billing_type

router = APIRouter(prefix="/kds", tags=["Kitchen Display System"])


@router.get("/live")
def kds_live_feed(
    shop_id: int = Query(...),
    branch_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """
    Returns all PENDING and PREPARING KOTs for the given shop and branch.
    This endpoint is polled by the Kitchen Display screen every 5 seconds.
    """
    ensure_hotel_billing_type(db, shop_id)
    kots = (
        db.query(KOT)
        .filter(
            KOT.shop_id == shop_id,
            KOT.branch_id == branch_id,
            KOT.status.in_(["PENDING", "PREPARING", "READY"]),
        )
        .order_by(KOT.printed_at)
        .all()
    )

    result = []
    for k in kots:
        table_name = None
        if k.table_id:
            table = db.query(TableMaster).filter(TableMaster.table_id == k.table_id).first()
            table_name = table.table_name if table else None

        result.append({
            "kot_id": k.kot_id,
            "kot_number": k.kot_number,
            "table_id": k.table_id,
            "table_name": table_name,
            "status": k.status,
            "printed_at": k.printed_at,
            "elapsed_minutes": _elapsed(k.printed_at),
            "items": [
                {
                    "id": ki.id,
                    "item_name": ki.item_name,
                    "quantity": ki.quantity,
                    "notes": ki.notes,
                    "status": ki.status,
                }
                for ki in k.items
            ],
        })

    return {"kots": result, "total": len(result)}


def _elapsed(printed_at) -> int:
    if not printed_at:
        return 0
    from datetime import datetime
    diff = datetime.utcnow() - printed_at
    return int(diff.total_seconds() // 60)
