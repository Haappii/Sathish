from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from sqlalchemy import func

from app.db import get_db
from app.models.invoice import Invoice
from app.models.invoice_details import InvoiceDetail
from app.models.items import Item
from app.models.category import Category
from app.utils.auth_user import get_current_user

router = APIRouter(prefix="/reports", tags=["Reports"])


# =========================================================
# DATE RANGE HELPER
# =========================================================
def date_range(mode: str, from_date: str | None, to_date: str | None):
    today = datetime.today()

    if mode == "today":
        start = today.replace(hour=0, minute=0, second=0, microsecond=0)
        end   = today.replace(hour=23, minute=59, second=59)
        return start, end

    if mode == "month":
        start = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end   = today
        return start, end

    if mode == "custom":
        if not from_date or not to_date:
            raise HTTPException(400, "from_date and to_date are required")

        start = datetime.strptime(from_date, "%Y-%m-%d")
        end   = datetime.strptime(to_date, "%Y-%m-%d")
        end   = end.replace(hour=23, minute=59, second=59)
        return start, end

    raise HTTPException(400, "Invalid mode")


# =========================================================
# CATEGORY SALES (ALREADY WORKING — KEPT AS IS)
# =========================================================
@router.get("/category-sales")
def category_sales(
    branch_id: int | None = Query(None, description="Optional — omit for consolidated"),
    mode: str = Query("today"),
    from_date: str | None = None,
    to_date: str | None = None,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    start, end = date_range(mode, from_date, to_date)

    q = (
        db.query(
            Category.category_id,
            Category.category_name,
            func.coalesce(func.sum(InvoiceDetail.quantity), 0).label("total_items"),
            func.coalesce(func.sum(InvoiceDetail.amount), 0).label("total_sales")
        )
        .join(Item, Item.item_id == InvoiceDetail.item_id)
        .join(Category, Category.category_id == Item.category_id)
        .join(Invoice, Invoice.invoice_id == InvoiceDetail.invoice_id)
        .filter(
            Invoice.shop_id == user.shop_id,
            Invoice.created_time.between(start, end)
        )
    )

    # apply branch filter only if provided
    if branch_id is not None:
        q = q.filter(Invoice.branch_id == branch_id)

    rows = q.group_by(
        Category.category_id,
        Category.category_name
    ).all()

    return [
        {
            "category_id": r.category_id,
            "category_name": r.category_name,
            "total_sales": float(r.total_sales),
            "total_items": int(r.total_items)
        }
        for r in rows
    ]


# =========================================================
# CATEGORY → ITEM DETAILS (🔥 THIS WAS MISSING / BROKEN)
# =========================================================
@router.get("/category-item-details")
def category_item_details(
    category_id: int = Query(...),
    branch_id: int | None = Query(None, description="Optional — omit for consolidated"),
    mode: str = Query("today"),
    from_date: str | None = None,
    to_date: str | None = None,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    start, end = date_range(mode, from_date, to_date)

    q = (
        db.query(
            Item.item_name,
            func.coalesce(func.sum(InvoiceDetail.quantity), 0).label("total_qty"),
            func.coalesce(func.sum(InvoiceDetail.amount), 0).label("total_amount")
        )
        .join(InvoiceDetail, InvoiceDetail.item_id == Item.item_id)
        .join(Invoice, Invoice.invoice_id == InvoiceDetail.invoice_id)
        .filter(
            Item.category_id == category_id,
            Invoice.created_time.between(start, end),
            Invoice.shop_id == user.shop_id
        )
    )

    # apply branch filter only if provided
    if branch_id is not None:
        q = q.filter(Invoice.branch_id == branch_id)

    rows = (
        q.group_by(Item.item_id, Item.item_name)
         .order_by(func.sum(InvoiceDetail.amount).desc())
         .all()
    )

    return [
        {
            "item_name": r.item_name,
            "total_qty": int(r.total_qty),
            "total_amount": float(r.total_amount)
        }
        for r in rows
    ]
