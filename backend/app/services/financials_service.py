from __future__ import annotations

from datetime import date

from sqlalchemy import and_, case, func
from sqlalchemy.orm import Session

from app.models.branch_expense import BranchExpense
from app.models.employee import EmployeeAttendance
from app.models.invoice import Invoice
from app.models.invoice_details import InvoiceDetail
from app.models.sales_return import SalesReturn, SalesReturnItem
from app.utils.shop_type import get_shop_billing_type


def calc_period_financials(
    db: Session,
    *,
    shop_id: int,
    branch_id: int | None,
    from_dt: date,
    to_dt: date,
) -> dict[str, float]:
    shop_type = get_shop_billing_type(db, int(shop_id))

    inv_total_expr = func.coalesce(Invoice.total_amount, 0)
    inv_tax_expr = func.coalesce(Invoice.tax_amt, 0)
    inv_sales_ex_tax_expr = inv_total_expr - inv_tax_expr
    inv_discount_expr = func.coalesce(Invoice.discounted_amt, 0)
    inv_discount_ex_tax_expr = case(
        (
            inv_total_expr > 0,
            inv_discount_expr * (inv_sales_ex_tax_expr / func.nullif(inv_total_expr, 0)),
        ),
        else_=0,
    )

    inv_q = db.query(Invoice).filter(
        Invoice.shop_id == shop_id,
        func.date(Invoice.created_time).between(from_dt, to_dt),
    )
    if branch_id is not None:
        inv_q = inv_q.filter(Invoice.branch_id == branch_id)

    inv_row = inv_q.with_entities(
        func.coalesce(
            func.sum(inv_sales_ex_tax_expr),
            0,
        ).label("sales_ex_tax"),
        func.coalesce(func.sum(func.coalesce(Invoice.tax_amt, 0)), 0).label("gst"),
        func.coalesce(func.sum(func.coalesce(Invoice.discounted_amt, 0)), 0).label("discount"),
        func.coalesce(func.sum(inv_discount_ex_tax_expr), 0).label("discount_ex_tax"),
    ).first()

    invoice_sales_ex_tax = float(getattr(inv_row, "sales_ex_tax", 0) or 0)
    invoice_gst = float(getattr(inv_row, "gst", 0) or 0)
    invoice_discount = float(getattr(inv_row, "discount", 0) or 0)
    invoice_discount_ex_tax = float(getattr(inv_row, "discount_ex_tax", 0) or 0)

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
    ret_inv_total_expr = func.coalesce(Invoice.total_amount, 0)
    ret_inv_tax_expr = func.coalesce(Invoice.tax_amt, 0)
    ret_inv_sales_ex_tax_expr = ret_inv_total_expr - ret_inv_tax_expr
    ret_discount_ex_tax_expr = case(
        (
            ret_inv_total_expr > 0,
            func.coalesce(SalesReturn.discount_amount, 0)
            * (ret_inv_sales_ex_tax_expr / func.nullif(ret_inv_total_expr, 0)),
        ),
        else_=0,
    )

    ret_q = (
        db.query(SalesReturn)
        .join(
            Invoice,
            and_(
                Invoice.invoice_id == SalesReturn.invoice_id,
                Invoice.shop_id == SalesReturn.shop_id,
            ),
        )
        .filter(
        SalesReturn.shop_id == shop_id,
        SalesReturn.status != "CANCELLED",
        func.date(SalesReturn.created_on).between(from_dt, to_dt),
    )
    )
    if branch_id is not None:
        ret_q = ret_q.filter(SalesReturn.branch_id == branch_id)

    ret_row = ret_q.with_entities(
        func.coalesce(func.sum(func.coalesce(SalesReturn.tax_amount, 0)), 0).label("ret_tax"),
        func.coalesce(func.sum(func.coalesce(SalesReturn.discount_amount, 0)), 0).label(
            "ret_discount"
        ),
        func.coalesce(func.sum(ret_discount_ex_tax_expr), 0).label("ret_discount_ex_tax"),
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
    ret_discount_ex_tax = float(getattr(ret_row, "ret_discount_ex_tax", 0) or 0)
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

    # Employee wages treated as expense (earned on attendance date).
    wage_q = db.query(func.coalesce(func.sum(EmployeeAttendance.wage_amount), 0)).filter(
        EmployeeAttendance.shop_id == shop_id,
        EmployeeAttendance.attendance_date.between(from_dt, to_dt),
    )
    if branch_id is not None:
        wage_q = wage_q.filter(EmployeeAttendance.branch_id == branch_id)
    wages_expense = float(wage_q.scalar() or 0)

    expense = float(expense + wages_expense)

    sales = invoice_sales_ex_tax - ret_sales_ex_tax
    gst = invoice_gst - ret_tax
    discount = invoice_discount - ret_discount
    discount_ex_tax = invoice_discount_ex_tax - ret_discount_ex_tax

    cogs_net = invoice_cogs - ret_cogs
    if shop_type == "hotel":
        # Hotels: day-end profit is sales (ex GST, net of discounts/returns) - expenses.
        cogs_net = 0.0
        gross_profit = (sales - discount_ex_tax)
    else:
        # Shops: consider COGS for profit.
        gross_profit = (sales - discount_ex_tax) - cogs_net
    net_profit = gross_profit - expense
    profit = net_profit

    return {
        "invoice_sales_ex_tax": invoice_sales_ex_tax,
        "invoice_gst": invoice_gst,
        "invoice_discount": invoice_discount,
        "invoice_discount_ex_tax": invoice_discount_ex_tax,
        "invoice_cogs": invoice_cogs,
        "returns_sales_ex_tax": ret_sales_ex_tax,
        "returns_tax": ret_tax,
        "returns_discount": ret_discount,
        "returns_discount_ex_tax": ret_discount_ex_tax,
        "returns_refund": ret_refund,
        "returns_cogs": ret_cogs,
        "sales_ex_tax": sales,
        "gst": gst,
        "discount": discount,
        "discount_ex_tax": discount_ex_tax,
        "expense": expense,
        "wages_expense": wages_expense,
        "cogs_net": cogs_net,
        "gross_profit": gross_profit,
        "net_profit": net_profit,
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
