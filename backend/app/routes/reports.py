from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, cast, Integer
from datetime import datetime, timedelta

from app.db import get_db
from app.utils.permissions import require_permission

from app.models.invoice import Invoice
from app.models.invoice_details import InvoiceDetail
from app.models.items import Item
from app.models.category import Category
from app.models.users import User
from app.models.branch import Branch
from app.models.invoice_archive import InvoiceArchive
from app.models.stock import Inventory
from app.models.stock_ledger import StockLedger
from app.models.date_wise_stock import DateWiseStock
from app.models.audit_log import AuditLog
from app.models.table_billing import TableMaster, Order
from app.models.branch_expense import BranchExpense
from app.models.supplier import Supplier
from app.models.purchase_order import PurchaseOrder

router = APIRouter(prefix="/reports", tags=["Reports"])


def _is_admin(user) -> bool:
    return str(getattr(user, "role_name", "") or "").strip().lower() == "admin"


def _force_branch(branch_id: int | None, user) -> int | None:
    if _is_admin(user):
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


# =====================================================
# DATE PARSER
# =====================================================
def parse_dates(from_date: str, to_date: str):
    try:
        return (
            datetime.strptime(from_date, "%Y-%m-%d"),
            datetime.strptime(to_date, "%Y-%m-%d"),
        )
    except ValueError:
        raise HTTPException(400, "Invalid date format YYYY-MM-DD")


# =====================================================
# GROUP BY RESOLVER
# =====================================================
def resolve_group_by(group_by: str):
    if group_by == "date":
        return func.date(Invoice.created_time), "date"
    if group_by == "month":
        return func.to_char(Invoice.created_time, "YYYY-MM"), "month"
    if group_by == "user":
        return User.user_name, "user"
    if group_by == "branch":
        return Branch.branch_name, "branch"

    raise HTTPException(400, "Invalid group_by value")


