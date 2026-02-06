from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from datetime import date

from app.db import get_db
from app.models.invoice_details import InvoiceDetail
from app.models.items import Item
from app.models.category import Category
from app.models.invoice import Invoice
from app.utils.auth_user import get_current_user


router = APIRouter(
    prefix="/reports",
    tags=["Reports"]
)


@router.get("/category-item-count")
def get_category_item_count(
    branch_id: int = Query(...),
    mode: str = Query("today", description="today | month | custom"),
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    category_id: int | None = Query(None),
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    """
    Returns total items sold (sum of quantity) grouped by category,
    filtered by branch + date range.
    """

    # ---------- DATE FILTERS ----------
    date_filter = []

    if mode == "today":
        today = date.today()
        date_filter.append(func.date(Invoice.created_time) == today)

    elif mode == "month":
        today = date.today()
        date_filter.append(func.extract("year", Invoice.created_time) == today.year)
        date_filter.append(func.extract("month", Invoice.created_time) == today.month)

    elif mode == "custom":
        if not from_date or not to_date:
            raise HTTPException(
                status_code=400,
                detail="from_date and to_date are required for custom mode"
            )

        date_filter.append(
            and_(
                func.date(Invoice.created_time) >= from_date,
                func.date(Invoice.created_time) <= to_date
            )
        )

    # ---------- QUERY ----------
    q = (
        db.query(
            Category.category_id,
            Category.category_name,
            func.coalesce(func.sum(InvoiceDetail.quantity), 0).label("total_items")
        )
        .join(Invoice, Invoice.invoice_id == InvoiceDetail.invoice_id)
        .join(Item, Item.item_id == InvoiceDetail.item_id)
        .join(Category, Category.category_id == Item.category_id)
        .filter(
            InvoiceDetail.branch_id == branch_id,
            Invoice.shop_id == user.shop_id
        )
        .filter(*date_filter)
        .group_by(Category.category_id, Category.category_name)
    )

    if category_id:
        q = q.filter(Category.category_id == category_id)

    results = q.all()

    return [
        {
            "category_id": r.category_id,
            "category_name": r.category_name,
            "total_items": int(r.total_items)
        }
        for r in results
    ]
