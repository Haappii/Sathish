from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, date, timedelta

from app.db import get_db
from app.utils.auth_user import get_current_user
from app.models.invoice import Invoice
from app.models.invoice_details import InvoiceDetail
from app.models.branch import Branch
from app.models.table_billing import Order
from app.models.branch_expense import BranchExpense
from app.models.day_close import BranchDayClose, ShopDayClose
from app.models.month_close import BranchMonthClose, ShopMonthClose
from app.models.branch import Branch
from app.models.stock import Inventory
from app.models.date_wise_stock import DateWiseStock
from app.models.sales_return import SalesReturn, SalesReturnItem

router = APIRouter(prefix="/day-close", tags=["Day Close"])


def admin_or_manager(user):
    role = str(user.role_name).lower()
    if role not in ["admin", "manager"]:
        raise HTTPException(403, "Admin/Manager access required")


def parse_date(d: str) -> date:
    try:
        return datetime.strptime(d, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "Invalid date format YYYY-MM-DD")


def calc_totals(db: Session, shop_id: int, branch_id: int | None, from_dt: date, to_dt: date):
    inv_q = db.query(Invoice).filter(
        func.date(Invoice.created_time).between(from_dt, to_dt),
        Invoice.shop_id == shop_id,
    )
    if branch_id is not None:
        inv_q = inv_q.filter(Invoice.branch_id == branch_id)

    inv_sales_ex_tax_row = inv_q.with_entities(
        func.coalesce(
            func.sum(func.coalesce(Invoice.total_amount, 0) - func.coalesce(Invoice.tax_amt, 0)),
            0,
        ).label("sales_ex_tax"),
        func.coalesce(func.sum(func.coalesce(Invoice.tax_amt, 0)), 0).label("gst"),
        func.coalesce(func.sum(func.coalesce(Invoice.discounted_amt, 0)), 0).label("discount"),
    ).first()

    invoice_sales_ex_tax = float(getattr(inv_sales_ex_tax_row, "sales_ex_tax", 0) or 0)
    invoice_gst = float(getattr(inv_sales_ex_tax_row, "gst", 0) or 0)
    invoice_discount = float(getattr(inv_sales_ex_tax_row, "discount", 0) or 0)

    # COGS for invoices in date range
    cogs_q = (
        db.query(func.coalesce(func.sum(InvoiceDetail.buy_price * InvoiceDetail.quantity), 0))
        .join(Invoice, Invoice.invoice_id == InvoiceDetail.invoice_id)
        .filter(
            Invoice.shop_id == shop_id,
            func.date(Invoice.created_time).between(from_dt, to_dt),
        )
    )
    if branch_id is not None:
        cogs_q = cogs_q.filter(Invoice.branch_id == branch_id)
    invoice_cogs = float(cogs_q.scalar() or 0)

    # Returns (reduce sales/GST/discount and reverse COGS)
    ret_q = db.query(SalesReturn).filter(
        SalesReturn.shop_id == shop_id,
        SalesReturn.status != "CANCELLED",
        func.date(SalesReturn.created_on).between(from_dt, to_dt),
    )
    if branch_id is not None:
        ret_q = ret_q.filter(SalesReturn.branch_id == branch_id)

    ret_row = ret_q.with_entities(
        func.coalesce(func.sum(func.coalesce(SalesReturn.tax_amount, 0)), 0).label("ret_tax"),
        func.coalesce(func.sum(func.coalesce(SalesReturn.discount_amount, 0)), 0).label("ret_discount"),
        func.coalesce(func.sum(func.coalesce(SalesReturn.refund_amount, 0)), 0).label("ret_refund"),
        func.coalesce(
            func.sum(
                func.coalesce(SalesReturn.refund_amount, 0)
                + func.coalesce(SalesReturn.discount_amount, 0)
                - func.coalesce(SalesReturn.tax_amount, 0)
            ),
            0,
        ).label("ret_sales_ex_tax"),
    ).first()

    ret_tax = float(getattr(ret_row, "ret_tax", 0) or 0)
    ret_discount = float(getattr(ret_row, "ret_discount", 0) or 0)
    ret_sales_ex_tax = float(getattr(ret_row, "ret_sales_ex_tax", 0) or 0)

    inv_cost_sq = (
        db.query(
            InvoiceDetail.invoice_id.label("invoice_id"),
            InvoiceDetail.item_id.label("item_id"),
            func.max(InvoiceDetail.buy_price).label("buy_price"),
        )
        .filter(InvoiceDetail.shop_id == shop_id)
        .group_by(InvoiceDetail.invoice_id, InvoiceDetail.item_id)
        .subquery()
    )
    ret_cogs_q = (
        db.query(
            func.coalesce(func.sum(SalesReturnItem.quantity * inv_cost_sq.c.buy_price), 0)
        )
        .join(SalesReturn, SalesReturn.return_id == SalesReturnItem.return_id)
        .join(
            inv_cost_sq,
            (inv_cost_sq.c.invoice_id == SalesReturn.invoice_id)
            & (inv_cost_sq.c.item_id == SalesReturnItem.item_id),
        )
        .filter(
            SalesReturn.shop_id == shop_id,
            SalesReturn.status != "CANCELLED",
            func.date(SalesReturn.created_on).between(from_dt, to_dt),
        )
    )
    if branch_id is not None:
        ret_cogs_q = ret_cogs_q.filter(SalesReturn.branch_id == branch_id)
    ret_cogs = float(ret_cogs_q.scalar() or 0)

    sales = invoice_sales_ex_tax - ret_sales_ex_tax
    gst = invoice_gst - ret_tax
    discount = invoice_discount - ret_discount

    exp_q = db.query(func.sum(BranchExpense.amount)).filter(
        BranchExpense.expense_date.between(from_dt, to_dt),
        BranchExpense.shop_id == shop_id
    )
    if branch_id is not None:
        exp_q = exp_q.filter(BranchExpense.branch_id == branch_id)
    expense = float(exp_q.scalar() or 0)

    cogs_net = invoice_cogs - ret_cogs
    profit = (sales - discount) - cogs_net - expense
    return {
        "total_sales": sales,
        "total_gst": gst,
        "total_discount": discount,
        "total_expense": expense,
        "total_profit": profit,
    }


