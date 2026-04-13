from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, case, func
from sqlalchemy.orm import Session
from datetime import datetime, date, timedelta

from app.db import get_db
from app.models.branch import Branch
from app.models.table_billing import Order, TableMaster
from app.models.day_close import BranchDayClose, ShopDayClose
from app.models.month_close import BranchMonthClose, ShopMonthClose
from app.models.stock import Inventory
from app.models.date_wise_stock import DateWiseStock
from app.models.invoice import Invoice
from app.models.invoice_payment import InvoicePayment
from app.models.branch_expense import BranchExpense
from app.models.sales_return import SalesReturn
from app.models.sales_return_meta import SalesReturnMeta
from app.models.cash_drawer import CashMovement, CashShift
from app.models.advance_order import AdvanceOrder
from app.models.employee import EmployeeWagePayment
from app.services.financials_service import calc_day_close_totals
from app.utils.permissions import require_permission
from app.utils.head_office import is_head_office_branch, get_head_office_branch_id
from app.models.shop_details import ShopDetails

router = APIRouter(prefix="/day-close", tags=["Day Close"])
TAKEAWAY_TABLE_NAME = "__TAKEAWAY__"


def _normalize_payment_mode_label(mode: str | None) -> str:
    normalized = str(mode or "").strip().lower().replace("-", "_").replace(" ", "_")
    mapping = {
        "cash": "CASH",
        "upi": "UPI",
        "card": "CARD",
        "gift_card": "GIFT CARD",
        "giftcard": "GIFT CARD",
        "wallet": "WALLET",
    }
    return mapping.get(normalized, str(mode or "cash").strip().upper() or "CASH")


def _cash_amount_from_invoice_row(payment_mode: str | None, payment_split, total_amount, discounted_amt) -> float:
    mode = str(payment_mode or "cash").strip().lower()
    net = float(total_amount or 0) - float(discounted_amt or 0)
    if mode == "cash":
        return round(net, 2)
    if mode == "split" and isinstance(payment_split, dict):
        return round(float(payment_split.get("cash") or 0), 2)
    return 0.0


def parse_date(d: str) -> date:
    try:
        return datetime.strptime(d, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "Invalid date format YYYY-MM-DD")


def calc_totals(db: Session, shop_id: int, branch_id: int | None, from_dt: date, to_dt: date):
    return calc_day_close_totals(
        db,
        shop_id=shop_id,
        branch_id=branch_id,
        from_dt=from_dt,
        to_dt=to_dt,
    )


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


def count_open_table_orders(db: Session, shop_id: int, branch_id: int) -> int:
    # Ignore hidden takeaway rows so branch close only blocks on actual table orders.
    return (
        db.query(Order.order_id)
        .outerjoin(
            TableMaster,
            and_(
                TableMaster.table_id == Order.table_id,
                TableMaster.shop_id == Order.shop_id,
            ),
        )
        .filter(
            Order.shop_id == shop_id,
            Order.branch_id == branch_id,
            Order.status == "OPEN",
            func.coalesce(func.upper(Order.order_type), "DINE_IN") != "TAKEAWAY",
            func.coalesce(TableMaster.table_name, "") != TAKEAWAY_TABLE_NAME,
        )
        .count()
    )


