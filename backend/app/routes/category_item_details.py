from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime

from app.db import get_db
from app.utils.auth_user import get_current_user
from app.models.invoice import Invoice
from app.models.invoice_details import InvoiceDetail
from app.models.items import Item

router = APIRouter(prefix="/reports", tags=["Reports"])


def resolve_range(mode: str, from_date: str | None, to_date: str | None):
    today = datetime.today()

    if mode == "today":
        start = today.replace(hour=0, minute=0, second=0, microsecond=0)
        end = today.replace(hour=23, minute=59, second=59, microsecond=999999)
        return start, end

    if mode == "month":
        start = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end = today
        return start, end

    if mode == "custom":
            if not from_date or not to_date:
                raise HTTPException(400, "from_date and to_date are required")
            start = datetime.strptime(from_date, "%Y-%m-%d")
            end = datetime.strptime(to_date, "%Y-%m-%d")
            end = end.replace(hour=23, minute=59, second=59)
            return start, end

    raise HTTPException(400, "Invalid mode")


@router.get("/category-item-details")
def category_item_details(
    branch_id: int,
    category_id: int,
    mode: str = "today",
    from_date: str | None = None,
    to_date: str | None = None,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    """
    Returns item-wise quantity + total sales inside a category
    """

    start, end = resolve_range(mode, from_date, to_date)

    rows = (
        db.query(
            Item.item_id,
            Item.item_name,
            func.coalesce(func.sum(InvoiceDetail.quantity), 0).label("total_qty"),
            func.coalesce(func.sum(InvoiceDetail.amount), 0).label("total_amount"),
        )
        .join(InvoiceDetail, InvoiceDetail.item_id == Item.item_id)
        .join(Invoice, Invoice.invoice_id == InvoiceDetail.invoice_id)
        .filter(
            Invoice.shop_id == user.shop_id,
            Invoice.branch_id == branch_id
        )
        .filter(
            Item.shop_id == user.shop_id,
            Item.category_id == category_id
        )
        .filter(Invoice.created_time.between(start, end))
        .group_by(Item.item_id, Item.item_name)
        .order_by(func.sum(InvoiceDetail.amount).desc())
        .all()
    )

    return [
        {
            "item_id": r.item_id,
            "item_name": r.item_name,
            "total_qty": int(r.total_qty),
            "total_amount": float(r.total_amount)
        }
        for r in rows
    ]