def snapshot_stock(db: Session, shop_id: int, branch_id: int, stock_date: date):
    db.query(DateWiseStock).filter(
        DateWiseStock.shop_id == shop_id,
        DateWiseStock.branch_id == branch_id,
        DateWiseStock.stock_date == stock_date
    ).delete()

    rows = (
        db.query(Inventory)
        .filter(Inventory.branch_id == branch_id, Inventory.shop_id == shop_id)
        .all()
    )
    for r in rows:
        db.add(DateWiseStock(
            stock_date=stock_date,
            shop_id=shop_id,
            branch_id=branch_id,
            item_id=r.item_id,
            quantity=r.quantity
        ))


@router.get("/status")
def day_close_status(
    date_str: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    admin_or_manager(user)
    d = parse_date(date_str)
    branches = db.query(Branch).filter(
        Branch.status == "ACTIVE",
        Branch.shop_id == user.shop_id
    ).all()

    return [
        {
            "branch_id": b.branch_id,
            "branch_name": b.branch_name,
            "closed": (b.branch_close or "N").upper() == "Y",
        }
        for b in branches
    ]


@router.post("/branch")
def close_branch_day(
    date_str: str,
    branch_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    admin_or_manager(user)
    d = parse_date(date_str)

    open_orders = (
        db.query(Order)
        .filter(
            Order.branch_id == branch_id,
            Order.status == "OPEN",
            Order.shop_id == user.shop_id
        )
        .count()
    )
    if open_orders > 0:
        raise HTTPException(
            400,
            "Please close all running tables before closing the branch."
        )

    exists = db.query(BranchDayClose).filter(
        BranchDayClose.branch_id == branch_id,
        BranchDayClose.close_date == d,
        BranchDayClose.shop_id == user.shop_id
    ).first()
    if exists:
        raise HTTPException(400, "Branch already closed for this date")

    totals = calc_totals(db, user.shop_id, branch_id, d, d)
    close = BranchDayClose(
        shop_id=user.shop_id,
        branch_id=branch_id,
        close_date=d,
        closed_by=user.user_id,
        **totals
    )
    db.add(close)
    snapshot_stock(db, user.shop_id, branch_id, d)
    # mark branch closed
    db.query(Branch).filter(
        Branch.branch_id == branch_id,
        Branch.shop_id == user.shop_id
    ).update(
        {"branch_close": "Y"}
    )
    db.commit()

    # If all branches closed, close shop
    branches = db.query(Branch).filter(
        Branch.status == "ACTIVE",
        Branch.shop_id == user.shop_id
    ).all()
    closed_count = db.query(BranchDayClose).filter(
        BranchDayClose.close_date == d,
        BranchDayClose.shop_id == user.shop_id
    ).count()
    if closed_count == len(branches):
        shop_exists = db.query(ShopDayClose).filter(
            ShopDayClose.close_date == d,
            ShopDayClose.shop_id == user.shop_id
        ).first()
        if not shop_exists:
            shop_totals = calc_totals(db, user.shop_id, None, d, d)
            shop_close = ShopDayClose(
                shop_id=user.shop_id,
                close_date=d,
                closed_by=user.user_id,
                **shop_totals
            )
            db.add(shop_close)
            db.commit()

    return {"message": "Branch day closed", "totals": totals}


@router.post("/month/branch")
def close_branch_month(
    month: str,
    branch_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    admin_or_manager(user)
    # YYYY-MM
    try:
        start = datetime.strptime(month + "-01", "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "Invalid month format YYYY-MM")
    if start.month == 12:
        end = date(start.year + 1, 1, 1) - timedelta(days=1)
    else:
        end = date(start.year, start.month + 1, 1) - timedelta(days=1)

    exists = db.query(BranchMonthClose).filter(
        BranchMonthClose.branch_id == branch_id,
        BranchMonthClose.month_key == month,
        BranchMonthClose.shop_id == user.shop_id
    ).first()
    if exists:
        raise HTTPException(400, "Branch already closed for this month")

    totals = calc_totals(db, user.shop_id, branch_id, start, end)
    close = BranchMonthClose(
        shop_id=user.shop_id,
        branch_id=branch_id,
        month_key=month,
        month_start=start,
        month_end=end,
        closed_by=user.user_id,
        **totals
    )
    db.add(close)
    db.commit()

    # If all branches closed, close shop month
    branches = db.query(Branch).filter(
        Branch.status == "ACTIVE",
        Branch.shop_id == user.shop_id
    ).all()
    closed_count = db.query(BranchMonthClose).filter(
        BranchMonthClose.month_key == month,
        BranchMonthClose.shop_id == user.shop_id
    ).count()
    if closed_count == len(branches):
        shop_exists = db.query(ShopMonthClose).filter(
            ShopMonthClose.month_key == month,
            ShopMonthClose.shop_id == user.shop_id
        ).first()
        if not shop_exists:
            shop_totals = calc_totals(db, user.shop_id, None, start, end)
            shop_close = ShopMonthClose(
                shop_id=user.shop_id,
                month_key=month,
                month_start=start,
                month_end=end,
                closed_by=user.user_id,
                **shop_totals
            )
            db.add(shop_close)
            db.commit()

    return {"message": "Branch month closed", "totals": totals}


@router.post("/shop")
def close_shop_day(
    date_str: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    admin_or_manager(user)

    head_branch = db.query(Branch).filter(
        Branch.branch_id == user.branch_id,
        Branch.shop_id == user.shop_id
    ).first()
    if not head_branch or (
        "head" not in (head_branch.type or "").lower()
        and "head" not in (head_branch.branch_name or "").lower()
    ):
        raise HTTPException(403, "Shop close allowed only from Head Office")

    d = parse_date(date_str)

    # ensure all branches closed (using branch_close flag)
    branches = db.query(Branch).filter(
        Branch.status == "ACTIVE",
        Branch.shop_id == user.shop_id
    ).all()
    active_branches = [
        b for b in branches
        if (
            b.branch_id != 1
            and "head" not in (b.type or "").lower()
            and "head" not in (b.branch_name or "").lower()
        )
    ]
    closed_ids = set(
        r[0] for r in db.query(BranchDayClose.branch_id)
        .filter(BranchDayClose.close_date == d, BranchDayClose.shop_id == user.shop_id)
        .all()
    )

    if any(
        (b.branch_close or "N").upper() != "Y" and b.branch_id not in closed_ids
        for b in active_branches
    ):
        pending = [
            b.branch_name for b in active_branches
            if (b.branch_close or "N").upper() != "Y" and b.branch_id not in closed_ids
        ]
        detail = "All branches must be closed first"
        if pending:
            detail += f": {', '.join(pending)}"
        raise HTTPException(400, detail)

    # wipe existing day-close rows for this date and recalculate
    db.query(BranchDayClose).filter(
        BranchDayClose.close_date == d,
        BranchDayClose.shop_id == user.shop_id
    ).delete()
    db.query(ShopDayClose).filter(
        ShopDayClose.close_date == d,
        ShopDayClose.shop_id == user.shop_id
    ).delete()
    db.query(DateWiseStock).filter(
        DateWiseStock.stock_date == d,
        DateWiseStock.shop_id == user.shop_id
    ).delete()
    db.commit()

    for b in active_branches:
        totals = calc_totals(db, user.shop_id, b.branch_id, d, d)
        db.add(BranchDayClose(
            shop_id=user.shop_id,
            branch_id=b.branch_id,
            close_date=d,
            closed_by=user.user_id,
            **totals
        ))
        snapshot_stock(db, user.shop_id, b.branch_id, d)
    db.commit()

    shop_totals = calc_totals(db, user.shop_id, None, d, d)
    db.add(ShopDayClose(
        shop_id=user.shop_id,
        close_date=d,
        closed_by=user.user_id,
        **shop_totals
    ))

    # auto month close as part of shop close
    month_key = d.strftime("%Y-%m")
    month_start = date(d.year, d.month, 1)
    if d.month == 12:
        month_end = date(d.year + 1, 1, 1) - timedelta(days=1)
    else:
        month_end = date(d.year, d.month + 1, 1) - timedelta(days=1)

    db.query(BranchMonthClose).filter(
        BranchMonthClose.month_key == month_key,
        BranchMonthClose.shop_id == user.shop_id
    ).delete()
    db.query(ShopMonthClose).filter(
        ShopMonthClose.month_key == month_key,
        ShopMonthClose.shop_id == user.shop_id
    ).delete()
    db.commit()

    for b in active_branches:
        month_totals = calc_totals(db, user.shop_id, b.branch_id, month_start, month_end)
        db.add(BranchMonthClose(
            shop_id=user.shop_id,
            branch_id=b.branch_id,
            month_key=month_key,
            month_start=month_start,
            month_end=month_end,
            closed_by=user.user_id,
            **month_totals
        ))
    db.commit()

    shop_month_totals = calc_totals(db, user.shop_id, None, month_start, month_end)
    db.add(ShopMonthClose(
        shop_id=user.shop_id,
        month_key=month_key,
        month_start=month_start,
        month_end=month_end,
        closed_by=user.user_id,
        **shop_month_totals
    ))

    # advance app date
    from app.models.shop_details import ShopDetails
    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == user.shop_id).first()
    if shop:
        shop.app_date = d + timedelta(days=1)
    # reset branch close flags
    db.query(Branch).filter(Branch.shop_id == user.shop_id).update({"branch_close": "N"})
    db.commit()

    return {"message": "Shop day closed", "totals": shop_totals, "next_date": (d + timedelta(days=1)).isoformat()}