@router.get("/cash-summary")
def day_close_cash_summary(
    date_str: str,
    branch_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("day_close", "read")),
):
    """
    Returns a cash-flow summary:
            Opening Balance + Cash In (sales + advance payments + due collections + top-up)
            − Cash Out (cash refunds + cash expenses + withdrawals)
    """
    d = parse_date(date_str)
    d_start = datetime.combine(d, datetime.min.time())
    d_end   = datetime.combine(d, datetime.max.time())
    shop_id = user.shop_id

    # ── Opening balance (most recent shift opened on this date or earlier) ───
    shift = (
        db.query(CashShift)
        .filter(
            CashShift.shop_id == shop_id,
            CashShift.branch_id == branch_id,
            CashShift.opened_at >= d_start,
            CashShift.opened_at <= d_end,
        )
        .order_by(CashShift.opened_at.desc())
        .first()
    )
    opening_balance = float(shift.opening_cash or 0) if shift else 0.0

    mov_row = (
        db.query(
            func.coalesce(
                func.sum(
                    case((CashMovement.movement_type == "IN", CashMovement.amount), else_=0)
                ),
                0,
            ).label("cash_top_up"),
            func.coalesce(
                func.sum(
                    case((CashMovement.movement_type == "OUT", CashMovement.amount), else_=0)
                ),
                0,
            ).label("cash_withdrawal"),
        )
        .filter(
            CashMovement.shop_id == shop_id,
            CashMovement.branch_id == branch_id,
            CashMovement.created_at >= d_start,
            CashMovement.created_at <= d_end,
        )
        .first()
    )
    cash_top_up = float(getattr(mov_row, "cash_top_up", 0) or 0)
    cash_withdrawal = float(getattr(mov_row, "cash_withdrawal", 0) or 0)

    # ── Invoice payment mode breakdown ───────────────────────────────────────
    invoice_rows = (
        db.query(
            Invoice.payment_mode,
            Invoice.payment_split,
            Invoice.total_amount,
            Invoice.discounted_amt,
        )
        .filter(
            Invoice.shop_id == shop_id,
            Invoice.branch_id == branch_id,
            Invoice.created_time >= d_start,
            Invoice.created_time <= d_end,
        )
        .all()
    )

    payment_by_mode: dict[str, float] = {}

    def add_payment(mode_key: str | None, amount: float):
        amt = round(float(amount or 0), 2)
        if amt <= 0:
            return
        label = _normalize_payment_mode_label(mode_key)
        payment_by_mode[label] = round(payment_by_mode.get(label, 0.0) + amt, 2)

    for row in invoice_rows:
        mode = (row.payment_mode or "cash").strip().lower()
        net = float(row.total_amount or 0) - float(row.discounted_amt or 0)
        if mode == "split" and row.payment_split:
            ps = row.payment_split if isinstance(row.payment_split, dict) else {}
            for key in ("cash", "card", "upi"):
                add_payment(key, float(ps.get(key) or 0))
            gift = float(ps.get("gift_card_amount") or 0)
            add_payment("gift_card", gift)
            wallet = float(ps.get("wallet_amount") or 0)
            add_payment("wallet", wallet)
        else:
            add_payment(mode, net)

    payment_by_mode = {
        key: round(float(value or 0), 2)
        for key, value in payment_by_mode.items()
        if round(float(value or 0), 2) > 0
    }

    # ── Invoice summary ──────────────────────────────────────────────────────
    inv_row = (
        db.query(
            func.count(func.distinct(Invoice.invoice_id)).label("bill_count"),
            func.coalesce(func.sum(Invoice.total_amount), 0).label("gross"),
            func.coalesce(func.sum(Invoice.tax_amt), 0).label("tax"),
            func.coalesce(func.sum(Invoice.discounted_amt), 0).label("discount"),
        )
        .filter(
            Invoice.shop_id == shop_id,
            Invoice.branch_id == branch_id,
            Invoice.created_time >= d_start,
            Invoice.created_time <= d_end,
        )
        .first()
    )

    # ── Dues collections paid in cash ────────────────────────────────────────
    cash_collections = float(
        (
            db.query(func.coalesce(func.sum(InvoicePayment.amount), 0))
            .filter(
                InvoicePayment.shop_id == shop_id,
                InvoicePayment.branch_id == branch_id,
                func.lower(InvoicePayment.payment_mode) == "cash",
                InvoicePayment.paid_on >= d_start,
                InvoicePayment.paid_on <= d_end,
            )
            .scalar()
            or 0
        )
    )

    # ── Advance order cash receipts ──────────────────────────────────────────
    cash_advance_payments = float(
        (
            db.query(func.coalesce(func.sum(AdvanceOrder.advance_amount), 0))
            .filter(
                AdvanceOrder.shop_id == shop_id,
                AdvanceOrder.branch_id == branch_id,
                AdvanceOrder.status != "CANCELLED",
                func.upper(func.coalesce(AdvanceOrder.advance_payment_mode, "")) == "CASH",
                AdvanceOrder.created_at >= d_start,
                AdvanceOrder.created_at <= d_end,
            )
            .scalar()
            or 0
        )
    )

    # ── Returns ──────────────────────────────────────────────────────────────
    ret_row = (
        db.query(
            func.count(func.distinct(SalesReturn.return_id)).label("return_count"),
            func.coalesce(func.sum(SalesReturn.refund_amount), 0).label("return_amount"),
        )
        .outerjoin(
            SalesReturnMeta,
            and_(
                SalesReturnMeta.shop_id == SalesReturn.shop_id,
                SalesReturnMeta.return_id == SalesReturn.return_id,
            ),
        )
        .filter(
            SalesReturn.shop_id == shop_id,
            SalesReturn.branch_id == branch_id,
            SalesReturn.status != "CANCELLED",
            SalesReturn.created_on >= d_start,
            SalesReturn.created_on <= d_end,
            case(
                (SalesReturnMeta.id.is_(None), True),
                else_=func.upper(SalesReturnMeta.refund_mode) == "CASH",
            ),
        )
        .first()
    )
    return_cash = float(ret_row.return_amount or 0) if ret_row else 0.0

    # ── Cash expenses ─────────────────────────────────────────────────────────
    exp_rows = (
        db.query(
            BranchExpense.category,
            BranchExpense.payment_mode,
            func.coalesce(func.sum(BranchExpense.amount), 0).label("total"),
        )
        .filter(
            BranchExpense.shop_id == shop_id,
            BranchExpense.branch_id == branch_id,
            BranchExpense.expense_date == d,
        )
        .group_by(BranchExpense.category, BranchExpense.payment_mode)
        .all()
    )
    expenses = [
        {"category": r.category,
         "payment_mode": (r.payment_mode or "cash").upper(),
         "amount": float(r.total or 0)}
        for r in exp_rows
    ]
    cash_expense = sum(e["amount"] for e in expenses if e["payment_mode"] == "CASH")

    # ── Cash wage payments ────────────────────────────────────────────────────
    wage_rows = (
        db.query(
            func.coalesce(func.sum(EmployeeWagePayment.amount), 0).label("total"),
        )
        .filter(
            EmployeeWagePayment.shop_id == shop_id,
            EmployeeWagePayment.branch_id == branch_id,
            EmployeeWagePayment.payment_date == d,
            func.upper(EmployeeWagePayment.payment_mode) == "CASH",
        )
        .first()
    )
    cash_wages = float(wage_rows.total or 0) if wage_rows else 0.0

    # ── Final cash position ───────────────────────────────────────────────────
    sales_cash = payment_by_mode.get("CASH", 0.0)
    operational_cash_out = round(return_cash + cash_expense, 2)
    cash_in     = round(sales_cash + cash_collections + cash_advance_payments + cash_top_up, 2)
    cash_out    = round(operational_cash_out + cash_withdrawal, 2)
    system_cash = round(opening_balance + cash_in - cash_out, 2)

    gross = float(inv_row.gross or 0) if inv_row else 0.0
    net   = round(gross - float(inv_row.discount or 0), 2) if inv_row else 0.0
    total_amount = round(sum(payment_by_mode.values()), 2)
    tracked_modes = {"CASH", "UPI", "CARD", "GIFT CARD", "WALLET"}
    other_payments = round(
        sum(amount for key, amount in payment_by_mode.items() if key not in tracked_modes),
        2,
    )
    report_totals = {
        "bill_count": int(inv_row.bill_count or 0) if inv_row else 0,
        "total_amount": total_amount,
        "cash": round(payment_by_mode.get("CASH", 0.0), 2),
        "upi": round(payment_by_mode.get("UPI", 0.0), 2),
        "card": round(payment_by_mode.get("CARD", 0.0), 2),
        "gift_card": round(payment_by_mode.get("GIFT CARD", 0.0), 2),
        "wallet": round(payment_by_mode.get("WALLET", 0.0), 2),
        "other": other_payments,
        "discount": round(float(inv_row.discount or 0), 2) if inv_row else 0.0,
        "gst": round(float(inv_row.tax or 0), 2) if inv_row else 0.0,
    }

    return {
        "date": str(d),
        "branch_id": branch_id,
        # Opening
        "opening_balance": round(opening_balance, 2),
        # Sales
        "bill_count":     int(inv_row.bill_count or 0) if inv_row else 0,
        "gross_sales":    round(gross, 2),
        "total_discount": round(float(inv_row.discount or 0), 2) if inv_row else 0.0,
        "total_tax":      round(float(inv_row.tax or 0), 2) if inv_row else 0.0,
        "net_sales":      net,
        "total_amount":   total_amount,
        "total_cash":     round(sales_cash, 2),
        "report_totals":  report_totals,
        # Payment mode breakdown
        "payment_modes":  payment_by_mode,
        "cash_sales":     round(sales_cash, 2),
        "cash_collections": round(cash_collections, 2),
        "cash_advance_payments": round(cash_advance_payments, 2),
        "cash_top_up":    round(cash_top_up, 2),
        "cash_in":        round(cash_in, 2),
        # Cash out breakdown
        "return_count":   int(ret_row.return_count or 0) if ret_row else 0,
        "return_cash":    round(return_cash, 2),
        "expenses":       expenses,
        "cash_expense":   round(cash_expense, 2),
        "cash_wages":     round(cash_wages, 2),
        "operational_cash_out": round(operational_cash_out, 2),
        "cash_withdrawal": round(cash_withdrawal, 2),
        "cash_out":       cash_out,
        # Net
        "system_cash":    system_cash,
    }


