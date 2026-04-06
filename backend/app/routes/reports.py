from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, aliased
from sqlalchemy import func, cast, Integer, and_, or_, case, inspect, literal
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from collections import defaultdict

from app.db import get_db
from app.utils.permissions import require_permission

from app.models.invoice import Invoice
from app.models.invoice_details import InvoiceDetail
from app.models.invoice_due import InvoiceDue
from app.models.invoice_payment import InvoicePayment
from app.models.items import Item
from app.models.item_lot import ItemLot
from app.models.category import Category
from app.models.users import User
from app.models.branch import Branch
from app.models.customer import Customer
from app.models.branch_item_price import BranchItemPrice
from app.models.invoice_archive import InvoiceArchive
from app.models.stock import Inventory
from app.models.stock_ledger import StockLedger
from app.models.date_wise_stock import DateWiseStock
from app.models.audit_log import AuditLog
from app.models.table_billing import TableMaster, Order
from app.models.branch_expense import BranchExpense
from app.models.sales_return import SalesReturn, SalesReturnItem
from app.models.supplier import Supplier
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem
from app.models.stock_transfer import StockTransfer, StockTransferItem
from app.models.cash_drawer import CashShift, CashMovement
from app.models.stock_audit import StockAudit, StockAuditLine
from app.models.supplier_ledger import SupplierLedgerEntry
from app.models.online_order import OnlineOrder, OnlineOrderItem
from app.models.loyalty import LoyaltyAccount, LoyaltyTransaction
from app.models.coupon import Coupon, CouponRedemption
from app.models.employee import Employee, EmployeeAttendance
from app.models.reservation import TableReservation
from app.models.shop_details import ShopDetails
from app.services.financials_service import calc_period_financials
from app.utils.business_date import get_business_date
from app.utils.shop_type import ensure_hotel_billing_type

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


def parse_dt_range(from_date: str, to_date: str):
    f, t = parse_dates(from_date, to_date)
    return f, t + timedelta(days=1)


def parse_optional_dates(from_date: str | None, to_date: str | None):
    if from_date and to_date:
        return parse_dates(from_date, to_date)
    if from_date or to_date:
        raise HTTPException(400, "Provide both from_date and to_date")
    return None, None


def _dec(val) -> Decimal:
    try:
        return Decimal(str(val or 0))
    except Exception:
        return Decimal("0.00")


def _q(val) -> Decimal:
    return _dec(val).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _state_eq(a, b) -> bool:
    return (a or "").strip().lower() == (b or "").strip().lower()


def _as_float(val) -> float:
    try:
        return float(_q(val))
    except Exception:
        return 0.0


def _detail_tax_breakup(detail, inv_ctx: dict) -> tuple[Decimal, Decimal, Decimal, Decimal, Decimal]:
    """
    Returns (taxable, cgst, sgst, igst, cess) using stored split when present
    and falling back to proportional split from invoice tax.
    """
    taxable = _dec(getattr(detail, "taxable_value", 0))
    cgst = _dec(getattr(detail, "cgst_amt", 0))
    sgst = _dec(getattr(detail, "sgst_amt", 0))
    igst = _dec(getattr(detail, "igst_amt", 0))
    cess = _dec(getattr(detail, "cess_amt", 0))
    amt = _dec(getattr(detail, "amount", 0))

    if (
        inv_ctx
        and inv_ctx.get("gst_enabled")
        and inv_ctx.get("subtotal") > 0
        and inv_ctx.get("tax") > 0
        and (cgst + sgst + igst + cess) == 0
    ):
        subtotal = inv_ctx["subtotal"]
        tax_total = inv_ctx["tax"]
        gst_mode = inv_ctx.get("gst_mode", "inclusive")
        if gst_mode == "inclusive":
            base_total = subtotal - tax_total
            if base_total <= 0:
                base_total = subtotal
            taxable = amt * (base_total / subtotal)
            tax_amt = amt - taxable
        else:
            taxable = amt
            tax_amt = tax_total * (amt / subtotal)
        taxable = _q(taxable)
        tax_amt = _q(tax_amt)
        if inv_ctx.get("intra_state", True):
            cgst = _q(tax_amt / 2)
            sgst = _q(tax_amt - cgst)
            igst = Decimal("0.00")
        else:
            cgst = Decimal("0.00")
            sgst = Decimal("0.00")
            igst = tax_amt
        cess = Decimal("0.00")
    else:
        if taxable == 0:
            taxable = amt
        if (cgst + sgst + igst + cess) == 0:
            cess = Decimal("0.00")
    return taxable, cgst, sgst, igst, cess


def _build_invoice_context(inv_rows, detail_rows):
    subtotal_map: dict[int, Decimal] = defaultdict(Decimal)
    for d in detail_rows:
        try:
            subtotal_map[int(d.invoice_id)] += _dec(getattr(d, "amount", 0))
        except Exception:
            continue

    ctx: dict[int, dict] = {}
    for inv in inv_rows:
        inv_id = int(getattr(inv, "invoice_id"))
        subtotal = subtotal_map.get(inv_id, _dec(getattr(inv, "total_amount", 0)))
        tax_total = _dec(getattr(inv, "tax_amt", 0))
        pos = getattr(inv, "place_of_supply", None) or getattr(inv, "branch_state", None)
        shop_state = getattr(inv, "shop_state", None)
        ctx[inv_id] = {
            "subtotal": subtotal if subtotal > 0 else _dec(getattr(inv, "total_amount", 0)),
            "tax": tax_total,
            "gst_mode": getattr(inv, "gst_mode", "inclusive") or "inclusive",
            "gst_enabled": bool(getattr(inv, "gst_enabled", False)),
            "intra_state": _state_eq(pos, shop_state),
        }
    return ctx, subtotal_map


def _has_column(db: Session, table: str, column: str) -> bool:
    try:
        insp = inspect(db.get_bind())
        return insp.has_column(table, column)
    except Exception:
        return False


