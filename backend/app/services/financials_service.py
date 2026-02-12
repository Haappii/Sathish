from __future__ import annotations

from datetime import date

from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from app.models.branch_expense import BranchExpense
from app.models.invoice import Invoice
from app.models.invoice_details import InvoiceDetail
from app.models.sales_return import SalesReturn, SalesReturnItem


def calc_period_financials(
    db: Session,
    *,
    shop_id: int,
    branch_id: int | None,
    from_dt: date,
    to_dt: date,
) -> dict[str, float]:
    inv_q = db.query(Invoice).filter(
        Invoice.shop_id == shop_id,
        func.date(Invoice.created_time).between(from_dt, to_dt),
    )
    if branch_id is not None:
        inv_q = inv_q.filter(Invoice.branch_id == branch_id)

    inv_row = inv_q.with_entities(
        func.coalesce(
            func.sum(func.coalesce(Invoice.total_amount, 0) - func.coalesce(Invoice.tax_amt, 0)),
            0,
        ).label("sales_ex_tax"),
        func.coalesce(func.sum(func.coalesce(Invoice.tax_amt, 0)), 0).label("gst"),
        func.coalesce(func.sum(func.coalesce(Invoice.discounted_amt, 0)), 0).label("discount"),
    ).first()

    invoice_sales_ex_tax = float(getattr(inv_row, "sales_ex_tax", 0) or 0)
    invoice_gst = float(getattr(inv_row, "gst", 0) or 0)
    invoice_discount = float(getattr(inv_row, "discount", 0) or 0)

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
        func.coalesce(func.sum(func.coalesce(SalesReturn.discount_amount, 0)), 0).label(
            "ret_discount"
        ),
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
    ret_refund = float(getattr(ret_row, "ret_refund", 0) or 0)
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
        db.query(func.coalesce(func.sum(SalesReturnItem.quantity * inv_cost_sq.c.buy_price), 0))
        .join(SalesReturn, SalesReturn.return_id == SalesReturnItem.return_id)
        .join(
            inv_cost_sq,
            and_(
                inv_cost_sq.c.invoice_id == SalesReturn.invoice_id,
                inv_cost_sq.c.item_id == SalesReturnItem.item_id,
            ),
        )
        .filter(
            SalesReturnItem.shop_id == shop_id,
            SalesReturn.shop_id == shop_id,
            SalesReturn.status != "CANCELLED",
            func.date(SalesReturn.created_on).between(from_dt, to_dt),
        )
    )
    if branch_id is not None:
        ret_cogs_q = ret_cogs_q.filter(SalesReturn.branch_id == branch_id)
    ret_cogs = float(ret_cogs_q.scalar() or 0)

    exp_q = db.query(func.sum(BranchExpense.amount)).filter(
        BranchExpense.expense_date.between(from_dt, to_dt),
        BranchExpense.shop_id == shop_id,
    )
    if branch_id is not None:
        exp_q = exp_q.filter(BranchExpense.branch_id == branch_id)
    expense = float(exp_q.scalar() or 0)

    sales = invoice_sales_ex_tax - ret_sales_ex_tax
    gst = invoice_gst - ret_tax
    discount = invoice_discount - ret_discount

    cogs_net = invoice_cogs - ret_cogs
    profit = (sales - discount) - cogs_net - expense

    return {
        "invoice_sales_ex_tax": invoice_sales_ex_tax,
        "invoice_gst": invoice_gst,
        "invoice_discount": invoice_discount,
        "invoice_cogs": invoice_cogs,
        "returns_sales_ex_tax": ret_sales_ex_tax,
        "returns_tax": ret_tax,
        "returns_discount": ret_discount,
        "returns_refund": ret_refund,
        "returns_cogs": ret_cogs,
        "sales_ex_tax": sales,
        "gst": gst,
        "discount": discount,
        "expense": expense,
        "cogs_net": cogs_net,
        "profit": profit,
    }


def calc_day_close_totals(
    db: Session,
    *,
    shop_id: int,
    branch_id: int | None,
    from_dt: date,
    to_dt: date,
) -> dict[str, float]:
    f = calc_period_financials(
        db,
        shop_id=shop_id,
        branch_id=branch_id,
        from_dt=from_dt,
        to_dt=to_dt,
    )
    return {
        "total_sales": float(f.get("sales_ex_tax", 0) or 0),
        "total_gst": float(f.get("gst", 0) or 0),
        "total_discount": float(f.get("discount", 0) or 0),
        "total_expense": float(f.get("expense", 0) or 0),
        "total_profit": float(f.get("profit", 0) or 0),
    }