# =====================================================
# SALES SUMMARY (ALL MODES + BRANCH COLUMN)
# =====================================================
@router.get("/sales/summary")
def sales_summary(
    from_date: str,
    to_date: str,
    group_by: str = "date",
    user_id: int | None = None,
    branch_id: int | None = None,
    payment_mode: str | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t = parse_dates(from_date, to_date)
    branch_id = _force_branch(branch_id, user)
    group_col, label = resolve_group_by(group_by)

    cols = [
        group_col.label(label),
        Branch.branch_name.label("branch"),
        func.count(func.distinct(Invoice.invoice_id)).label("bills"),
        func.sum(InvoiceDetail.quantity * Item.price).label("sub_total"),
        func.sum(Invoice.tax_amt).label("gst"),
        func.sum(Invoice.discounted_amt).label("discount"),
        func.sum(
            (InvoiceDetail.quantity * Item.price)
            + Invoice.tax_amt
            - Invoice.discounted_amt
        ).label("grand_total"),
    ]

    q = (
        db.query(*cols)
        .join(InvoiceDetail, InvoiceDetail.invoice_id == Invoice.invoice_id)
        .join(Item, Item.item_id == InvoiceDetail.item_id)
        .outerjoin(User, User.user_id == Invoice.created_user)
        .outerjoin(Branch, Branch.branch_id == Invoice.branch_id)
        .filter(Invoice.shop_id == user.shop_id)
        .filter(Invoice.created_time.between(f, t))
        .group_by(group_col, Branch.branch_name)
        .order_by(group_col)
    )

    if user_id:
        q = q.filter(Invoice.created_user == user_id)

    if branch_id:
        q = q.filter(Invoice.branch_id == branch_id)

    if payment_mode:
        q = q.filter(Invoice.payment_mode == payment_mode)

    rows = q.all()

    return [
        {
            label: r[0],
            "branch": r.branch,
            "bills": int(r.bills or 0),
            "sub_total": float(r.sub_total or 0),
            "gst": float(r.gst or 0),
            "discount": float(r.discount or 0),
            "grand_total": float(r.grand_total or 0),
        }
        for r in rows
    ]


# =====================================================
# ITEM-WISE SALES (WITH BRANCH)
# =====================================================
@router.get("/sales/items")
def item_wise_sales(
    from_date: str,
    to_date: str,
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t = parse_dates(from_date, to_date)
    branch_id = _force_branch(branch_id, user)

    q = (
        db.query(
            Item.item_name.label("item"),
            Branch.branch_name.label("branch"),
            func.sum(InvoiceDetail.quantity).label("quantity"),
            func.sum(InvoiceDetail.amount).label("amount"),
        )
        .join(InvoiceDetail, InvoiceDetail.item_id == Item.item_id)
        .join(Invoice, Invoice.invoice_id == InvoiceDetail.invoice_id)
        .outerjoin(Branch, Branch.branch_id == Invoice.branch_id)
        .filter(Invoice.shop_id == user.shop_id)
        .filter(Invoice.created_time.between(f, t))
        .group_by(Item.item_name, Branch.branch_name)
        .order_by(func.sum(InvoiceDetail.amount).desc())
    )

    if branch_id:
        q = q.filter(Invoice.branch_id == branch_id)

    return [
        {
            "item": r.item,
            "branch": r.branch,
            "quantity": int(r.quantity or 0),
            "amount": float(r.amount or 0),
        }
        for r in q.all()
    ]


# =====================================================
# INVOICE DETAIL REPORT (ITEM LINES + TOTALS)
# =====================================================
@router.get("/sales/invoice-details")
def invoice_detail_report(
    from_date: str,
    to_date: str,
    branch_id: int | None = None,
    payment_mode: str | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t = parse_dates(from_date, to_date)
    branch_id = _force_branch(branch_id, user)

    total_items = func.sum(InvoiceDetail.quantity).over(
        partition_by=Invoice.invoice_id
    ).label("total_items")
    sub_total = func.sum(InvoiceDetail.amount).over(
        partition_by=Invoice.invoice_id
    ).label("sub_total")

    q = (
        db.query(
            Invoice.created_time,
            Invoice.invoice_number,
            Invoice.customer_name,
            Invoice.mobile,
            Invoice.gst_number,
            Invoice.total_amount,
            Invoice.tax_amt,
            Invoice.discounted_amt,
            Invoice.payment_mode,
            InvoiceDetail.quantity,
            Item.item_name,
            Item.price,
            User.user_name.label("created_user"),
            total_items,
            sub_total,
        )
        .join(InvoiceDetail, InvoiceDetail.invoice_id == Invoice.invoice_id)
        .join(Item, Item.item_id == InvoiceDetail.item_id)
        .join(User, User.user_id == Invoice.created_user)
        .filter(Invoice.shop_id == user.shop_id)
        .filter(Invoice.created_time.between(f, t))
        .order_by(Invoice.invoice_id.desc())
    )

    if branch_id:
        q = q.filter(Invoice.branch_id == branch_id)

    if payment_mode:
        q = q.filter(Invoice.payment_mode == payment_mode)

    rows = q.all()

    result = []
    for r in rows:
        customer = " / ".join(
            [x for x in [r.customer_name, r.mobile, r.gst_number] if x]
        )
        result.append(
            {
                "invoice_date": r.created_time.strftime("%d %b %Y"),
                "invoice_time": r.created_time.strftime("%H:%M"),
                "invoice_number": r.invoice_number,
                "customer": customer,
                "item_name": r.item_name,
                "quantity": int(r.quantity or 0),
                "price": float(r.price or 0),
                "total_items": int(r.total_items or 0),
                "sub_total": float(r.sub_total or 0),
                "gst": float(r.tax_amt or 0),
                "discount": float(r.discounted_amt or 0),
                "grand_total": float(r.total_amount or 0),
                "payment_mode": r.payment_mode or "cash",
                "created_user": r.created_user,
            }
        )

    return result


# =====================================================
# CUSTOMER INVOICE DETAILS
# =====================================================
@router.get("/sales/customer-invoices")
def customer_invoice_details(
    from_date: str,
    to_date: str,
    customer_number: str,
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    if not customer_number:
        raise HTTPException(400, "Customer number is required")

    f, t = parse_dates(from_date, to_date)
    branch_id = _force_branch(branch_id, user)

    total_items = func.sum(InvoiceDetail.quantity).over(
        partition_by=Invoice.invoice_id
    ).label("total_items")
    sub_total = func.sum(InvoiceDetail.amount).over(
        partition_by=Invoice.invoice_id
    ).label("sub_total")

    q = (
        db.query(
            Invoice.created_time,
            Invoice.invoice_number,
            Invoice.customer_name,
            Invoice.mobile,
            Invoice.gst_number,
            Invoice.total_amount,
            Invoice.tax_amt,
            Invoice.discounted_amt,
            Invoice.payment_mode,
            InvoiceDetail.quantity,
            Item.item_name,
            Item.price,
            User.user_name.label("created_user"),
            total_items,
            sub_total,
        )
        .join(InvoiceDetail, InvoiceDetail.invoice_id == Invoice.invoice_id)
        .join(Item, Item.item_id == InvoiceDetail.item_id)
        .join(User, User.user_id == Invoice.created_user)
        .filter(Invoice.shop_id == user.shop_id)
        .filter(Invoice.created_time.between(f, t))
        .filter(Invoice.mobile == customer_number)
        .order_by(Invoice.invoice_id.desc())
    )

    if branch_id:
        q = q.filter(Invoice.branch_id == branch_id)

    rows = q.all()

    result = []
    for r in rows:
        customer = " / ".join(
            [x for x in [r.customer_name, r.mobile, r.gst_number] if x]
        )
        result.append(
            {
                "invoice_date": r.created_time.strftime("%d %b %Y"),
                "invoice_time": r.created_time.strftime("%H:%M"),
                "invoice_number": r.invoice_number,
                "customer": customer,
                "item_name": r.item_name,
                "quantity": int(r.quantity or 0),
                "price": float(r.price or 0),
                "total_items": int(r.total_items or 0),
                "sub_total": float(r.sub_total or 0),
                "gst": float(r.tax_amt or 0),
                "discount": float(r.discounted_amt or 0),
                "grand_total": float(r.total_amount or 0),
                "payment_mode": r.payment_mode or "cash",
                "created_user": r.created_user,
            }
        )

    return result


# =====================================================
# CATEGORY-WISE SALES (WITH BRANCH)
# =====================================================
@router.get("/sales/category")
def category_sales(
    from_date: str,
    to_date: str,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t = parse_dates(from_date, to_date)

    q = (
        db.query(
            Category.category_name.label("category"),
            Branch.branch_name.label("branch"),
            func.sum(InvoiceDetail.quantity).label("quantity"),
            func.sum(InvoiceDetail.amount).label("amount"),
        )
        .join(Item, Item.category_id == Category.category_id)
        .join(InvoiceDetail, InvoiceDetail.item_id == Item.item_id)
        .join(Invoice, Invoice.invoice_id == InvoiceDetail.invoice_id)
        .outerjoin(Branch, Branch.branch_id == Invoice.branch_id)
        .filter(Invoice.shop_id == user.shop_id)
        .filter(Invoice.created_time.between(f, t))
    )

    if not _is_admin(user):
        q = q.filter(Invoice.branch_id == user.branch_id)

    rows = (
        q.group_by(Category.category_name, Branch.branch_name)
        .order_by(func.sum(InvoiceDetail.amount).desc())
        .all()
    )

    return [
        {
            "category": r.category,
            "branch": r.branch,
            "quantity": int(r.quantity or 0),
            "amount": float(r.amount or 0),
        }
        for r in rows
    ]


# =====================================================
# PROFIT ITEM-WISE
# =====================================================
@router.get("/profit/items")
def profit_item_wise(
    from_date: str,
    to_date: str,
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t = parse_dates(from_date, to_date)
    branch_id = _force_branch(branch_id, user)

    q = (
        db.query(
            Item.item_name.label("item"),
            Category.category_name.label("category"),
            func.sum(InvoiceDetail.quantity).label("quantity"),
            func.sum(InvoiceDetail.amount).label("sales_amount"),
            func.sum(InvoiceDetail.buy_price * InvoiceDetail.quantity).label("cost_amount"),
        )
        .join(InvoiceDetail, InvoiceDetail.item_id == Item.item_id)
        .join(Invoice, Invoice.invoice_id == InvoiceDetail.invoice_id)
        .outerjoin(Category, Category.category_id == Item.category_id)
        .filter(Invoice.shop_id == user.shop_id)
        .filter(Invoice.created_time.between(f, t))
        .group_by(Item.item_name, Category.category_name)
        .order_by(func.sum(InvoiceDetail.amount).desc())
    )

    if branch_id:
        q = q.filter(Invoice.branch_id == branch_id)

    rows = q.all()

    return [
        {
            "item": r.item,
            "category": r.category,
            "quantity": int(r.quantity or 0),
            "sales_amount": float(r.sales_amount or 0),
            "cost_amount": float(r.cost_amount or 0),
            "profit": float((r.sales_amount or 0) - (r.cost_amount or 0)),
        }
        for r in rows
    ]


# =====================================================
# PROFIT CATEGORY-WISE
# =====================================================
@router.get("/profit/category")
def profit_category_wise(
    from_date: str,
    to_date: str,
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t = parse_dates(from_date, to_date)
    branch_id = _force_branch(branch_id, user)

    q = (
        db.query(
            Category.category_name.label("category"),
            func.sum(InvoiceDetail.quantity).label("quantity"),
            func.sum(InvoiceDetail.amount).label("sales_amount"),
            func.sum(InvoiceDetail.buy_price * InvoiceDetail.quantity).label("cost_amount"),
        )
        .join(Item, Item.category_id == Category.category_id)
        .join(InvoiceDetail, InvoiceDetail.item_id == Item.item_id)
        .join(Invoice, Invoice.invoice_id == InvoiceDetail.invoice_id)
        .filter(Invoice.shop_id == user.shop_id)
        .filter(Invoice.created_time.between(f, t))
        .group_by(Category.category_name)
        .order_by(func.sum(InvoiceDetail.amount).desc())
    )

    if branch_id:
        q = q.filter(Invoice.branch_id == branch_id)

    rows = q.all()

    return [
        {
            "category": r.category,
            "quantity": int(r.quantity or 0),
            "sales_amount": float(r.sales_amount or 0),
            "cost_amount": float(r.cost_amount or 0),
            "profit": float((r.sales_amount or 0) - (r.cost_amount or 0)),
        }
        for r in rows
    ]


# =====================================================
# PROFIT DATE-WISE
# =====================================================
@router.get("/profit/date")
def profit_date_wise(
    from_date: str,
    to_date: str,
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t = parse_dates(from_date, to_date)
    branch_id = _force_branch(branch_id, user)

    q = (
        db.query(
            func.date(Invoice.created_time).label("date"),
            func.sum(InvoiceDetail.quantity).label("quantity"),
            func.sum(InvoiceDetail.amount).label("sales_amount"),
            func.sum(InvoiceDetail.buy_price * InvoiceDetail.quantity).label("cost_amount"),
        )
        .join(InvoiceDetail, InvoiceDetail.invoice_id == Invoice.invoice_id)
        .filter(Invoice.shop_id == user.shop_id)
        .filter(Invoice.created_time.between(f, t))
        .group_by(func.date(Invoice.created_time))
        .order_by(func.date(Invoice.created_time))
    )

    if branch_id:
        q = q.filter(Invoice.branch_id == branch_id)

    rows = q.all()

    return [
        {
            "date": r.date.strftime("%Y-%m-%d"),
            "quantity": int(r.quantity or 0),
            "sales_amount": float(r.sales_amount or 0),
            "cost_amount": float(r.cost_amount or 0),
            "profit": float((r.sales_amount or 0) - (r.cost_amount or 0)),
        }
        for r in rows
    ]


# =====================================================
# EXPENSE REPORT (DATE + BRANCH)
# =====================================================
@router.get("/expenses")
def expense_report(
    from_date: str,
    to_date: str,
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t = parse_dates(from_date, to_date)
    branch_id = _force_branch(branch_id, user)

    q = (
        db.query(
            BranchExpense.expense_date.label("date"),
            Branch.branch_name.label("branch"),
            BranchExpense.category.label("category"),
            BranchExpense.payment_mode.label("payment_mode"),
            BranchExpense.amount.label("amount"),
            BranchExpense.note.label("note"),
        )
        .join(Branch, Branch.branch_id == BranchExpense.branch_id)
        .filter(BranchExpense.shop_id == user.shop_id)
        .filter(BranchExpense.expense_date.between(f.date(), t.date()))
        .order_by(BranchExpense.expense_date.desc())
    )

    if branch_id:
        q = q.filter(BranchExpense.branch_id == branch_id)

    return [
        {
            "date": r.date.strftime("%Y-%m-%d"),
            "branch": r.branch,
            "category": r.category,
            "payment_mode": r.payment_mode,
            "amount": float(r.amount or 0),
            "note": r.note or "",
        }
        for r in q.all()
    ]

# =====================================================
# USER-WISE SALES (WITH BRANCH)
# =====================================================
@router.get("/sales/user")
def user_sales(
    from_date: str,
    to_date: str,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t = parse_dates(from_date, to_date)

    q = (
        db.query(
            User.user_name.label("user"),
            Branch.branch_name.label("branch"),
            func.count(Invoice.invoice_id).label("bills"),
            func.sum(Invoice.total_amount).label("amount"),
        )
        .join(Invoice, Invoice.created_user == User.user_id)
        .outerjoin(Branch, Branch.branch_id == Invoice.branch_id)
        .filter(Invoice.shop_id == user.shop_id)
        .filter(Invoice.created_time.between(f, t))
    )

    if not _is_admin(user):
        q = q.filter(Invoice.branch_id == user.branch_id)

    rows = (
        q.group_by(User.user_name, Branch.branch_name)
        .order_by(func.sum(Invoice.total_amount).desc())
        .all()
    )

    return [
        {
            "user": r.user,
            "branch": r.branch,
            "bills": int(r.bills or 0),
            "amount": float(r.amount or 0),
        }
        for r in rows
    ]


# =====================================================
# INVENTORY — CURRENT STOCK (WITH BRANCH)
# =====================================================
@router.get("/inventory/current")
def inventory_current(
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    branch_id = _force_branch(branch_id, user)
    q = (
        db.query(
            Item.item_name.label("item"),
            Branch.branch_name.label("branch"),
            Inventory.quantity.label("qty"),
            Inventory.min_stock.label("min_stock"),
        )
        .join(Inventory, Inventory.item_id == Item.item_id)
        .outerjoin(Branch, Branch.branch_id == Inventory.branch_id)
        .filter(Inventory.shop_id == user.shop_id)
    )

    if branch_id:
        q = q.filter(Inventory.branch_id == branch_id)

    rows = q.all()

    return [
        {
            "item": r.item,
            "branch": r.branch,
            "qty": r.qty,
            "status": "LOW" if r.qty <= r.min_stock else "OK",
        }
        for r in rows
    ]


# =====================================================
# INVENTORY — STOCK MOVEMENT (WITH BRANCH)
# =====================================================
@router.get("/inventory/movement")
def inventory_movement(
    from_date: str,
    to_date: str,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t = parse_dates(from_date, to_date)

    q = (
        db.query(
            Item.item_name.label("item"),
            Branch.branch_name.label("branch"),
            StockLedger.change_type.label("type"),
            StockLedger.quantity.label("qty"),
            StockLedger.reference_no.label("reference"),
            StockLedger.created_time.label("time"),
        )
        .join(Item, Item.item_id == StockLedger.item_id)
        .outerjoin(Branch, Branch.branch_id == StockLedger.branch_id)
        .filter(StockLedger.shop_id == user.shop_id)
        .filter(StockLedger.created_time.between(f, t))
        .order_by(StockLedger.created_time.desc())
    )

    if not _is_admin(user):
        q = q.filter(StockLedger.branch_id == user.branch_id)

    rows = q.all()

    return [
        {
            "item": r.item,
            "branch": r.branch,
            "type": r.type,
            "qty": r.qty,
            "reference": r.reference,
            "time": r.time.strftime("%d %b %Y %H:%M"),
        }
        for r in rows
    ]


# =====================================================
# INVENTORY — DATE-WISE STOCK (WITH BRANCH)
# =====================================================
@router.get("/inventory/date-wise")
def inventory_date_wise(
    from_date: str,
    to_date: str,
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t = parse_dates(from_date, to_date)
    branch_id = _force_branch(branch_id, user)

    q = (
        db.query(
            DateWiseStock.stock_date.label("stock_date"),
            Item.item_name.label("item"),
            Branch.branch_name.label("branch"),
            DateWiseStock.quantity.label("qty"),
        )
        .join(Item, Item.item_id == DateWiseStock.item_id)
        .outerjoin(Branch, Branch.branch_id == DateWiseStock.branch_id)
        .filter(DateWiseStock.shop_id == user.shop_id)
        .filter(DateWiseStock.stock_date.between(f, t))
        .order_by(DateWiseStock.stock_date.desc(), Item.item_name.asc())
    )

    if branch_id:
        q = q.filter(DateWiseStock.branch_id == branch_id)

    rows = q.all()

    return [
        {
            "stock_date": r.stock_date.strftime("%d %b %Y"),
            "item": r.item,
            "branch": r.branch,
            "qty": r.qty,
        }
        for r in rows
    ]


# =====================================================
# AUDIT — DELETED INVOICES (WITH BRANCH)
# =====================================================
@router.get("/audit/deleted-invoices")
def deleted_invoices(
    from_date: str,
    to_date: str,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t = parse_dates(from_date, to_date)

    q = (
        db.query(
            InvoiceArchive.invoice_number.label("invoice"),
            Branch.branch_name.label("branch"),
            InvoiceArchive.total_amount.label("amount"),
            func.coalesce(
                User.user_name,
                InvoiceArchive.deleted_by
            ).label("deleted_by"),
            InvoiceArchive.delete_reason.label("reason"),
            InvoiceArchive.deleted_time.label("time"),
        )
        .outerjoin(Branch, Branch.branch_id == InvoiceArchive.branch_id)
        .outerjoin(User, User.user_id == cast(InvoiceArchive.deleted_by, Integer))
        .filter(InvoiceArchive.shop_id == user.shop_id)
        .filter(InvoiceArchive.deleted_time.between(f, t))
        .order_by(InvoiceArchive.deleted_time.desc())
    )

    if not _is_admin(user):
        q = q.filter(InvoiceArchive.branch_id == user.branch_id)

    rows = q.all()

    return [
        {
            "invoice": r.invoice,
            "branch": r.branch,
            "amount": float(r.amount or 0),
            "deleted_by": r.deleted_by,
            "reason": r.reason,
            "time": r.time.strftime("%d %b %Y %H:%M"),
        }
        for r in rows
    ]


# =====================================================
# AUDIT LOGS
# =====================================================
@router.get("/audit/logs")
def audit_logs(
    from_date: str,
    to_date: str,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t = parse_dates(from_date, to_date)

    rows = (
        db.query(
            AuditLog.module_name.label("module"),
            AuditLog.action_type.label("action"),
            AuditLog.record_id.label("record"),
            User.user_name.label("user"),
            AuditLog.created_on.label("time"),
        )
        .outerjoin(User, User.user_id == AuditLog.created_by)
        .filter(AuditLog.shop_id == user.shop_id)
        .filter(AuditLog.created_on.between(f, t))
        .order_by(AuditLog.created_on.desc())
        .all()
    )

    return [
        {
            "module": r.module,
            "action": r.action,
            "record": r.record,
            "user": r.user,
            "time": r.time.strftime("%d %b %Y %H:%M") if r.time else "",
        }
        for r in rows
    ]


# =====================================================
# TABLE USAGE
# =====================================================
@router.get("/table/usage")
def table_usage(
    from_date: str,
    to_date: str,
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t = parse_dates(from_date, to_date)
    branch_id = _force_branch(branch_id, user)

    rows = (
        db.query(
            TableMaster.table_name.label("table"),
            Order.status.label("status"),
            Order.opened_at.label("opened_at"),
            Order.closed_at.label("closed_at"),
            User.user_name.label("opened_by"),
            Order.branch_id.label("branch_id"),
        )
        .join(TableMaster, TableMaster.table_id == Order.table_id)
        .outerjoin(User, User.user_id == Order.opened_by)
        .filter(Order.shop_id == user.shop_id)
        .filter(Order.opened_at.between(f, t))
    )

    if branch_id is not None:
        rows = rows.filter(Order.branch_id == branch_id)

    rows = rows.order_by(Order.opened_at.desc()).all()

    result = []
    for r in rows:
        duration_minutes = ""
        if r.opened_at and r.closed_at:
            duration = r.closed_at - r.opened_at
            duration_minutes = int(duration.total_seconds() // 60)

        result.append(
            {
                "table": r.table,
                "status": r.status,
                "opened_by": r.opened_by,
                "opened_at": r.opened_at.strftime("%d %b %Y %H:%M") if r.opened_at else "",
                "closed_at": r.closed_at.strftime("%d %b %Y %H:%M") if r.closed_at else "",
                "duration_min": duration_minutes,
            }
        )

    return result


# =====================================================
# SUPPLIER REPORT
# =====================================================
@router.get("/suppliers")
def supplier_report(
    from_date: str,
    to_date: str,
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t = parse_dates(from_date, to_date)
    t_end = t + timedelta(days=1)
    branch_id = _force_branch(branch_id, user)

    q = (
        db.query(
            Supplier.supplier_name.label("supplier"),
            Branch.branch_name.label("branch"),
            Supplier.phone.label("phone"),
            Supplier.email.label("email"),
            Supplier.gstin.label("gstin"),
            Supplier.city.label("city"),
            Supplier.state.label("state"),
            Supplier.credit_terms_days.label("credit_terms_days"),
            Supplier.status.label("status"),
            Supplier.created_at.label("created_at"),
        )
        .outerjoin(Branch, Branch.branch_id == Supplier.branch_id)
        .filter(Supplier.shop_id == user.shop_id)
        .filter(Supplier.created_at >= f)
        .filter(Supplier.created_at < t_end)
        .order_by(Supplier.created_at.desc())
    )

    if branch_id is not None:
        q = q.filter(Supplier.branch_id == branch_id)

    return [
        {
            "supplier": r.supplier,
            "branch": r.branch,
            "phone": r.phone or "",
            "email": r.email or "",
            "gstin": r.gstin or "",
            "city": r.city or "",
            "state": r.state or "",
            "credit_terms_days": int(r.credit_terms_days or 0),
            "status": r.status,
            "created_at": r.created_at.strftime("%d %b %Y") if r.created_at else "",
        }
        for r in q.all()
    ]


# =====================================================
# PO AGING
# =====================================================
@router.get("/po-aging")
def po_aging(
    from_date: str,
    to_date: str,
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t = parse_dates(from_date, to_date)
    ref_date = t.date()
    branch_id = _force_branch(branch_id, user)

    q = (
        db.query(
            PurchaseOrder.po_number.label("po_number"),
            Supplier.supplier_name.label("supplier"),
            Branch.branch_name.label("branch"),
            PurchaseOrder.order_date.label("order_date"),
            PurchaseOrder.expected_date.label("expected_date"),
            PurchaseOrder.status.label("status"),
            PurchaseOrder.payment_status.label("payment_status"),
            PurchaseOrder.total_amount.label("total_amount"),
            PurchaseOrder.paid_amount.label("paid_amount"),
        )
        .join(Supplier, Supplier.supplier_id == PurchaseOrder.supplier_id)
        .outerjoin(Branch, Branch.branch_id == PurchaseOrder.branch_id)
        .filter(PurchaseOrder.shop_id == user.shop_id)
        .filter(PurchaseOrder.order_date.between(f.date(), t.date()))
        .order_by(PurchaseOrder.order_date.desc())
    )

    if branch_id is not None:
        q = q.filter(PurchaseOrder.branch_id == branch_id)

    rows = q.all()
    result = []
    for r in rows:
        age_days = ""
        if r.order_date:
            age_days = (ref_date - r.order_date).days
        outstanding = float(r.total_amount or 0) - float(r.paid_amount or 0)
        result.append(
            {
                "po_number": r.po_number,
                "supplier": r.supplier,
                "branch": r.branch,
                "order_date": r.order_date.strftime("%Y-%m-%d") if r.order_date else "",
                "expected_date": r.expected_date.strftime("%Y-%m-%d") if r.expected_date else "",
                "status": r.status,
                "payment_status": r.payment_status,
                "total_amount": float(r.total_amount or 0),
                "paid_amount": float(r.paid_amount or 0),
                "outstanding": float(outstanding),
                "age_days": age_days,
            }
        )

    return result


# =====================================================
# PAYABLES SUMMARY
# =====================================================
@router.get("/payables-summary")
def payables_summary(
    from_date: str,
    to_date: str,
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t = parse_dates(from_date, to_date)
    branch_id = _force_branch(branch_id, user)

    total_amount = func.sum(PurchaseOrder.total_amount).label("total_amount")
    paid_amount = func.sum(PurchaseOrder.paid_amount).label("paid_amount")
    outstanding = func.sum(PurchaseOrder.total_amount - PurchaseOrder.paid_amount).label("outstanding")

    q = (
        db.query(
            Supplier.supplier_name.label("supplier"),
            Branch.branch_name.label("branch"),
            total_amount,
            paid_amount,
            outstanding,
        )
        .join(Supplier, Supplier.supplier_id == PurchaseOrder.supplier_id)
        .outerjoin(Branch, Branch.branch_id == PurchaseOrder.branch_id)
        .filter(PurchaseOrder.shop_id == user.shop_id)
        .filter(PurchaseOrder.order_date.between(f.date(), t.date()))
        .group_by(Supplier.supplier_name, Branch.branch_name)
        .order_by(outstanding.desc())
    )

    if branch_id is not None:
        q = q.filter(PurchaseOrder.branch_id == branch_id)

    rows = q.all()
    result = []
    for r in rows:
        out = float(r.outstanding or 0)
        if out <= 0:
            continue
        result.append(
            {
                "supplier": r.supplier,
                "branch": r.branch,
                "total_amount": float(r.total_amount or 0),
                "paid_amount": float(r.paid_amount or 0),
                "outstanding": out,
            }
        )

    return result
