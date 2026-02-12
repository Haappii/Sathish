from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.invoice_due import InvoiceDue
from app.models.invoice_payment import InvoicePayment
from app.models.items import Item
from app.models.sales_return import SalesReturn
from app.models.stock import Inventory
from app.services.financials_service import calc_period_financials
from app.utils.permissions import require_permission


router = APIRouter(prefix="/analytics", tags=["Analytics"])


def _role(user) -> str:
    return str(getattr(user, "role_name", "") or "").strip().lower()


def _force_branch(branch_id: int | None, user) -> int | None:
    if _role(user) == "admin":
        if branch_id is None:
            return None
        try:
            return int(branch_id)
        except (TypeError, ValueError):
            raise HTTPException(400, "Invalid branch_id")

    try:
        return int(getattr(user, "branch_id", None))
    except (TypeError, ValueError):
        raise HTTPException(400, "Branch required")


def _parse_dates(from_date: str, to_date: str):
    try:
        return (
            datetime.strptime(from_date, "%Y-%m-%d").date(),
            datetime.strptime(to_date, "%Y-%m-%d").date(),
        )
    except ValueError:
        raise HTTPException(400, "Invalid date format YYYY-MM-DD")


@router.get("/summary")
def analytics_summary(
    from_date: str,
    to_date: str,
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("analytics", "read")),
):
    f, t = _parse_dates(from_date, to_date)
    branch_id = _force_branch(branch_id, user)

    fin = calc_period_financials(
        db,
        shop_id=int(user.shop_id),
        branch_id=branch_id,
        from_dt=f,
        to_dt=t,
    )

    # Collections received in date range
    col_q = db.query(func.coalesce(func.sum(InvoicePayment.amount), 0)).filter(
        InvoicePayment.shop_id == user.shop_id,
        func.date(InvoicePayment.paid_on).between(f, t),
    )
    if branch_id is not None:
        col_q = col_q.filter(InvoicePayment.branch_id == branch_id)
    collections = float(col_q.scalar() or 0)

    # Open dues outstanding (current)
    dues_q = db.query(
        InvoiceDue.invoice_id.label("invoice_id"),
        InvoiceDue.original_amount.label("original_amount"),
    ).filter(
        InvoiceDue.shop_id == user.shop_id,
        InvoiceDue.status == "OPEN",
    )
    if branch_id is not None:
        dues_q = dues_q.filter(InvoiceDue.branch_id == branch_id)
    dues_sq = dues_q.subquery()

    dues_original = float(
        db.query(func.coalesce(func.sum(dues_sq.c.original_amount), 0)).scalar() or 0
    )
    dues_paid = float(
        (
            db.query(func.coalesce(func.sum(InvoicePayment.amount), 0))
            .join(dues_sq, dues_sq.c.invoice_id == InvoicePayment.invoice_id)
            .filter(InvoicePayment.shop_id == user.shop_id)
            .scalar()
            or 0
        )
    )
    dues_returns = float(
        (
            db.query(func.coalesce(func.sum(SalesReturn.refund_amount), 0))
            .join(dues_sq, dues_sq.c.invoice_id == SalesReturn.invoice_id)
            .filter(
                SalesReturn.shop_id == user.shop_id,
                SalesReturn.status != "CANCELLED",
            )
            .scalar()
            or 0
        )
    )
    outstanding = dues_original - dues_paid - dues_returns
    if outstanding < 0:
        outstanding = 0.0
    open_count = int(db.query(func.count(dues_sq.c.invoice_id)).scalar() or 0)

    # Stock valuation (buy price)
    stock_q = (
        db.query(func.coalesce(func.sum(Inventory.quantity * func.coalesce(Item.buy_price, 0)), 0))
        .join(Item, and_(Item.shop_id == Inventory.shop_id, Item.item_id == Inventory.item_id))
        .filter(Inventory.shop_id == user.shop_id)
    )
    if branch_id is not None:
        stock_q = stock_q.filter(Inventory.branch_id == branch_id)
    stock_value = float(stock_q.scalar() or 0)

    return {
        "from_date": from_date,
        "to_date": to_date,
        "branch_id": branch_id,
        "financials": fin,
        "collections": {"amount": collections},
        "open_dues": {"count": open_count, "outstanding": outstanding},
        "stock": {"valuation": stock_value},
    }

