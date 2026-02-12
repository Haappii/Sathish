from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.item_lot import ItemLot
from app.models.items import Item
from app.utils.permissions import require_permission

router = APIRouter(prefix="/item-lots", tags=["Item Lots"])


def resolve_branch(branch_id_param, user) -> int:
    role = str(getattr(user, "role_name", "") or "").strip().lower()
    if role == "admin":
        branch_raw = (
            branch_id_param
            if branch_id_param not in (None, "")
            else getattr(user, "branch_id", None)
        )
    else:
        branch_raw = getattr(user, "branch_id", None)
    try:
        return int(branch_raw)
    except (TypeError, ValueError):
        raise HTTPException(400, "Branch required")


@router.get("/")
def list_lots(
    branch_id: int | None = Query(None),
    item_id: int | None = Query(None),
    batch_no: str | None = Query(None),
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
    user=Depends(require_permission("item_lots", "read")),
):
    bid = resolve_branch(branch_id, user)

    q = (
        db.query(ItemLot, Item.item_name)
        .join(Item, Item.item_id == ItemLot.item_id)
        .filter(ItemLot.shop_id == user.shop_id, ItemLot.branch_id == bid)
    )
    if item_id:
        q = q.filter(ItemLot.item_id == item_id)
    if batch_no:
        q = q.filter(ItemLot.batch_no == batch_no)

    rows = (
        q.order_by(ItemLot.lot_id.desc())
        .limit(limit)
        .all()
    )

    return [
        {
            "lot_id": lot.lot_id,
            "item_id": lot.item_id,
            "item_name": item_name,
            "batch_no": lot.batch_no,
            "expiry_date": lot.expiry_date.strftime("%Y-%m-%d") if lot.expiry_date else None,
            "serial_no": lot.serial_no,
            "quantity": int(lot.quantity or 0),
            "unit_cost": float(lot.unit_cost or 0) if lot.unit_cost is not None else None,
            "source_type": lot.source_type,
            "source_ref": lot.source_ref,
            "created_at": lot.created_at.strftime("%Y-%m-%d %H:%M") if lot.created_at else None,
        }
        for lot, item_name in rows
    ]