@router.get("/status")
def day_close_status(
    date_str: str,
    db: Session = Depends(get_db),
    user=Depends(require_permission("day_close", "read")),
):
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
    user=Depends(require_permission("day_close", "write")),
):
    d = parse_date(date_str)

    open_table_orders = count_open_table_orders(
        db,
        int(user.shop_id),
        int(branch_id),
    )
    if open_table_orders > 0:
        raise HTTPException(
            400,
            "Please complete or cancel all open table orders before closing the branch."
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
    user=Depends(require_permission("day_close", "write")),
):
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
    user=Depends(require_permission("day_close", "write")),
):
    # Permission already checked by dependency.

    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == user.shop_id).first()
    if not is_head_office_branch(
        db,
        shop_id=user.shop_id,
        branch_id=getattr(user, "branch_id", None),
        shop=shop,
    ):
        raise HTTPException(403, "Shop close allowed only from Head Office")

    d = parse_date(date_str)

    # ensure all branches closed (using branch_close flag)
    head_office_branch_id = get_head_office_branch_id(db, shop_id=user.shop_id, shop=shop)
    branches = db.query(Branch).filter(
        Branch.status == "ACTIVE",
        Branch.shop_id == user.shop_id
    ).all()
    active_branches = [
        b for b in branches
        if head_office_branch_id is None or int(b.branch_id) != int(head_office_branch_id)
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
    if shop:
        shop.app_date = d + timedelta(days=1)
    # reset branch close flags
    db.query(Branch).filter(Branch.shop_id == user.shop_id).update({"branch_close": "N"})
    db.commit()

    return {"message": "Shop day closed", "totals": shop_totals, "next_date": (d + timedelta(days=1)).isoformat()}