def _compute_itc_rows(db: Session, user, f_dt: datetime, t_dt: datetime, branch_id: int | None):
    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == user.shop_id).first()
    shop_state = getattr(shop, "state", None)
    has_pos = _has_column(db, "invoice", "place_of_supply")
    gst_default = _dec(getattr(shop, "gst_percent", 0))
    start_date = f_dt.date()
    end_date = (t_dt - timedelta(days=1)).date()

    q = (
        db.query(
            PurchaseOrder.po_number,
            PurchaseOrder.order_date,
            Supplier.supplier_name,
            Supplier.gstin,
            Supplier.state.label("supplier_state"),
            PurchaseOrderItem.qty_received,
            PurchaseOrderItem.qty_ordered,
            PurchaseOrderItem.unit_cost,
            PurchaseOrderItem.item_name,
            Item.hsn_code,
            Item.gst_rate,
        )
        .join(PurchaseOrder, PurchaseOrder.po_id == PurchaseOrderItem.po_id)
        .join(Supplier, Supplier.supplier_id == PurchaseOrder.supplier_id)
        .outerjoin(Item, Item.item_id == PurchaseOrderItem.item_id)
        .filter(PurchaseOrder.shop_id == user.shop_id)
        .filter(PurchaseOrder.order_date >= start_date)
        .filter(PurchaseOrder.order_date <= end_date)
    )
    if branch_id:
        q = q.filter(PurchaseOrder.branch_id == branch_id)

    rows = []
    totals = {
        "taxable": Decimal("0.00"),
        "cgst": Decimal("0.00"),
        "sgst": Decimal("0.00"),
        "igst": Decimal("0.00"),
        "cess": Decimal("0.00"),
    }

    for r in q.all():
        qty = r.qty_received if r.qty_received is not None else r.qty_ordered
        qty = qty if qty is not None else 0
        qty_dec = _dec(qty)
        taxable = _q(_dec(r.unit_cost) * qty_dec)
        rate = _dec(r.gst_rate or gst_default)
        tax_amt = _q(taxable * (rate / Decimal("100")))
        intra = _state_eq(r.supplier_state, shop_state)
        if intra:
            cgst = _q(tax_amt / 2)
            sgst = _q(tax_amt - cgst)
            igst = Decimal("0.00")
        else:
            cgst = Decimal("0.00")
            sgst = Decimal("0.00")
            igst = tax_amt
        cess = Decimal("0.00")

        totals["taxable"] += taxable
        totals["cgst"] += cgst
        totals["sgst"] += sgst
        totals["igst"] += igst
        totals["cess"] += cess

        rows.append(
            {
                "po_date": r.order_date.strftime("%d %b %Y") if r.order_date else "",
                "po_number": r.po_number,
                "supplier": r.supplier_name,
                "supplier_gst": r.gstin or "",
                "hsn": r.hsn_code or "",
                "item": r.item_name,
                "quantity": int(qty_dec),
                "taxable_value": _as_float(taxable),
                "cgst": _as_float(cgst),
                "sgst": _as_float(sgst),
                "igst": _as_float(igst),
                "cess": _as_float(cess),
                "total_value": _as_float(taxable + cgst + sgst + igst + cess),
            }
        )

    return rows, totals


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
    f, t_end = parse_dt_range(from_date, to_date)
    branch_id = _force_branch(branch_id, user)
    group_col, label = resolve_group_by(group_by)

    cols = [
        group_col.label(label),
        Branch.branch_name.label("branch"),
        func.count(func.distinct(Invoice.invoice_id)).label("bills"),
        func.coalesce(
            func.sum(func.coalesce(Invoice.total_amount, 0) - func.coalesce(Invoice.tax_amt, 0)),
            0,
        ).label("sub_total"),
        func.coalesce(func.sum(func.coalesce(Invoice.tax_amt, 0)), 0).label("gst"),
        func.coalesce(func.sum(func.coalesce(Invoice.discounted_amt, 0)), 0).label("discount"),
        func.coalesce(
            func.sum(func.coalesce(Invoice.total_amount, 0) - func.coalesce(Invoice.discounted_amt, 0)),
            0,
        ).label("grand_total"),
    ]

    q = (
        db.query(*cols)
        .outerjoin(User, User.user_id == Invoice.created_user)
        .outerjoin(Branch, Branch.branch_id == Invoice.branch_id)
        .filter(Invoice.shop_id == user.shop_id)
        .filter(Invoice.created_time >= f)
        .filter(Invoice.created_time < t_end)
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
# GST SUMMARY (NET OF RETURNS)
# =====================================================
@router.get("/gst/summary")
def gst_summary(
    from_date: str,
    to_date: str,
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t = parse_dates(from_date, to_date)
    bid = _force_branch(branch_id, user)

    fin = calc_period_financials(
        db,
        shop_id=user.shop_id,
        branch_id=bid,
        from_dt=f.date(),
        to_dt=t.date(),
    )

    return {
        "invoice_sales_ex_tax": float(fin.get("invoice_sales_ex_tax", 0) or 0),
        "invoice_gst": float(fin.get("invoice_gst", 0) or 0),
        "invoice_discount": float(fin.get("invoice_discount", 0) or 0),
        "returns_sales_ex_tax": float(fin.get("returns_sales_ex_tax", 0) or 0),
        "returns_tax": float(fin.get("returns_tax", 0) or 0),
        "returns_discount": float(fin.get("returns_discount", 0) or 0),
        "net_sales_ex_tax": float(fin.get("sales_ex_tax", 0) or 0),
        "net_gst": float(fin.get("gst", 0) or 0),
        "net_discount": float(fin.get("discount", 0) or 0),
    }


# =====================================================
# ITEM-WISE SALES (WITH BRANCH)
# =====================================================
@router.get("/sales/items")
def item_wise_sales(
    from_date: str,
    to_date: str,
    branch_id: int | None = None,
    user_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t_end = parse_dt_range(from_date, to_date)
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
        .filter(Invoice.created_time >= f)
        .filter(Invoice.created_time < t_end)
        .group_by(Item.item_name, Branch.branch_name)
        .order_by(func.sum(InvoiceDetail.amount).desc())
    )

    if branch_id:
        q = q.filter(Invoice.branch_id == branch_id)

    if user_id:
        q = q.filter(Invoice.created_user == user_id)

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
    user_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t_end = parse_dt_range(from_date, to_date)
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
        .filter(Invoice.created_time >= f)
        .filter(Invoice.created_time < t_end)
        .order_by(Invoice.invoice_id.desc())
    )

    if branch_id:
        q = q.filter(Invoice.branch_id == branch_id)

    if payment_mode:
        q = q.filter(Invoice.payment_mode == payment_mode)

    if user_id:
        q = q.filter(Invoice.created_user == user_id)

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
    user_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    if not customer_number:
        raise HTTPException(400, "Customer number is required")

    f, t_end = parse_dt_range(from_date, to_date)
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
        .filter(Invoice.created_time >= f)
        .filter(Invoice.created_time < t_end)
        .filter(Invoice.mobile == customer_number)
        .order_by(Invoice.invoice_id.desc())
    )

    if branch_id:
        q = q.filter(Invoice.branch_id == branch_id)

    if user_id:
        q = q.filter(Invoice.created_user == user_id)

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
    branch_id: int | None = None,
    user_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t_end = parse_dt_range(from_date, to_date)
    branch_id = _force_branch(branch_id, user)

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
        .filter(Invoice.created_time >= f)
        .filter(Invoice.created_time < t_end)
    )

    if branch_id:
        q = q.filter(Invoice.branch_id == branch_id)

    if user_id:
        q = q.filter(Invoice.created_user == user_id)

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
    sales_expr = func.coalesce(
        InvoiceDetail.amount,
        func.coalesce(Item.price, 0) * func.coalesce(InvoiceDetail.quantity, 0),
    )

    q = (
        db.query(
            Item.item_name.label("item"),
            Category.category_name.label("category"),
            func.sum(InvoiceDetail.quantity).label("quantity"),
            func.sum(sales_expr).label("sales_amount"),
            func.sum(InvoiceDetail.buy_price * InvoiceDetail.quantity).label("cost_amount"),
        )
        .join(InvoiceDetail, InvoiceDetail.item_id == Item.item_id)
        .join(Invoice, Invoice.invoice_id == InvoiceDetail.invoice_id)
        .outerjoin(Category, Category.category_id == Item.category_id)
        .filter(Invoice.shop_id == user.shop_id)
        .filter(func.date(Invoice.created_time).between(f.date(), t.date()))
        .group_by(Item.item_name, Category.category_name)
        .order_by(func.sum(sales_expr).desc())
    )

    if branch_id:
        q = q.filter(Invoice.branch_id == branch_id)

    rows = q.all()
    is_hotel = get_shop_billing_type(db, user.shop_id) == "hotel"
    exp_q = db.query(func.coalesce(func.sum(BranchExpense.amount), 0)).filter(
        BranchExpense.shop_id == user.shop_id,
        BranchExpense.expense_date.between(f.date(), t.date()),
    )
    if branch_id:
        exp_q = exp_q.filter(BranchExpense.branch_id == branch_id)
    total_expense = float(exp_q.scalar() or 0)
    total_sales = sum(float(r.sales_amount or 0) for r in rows)

    result = []
    for r in rows:
        sales = float(r.sales_amount or 0)
        cost = 0.0 if is_hotel else float(r.cost_amount or 0)
        gross_profit = sales - cost
        allocated_expense = (total_expense * sales / total_sales) if total_sales > 0 else 0.0
        net_profit = gross_profit - allocated_expense
        result.append(
            {
                "item": r.item,
                "category": r.category,
                "quantity": int(r.quantity or 0),
                "sales_amount": float(sales),
                "gross_profit": float(gross_profit),
                "allocated_expense": float(allocated_expense),
                "profit": float(net_profit),
            }
        )
    return result


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
    sales_expr = func.coalesce(
        InvoiceDetail.amount,
        func.coalesce(Item.price, 0) * func.coalesce(InvoiceDetail.quantity, 0),
    )

    q = (
        db.query(
            Category.category_name.label("category"),
            func.sum(InvoiceDetail.quantity).label("quantity"),
            func.sum(sales_expr).label("sales_amount"),
            func.sum(InvoiceDetail.buy_price * InvoiceDetail.quantity).label("cost_amount"),
        )
        .join(Item, Item.category_id == Category.category_id)
        .join(InvoiceDetail, InvoiceDetail.item_id == Item.item_id)
        .join(Invoice, Invoice.invoice_id == InvoiceDetail.invoice_id)
        .filter(Invoice.shop_id == user.shop_id)
        .filter(func.date(Invoice.created_time).between(f.date(), t.date()))
        .group_by(Category.category_name)
        .order_by(func.sum(sales_expr).desc())
    )

    if branch_id:
        q = q.filter(Invoice.branch_id == branch_id)

    rows = q.all()
    is_hotel = get_shop_billing_type(db, user.shop_id) == "hotel"
    exp_q = db.query(func.coalesce(func.sum(BranchExpense.amount), 0)).filter(
        BranchExpense.shop_id == user.shop_id,
        BranchExpense.expense_date.between(f.date(), t.date()),
    )
    if branch_id:
        exp_q = exp_q.filter(BranchExpense.branch_id == branch_id)
    total_expense = float(exp_q.scalar() or 0)
    total_sales = sum(float(r.sales_amount or 0) for r in rows)

    result = []
    for r in rows:
        sales = float(r.sales_amount or 0)
        cost = 0.0 if is_hotel else float(r.cost_amount or 0)
        gross_profit = sales - cost
        allocated_expense = (total_expense * sales / total_sales) if total_sales > 0 else 0.0
        net_profit = gross_profit - allocated_expense
        result.append(
            {
                "category": r.category,
                "quantity": int(r.quantity or 0),
                "sales_amount": float(sales),
                "gross_profit": float(gross_profit),
                "allocated_expense": float(allocated_expense),
                "profit": float(net_profit),
            }
        )
    return result


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

    if (t.date() - f.date()).days > 366:
        raise HTTPException(400, "Date range too large. Please select a range of 366 days or less.")

    qty_q = (
        db.query(
            func.date(Invoice.created_time).label("date"),
            func.coalesce(func.sum(InvoiceDetail.quantity), 0).label("sold_qty"),
        )
        .join(InvoiceDetail, InvoiceDetail.invoice_id == Invoice.invoice_id)
        .filter(Invoice.shop_id == user.shop_id)
        .filter(func.date(Invoice.created_time).between(f.date(), t.date()))
        .group_by(func.date(Invoice.created_time))
        .order_by(func.date(Invoice.created_time))
    )

    if branch_id:
        qty_q = qty_q.filter(Invoice.branch_id == branch_id)

    sold_qty_map = {r.date: int(r.sold_qty or 0) for r in qty_q.all()}

    ret_qty_q = (
        db.query(
            func.date(SalesReturn.created_on).label("date"),
            func.coalesce(func.sum(SalesReturnItem.quantity), 0).label("ret_qty"),
        )
        .join(SalesReturnItem, SalesReturnItem.return_id == SalesReturn.return_id)
        .filter(SalesReturn.shop_id == user.shop_id)
        .filter(SalesReturn.status != "CANCELLED")
        .filter(func.date(SalesReturn.created_on).between(f.date(), t.date()))
        .group_by(func.date(SalesReturn.created_on))
        .order_by(func.date(SalesReturn.created_on))
    )

    if branch_id:
        ret_qty_q = ret_qty_q.filter(SalesReturn.branch_id == branch_id)

    ret_qty_map = {r.date: int(r.ret_qty or 0) for r in ret_qty_q.all()}

    rows = []
    cur = f.date()
    end = t.date()
    while cur <= end:
        fin = calc_period_financials(
            db,
            shop_id=user.shop_id,
            branch_id=branch_id,
            from_dt=cur,
            to_dt=cur,
        )
        sold_qty = int(sold_qty_map.get(cur, 0))
        ret_qty = int(ret_qty_map.get(cur, 0))
        quantity = sold_qty - ret_qty

        sales_amount = float(fin.get("sales_ex_tax", 0) or 0)
        discount_amount = float(fin.get("discount_ex_tax", fin.get("discount", 0)) or 0)
        cost_amount = float(fin.get("cogs_net", 0) or 0)
        expense_amount = float(fin.get("expense", 0) or 0)
        gross_profit = (sales_amount - discount_amount) - cost_amount
        net_profit = float(fin.get("profit", 0) or 0)

        has_activity = any(
            abs(v) > 1e-9
            for v in [sales_amount, discount_amount, cost_amount, expense_amount, net_profit]
        ) or quantity != 0

        if has_activity:
            rows.append(
                {
                    "date": cur.strftime("%Y-%m-%d"),
                    "quantity": int(quantity),
                    "sales_amount": float(sales_amount),
                    "discount_amount": float(discount_amount),
                    "cost_amount": float(cost_amount),
                    "expense_amount": float(expense_amount),
                    "gross_profit": float(gross_profit),
                    "profit": float(net_profit),
                }
            )
        cur = cur + timedelta(days=1)

    return rows


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
    branch_id: int | None = None,
    user_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t_end = parse_dt_range(from_date, to_date)
    branch_id = _force_branch(branch_id, user)

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
        .filter(Invoice.created_time >= f)
        .filter(Invoice.created_time < t_end)
    )

    if branch_id:
        q = q.filter(Invoice.branch_id == branch_id)

    if user_id:
        q = q.filter(Invoice.created_user == user_id)

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

    totals_sq = (
        db.query(
            Inventory.item_id.label("item_id"),
            func.coalesce(func.sum(Inventory.quantity), 0).label("shop_qty"),
        )
        .filter(Inventory.shop_id == user.shop_id)
        .group_by(Inventory.item_id)
        .subquery()
    )

    price_sq = (
        db.query(
            ItemPrice.item_id.label("item_id"),
            func.string_agg(
                func.concat(ItemPrice.level, ":", ItemPrice.price), "; "
            ).label("price_levels"),
        )
        .filter(ItemPrice.shop_id == user.shop_id)
        .group_by(ItemPrice.item_id)
        .subquery()
    )

    q = (
        db.query(
            Item.item_name.label("item"),
            Branch.branch_name.label("branch"),
            Inventory.quantity.label("qty"),
            Inventory.min_stock.label("min_stock"),
            Item.price.label("price"),
            Item.buy_price.label("buy_price"),
            totals_sq.c.shop_qty.label("shop_qty"),
            price_sq.c.price_levels.label("price_levels"),
            BranchItemPrice.price.label("branch_price"),
            BranchItemPrice.item_status.label("branch_item_status"),
        )
        .join(Inventory, Inventory.item_id == Item.item_id)
        .outerjoin(Branch, Branch.branch_id == Inventory.branch_id)
        .join(totals_sq, totals_sq.c.item_id == Inventory.item_id)
        .outerjoin(price_sq, price_sq.c.item_id == Inventory.item_id)
        .outerjoin(
            BranchItemPrice,
            and_(
                BranchItemPrice.item_id == Inventory.item_id,
                BranchItemPrice.branch_id == Inventory.branch_id,
                BranchItemPrice.shop_id == user.shop_id,
            ),
        )
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
            "shop_qty": r.shop_qty,
            "price": float(r.branch_price or r.price or 0),
            "buy_price": float(r.buy_price or 0),
            "status": "LOW" if r.qty <= r.min_stock else "OK",
            "item_status": bool(r.branch_item_status) if r.branch_item_status is not None else True,
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
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t_end = parse_dt_range(from_date, to_date)
    branch_id = _force_branch(branch_id, user)

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
        .filter(StockLedger.created_time >= f)
        .filter(StockLedger.created_time < t_end)
        .order_by(StockLedger.created_time.desc())
    )

    if branch_id:
        q = q.filter(StockLedger.branch_id == branch_id)

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
        .filter(DateWiseStock.stock_date.between(f.date(), t.date()))
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
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t_end = parse_dt_range(from_date, to_date)
    branch_id = _force_branch(branch_id, user)

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
        .filter(InvoiceArchive.deleted_time >= f)
        .filter(InvoiceArchive.deleted_time < t_end)
        .order_by(InvoiceArchive.deleted_time.desc())
    )

    if branch_id:
        q = q.filter(InvoiceArchive.branch_id == branch_id)

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
    user_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t_end = parse_dt_range(from_date, to_date)

    q = (
        db.query(
            AuditLog.module_name.label("module"),
            AuditLog.action_type.label("action"),
            AuditLog.record_id.label("record"),
            User.user_name.label("user"),
            AuditLog.created_on.label("time"),
        )
        .outerjoin(User, User.user_id == AuditLog.created_by)
        .filter(AuditLog.shop_id == user.shop_id)
        .filter(AuditLog.created_on >= f)
        .filter(AuditLog.created_on < t_end)
        .order_by(AuditLog.created_on.desc())
    )

    if user_id:
        q = q.filter(AuditLog.created_by == user_id)

    rows = q.all()

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
    ensure_hotel_billing_type(db, user.shop_id)
    f, t_end = parse_dt_range(from_date, to_date)
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
        .filter(Order.opened_at >= f)
        .filter(Order.opened_at < t_end)
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
# EMPLOYEE ATTENDANCE SUMMARY
# =====================================================
@router.get("/employees/attendance-summary")
def employee_attendance_summary(
    from_date: str,
    to_date: str,
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t = parse_dates(from_date, to_date)
    t_end = t + timedelta(days=1)
    branch_id = _force_branch(branch_id, user)

    rows = (
        db.query(
            Employee.employee_id.label("employee_id"),
            Employee.employee_name.label("employee_name"),
            func.sum(case((EmployeeAttendance.status == "PRESENT", 1), else_=0)).label("present_days"),
            func.sum(case((EmployeeAttendance.status == "ABSENT", 1), else_=0)).label("absent_days"),
            func.sum(case((EmployeeAttendance.status == "HALF_DAY", 1), else_=0)).label("half_days"),
            func.sum(case((EmployeeAttendance.status == "LEAVE", 1), else_=0)).label("leave_days"),
        )
        .join(
            EmployeeAttendance,
            and_(
                EmployeeAttendance.employee_id == Employee.employee_id,
                EmployeeAttendance.shop_id == Employee.shop_id,
            ),
        )
        .filter(Employee.shop_id == user.shop_id)
        .filter(EmployeeAttendance.attendance_date >= f)
        .filter(EmployeeAttendance.attendance_date < t_end)
    )

    if branch_id is not None:
        rows = rows.filter(EmployeeAttendance.branch_id == branch_id)

    rows = rows.group_by(Employee.employee_id, Employee.employee_name).order_by(Employee.employee_name.asc()).all()

    return [
        {
          "employee_id": r.employee_id,
          "employee_name": r.employee_name,
          "present_days": int(r.present_days or 0),
          "absent_days": int(r.absent_days or 0),
          "half_days": int(r.half_days or 0),
          "leave_days": int(r.leave_days or 0),
        }
        for r in rows
    ]


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


# =====================================================
# DUES — OPEN / OUTSTANDING
# =====================================================
@router.get("/dues/open")
def dues_open(
    branch_id: int | None = None,
    user_id: int | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t = parse_optional_dates(from_date, to_date)
    branch_id = _force_branch(branch_id, user)

    paid_sq = (
        db.query(
            InvoicePayment.invoice_id.label("invoice_id"),
            func.coalesce(func.sum(InvoicePayment.amount), 0).label("paid_amount"),
        )
        .filter(InvoicePayment.shop_id == user.shop_id)
        .group_by(InvoicePayment.invoice_id)
        .subquery()
    )

    ret_sq = (
        db.query(
            SalesReturn.invoice_id.label("invoice_id"),
            func.coalesce(func.sum(SalesReturn.refund_amount), 0).label("returns_amount"),
        )
        .filter(
            SalesReturn.shop_id == user.shop_id,
            SalesReturn.status != "CANCELLED",
        )
        .group_by(SalesReturn.invoice_id)
        .subquery()
    )

    outstanding_expr = (
        func.coalesce(InvoiceDue.original_amount, 0)
        - func.coalesce(paid_sq.c.paid_amount, 0)
        - func.coalesce(ret_sq.c.returns_amount, 0)
    ).label("outstanding")

    q = (
        db.query(
            InvoiceDue.invoice_number.label("invoice_number"),
            Branch.branch_name.label("branch"),
            Customer.customer_name.label("customer_name"),
            Customer.mobile.label("mobile"),
            InvoiceDue.original_amount.label("original_amount"),
            func.coalesce(paid_sq.c.paid_amount, 0).label("paid_amount"),
            func.coalesce(ret_sq.c.returns_amount, 0).label("returns_amount"),
            outstanding_expr,
            InvoiceDue.created_on.label("created_on"),
            User.user_name.label("created_by"),
        )
        .outerjoin(Branch, Branch.branch_id == InvoiceDue.branch_id)
        .outerjoin(Customer, Customer.customer_id == InvoiceDue.customer_id)
        .outerjoin(paid_sq, paid_sq.c.invoice_id == InvoiceDue.invoice_id)
        .outerjoin(ret_sq, ret_sq.c.invoice_id == InvoiceDue.invoice_id)
        .outerjoin(User, User.user_id == InvoiceDue.created_by)
        .filter(InvoiceDue.shop_id == user.shop_id)
        .filter(InvoiceDue.status == "OPEN")
        .filter(outstanding_expr > 0)
        .order_by(InvoiceDue.created_on.desc())
    )

    if branch_id is not None:
        q = q.filter(InvoiceDue.branch_id == branch_id)

    if user_id:
        q = q.filter(InvoiceDue.created_by == user_id)

    if f and t:
        q = q.filter(InvoiceDue.created_on.between(f, t + timedelta(days=1)))

    rows = q.all()
    today = get_business_date(db, user.shop_id)
    out = []
    for r in rows:
        age_days = ""
        if r.created_on:
            try:
                age_days = (today - r.created_on.date()).days
            except Exception:
                age_days = ""
        out.append(
            {
                "invoice_number": r.invoice_number,
                "branch": r.branch,
                "customer_name": r.customer_name or "",
                "mobile": r.mobile or "",
                "original_amount": float(r.original_amount or 0),
                "paid_amount": float(r.paid_amount or 0),
                "returns_amount": float(r.returns_amount or 0),
                "outstanding": float(r.outstanding or 0),
                "created_on": r.created_on.strftime("%Y-%m-%d") if r.created_on else "",
                "age_days": age_days,
                "created_by": r.created_by or "",
            }
        )

    return out


# =====================================================
# DUES — PAYMENTS / COLLECTIONS
# =====================================================
@router.get("/dues/payments")
def dues_payments(
    from_date: str,
    to_date: str,
    branch_id: int | None = None,
    user_id: int | None = None,
    payment_mode: str | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t_end = parse_dt_range(from_date, to_date)
    branch_id = _force_branch(branch_id, user)

    q = (
        db.query(
            InvoicePayment.invoice_number.label("invoice_number"),
            Branch.branch_name.label("branch"),
            Customer.customer_name.label("customer_name"),
            Customer.mobile.label("mobile"),
            InvoicePayment.amount.label("amount"),
            InvoicePayment.payment_mode.label("payment_mode"),
            InvoicePayment.reference_no.label("reference_no"),
            InvoicePayment.notes.label("notes"),
            InvoicePayment.paid_on.label("paid_on"),
            User.user_name.label("created_by"),
        )
        .outerjoin(Branch, Branch.branch_id == InvoicePayment.branch_id)
        .outerjoin(Customer, Customer.customer_id == InvoicePayment.customer_id)
        .outerjoin(User, User.user_id == InvoicePayment.created_by)
        .filter(InvoicePayment.shop_id == user.shop_id)
        .filter(InvoicePayment.paid_on >= f)
        .filter(InvoicePayment.paid_on < t_end)
        .order_by(InvoicePayment.paid_on.desc())
    )

    if branch_id is not None:
        q = q.filter(InvoicePayment.branch_id == branch_id)

    if user_id:
        q = q.filter(InvoicePayment.created_by == user_id)

    if payment_mode:
        q = q.filter(InvoicePayment.payment_mode == payment_mode)

    return [
        {
            "invoice_number": r.invoice_number,
            "branch": r.branch,
            "customer_name": r.customer_name or "",
            "mobile": r.mobile or "",
            "amount": float(r.amount or 0),
            "payment_mode": r.payment_mode or "",
            "reference_no": r.reference_no or "",
            "notes": r.notes or "",
            "paid_on": r.paid_on.strftime("%d %b %Y %H:%M") if r.paid_on else "",
            "created_by": r.created_by or "",
        }
        for r in q.all()
    ]


# =====================================================
# RETURNS — REGISTER
# =====================================================
@router.get("/returns/register")
def returns_register(
    from_date: str,
    to_date: str,
    branch_id: int | None = None,
    user_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t_end = parse_dt_range(from_date, to_date)
    branch_id = _force_branch(branch_id, user)

    q = (
        db.query(
            SalesReturn.return_number.label("return_number"),
            SalesReturn.invoice_number.label("invoice_number"),
            Branch.branch_name.label("branch"),
            Customer.customer_name.label("customer_name"),
            SalesReturn.customer_mobile.label("mobile"),
            SalesReturn.subtotal_amount.label("sub_total"),
            SalesReturn.tax_amount.label("gst"),
            SalesReturn.discount_amount.label("discount"),
            SalesReturn.refund_amount.label("refund_amount"),
            SalesReturn.reason.label("reason"),
            SalesReturn.status.label("status"),
            SalesReturn.created_on.label("created_on"),
            User.user_name.label("created_by"),
        )
        .outerjoin(Branch, Branch.branch_id == SalesReturn.branch_id)
        .outerjoin(Customer, Customer.customer_id == SalesReturn.customer_id)
        .outerjoin(User, User.user_id == SalesReturn.created_by)
        .filter(SalesReturn.shop_id == user.shop_id)
        .filter(SalesReturn.created_on >= f)
        .filter(SalesReturn.created_on < t_end)
        .order_by(SalesReturn.created_on.desc())
    )

    if branch_id is not None:
        q = q.filter(SalesReturn.branch_id == branch_id)

    if user_id:
        q = q.filter(SalesReturn.created_by == user_id)

    rows = q.all()
    return [
        {
            "return_number": r.return_number,
            "invoice_number": r.invoice_number,
            "branch": r.branch,
            "customer_name": r.customer_name or "",
            "mobile": r.mobile or "",
            "sub_total": float(r.sub_total or 0),
            "gst": float(r.gst or 0),
            "discount": float(r.discount or 0),
            "refund_amount": float(r.refund_amount or 0),
            "reason": r.reason or "",
            "status": r.status,
            "created_on": r.created_on.strftime("%d %b %Y %H:%M") if r.created_on else "",
            "created_by": r.created_by or "",
        }
        for r in rows
    ]


# =====================================================
# RETURNS — ITEM-WISE
# =====================================================
@router.get("/returns/items")
def returns_items(
    from_date: str,
    to_date: str,
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t_end = parse_dt_range(from_date, to_date)
    branch_id = _force_branch(branch_id, user)

    q = (
        db.query(
            Item.item_name.label("item"),
            Branch.branch_name.label("branch"),
            func.coalesce(func.sum(SalesReturnItem.quantity), 0).label("quantity"),
            func.coalesce(func.sum(SalesReturnItem.line_subtotal), 0).label("amount"),
        )
        .join(SalesReturnItem, SalesReturnItem.item_id == Item.item_id)
        .join(SalesReturn, SalesReturn.return_id == SalesReturnItem.return_id)
        .outerjoin(Branch, Branch.branch_id == SalesReturn.branch_id)
        .filter(SalesReturn.shop_id == user.shop_id)
        .filter(SalesReturn.status != "CANCELLED")
        .filter(SalesReturn.created_on >= f)
        .filter(SalesReturn.created_on < t_end)
        .group_by(Item.item_name, Branch.branch_name)
        .order_by(func.sum(SalesReturnItem.line_subtotal).desc())
    )

    if branch_id is not None:
        q = q.filter(SalesReturn.branch_id == branch_id)

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
# STOCK TRANSFERS — REGISTER
# =====================================================
@router.get("/stock-transfers/register")
def stock_transfers_register(
    from_date: str,
    to_date: str,
    branch_id: int | None = None,
    user_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t_end = parse_dt_range(from_date, to_date)
    from_branch = aliased(Branch)
    to_branch = aliased(Branch)
    branch_id = _force_branch(branch_id, user)

    qty_sq = (
        db.query(
            StockTransferItem.transfer_id.label("transfer_id"),
            func.coalesce(func.sum(StockTransferItem.quantity), 0).label("total_qty"),
        )
        .filter(StockTransferItem.shop_id == user.shop_id)
        .group_by(StockTransferItem.transfer_id)
        .subquery()
    )

    q = (
        db.query(
            StockTransfer.transfer_number.label("transfer_number"),
            from_branch.branch_name.label("from_branch"),
            to_branch.branch_name.label("to_branch"),
            StockTransfer.status.label("status"),
            StockTransfer.requested_on.label("requested_on"),
            StockTransfer.approved_on.label("approved_on"),
            StockTransfer.dispatched_on.label("dispatched_on"),
            StockTransfer.received_on.label("received_on"),
            User.user_name.label("requested_by"),
            func.coalesce(qty_sq.c.total_qty, 0).label("total_qty"),
            StockTransfer.notes.label("notes"),
        )
        .join(from_branch, from_branch.branch_id == StockTransfer.from_branch_id)
        .join(to_branch, to_branch.branch_id == StockTransfer.to_branch_id)
        .outerjoin(User, User.user_id == StockTransfer.requested_by)
        .outerjoin(qty_sq, qty_sq.c.transfer_id == StockTransfer.transfer_id)
        .filter(StockTransfer.shop_id == user.shop_id)
        .filter(StockTransfer.requested_on >= f)
        .filter(StockTransfer.requested_on < t_end)
        .order_by(StockTransfer.requested_on.desc())
    )

    if branch_id is not None:
        q = q.filter(
            or_(
                StockTransfer.from_branch_id == branch_id,
                StockTransfer.to_branch_id == branch_id,
            )
        )

    if user_id:
        q = q.filter(StockTransfer.requested_by == user_id)

    rows = q.all()
    return [
        {
            "transfer_number": r.transfer_number,
            "from_branch": r.from_branch,
            "to_branch": r.to_branch,
            "status": r.status,
            "requested_on": r.requested_on.strftime("%d %b %Y %H:%M") if r.requested_on else "",
            "approved_on": r.approved_on.strftime("%d %b %Y %H:%M") if r.approved_on else "",
            "dispatched_on": r.dispatched_on.strftime("%d %b %Y %H:%M") if r.dispatched_on else "",
            "received_on": r.received_on.strftime("%d %b %Y %H:%M") if r.received_on else "",
            "requested_by": r.requested_by or "",
            "total_qty": int(r.total_qty or 0),
            "notes": r.notes or "",
        }
        for r in rows
    ]


# =====================================================
# STOCK TRANSFERS — ITEM LINES
# =====================================================
@router.get("/stock-transfers/items")
def stock_transfers_items(
    from_date: str,
    to_date: str,
    branch_id: int | None = None,
    user_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t_end = parse_dt_range(from_date, to_date)
    from_branch = aliased(Branch)
    to_branch = aliased(Branch)
    branch_id = _force_branch(branch_id, user)

    q = (
        db.query(
            StockTransfer.transfer_number.label("transfer_number"),
            from_branch.branch_name.label("from_branch"),
            to_branch.branch_name.label("to_branch"),
            StockTransfer.status.label("status"),
            StockTransfer.requested_on.label("requested_on"),
            Item.item_name.label("item"),
            StockTransferItem.quantity.label("quantity"),
            User.user_name.label("requested_by"),
        )
        .join(StockTransfer, StockTransfer.transfer_id == StockTransferItem.transfer_id)
        .join(Item, Item.item_id == StockTransferItem.item_id)
        .join(from_branch, from_branch.branch_id == StockTransfer.from_branch_id)
        .join(to_branch, to_branch.branch_id == StockTransfer.to_branch_id)
        .outerjoin(User, User.user_id == StockTransfer.requested_by)
        .filter(StockTransferItem.shop_id == user.shop_id)
        .filter(StockTransfer.requested_on >= f)
        .filter(StockTransfer.requested_on < t_end)
        .order_by(StockTransfer.requested_on.desc(), StockTransfer.transfer_number.desc())
    )

    if branch_id is not None:
        q = q.filter(
            or_(
                StockTransfer.from_branch_id == branch_id,
                StockTransfer.to_branch_id == branch_id,
            )
        )

    if user_id:
        q = q.filter(StockTransfer.requested_by == user_id)

    rows = q.all()
    return [
        {
            "transfer_number": r.transfer_number,
            "from_branch": r.from_branch,
            "to_branch": r.to_branch,
            "status": r.status,
            "requested_on": r.requested_on.strftime("%d %b %Y %H:%M") if r.requested_on else "",
            "item": r.item,
            "quantity": int(r.quantity or 0),
            "requested_by": r.requested_by or "",
        }
        for r in rows
    ]


# =====================================================
# CASH DRAWER — SHIFTS SUMMARY
# =====================================================
@router.get("/cash-drawer/shifts")
def cash_drawer_shifts(
    from_date: str,
    to_date: str,
    branch_id: int | None = None,
    user_id: int | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t_end = parse_dt_range(from_date, to_date)
    branch_id = _force_branch(branch_id, user)
    opened_u = aliased(User)
    closed_u = aliased(User)

    mov_sq = (
        db.query(
            CashMovement.shift_id.label("shift_id"),
            func.coalesce(
                func.sum(case((CashMovement.movement_type == "IN", CashMovement.amount), else_=0)),
                0,
            ).label("cash_in"),
            func.coalesce(
                func.sum(case((CashMovement.movement_type == "OUT", CashMovement.amount), else_=0)),
                0,
            ).label("cash_out"),
        )
        .filter(CashMovement.shop_id == user.shop_id)
        .group_by(CashMovement.shift_id)
        .subquery()
    )

    q = (
        db.query(
            CashShift.shift_id.label("shift_id"),
            Branch.branch_name.label("branch"),
            CashShift.status.label("status"),
            CashShift.opened_at.label("opened_at"),
            opened_u.user_name.label("opened_by"),
            CashShift.opening_cash.label("opening_cash"),
            CashShift.closed_at.label("closed_at"),
            closed_u.user_name.label("closed_by"),
            CashShift.expected_cash.label("expected_cash"),
            CashShift.actual_cash.label("actual_cash"),
            CashShift.diff_cash.label("diff_cash"),
            func.coalesce(mov_sq.c.cash_in, 0).label("cash_in"),
            func.coalesce(mov_sq.c.cash_out, 0).label("cash_out"),
        )
        .join(Branch, Branch.branch_id == CashShift.branch_id)
        .outerjoin(opened_u, opened_u.user_id == CashShift.opened_by)
        .outerjoin(closed_u, closed_u.user_id == CashShift.closed_by)
        .outerjoin(mov_sq, mov_sq.c.shift_id == CashShift.shift_id)
        .filter(CashShift.shop_id == user.shop_id)
        .filter(CashShift.opened_at >= f)
        .filter(CashShift.opened_at < t_end)
        .order_by(CashShift.opened_at.desc())
    )

    if branch_id is not None:
        q = q.filter(CashShift.branch_id == branch_id)

    if user_id:
        q = q.filter(CashShift.opened_by == user_id)

    if status:
        q = q.filter(CashShift.status == status)

    rows = q.all()
    return [
        {
            "shift_id": int(r.shift_id),
            "branch": r.branch,
            "status": r.status,
            "opened_at": r.opened_at.strftime("%d %b %Y %H:%M") if r.opened_at else "",
            "opened_by": r.opened_by or "",
            "opening_cash": float(r.opening_cash or 0),
            "cash_in": float(r.cash_in or 0),
            "cash_out": float(r.cash_out or 0),
            "expected_cash": float(r.expected_cash or 0),
            "actual_cash": float(r.actual_cash or 0),
            "diff_cash": float(r.diff_cash or 0),
            "closed_at": r.closed_at.strftime("%d %b %Y %H:%M") if r.closed_at else "",
            "closed_by": r.closed_by or "",
        }
        for r in rows
    ]


# =====================================================
# CASH DRAWER — MOVEMENTS REGISTER
# =====================================================
@router.get("/cash-drawer/movements")
def cash_drawer_movements(
    from_date: str,
    to_date: str,
    branch_id: int | None = None,
    user_id: int | None = None,
    movement_type: str | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t_end = parse_dt_range(from_date, to_date)
    branch_id = _force_branch(branch_id, user)

    q = (
        db.query(
            CashMovement.shift_id.label("shift_id"),
            Branch.branch_name.label("branch"),
            CashMovement.movement_type.label("type"),
            CashMovement.amount.label("amount"),
            CashMovement.reason.label("reason"),
            CashMovement.created_at.label("time"),
            User.user_name.label("created_by"),
        )
        .join(Branch, Branch.branch_id == CashMovement.branch_id)
        .outerjoin(User, User.user_id == CashMovement.created_by)
        .filter(CashMovement.shop_id == user.shop_id)
        .filter(CashMovement.created_at >= f)
        .filter(CashMovement.created_at < t_end)
        .order_by(CashMovement.created_at.desc())
    )

    if branch_id is not None:
        q = q.filter(CashMovement.branch_id == branch_id)

    if user_id:
        q = q.filter(CashMovement.created_by == user_id)

    if movement_type:
        q = q.filter(CashMovement.movement_type == movement_type)

    rows = q.all()
    return [
        {
            "shift_id": int(r.shift_id),
            "branch": r.branch,
            "type": r.type,
            "amount": float(r.amount or 0),
            "reason": r.reason or "",
            "time": r.time.strftime("%d %b %Y %H:%M") if r.time else "",
            "created_by": r.created_by or "",
        }
        for r in rows
    ]


# =====================================================
# STOCK AUDIT — AUDIT REGISTER
# =====================================================
@router.get("/stock-audit/audits")
def stock_audit_register(
    from_date: str,
    to_date: str,
    branch_id: int | None = None,
    user_id: int | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t_end = parse_dt_range(from_date, to_date)
    branch_id = _force_branch(branch_id, user)
    created_u = aliased(User)
    completed_u = aliased(User)

    lines_sq = (
        db.query(
            StockAuditLine.audit_id.label("audit_id"),
            func.count(StockAuditLine.line_id).label("lines"),
            func.coalesce(
                func.sum(func.abs(func.coalesce(StockAuditLine.difference_qty, 0))),
                0,
            ).label("abs_variance_qty"),
        )
        .filter(StockAuditLine.shop_id == user.shop_id)
        .group_by(StockAuditLine.audit_id)
        .subquery()
    )

    q = (
        db.query(
            StockAudit.audit_number.label("audit_number"),
            Branch.branch_name.label("branch"),
            StockAudit.status.label("status"),
            StockAudit.created_at.label("created_at"),
            created_u.user_name.label("created_by"),
            StockAudit.completed_at.label("completed_at"),
            completed_u.user_name.label("completed_by"),
            func.coalesce(lines_sq.c.lines, 0).label("lines"),
            func.coalesce(lines_sq.c.abs_variance_qty, 0).label("abs_variance_qty"),
            StockAudit.notes.label("notes"),
        )
        .join(Branch, Branch.branch_id == StockAudit.branch_id)
        .outerjoin(created_u, created_u.user_id == StockAudit.created_by)
        .outerjoin(completed_u, completed_u.user_id == StockAudit.completed_by)
        .outerjoin(lines_sq, lines_sq.c.audit_id == StockAudit.audit_id)
        .filter(StockAudit.shop_id == user.shop_id)
        .filter(StockAudit.created_at >= f)
        .filter(StockAudit.created_at < t_end)
        .order_by(StockAudit.created_at.desc())
    )

    if branch_id is not None:
        q = q.filter(StockAudit.branch_id == branch_id)

    if user_id:
        q = q.filter(StockAudit.created_by == user_id)

    if status:
        q = q.filter(StockAudit.status == status)

    rows = q.all()
    return [
        {
            "audit_number": r.audit_number,
            "branch": r.branch,
            "status": r.status,
            "created_at": r.created_at.strftime("%d %b %Y %H:%M") if r.created_at else "",
            "created_by": r.created_by or "",
            "completed_at": r.completed_at.strftime("%d %b %Y %H:%M") if r.completed_at else "",
            "completed_by": r.completed_by or "",
            "lines": int(r.lines or 0),
            "abs_variance_qty": int(r.abs_variance_qty or 0),
            "notes": r.notes or "",
        }
        for r in rows
    ]


# =====================================================
# STOCK AUDIT — VARIANCE LINES
# =====================================================
@router.get("/stock-audit/variances")
def stock_audit_variances(
    from_date: str,
    to_date: str,
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t_end = parse_dt_range(from_date, to_date)
    branch_id = _force_branch(branch_id, user)

    q = (
        db.query(
            StockAudit.audit_number.label("audit_number"),
            Branch.branch_name.label("branch"),
            StockAudit.status.label("status"),
            Item.item_name.label("item"),
            StockAuditLine.system_qty.label("system_qty"),
            StockAuditLine.counted_qty.label("counted_qty"),
            StockAuditLine.difference_qty.label("difference_qty"),
            StockAuditLine.reason.label("reason"),
            StockAudit.completed_at.label("completed_at"),
        )
        .join(StockAudit, StockAudit.audit_id == StockAuditLine.audit_id)
        .join(Item, Item.item_id == StockAuditLine.item_id)
        .join(Branch, Branch.branch_id == StockAudit.branch_id)
        .filter(StockAuditLine.shop_id == user.shop_id)
        .filter(StockAudit.created_at >= f)
        .filter(StockAudit.created_at < t_end)
        .filter(func.coalesce(StockAuditLine.difference_qty, 0) != 0)
        .order_by(StockAudit.created_at.desc(), StockAudit.audit_number.desc())
    )

    if branch_id is not None:
        q = q.filter(StockAudit.branch_id == branch_id)

    rows = q.all()
    return [
        {
            "audit_number": r.audit_number,
            "branch": r.branch,
            "status": r.status,
            "item": r.item,
            "system_qty": int(r.system_qty or 0),
            "counted_qty": int(r.counted_qty or 0) if r.counted_qty is not None else "",
            "difference_qty": int(r.difference_qty or 0) if r.difference_qty is not None else "",
            "reason": r.reason or "",
            "completed_at": r.completed_at.strftime("%d %b %Y %H:%M") if r.completed_at else "",
        }
        for r in rows
    ]


# =====================================================
# SUPPLIER LEDGER — ENTRIES
# =====================================================
@router.get("/supplier-ledger/entries")
def supplier_ledger_entries(
    from_date: str,
    to_date: str,
    branch_id: int | None = None,
    supplier_id: int | None = None,
    user_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t_end = parse_dt_range(from_date, to_date)
    branch_id = _force_branch(branch_id, user)

    q = (
        db.query(
            Supplier.supplier_name.label("supplier"),
            Branch.branch_name.label("branch"),
            SupplierLedgerEntry.entry_type.label("type"),
            SupplierLedgerEntry.reference_no.label("reference_no"),
            SupplierLedgerEntry.debit.label("debit"),
            SupplierLedgerEntry.credit.label("credit"),
            SupplierLedgerEntry.notes.label("notes"),
            SupplierLedgerEntry.entry_time.label("time"),
            User.user_name.label("created_by"),
        )
        .join(Supplier, Supplier.supplier_id == SupplierLedgerEntry.supplier_id)
        .join(Branch, Branch.branch_id == SupplierLedgerEntry.branch_id)
        .outerjoin(User, User.user_id == SupplierLedgerEntry.created_by)
        .filter(SupplierLedgerEntry.shop_id == user.shop_id)
        .filter(SupplierLedgerEntry.entry_time >= f)
        .filter(SupplierLedgerEntry.entry_time < t_end)
        .order_by(SupplierLedgerEntry.entry_time.desc())
    )

    if branch_id is not None:
        q = q.filter(SupplierLedgerEntry.branch_id == branch_id)

    if supplier_id:
        q = q.filter(SupplierLedgerEntry.supplier_id == supplier_id)

    if user_id:
        q = q.filter(SupplierLedgerEntry.created_by == user_id)

    rows = q.all()
    return [
        {
            "supplier": r.supplier,
            "branch": r.branch,
            "type": r.type,
            "reference_no": r.reference_no or "",
            "debit": float(r.debit or 0),
            "credit": float(r.credit or 0),
            "notes": r.notes or "",
            "time": r.time.strftime("%d %b %Y %H:%M") if r.time else "",
            "created_by": r.created_by or "",
        }
        for r in rows
    ]


# =====================================================
# SUPPLIER LEDGER — BALANCES
# =====================================================
@router.get("/supplier-ledger/balances")
def supplier_ledger_balances(
    branch_id: int | None = None,
    supplier_id: int | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t = parse_optional_dates(from_date, to_date)
    branch_id = _force_branch(branch_id, user)

    balance_expr = func.coalesce(func.sum(SupplierLedgerEntry.debit - SupplierLedgerEntry.credit), 0).label("balance")

    q = (
        db.query(
            Supplier.supplier_name.label("supplier"),
            Branch.branch_name.label("branch"),
            balance_expr,
        )
        .join(Supplier, Supplier.supplier_id == SupplierLedgerEntry.supplier_id)
        .join(Branch, Branch.branch_id == SupplierLedgerEntry.branch_id)
        .filter(SupplierLedgerEntry.shop_id == user.shop_id)
    )

    if branch_id is not None:
        q = q.filter(SupplierLedgerEntry.branch_id == branch_id)

    if supplier_id:
        q = q.filter(SupplierLedgerEntry.supplier_id == supplier_id)

    if f and t:
        q = q.filter(SupplierLedgerEntry.entry_time >= f).filter(SupplierLedgerEntry.entry_time < t + timedelta(days=1))

    rows = (
        q.group_by(Supplier.supplier_name, Branch.branch_name)
        .order_by(balance_expr.desc())
        .all()
    )

    return [
        {
            "supplier": r.supplier,
            "branch": r.branch,
            "balance": float(r.balance or 0),
        }
        for r in rows
        if abs(float(r.balance or 0)) > 1e-9
    ]


# =====================================================
# ONLINE ORDERS — REGISTER
# =====================================================
@router.get("/online-orders/list")
def online_orders_list(
    from_date: str,
    to_date: str,
    branch_id: int | None = None,
    provider: str | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t_end = parse_dt_range(from_date, to_date)
    branch_id = _force_branch(branch_id, user)

    q = (
        db.query(
            OnlineOrder.provider.label("provider"),
            OnlineOrder.provider_order_id.label("provider_order_id"),
            OnlineOrder.provider_order_number.label("provider_order_number"),
            OnlineOrder.order_type.label("order_type"),
            OnlineOrder.status.label("status"),
            Branch.branch_name.label("branch"),
            OnlineOrder.customer_name.label("customer_name"),
            OnlineOrder.customer_mobile.label("mobile"),
            OnlineOrder.subtotal_amount.label("sub_total"),
            OnlineOrder.tax_amount.label("gst"),
            OnlineOrder.discount_amount.label("discount"),
            OnlineOrder.total_amount.label("grand_total"),
            OnlineOrder.payment_mode.label("payment_mode"),
            OnlineOrder.payment_status.label("payment_status"),
            OnlineOrder.created_at.label("created_at"),
        )
        .outerjoin(Branch, Branch.branch_id == OnlineOrder.branch_id)
        .filter(OnlineOrder.shop_id == user.shop_id)
        .filter(OnlineOrder.created_at >= f)
        .filter(OnlineOrder.created_at < t_end)
        .order_by(OnlineOrder.created_at.desc())
    )

    if branch_id is not None:
        q = q.filter(OnlineOrder.branch_id == branch_id)

    if provider:
        q = q.filter(OnlineOrder.provider == provider)

    if status:
        q = q.filter(OnlineOrder.status == status)

    rows = q.all()
    return [
        {
            "provider": r.provider,
            "provider_order_id": r.provider_order_id,
            "provider_order_number": r.provider_order_number or "",
            "order_type": r.order_type,
            "status": r.status,
            "branch": r.branch or "",
            "customer_name": r.customer_name or "",
            "mobile": r.mobile or "",
            "sub_total": float(r.sub_total or 0),
            "gst": float(r.gst or 0),
            "discount": float(r.discount or 0),
            "grand_total": float(r.grand_total or 0),
            "payment_mode": r.payment_mode or "",
            "payment_status": r.payment_status or "",
            "created_at": r.created_at.strftime("%d %b %Y %H:%M") if r.created_at else "",
        }
        for r in rows
    ]


# =====================================================
# ONLINE ORDERS — SUMMARY
# =====================================================
@router.get("/online-orders/summary")
def online_orders_summary(
    from_date: str,
    to_date: str,
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t_end = parse_dt_range(from_date, to_date)
    branch_id = _force_branch(branch_id, user)

    q = (
        db.query(
            OnlineOrder.provider.label("provider"),
            OnlineOrder.status.label("status"),
            func.count(OnlineOrder.online_order_id).label("orders"),
            func.coalesce(func.sum(OnlineOrder.total_amount), 0).label("amount"),
        )
        .filter(OnlineOrder.shop_id == user.shop_id)
        .filter(OnlineOrder.created_at >= f)
        .filter(OnlineOrder.created_at < t_end)
        .group_by(OnlineOrder.provider, OnlineOrder.status)
        .order_by(func.sum(OnlineOrder.total_amount).desc())
    )

    if branch_id is not None:
        q = q.filter(OnlineOrder.branch_id == branch_id)

    rows = q.all()
    return [
        {
            "provider": r.provider,
            "status": r.status,
            "orders": int(r.orders or 0),
            "amount": float(r.amount or 0),
        }
        for r in rows
    ]


# =====================================================
# LOYALTY — TRANSACTIONS
# =====================================================
@router.get("/loyalty/transactions")
def loyalty_transactions(
    from_date: str,
    to_date: str,
    customer_id: int | None = None,
    user_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t_end = parse_dt_range(from_date, to_date)

    q = (
        db.query(
            Customer.customer_name.label("customer_name"),
            Customer.mobile.label("mobile"),
            LoyaltyTransaction.txn_type.label("type"),
            LoyaltyTransaction.points.label("points"),
            LoyaltyTransaction.amount_value.label("amount_value"),
            Invoice.invoice_number.label("invoice_number"),
            Branch.branch_name.label("branch"),
            LoyaltyTransaction.notes.label("notes"),
            LoyaltyTransaction.created_at.label("time"),
            User.user_name.label("created_by"),
        )
        .join(Customer, Customer.customer_id == LoyaltyTransaction.customer_id)
        .outerjoin(Invoice, Invoice.invoice_id == LoyaltyTransaction.invoice_id)
        .outerjoin(Branch, Branch.branch_id == Invoice.branch_id)
        .outerjoin(User, User.user_id == LoyaltyTransaction.created_by)
        .filter(LoyaltyTransaction.shop_id == user.shop_id)
        .filter(LoyaltyTransaction.created_at >= f)
        .filter(LoyaltyTransaction.created_at < t_end)
        .order_by(LoyaltyTransaction.created_at.desc())
    )

    if customer_id:
        q = q.filter(LoyaltyTransaction.customer_id == customer_id)

    if user_id:
        q = q.filter(LoyaltyTransaction.created_by == user_id)

    rows = q.all()
    return [
        {
            "customer_name": r.customer_name or "",
            "mobile": r.mobile or "",
            "type": r.type,
            "points": int(r.points or 0),
            "amount_value": float(r.amount_value or 0),
            "invoice_number": r.invoice_number or "",
            "branch": r.branch or "",
            "notes": r.notes or "",
            "time": r.time.strftime("%d %b %Y %H:%M") if r.time else "",
            "created_by": r.created_by or "",
        }
        for r in rows
    ]


# =====================================================
# LOYALTY — CUSTOMER BALANCES
# =====================================================
@router.get("/loyalty/balances")
def loyalty_balances(
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    rows = (
        db.query(
            Customer.customer_name.label("customer_name"),
            Customer.mobile.label("mobile"),
            LoyaltyAccount.points_balance.label("points_balance"),
            LoyaltyAccount.tier.label("tier"),
            LoyaltyAccount.updated_at.label("updated_at"),
        )
        .join(Customer, Customer.customer_id == LoyaltyAccount.customer_id)
        .filter(LoyaltyAccount.shop_id == user.shop_id)
        .order_by(LoyaltyAccount.points_balance.desc())
        .all()
    )

    return [
        {
            "customer_name": r.customer_name or "",
            "mobile": r.mobile or "",
            "points_balance": int(r.points_balance or 0),
            "tier": r.tier or "",
            "updated_at": r.updated_at.strftime("%d %b %Y %H:%M") if r.updated_at else "",
        }
        for r in rows
    ]


# =====================================================
# COUPONS — REDEMPTIONS
# =====================================================
@router.get("/coupons/redemptions")
def coupon_redemptions(
    from_date: str,
    to_date: str,
    coupon_id: int | None = None,
    user_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t_end = parse_dt_range(from_date, to_date)

    q = (
        db.query(
            Coupon.code.label("coupon_code"),
            Coupon.name.label("coupon_name"),
            Invoice.invoice_number.label("invoice_number"),
            Customer.customer_name.label("customer_name"),
            Customer.mobile.label("mobile"),
            User.user_name.label("redeemed_by"),
            CouponRedemption.redeemed_at.label("redeemed_at"),
        )
        .join(Coupon, Coupon.coupon_id == CouponRedemption.coupon_id)
        .outerjoin(Invoice, Invoice.invoice_id == CouponRedemption.invoice_id)
        .outerjoin(Customer, Customer.customer_id == CouponRedemption.customer_id)
        .outerjoin(User, User.user_id == CouponRedemption.redeemed_by)
        .filter(CouponRedemption.shop_id == user.shop_id)
        .filter(CouponRedemption.redeemed_at >= f)
        .filter(CouponRedemption.redeemed_at < t_end)
        .order_by(CouponRedemption.redeemed_at.desc())
    )

    if coupon_id:
        q = q.filter(CouponRedemption.coupon_id == coupon_id)

    if user_id:
        q = q.filter(CouponRedemption.redeemed_by == user_id)

    rows = q.all()
    return [
        {
            "coupon_code": r.coupon_code,
            "coupon_name": r.coupon_name or "",
            "invoice_number": r.invoice_number or "",
            "customer_name": r.customer_name or "",
            "mobile": r.mobile or "",
            "redeemed_by": r.redeemed_by or "",
            "redeemed_at": r.redeemed_at.strftime("%d %b %Y %H:%M") if r.redeemed_at else "",
        }
        for r in rows
    ]


# =====================================================
# COUPONS — SUMMARY
# =====================================================
@router.get("/coupons/summary")
def coupons_summary(
    from_date: str,
    to_date: str,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    f, t_end = parse_dt_range(from_date, to_date)

    q = (
        db.query(
            Coupon.code.label("coupon_code"),
            Coupon.name.label("coupon_name"),
            func.count(CouponRedemption.redemption_id).label("redemptions"),
            func.coalesce(func.sum(Invoice.total_amount), 0).label("invoice_amount"),
        )
        .join(Coupon, Coupon.coupon_id == CouponRedemption.coupon_id)
        .outerjoin(Invoice, Invoice.invoice_id == CouponRedemption.invoice_id)
        .filter(CouponRedemption.shop_id == user.shop_id)
        .filter(CouponRedemption.redeemed_at >= f)
        .filter(CouponRedemption.redeemed_at < t_end)
        .group_by(Coupon.code, Coupon.name)
        .order_by(func.count(CouponRedemption.redemption_id).desc())
    )

    rows = q.all()
    return [
        {
            "coupon_code": r.coupon_code,
            "coupon_name": r.coupon_name or "",
            "redemptions": int(r.redemptions or 0),
            "invoice_amount": float(r.invoice_amount or 0),
        }
        for r in rows
    ]


# =====================================================
# ITEM LOTS — EXPIRY / BATCH REPORT
# =====================================================
@router.get("/inventory/expiry-lots")
def inventory_expiry_lots(
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
            ItemLot.batch_no.label("batch_no"),
            ItemLot.expiry_date.label("expiry_date"),
            ItemLot.serial_no.label("serial_no"),
            ItemLot.quantity.label("quantity"),
            ItemLot.unit_cost.label("unit_cost"),
            ItemLot.source_type.label("source_type"),
            ItemLot.source_ref.label("source_ref"),
        )
        .join(Item, Item.item_id == ItemLot.item_id)
        .join(Branch, Branch.branch_id == ItemLot.branch_id)
        .filter(ItemLot.shop_id == user.shop_id)
        .filter(ItemLot.expiry_date.isnot(None))
        .filter(ItemLot.expiry_date.between(f.date(), t.date()))
        .order_by(ItemLot.expiry_date.asc(), Item.item_name.asc())
    )

    if branch_id is not None:
        q = q.filter(ItemLot.branch_id == branch_id)

    rows = q.all()
    return [
        {
            "item": r.item,
            "branch": r.branch,
            "batch_no": r.batch_no or "",
            "expiry_date": r.expiry_date.strftime("%d %b %Y") if r.expiry_date else "",
            "serial_no": r.serial_no or "",
            "quantity": int(r.quantity or 0),
            "unit_cost": float(r.unit_cost or 0),
            "source_type": r.source_type or "",
            "source_ref": r.source_ref or "",
        }
        for r in rows
    ]


# =====================================================
# PLACEHOLDER REPORTS (GST / ACCOUNTING / RECON / COMPLIANCE)
# These return an empty list with 200 to avoid 404 until implemented.
# =====================================================
def _empty_report():
    return []


@router.get("/gst/gstr1")
def gst_gstr1(
    from_date: str | None = None,
    to_date: str | None = None,
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    if not from_date or not to_date:
        raise HTTPException(400, "from_date and to_date are required")

    f, t_end = parse_dt_range(from_date, to_date)
    branch_id = _force_branch(branch_id, user)

    has_pos = _has_column(db, "invoice", "place_of_supply")
    has_supply_type = _has_column(db, "invoice", "supply_type")
    has_reverse = _has_column(db, "invoice", "reverse_charge")

    inv_rows = (
        db.query(
            Invoice.invoice_id,
            Invoice.invoice_number,
            Invoice.created_time,
            Invoice.customer_name,
            Invoice.gst_number,
            Invoice.total_amount,
            Invoice.discounted_amt,
            Invoice.tax_amt,
            (Invoice.place_of_supply if has_pos else literal(None)).label("place_of_supply"),
            (Invoice.supply_type if has_supply_type else literal(None)).label("supply_type"),
            (Invoice.reverse_charge if has_reverse else literal(False)).label("reverse_charge"),
            Branch.state.label("branch_state"),
            ShopDetails.state.label("shop_state"),
            ShopDetails.gst_mode,
            ShopDetails.gst_enabled,
        )
        .join(ShopDetails, ShopDetails.shop_id == Invoice.shop_id)
        .outerjoin(Branch, Branch.branch_id == Invoice.branch_id)
        .filter(Invoice.shop_id == user.shop_id)
        .filter(Invoice.created_time >= f)
        .filter(Invoice.created_time < t_end)
    )
    if branch_id:
        inv_rows = inv_rows.filter(Invoice.branch_id == branch_id)
    inv_rows = inv_rows.order_by(Invoice.created_time).all()
    if not inv_rows:
        return []

    inv_ids = [r.invoice_id for r in inv_rows]
    has_taxable = _has_column(db, "invoice_details", "taxable_value")
    has_cgst = _has_column(db, "invoice_details", "cgst_amt")
    has_sgst = _has_column(db, "invoice_details", "sgst_amt")
    has_igst = _has_column(db, "invoice_details", "igst_amt")
    has_cess = _has_column(db, "invoice_details", "cess_amt")
    has_tax_rate = _has_column(db, "invoice_details", "tax_rate")
    detail_rows = (
        db.query(
            InvoiceDetail.invoice_id,
            InvoiceDetail.amount,
            (InvoiceDetail.taxable_value if has_taxable else literal(None)).label("taxable_value"),
            (InvoiceDetail.cgst_amt if has_cgst else literal(None)).label("cgst_amt"),
            (InvoiceDetail.sgst_amt if has_sgst else literal(None)).label("sgst_amt"),
            (InvoiceDetail.igst_amt if has_igst else literal(None)).label("igst_amt"),
            (InvoiceDetail.cess_amt if has_cess else literal(None)).label("cess_amt"),
            (InvoiceDetail.tax_rate if has_tax_rate else literal(None)).label("tax_rate"),
            InvoiceDetail.quantity,
            Item.hsn_code,
            Item.item_name,
            Item.gst_rate,
        )
        .join(Item, Item.item_id == InvoiceDetail.item_id)
        .filter(InvoiceDetail.invoice_id.in_(inv_ids))
        .all()
    )

    ctx_map, _ = _build_invoice_context(inv_rows, detail_rows)
    agg = defaultdict(
        lambda: {
            "taxable": Decimal("0.00"),
            "cgst": Decimal("0.00"),
            "sgst": Decimal("0.00"),
            "igst": Decimal("0.00"),
            "cess": Decimal("0.00"),
        }
    )

    for d in detail_rows:
        inv_id = int(d.invoice_id)
        taxable, cgst, sgst, igst, cess = _detail_tax_breakup(d, ctx_map.get(inv_id, {}))
        agg[inv_id]["taxable"] += taxable
        agg[inv_id]["cgst"] += cgst
        agg[inv_id]["sgst"] += sgst
        agg[inv_id]["igst"] += igst
        agg[inv_id]["cess"] += cess

    results = []
    for inv in inv_rows:
        sums = agg[inv.invoice_id]
        total_value = sums["taxable"] + sums["cgst"] + sums["sgst"] + sums["igst"] + sums["cess"]
        total_value -= _dec(inv.discounted_amt or 0)
        if total_value < 0:
            total_value = Decimal("0.00")

        results.append(
            {
                "invoice_date": inv.created_time.strftime("%d %b %Y"),
                "invoice_number": inv.invoice_number,
                "customer": inv.customer_name or "",
                "customer_gst": inv.gst_number or "",
                "supply_type": inv.supply_type or ("B2B" if inv.gst_number else "B2C"),
                "place_of_supply": inv.place_of_supply or inv.branch_state or inv.shop_state or "",
                "taxable_value": _as_float(sums["taxable"]),
                "cgst": _as_float(sums["cgst"]),
                "sgst": _as_float(sums["sgst"]),
                "igst": _as_float(sums["igst"]),
                "cess": _as_float(sums["cess"]),
                "total_value": _as_float(total_value),
                "reverse_charge": "Yes" if inv.reverse_charge else "No",
            }
        )

    return results


@router.get("/gst/gstr3b")
def gst_gstr3b(
    from_date: str | None = None,
    to_date: str | None = None,
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    if not from_date or not to_date:
        raise HTTPException(400, "from_date and to_date are required")

    f, t_end = parse_dt_range(from_date, to_date)
    branch_id = _force_branch(branch_id, user)

    outward_rows = gst_gstr1(from_date, to_date, branch_id, db, user)
    out_taxable = sum((_dec(r.get("taxable_value")) for r in outward_rows), Decimal("0.00"))
    out_igst = sum((_dec(r.get("igst")) for r in outward_rows), Decimal("0.00"))
    out_cgst = sum((_dec(r.get("cgst")) for r in outward_rows), Decimal("0.00"))
    out_sgst = sum((_dec(r.get("sgst")) for r in outward_rows), Decimal("0.00"))
    out_cess = sum((_dec(r.get("cess")) for r in outward_rows), Decimal("0.00"))

    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == user.shop_id).first()
    shop_state = getattr(shop, "state", None)
    has_pos = _has_column(db, "invoice", "place_of_supply")

    ret_q = (
        db.query(
            SalesReturn.subtotal_amount,
            SalesReturn.tax_amount,
            SalesReturn.created_on,
            (Invoice.place_of_supply if has_pos else literal(None)).label("place_of_supply"),
            Branch.state.label("branch_state"),
        )
        .join(Invoice, Invoice.invoice_id == SalesReturn.invoice_id)
        .outerjoin(Branch, Branch.branch_id == SalesReturn.branch_id)
        .filter(SalesReturn.shop_id == user.shop_id)
        .filter(SalesReturn.status != "CANCELLED")
        .filter(SalesReturn.created_on >= f)
        .filter(SalesReturn.created_on < t_end)
    )
    if branch_id:
        ret_q = ret_q.filter(SalesReturn.branch_id == branch_id)
    ret_rows = ret_q.all()

    ret_taxable = Decimal("0.00")
    ret_cgst = Decimal("0.00")
    ret_sgst = Decimal("0.00")
    ret_igst = Decimal("0.00")
    ret_cess = Decimal("0.00")

    for r in ret_rows:
        taxable = _dec(r.subtotal_amount)
        tax_amt = _dec(r.tax_amount)
        ret_taxable += taxable
        intra = _state_eq(r.place_of_supply or r.branch_state, shop_state)
        if intra:
            cg = _q(tax_amt / 2)
            sg = _q(tax_amt - cg)
            ret_cgst += cg
            ret_sgst += sg
        else:
            ret_igst += tax_amt

    net_taxable = out_taxable - ret_taxable
    net_cgst = out_cgst - ret_cgst
    net_sgst = out_sgst - ret_sgst
    net_igst = out_igst - ret_igst
    net_cess = out_cess - ret_cess

    itc_rows, itc_totals = _compute_itc_rows(db, user, f, t_end, branch_id)

    payable_cgst = net_cgst - itc_totals["cgst"]
    payable_sgst = net_sgst - itc_totals["sgst"]
    payable_igst = net_igst - itc_totals["igst"]
    payable_cess = net_cess - itc_totals["cess"]

    return [
        {
            "section": "Outward Supplies",
            "taxable_value": _as_float(out_taxable),
            "igst": _as_float(out_igst),
            "cgst": _as_float(out_cgst),
            "sgst": _as_float(out_sgst),
            "cess": _as_float(out_cess),
        },
        {
            "section": "Credit Notes / Returns",
            "taxable_value": _as_float(-ret_taxable),
            "igst": _as_float(-ret_igst),
            "cgst": _as_float(-ret_cgst),
            "sgst": _as_float(-ret_sgst),
            "cess": _as_float(-ret_cess),
        },
        {
            "section": "Net Outward",
            "taxable_value": _as_float(net_taxable),
            "igst": _as_float(net_igst),
            "cgst": _as_float(net_cgst),
            "sgst": _as_float(net_sgst),
            "cess": _as_float(net_cess),
        },
        {
            "section": "Input Tax Credit (Purchases)",
            "taxable_value": _as_float(itc_totals["taxable"]),
            "igst": _as_float(itc_totals["igst"]),
            "cgst": _as_float(itc_totals["cgst"]),
            "sgst": _as_float(itc_totals["sgst"]),
            "cess": _as_float(itc_totals["cess"]),
        },
        {
            "section": "Net GST Payable",
            "taxable_value": _as_float(net_taxable),
            "igst": _as_float(payable_igst),
            "cgst": _as_float(payable_cgst),
            "sgst": _as_float(payable_sgst),
            "cess": _as_float(payable_cess),
        },
    ]


@router.get("/gst/hsn-summary")
def gst_hsn_summary(
    from_date: str | None = None,
    to_date: str | None = None,
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    if not from_date or not to_date:
        raise HTTPException(400, "from_date and to_date are required")

    f, t_end = parse_dt_range(from_date, to_date)
    branch_id = _force_branch(branch_id, user)

    inv_rows = (
        db.query(
            Invoice.invoice_id,
            Invoice.tax_amt,
            Invoice.total_amount,
            (Invoice.place_of_supply if _has_column(db, "invoice", "place_of_supply") else literal(None)).label(
                "place_of_supply"
            ),
            Branch.state.label("branch_state"),
            ShopDetails.state.label("shop_state"),
            ShopDetails.gst_mode,
            ShopDetails.gst_enabled,
        )
        .join(ShopDetails, ShopDetails.shop_id == Invoice.shop_id)
        .outerjoin(Branch, Branch.branch_id == Invoice.branch_id)
        .filter(Invoice.shop_id == user.shop_id)
        .filter(Invoice.created_time >= f)
        .filter(Invoice.created_time < t_end)
    )
    if branch_id:
        inv_rows = inv_rows.filter(Invoice.branch_id == branch_id)
    inv_rows = inv_rows.all()
    if not inv_rows:
        return []

    inv_ids = [r.invoice_id for r in inv_rows]
    has_taxable = _has_column(db, "invoice_details", "taxable_value")
    has_cgst = _has_column(db, "invoice_details", "cgst_amt")
    has_sgst = _has_column(db, "invoice_details", "sgst_amt")
    has_igst = _has_column(db, "invoice_details", "igst_amt")
    has_cess = _has_column(db, "invoice_details", "cess_amt")
    has_tax_rate = _has_column(db, "invoice_details", "tax_rate")

    detail_rows = (
        db.query(
            InvoiceDetail.invoice_id,
            InvoiceDetail.quantity,
            InvoiceDetail.amount,
            (InvoiceDetail.taxable_value if has_taxable else literal(None)).label("taxable_value"),
            (InvoiceDetail.cgst_amt if has_cgst else literal(None)).label("cgst_amt"),
            (InvoiceDetail.sgst_amt if has_sgst else literal(None)).label("sgst_amt"),
            (InvoiceDetail.igst_amt if has_igst else literal(None)).label("igst_amt"),
            (InvoiceDetail.cess_amt if has_cess else literal(None)).label("cess_amt"),
            (InvoiceDetail.tax_rate if has_tax_rate else literal(None)).label("tax_rate"),
            Item.hsn_code,
            Item.item_name,
            Item.gst_rate,
        )
        .join(Item, Item.item_id == InvoiceDetail.item_id)
        .filter(InvoiceDetail.invoice_id.in_(inv_ids))
        .all()
    )

    ctx_map, _ = _build_invoice_context(inv_rows, detail_rows)
    agg = defaultdict(
        lambda: {
            "description": "",
            "quantity": 0,
            "taxable": Decimal("0.00"),
            "cgst": Decimal("0.00"),
            "sgst": Decimal("0.00"),
            "igst": Decimal("0.00"),
            "cess": Decimal("0.00"),
        }
    )

    for d in detail_rows:
        inv_id = int(d.invoice_id)
        taxable, cgst, sgst, igst, cess = _detail_tax_breakup(d, ctx_map.get(inv_id, {}))
        hsn = (d.hsn_code or "NA").strip() or "NA"
        agg[hsn]["description"] = agg[hsn]["description"] or (d.item_name or "")
        agg[hsn]["quantity"] += int(d.quantity or 0)
        agg[hsn]["taxable"] += taxable
        agg[hsn]["cgst"] += cgst
        agg[hsn]["sgst"] += sgst
        agg[hsn]["igst"] += igst
        agg[hsn]["cess"] += cess

    results = []
    for hsn, vals in sorted(agg.items(), key=lambda x: x[0]):
        total = vals["taxable"] + vals["cgst"] + vals["sgst"] + vals["igst"] + vals["cess"]
        results.append(
            {
                "hsn": hsn,
                "description": vals["description"],
                "quantity": vals["quantity"],
                "taxable_value": _as_float(vals["taxable"]),
                "cgst": _as_float(vals["cgst"]),
                "sgst": _as_float(vals["sgst"]),
                "igst": _as_float(vals["igst"]),
                "cess": _as_float(vals["cess"]),
                "total_value": _as_float(total),
            }
        )

    return results


@router.get("/gst/itc-register")
def gst_itc_register(
    from_date: str | None = None,
    to_date: str | None = None,
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    if not from_date or not to_date:
        raise HTTPException(400, "from_date and to_date are required")

    f, t_end = parse_dt_range(from_date, to_date)
    branch_id = _force_branch(branch_id, user)
    rows, _ = _compute_itc_rows(db, user, f, t_end, branch_id)
    return rows


@router.get("/accounting/cash-bank-book")
def accounting_cash_bank_book(
    from_date: str | None = None,
    to_date: str | None = None,
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    if not from_date or not to_date:
        raise HTTPException(400, "from_date and to_date are required")

    f, t_end = parse_dt_range(from_date, to_date)
    branch_id = _force_branch(branch_id, user)

    pay_q = (
        db.query(
            InvoicePayment.payment_mode,
            func.coalesce(func.sum(InvoicePayment.amount), 0).label("amount"),
            func.count(InvoicePayment.payment_id).label("count"),
        )
        .filter(InvoicePayment.shop_id == user.shop_id)
        .filter(InvoicePayment.paid_on >= f)
        .filter(InvoicePayment.paid_on < t_end)
        .group_by(InvoicePayment.payment_mode)
    )
    if branch_id:
        pay_q = pay_q.filter(InvoicePayment.branch_id == branch_id)
    pay_rows = pay_q.all()
    inflow = {r.payment_mode or "cash": _dec(r.amount) for r in pay_rows}

    exp_q = (
        db.query(
            BranchExpense.payment_mode,
            func.coalesce(func.sum(BranchExpense.amount), 0).label("amount"),
            func.count(BranchExpense.expense_id).label("count"),
        )
        .filter(BranchExpense.shop_id == user.shop_id)
        .filter(BranchExpense.expense_date >= f.date())
        .filter(BranchExpense.expense_date <= (t_end - timedelta(days=1)).date())
        .group_by(BranchExpense.payment_mode)
    )
    if branch_id:
        exp_q = exp_q.filter(BranchExpense.branch_id == branch_id)
    exp_rows = exp_q.all()
    outflow = {r.payment_mode or "cash": _dec(r.amount) for r in exp_rows}

    modes = set(inflow.keys()) | set(outflow.keys())
    if not modes:
        return []

    results = []
    for mode in sorted(modes):
        inflow_amt = inflow.get(mode, Decimal("0.00"))
        outflow_amt = outflow.get(mode, Decimal("0.00"))
        results.append(
            {
                "payment_mode": (mode or "cash").replace("_", " ").title(),
                "inflow": _as_float(inflow_amt),
                "outflow": _as_float(outflow_amt),
                "net": _as_float(inflow_amt - outflow_amt),
            }
        )
    return results


@router.get("/accounting/day-book")
def accounting_day_book(
    from_date: str | None = None,
    to_date: str | None = None,
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    if not from_date or not to_date:
        raise HTTPException(400, "from_date and to_date are required")

    f, t_end = parse_dt_range(from_date, to_date)
    branch_id = _force_branch(branch_id, user)

    entries = []

    inv_q = (
        db.query(
            Invoice.invoice_number,
            Invoice.customer_name,
            Invoice.total_amount,
            Invoice.discounted_amt,
            Invoice.payment_mode,
            Invoice.created_time,
        )
        .filter(Invoice.shop_id == user.shop_id)
        .filter(Invoice.created_time >= f)
        .filter(Invoice.created_time < t_end)
    )
    if branch_id:
        inv_q = inv_q.filter(Invoice.branch_id == branch_id)
    for r in inv_q.all():
        amount = _dec(r.total_amount) - _dec(r.discounted_amt)
        entries.append(
            {
                "date": r.created_time.strftime("%d %b %Y"),
                "type": "Sale",
                "reference": r.invoice_number,
                "particulars": r.customer_name or "",
                "payment_mode": (r.payment_mode or "cash").title(),
                "inflow": _as_float(amount),
                "outflow": 0.0,
                "_sort": r.created_time,
            }
        )

    exp_q = (
        db.query(
            BranchExpense.expense_id,
            BranchExpense.expense_date,
            BranchExpense.category,
            BranchExpense.amount,
            BranchExpense.payment_mode,
        )
        .filter(BranchExpense.shop_id == user.shop_id)
        .filter(BranchExpense.expense_date >= f.date())
        .filter(BranchExpense.expense_date <= (t_end - timedelta(days=1)).date())
    )
    if branch_id:
        exp_q = exp_q.filter(BranchExpense.branch_id == branch_id)
    for r in exp_q.all():
        sort_dt = datetime.combine(r.expense_date, datetime.min.time())
        entries.append(
            {
                "date": r.expense_date.strftime("%d %b %Y"),
                "type": "Expense",
                "reference": r.category,
                "particulars": r.category,
                "payment_mode": (r.payment_mode or "cash").title(),
                "inflow": 0.0,
                "outflow": _as_float(r.amount),
                "_sort": sort_dt,
            }
        )

    entries = sorted(entries, key=lambda x: x.get("_sort"))
    for e in entries:
        e.pop("_sort", None)
    return entries


@router.get("/accounting/trial-balance")
def accounting_trial_balance(
    as_of: str | None = None,
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    if not as_of:
        as_of = get_business_date(db, user.shop_id).isoformat()
    try:
        dt = datetime.strptime(as_of, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "Invalid as_of date")

    # Use range from beginning to as_of inclusive
    f = datetime.combine(dt.date(), datetime.min.time())
    t_end = f + timedelta(days=1)
    branch_id = _force_branch(branch_id, user)

    sales_q = (
        db.query(
            func.coalesce(
                func.sum(func.coalesce(Invoice.total_amount, 0) - func.coalesce(Invoice.discounted_amt, 0)),
                0,
            ).label("sales"),
            func.coalesce(func.sum(func.coalesce(Invoice.tax_amt, 0)), 0).label("gst"),
            func.coalesce(func.sum(func.coalesce(Invoice.discounted_amt, 0)), 0).label("discounts"),
        )
        .filter(Invoice.shop_id == user.shop_id)
        .filter(Invoice.created_time < t_end)
    )
    if branch_id:
        sales_q = sales_q.filter(Invoice.branch_id == branch_id)
    sales_row = sales_q.first()
    sales = _dec(getattr(sales_row, "sales", 0))
    gst_out = _dec(getattr(sales_row, "gst", 0))
    discounts = _dec(getattr(sales_row, "discounts", 0))

    returns_q = (
        db.query(func.coalesce(func.sum(func.coalesce(SalesReturn.refund_amount, 0)), 0))
        .filter(SalesReturn.shop_id == user.shop_id)
        .filter(SalesReturn.status != "CANCELLED")
        .filter(SalesReturn.created_on < t_end)
    )
    if branch_id:
        returns_q = returns_q.filter(SalesReturn.branch_id == branch_id)
    returns_amt = _dec(returns_q.scalar() or 0)

    exp_q = (
        db.query(func.coalesce(func.sum(func.coalesce(BranchExpense.amount, 0)), 0))
        .filter(BranchExpense.shop_id == user.shop_id)
        .filter(BranchExpense.expense_date <= dt.date())
    )
    if branch_id:
        exp_q = exp_q.filter(BranchExpense.branch_id == branch_id)
    expenses = _dec(exp_q.scalar() or 0)

    cogs_q = (
        db.query(func.coalesce(func.sum(InvoiceDetail.buy_price * InvoiceDetail.quantity), 0))
        .join(Invoice, Invoice.invoice_id == InvoiceDetail.invoice_id)
        .filter(Invoice.shop_id == user.shop_id)
        .filter(Invoice.created_time < t_end)
    )
    if branch_id:
        cogs_q = cogs_q.filter(Invoice.branch_id == branch_id)
    cogs = _dec(cogs_q.scalar() or 0)

    recv_q = (
        db.query(func.coalesce(func.sum(func.coalesce(InvoiceDue.original_amount, 0)), 0))
        .filter(InvoiceDue.shop_id == user.shop_id)
        .filter(InvoiceDue.status == "OPEN")
        .filter(InvoiceDue.created_on <= t_end)
    )
    if branch_id:
        recv_q = recv_q.filter(InvoiceDue.branch_id == branch_id)
    receivables = _dec(recv_q.scalar() or 0)

    pay_q = (
        db.query(
            func.coalesce(func.sum(func.coalesce(SupplierLedgerEntry.credit, 0)), 0).label("credit"),
            func.coalesce(func.sum(func.coalesce(SupplierLedgerEntry.debit, 0)), 0).label("debit"),
        )
        .filter(SupplierLedgerEntry.shop_id == user.shop_id)
        .filter(SupplierLedgerEntry.entry_time < t_end)
    )
    if branch_id:
        pay_q = pay_q.filter(SupplierLedgerEntry.branch_id == branch_id)
    pay_row = pay_q.first()
    payables_net = _dec(getattr(pay_row, "credit", 0)) - _dec(getattr(pay_row, "debit", 0))

    rows = [
        {"account": "Sales", "debit": 0.0, "credit": _as_float(sales)},
        {"account": "Output GST", "debit": 0.0, "credit": _as_float(gst_out)},
        {"account": "Discount Allowed", "debit": _as_float(discounts), "credit": 0.0},
        {"account": "Sales Returns", "debit": _as_float(returns_amt), "credit": 0.0},
        {"account": "Cost of Goods Sold", "debit": _as_float(cogs), "credit": 0.0},
        {"account": "Expenses", "debit": _as_float(expenses), "credit": 0.0},
        {"account": "Accounts Receivable", "debit": _as_float(receivables), "credit": 0.0},
    ]

    if payables_net >= 0:
        rows.append({"account": "Accounts Payable", "debit": 0.0, "credit": _as_float(payables_net)})
    else:
        rows.append({"account": "Accounts Payable", "debit": _as_float(-payables_net), "credit": 0.0})

    debit_total = sum(r["debit"] for r in rows)
    credit_total = sum(r["credit"] for r in rows)
    diff = debit_total - credit_total
    if abs(diff) >= 0.01:
        if diff > 0:
            rows.append({"account": "Balancing Figure", "debit": 0.0, "credit": _as_float(diff)})
        else:
            rows.append({"account": "Balancing Figure", "debit": _as_float(-diff), "credit": 0.0})

    return rows


@router.get("/accounting/pnl")
def accounting_pnl(
    from_date: str | None = None,
    to_date: str | None = None,
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    if not from_date or not to_date:
        raise HTTPException(400, "from_date and to_date are required")

    f, t = parse_dates(from_date, to_date)
    branch_id = _force_branch(branch_id, user)
    fin = calc_period_financials(
        db,
        shop_id=user.shop_id,
        branch_id=branch_id,
        from_dt=f.date(),
        to_dt=t.date(),
    )

    return [
        {"metric": "Sales (Ex GST)", "amount": _as_float(fin.get("sales_ex_tax", 0))},
        {"metric": "GST Output", "amount": _as_float(fin.get("gst", 0))},
        {"metric": "Discounts", "amount": _as_float(fin.get("discount", 0))},
        {"metric": "Returns (Ex GST)", "amount": _as_float(fin.get("returns_sales_ex_tax", 0))},
        {"metric": "Returns GST", "amount": _as_float(fin.get("returns_tax", 0))},
        {"metric": "COGS", "amount": _as_float(fin.get("cogs_net", 0))},
        {"metric": "Expenses", "amount": _as_float(fin.get("expense", 0))},
        {"metric": "Gross Profit", "amount": _as_float(fin.get("gross_profit", 0))},
        {"metric": "Net Profit", "amount": _as_float(fin.get("net_profit", 0))},
    ]


@router.get("/accounting/balance-sheet")
def accounting_balance_sheet(
    as_of: str | None = None,
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    if not as_of:
        as_of = get_business_date(db, user.shop_id).isoformat()
    try:
        dt = datetime.strptime(as_of, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "Invalid as_of date")

    branch_id = _force_branch(branch_id, user)
    f_anchor = datetime(2000, 1, 1)
    t_end = datetime.combine(dt.date(), datetime.min.time()) + timedelta(days=1)

    pay_q = (
        db.query(func.coalesce(func.sum(InvoicePayment.amount), 0))
        .filter(InvoicePayment.shop_id == user.shop_id)
        .filter(InvoicePayment.paid_on < t_end)
    )
    if branch_id:
        pay_q = pay_q.filter(InvoicePayment.branch_id == branch_id)
    receipts = _dec(pay_q.scalar() or 0)

    exp_q = (
        db.query(func.coalesce(func.sum(BranchExpense.amount), 0))
        .filter(BranchExpense.shop_id == user.shop_id)
        .filter(BranchExpense.expense_date <= dt.date())
    )
    if branch_id:
        exp_q = exp_q.filter(BranchExpense.branch_id == branch_id)
    payouts = _dec(exp_q.scalar() or 0)
    cash_bank = receipts - payouts

    inv_q = (
        db.query(
            func.coalesce(func.sum(func.coalesce(Inventory.quantity, 0) * func.coalesce(Item.buy_price, 0)), 0)
        )
        .join(Item, Item.item_id == Inventory.item_id)
        .filter(Inventory.shop_id == user.shop_id)
    )
    if branch_id:
        inv_q = inv_q.filter(Inventory.branch_id == branch_id)
    inventory_val = _dec(inv_q.scalar() or 0)

    recv_q = (
        db.query(func.coalesce(func.sum(func.coalesce(InvoiceDue.original_amount, 0)), 0))
        .filter(InvoiceDue.shop_id == user.shop_id)
        .filter(InvoiceDue.status == "OPEN")
        .filter(InvoiceDue.created_on <= t_end)
    )
    if branch_id:
        recv_q = recv_q.filter(InvoiceDue.branch_id == branch_id)
    receivables = _dec(recv_q.scalar() or 0)

    payables_q = (
        db.query(
            func.coalesce(func.sum(func.coalesce(SupplierLedgerEntry.credit, 0)), 0).label("credit"),
            func.coalesce(func.sum(func.coalesce(SupplierLedgerEntry.debit, 0)), 0).label("debit"),
        )
        .filter(SupplierLedgerEntry.shop_id == user.shop_id)
        .filter(SupplierLedgerEntry.entry_time < t_end)
    )
    if branch_id:
        payables_q = payables_q.filter(SupplierLedgerEntry.branch_id == branch_id)
    payables_row = payables_q.first()
    payables = _dec(getattr(payables_row, "credit", 0)) - _dec(getattr(payables_row, "debit", 0))

    # GST payable (net output - ITC)
    gst_out_q = (
        db.query(func.coalesce(func.sum(func.coalesce(Invoice.tax_amt, 0)), 0))
        .filter(Invoice.shop_id == user.shop_id)
        .filter(Invoice.created_time < t_end)
    )
    if branch_id:
        gst_out_q = gst_out_q.filter(Invoice.branch_id == branch_id)
    gst_output = _dec(gst_out_q.scalar() or 0)

    ret_tax_q = (
        db.query(func.coalesce(func.sum(func.coalesce(SalesReturn.tax_amount, 0)), 0))
        .filter(SalesReturn.shop_id == user.shop_id)
        .filter(SalesReturn.status != "CANCELLED")
        .filter(SalesReturn.created_on < t_end)
    )
    if branch_id:
        ret_tax_q = ret_tax_q.filter(SalesReturn.branch_id == branch_id)
    gst_output -= _dec(ret_tax_q.scalar() or 0)

    _, itc_totals = _compute_itc_rows(db, user, f_anchor, t_end, branch_id)
    gst_itc_total = itc_totals["cgst"] + itc_totals["sgst"] + itc_totals["igst"] + itc_totals["cess"]
    gst_payable = gst_output - gst_itc_total

    assets_total = cash_bank + receivables + inventory_val
    liabilities_total = Decimal("0.00")
    rows = [
        {"head": "Cash & Bank", "type": "Asset", "amount": _as_float(cash_bank)},
        {"head": "Accounts Receivable", "type": "Asset", "amount": _as_float(receivables)},
        {"head": "Inventory", "type": "Asset", "amount": _as_float(inventory_val)},
    ]

    if payables >= 0:
        rows.append({"head": "Accounts Payable", "type": "Liability", "amount": _as_float(payables)})
        liabilities_total += payables
    else:
        assets_total += -payables
        rows.append({"head": "Accounts Payable", "type": "Asset", "amount": _as_float(-payables)})

    if gst_payable >= 0:
        rows.append({"head": "GST Payable", "type": "Liability", "amount": _as_float(gst_payable)})
        liabilities_total += gst_payable
    else:
        rows.append({"head": "GST Credit", "type": "Asset", "amount": _as_float(-gst_payable)})
        assets_total += -gst_payable

    equity = assets_total - liabilities_total
    if abs(equity) >= Decimal("0.01"):
        rows.append({"head": "Equity / Retained", "type": "Liability", "amount": _as_float(equity)})

    return rows


@router.get("/recon/payments-gateway")
def recon_payments_gateway(
    from_date: str | None = None,
    to_date: str | None = None,
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    if not from_date or not to_date:
        raise HTTPException(400, "from_date and to_date are required")

    f, t_end = parse_dt_range(from_date, to_date)
    branch_id = _force_branch(branch_id, user)
    pay_q = (
        db.query(
            InvoicePayment.payment_mode,
            func.count(InvoicePayment.payment_id).label("txns"),
            func.coalesce(func.sum(InvoicePayment.amount), 0).label("amount"),
        )
        .filter(InvoicePayment.shop_id == user.shop_id)
        .filter(InvoicePayment.paid_on >= f)
        .filter(InvoicePayment.paid_on < t_end)
        .group_by(InvoicePayment.payment_mode)
    )
    if branch_id:
        pay_q = pay_q.filter(InvoicePayment.branch_id == branch_id)

    rows = []
    for r in pay_q.all():
        mode = (r.payment_mode or "cash").lower()
        rows.append(
            {
                "gateway": mode.upper(),
                "transactions": int(r.txns or 0),
                "amount": _as_float(r.amount),
            }
        )
    return rows


@router.get("/recon/stock-valuation")
def recon_stock_valuation(
    as_of: str | None = None,
    method: str | None = None,
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    if not as_of:
        as_of = get_business_date(db, user.shop_id).isoformat()
    try:
        _ = datetime.strptime(as_of, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "Invalid as_of date")

    branch_id = _force_branch(branch_id, user)
    q = (
        db.query(
            Item.item_name,
            Item.hsn_code,
            Item.buy_price,
            Inventory.quantity,
            Inventory.branch_id,
        )
        .join(Item, Item.item_id == Inventory.item_id)
        .filter(Inventory.shop_id == user.shop_id)
    )
    if branch_id:
        q = q.filter(Inventory.branch_id == branch_id)

    rows = []
    for r in q.all():
        qty = int(r.quantity or 0)
        rate = _dec(r.buy_price)
        valuation = rate * qty
        rows.append(
            {
                "item": r.item_name,
                "hsn": r.hsn_code or "",
                "method": (method or "AVG").upper(),
                "quantity": qty,
                "rate": _as_float(rate),
                "valuation": _as_float(valuation),
            }
        )

    return rows


@router.get("/compliance/e-invoice-status")
def compliance_e_invoice_status(
    from_date: str | None = None,
    to_date: str | None = None,
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    # Default to last 30 days when range not provided
    if from_date and to_date:
        f, t_end = parse_dt_range(from_date, to_date)
    else:
        today = get_business_date(db, user.shop_id)
        f = datetime.combine(today - timedelta(days=29), datetime.min.time())
        t_end = datetime.combine(today + timedelta(days=1), datetime.min.time())

    branch_id = _force_branch(branch_id, user)
    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == user.shop_id).first()
    gst_enabled = bool(getattr(shop, "gst_enabled", False))

    has_supply_type = _has_column(db, "invoice", "supply_type")
    q = (
        db.query(
            Invoice.invoice_number,
            Invoice.created_time,
            Invoice.customer_name,
            Invoice.gst_number,
            Invoice.total_amount,
            Invoice.discounted_amt,
            (Invoice.supply_type if has_supply_type else literal(None)).label("supply_type"),
        )
        .filter(Invoice.shop_id == user.shop_id)
        .filter(Invoice.created_time >= f)
        .filter(Invoice.created_time < t_end)
    )
    if branch_id:
        q = q.filter(Invoice.branch_id == branch_id)

    rows = []
    for r in q.all():
        total_val = _dec(r.total_amount) - _dec(r.discounted_amt)
        required = gst_enabled and (r.supply_type or "B2C").upper() == "B2B" and total_val >= 50000
        status = "PENDING" if required else "NOT REQUIRED"
        rows.append(
            {
                "invoice_date": r.created_time.strftime("%d %b %Y"),
                "invoice_number": r.invoice_number,
                "customer": r.customer_name or "",
                "gstin": r.gst_number or "",
                "total_value": _as_float(total_val),
                "status": status,
            }
        )

    return rows


@router.get("/compliance/e-waybill-status")
def compliance_e_waybill_status(
    from_date: str | None = None,
    to_date: str | None = None,
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    if from_date and to_date:
        f, t_end = parse_dt_range(from_date, to_date)
    else:
        today = get_business_date(db, user.shop_id)
        f = datetime.combine(today - timedelta(days=29), datetime.min.time())
        t_end = datetime.combine(today + timedelta(days=1), datetime.min.time())

    branch_id = _force_branch(branch_id, user)
    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == user.shop_id).first()
    shop_state = getattr(shop, "state", None)

    has_pos = _has_column(db, "invoice", "place_of_supply")
    q = (
        db.query(
            Invoice.invoice_number,
            Invoice.created_time,
            Invoice.customer_name,
            Invoice.gst_number,
            Invoice.total_amount,
            Invoice.discounted_amt,
            (Invoice.place_of_supply if has_pos else literal(None)).label("place_of_supply"),
            Branch.state.label("branch_state"),
        )
        .outerjoin(Branch, Branch.branch_id == Invoice.branch_id)
        .filter(Invoice.shop_id == user.shop_id)
        .filter(Invoice.created_time >= f)
        .filter(Invoice.created_time < t_end)
    )
    if branch_id:
        q = q.filter(Invoice.branch_id == branch_id)

    rows = []
    for r in q.all():
        total_val = _dec(r.total_amount) - _dec(r.discounted_amt)
        supply_state = r.place_of_supply or r.branch_state or shop_state
        interstate = not _state_eq(supply_state, shop_state)
        required = interstate and total_val >= 50000
        status = "PENDING" if required else "NOT REQUIRED"
        rows.append(
            {
                "invoice_date": r.created_time.strftime("%d %b %Y"),
                "invoice_number": r.invoice_number,
                "customer": r.customer_name or "",
                "gstin": r.gst_number or "",
                "total_value": _as_float(total_val),
                "status": status,
            }
        )

    return rows


@router.get("/compliance/tds-vendor-payments")
def compliance_tds_vendor_payments(
    from_date: str | None = None,
    to_date: str | None = None,
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    if not from_date or not to_date:
        raise HTTPException(400, "from_date and to_date are required")

    f, t_end = parse_dt_range(from_date, to_date)
    branch_id = _force_branch(branch_id, user)

    q = (
        db.query(
            SupplierLedgerEntry.entry_time,
            SupplierLedgerEntry.debit,
            SupplierLedgerEntry.credit,
            SupplierLedgerEntry.reference_no,
            Supplier.supplier_name,
        )
        .join(Supplier, Supplier.supplier_id == SupplierLedgerEntry.supplier_id)
        .filter(SupplierLedgerEntry.shop_id == user.shop_id)
        .filter(SupplierLedgerEntry.entry_type == "PAYMENT")
        .filter(SupplierLedgerEntry.entry_time >= f)
        .filter(SupplierLedgerEntry.entry_time < t_end)
    )
    if branch_id:
        q = q.filter(SupplierLedgerEntry.branch_id == branch_id)

    rows = []
    for r in q.all():
        amt = _dec(r.debit or r.credit)
        tds_amt = _q(amt * Decimal("0.01"))
        rows.append(
            {
                "payment_date": r.entry_time.strftime("%d %b %Y"),
                "supplier": r.supplier_name or "",
                "reference": r.reference_no or "",
                "amount": _as_float(amt),
                "tds_amount": _as_float(tds_amt),
            }
        )

    return rows


@router.get("/compliance/tcs-sales")
def compliance_tcs_sales(
    from_date: str | None = None,
    to_date: str | None = None,
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    if not from_date or not to_date:
        raise HTTPException(400, "from_date and to_date are required")

    f, t_end = parse_dt_range(from_date, to_date)
    branch_id = _force_branch(branch_id, user)

    q = (
        db.query(
            Invoice.invoice_number,
            Invoice.created_time,
            Invoice.customer_name,
            Invoice.gst_number,
            Invoice.total_amount,
            Invoice.discounted_amt,
        )
        .filter(Invoice.shop_id == user.shop_id)
        .filter(Invoice.created_time >= f)
        .filter(Invoice.created_time < t_end)
    )
    if branch_id:
        q = q.filter(Invoice.branch_id == branch_id)

    rows = []
    for r in q.all():
        total_val = _dec(r.total_amount) - _dec(r.discounted_amt)
        if r.gst_number:
            continue
        if total_val < 50000:
            continue
        tcs_amt = _q(total_val * Decimal("0.001"))
        rows.append(
            {
                "invoice_date": r.created_time.strftime("%d %b %Y"),
                "invoice_number": r.invoice_number,
                "customer": r.customer_name or "",
                "total_value": _as_float(total_val),
                "tcs_amount": _as_float(tcs_amt),
            }
        )


# ── RESERVATIONS ──────────────────────────────────────────────────────────────
@router.get("/reservations/list")
def reservations_report(
    from_date: str,
    to_date: str,
    branch_id: int | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("reports", "read")),
):
    from datetime import date as date_type
    try:
        f_date = date_type.fromisoformat(from_date)
        t_date = date_type.fromisoformat(to_date)
    except ValueError:
        raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD")

    branch_id = _force_branch(branch_id, user)

    q = (
        db.query(
            TableReservation.reservation_id,
            TableReservation.reservation_date,
            TableReservation.reservation_time,
            TableReservation.customer_name,
            TableReservation.mobile,
            TableReservation.email,
            TableReservation.guests,
            TableReservation.status,
            TableReservation.notes,
            TableReservation.cancel_reason,
            TableReservation.created_at,
            TableReservation.confirmed_at,
            TableReservation.seated_at,
            TableReservation.cancelled_at,
            Branch.branch_name.label("branch"),
        )
        .outerjoin(Branch, Branch.branch_id == TableReservation.branch_id)
        .filter(TableReservation.shop_id == user.shop_id)
        .filter(TableReservation.reservation_date >= f_date)
        .filter(TableReservation.reservation_date <= t_date)
        .order_by(TableReservation.reservation_date, TableReservation.reservation_time)
    )

    if branch_id is not None:
        q = q.filter(TableReservation.branch_id == branch_id)

    if status:
        q = q.filter(TableReservation.status == status.upper())

    rows = q.all()
    return [
        {
            "reservation_id": r.reservation_id,
            "reservation_date": str(r.reservation_date),
            "reservation_time": r.reservation_time,
            "customer_name": r.customer_name or "",
            "mobile": r.mobile or "",
            "email": r.email or "",
            "guests": r.guests or 1,
            "status": r.status or "",
            "notes": r.notes or "",
            "cancel_reason": r.cancel_reason or "",
            "branch": r.branch or "",
            "created_at": r.created_at.strftime("%d %b %Y %H:%M") if r.created_at else "",
            "confirmed_at": r.confirmed_at.strftime("%d %b %Y %H:%M") if r.confirmed_at else "",
            "seated_at": r.seated_at.strftime("%d %b %Y %H:%M") if r.seated_at else "",
            "cancelled_at": r.cancelled_at.strftime("%d %b %Y %H:%M") if r.cancelled_at else "",
        }
        for r in rows
    ]
