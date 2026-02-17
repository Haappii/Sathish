from __future__ import annotations

from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db import get_db
from app.models.invoice import Invoice
from app.models.invoice_details import InvoiceDetail
from app.models.sales_return import SalesReturn, SalesReturnItem
from app.models.sales_return_meta import SalesReturnMeta, SalesReturnItemMeta
from app.models.shop_details import ShopDetails
from app.models.customer import Customer
from app.schemas.returns import SalesReturnCreate, SalesReturnOut
from app.models.system_parameters import SystemParameter
from app.services.audit_service import log_action
from app.services.credit_service import as_decimal, normalize_mobile, upsert_customer
from app.services.day_close_service import is_branch_day_closed
from app.services.inventory_service import is_inventory_enabled, adjust_stock, get_stock
from app.services.item_lot_service import add_lot, remove_return_lots
from app.services.wallet_service import (
    is_placeholder_mobile,
    get_customer_by_mobile,
    credit_wallet,
    debit_wallet,
    get_wallet_balance,
    as_money,
)
from app.utils.auth_user import get_current_user
from app.utils.permissions import require_permission

router = APIRouter(prefix="/returns", tags=["Sales Returns"])


def _require_admin(user):
    role = str(getattr(user, "role_name", "") or "").lower()
    if role != "admin":
        raise HTTPException(403, "Admin access required")


def _get_business_date(db: Session, shop_id: int):
    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == shop_id).first()
    return shop.app_date if shop and shop.app_date else datetime.utcnow().date()

def _get_business_datetime(db: Session, shop_id: int) -> datetime:
    business_date = _get_business_date(db, shop_id)
    return datetime.combine(business_date, datetime.now().time())


def _new_return_number() -> str:
    return f"RET-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6].upper()}"


def _q2(v: Decimal) -> Decimal:
    return v.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _normalize_return_type(raw: str | None) -> str:
    t = str(raw or "").strip().upper()
    if t in {"EXCHANGE", "SWAP"}:
        return "EXCHANGE"
    return "REFUND"


def _normalize_refund_mode(raw: str | None) -> str:
    m = str(raw or "").strip().upper().replace(" ", "_")
    if m in {"CASH", "CARD", "UPI"}:
        return m
    if m in {"STORE_CREDIT", "STORECREDIT", "CREDIT", "WALLET"}:
        return "STORE_CREDIT"
    return "CASH"


def _normalize_condition(raw: str | None) -> str:
    c = str(raw or "").strip().upper()
    if c in {"DAMAGED", "DAMAGE", "BROKEN", "EXPIRED"}:
        return "DAMAGED"
    return "GOOD"


def _get_meta_maps(
    db: Session,
    *,
    shop_id: int,
    return_ids: list[int],
):
    if not return_ids:
        return {}, {}

    meta_rows = (
        db.query(SalesReturnMeta)
        .filter(SalesReturnMeta.shop_id == shop_id, SalesReturnMeta.return_id.in_(return_ids))
        .all()
    )
    meta_map = {int(r.return_id): r for r in meta_rows}

    item_ids: list[int] = []
    for sr in (
        db.query(SalesReturnItem.id)
        .filter(SalesReturnItem.shop_id == shop_id, SalesReturnItem.return_id.in_(return_ids))
        .all()
    ):
        item_ids.append(int(sr.id))

    item_meta_rows = []
    if item_ids:
        item_meta_rows = (
            db.query(SalesReturnItemMeta)
            .filter(SalesReturnItemMeta.shop_id == shop_id, SalesReturnItemMeta.return_item_id.in_(item_ids))
            .all()
        )
    item_meta_map = {int(r.return_item_id): r for r in item_meta_rows}

    return meta_map, item_meta_map


def _to_out(row: SalesReturn, meta: SalesReturnMeta | None, item_meta_map: dict[int, SalesReturnItemMeta]) -> dict:
    return {
        "return_id": int(row.return_id),
        "return_number": row.return_number,
        "invoice_number": row.invoice_number,
        "branch_id": int(row.branch_id),
        "subtotal_amount": float(as_decimal(row.subtotal_amount)),
        "tax_amount": float(as_decimal(row.tax_amount)),
        "discount_amount": float(as_decimal(row.discount_amount)),
        "refund_amount": float(as_decimal(row.refund_amount)),
        "return_type": (meta.return_type if meta else "REFUND"),
        "refund_mode": (meta.refund_mode if meta else "CASH"),
        "reason_code": (meta.reason_code if meta else None),
        "reason": row.reason,
        "note": (meta.note if meta else None),
        "status": row.status,
        "items": [
            {
                "item_id": int(i.item_id),
                "quantity": int(i.quantity or 0),
                "unit_price": float(as_decimal(i.unit_price)),
                "line_subtotal": float(as_decimal(i.line_subtotal)),
                "condition": (item_meta_map.get(int(i.id)).condition if item_meta_map.get(int(i.id)) else None),
                "restock": (bool(item_meta_map.get(int(i.id)).restock) if item_meta_map.get(int(i.id)) else None),
            }
            for i in (row.items or [])
        ],
    }


@router.get("/list", response_model=list[SalesReturnOut])
def list_returns(
    from_date: str,
    to_date: str,
    branch_id: int | None = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_permission("returns", "read")),
):
    try:
        f = datetime.strptime(from_date, "%Y-%m-%d").date()
        t = datetime.strptime(to_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "Invalid date format YYYY-MM-DD")

    query = db.query(SalesReturn).filter(
        SalesReturn.shop_id == user.shop_id,
        func.date(SalesReturn.created_on).between(f, t),
        SalesReturn.status != "CANCELLED",
    )

    role = str(getattr(user, "role_name", "") or "").lower()
    if role != "admin":
        query = query.filter(SalesReturn.branch_id == user.branch_id)
    elif branch_id is not None:
        query = query.filter(SalesReturn.branch_id == int(branch_id))

    rows = query.order_by(SalesReturn.return_id.desc()).all()
    meta_map, item_meta_map = _get_meta_maps(
        db, shop_id=user.shop_id, return_ids=[int(r.return_id) for r in rows]
    )
    return [_to_out(r, meta_map.get(int(r.return_id)), item_meta_map) for r in rows]


@router.get("/{return_number}", response_model=SalesReturnOut)
def get_return(
    return_number: str,
    db: Session = Depends(get_db),
    user=Depends(require_permission("returns", "read")),
):
    row = db.query(SalesReturn).filter(
        SalesReturn.shop_id == user.shop_id,
        SalesReturn.return_number == return_number,
    ).first()
    if not row or row.status == "CANCELLED":
        raise HTTPException(404, "Return not found")

    if str(getattr(user, "role_name", "") or "").lower() != "admin":
        if row.branch_id != user.branch_id:
            raise HTTPException(403, "Not allowed")

    meta_map, item_meta_map = _get_meta_maps(
        db, shop_id=user.shop_id, return_ids=[int(row.return_id)]
    )
    return _to_out(row, meta_map.get(int(row.return_id)), item_meta_map)


@router.post("/", response_model=SalesReturnOut)
def create_return(
    payload: SalesReturnCreate,
    db: Session = Depends(get_db),
    user=Depends(require_permission("returns", "write")),
):
    invoice = (
        db.query(Invoice)
        .filter(
            Invoice.shop_id == user.shop_id,
            Invoice.invoice_number == payload.invoice_number,
        )
        .first()
    )
    if not invoice:
        raise HTTPException(404, "Invoice not found")

    business_date = _get_business_date(db, user.shop_id)
    if invoice.branch_id and is_branch_day_closed(db, user.shop_id, invoice.branch_id, business_date):
        raise HTTPException(403, "Day closed for this branch")
    business_dt = _get_business_datetime(db, user.shop_id)

    details = (
        db.query(InvoiceDetail)
        .filter(
            InvoiceDetail.shop_id == user.shop_id,
            InvoiceDetail.invoice_id == invoice.invoice_id,
        )
        .all()
    )
    if not details:
        raise HTTPException(400, "Invoice has no items")

    sold_map: dict[int, dict[str, Decimal]] = {}
    cost_map: dict[int, Decimal] = {}
    for d in details:
        item_id = int(d.item_id)
        sold_map.setdefault(item_id, {"qty": Decimal("0"), "amount": Decimal("0")})
        sold_map[item_id]["qty"] += Decimal(int(d.quantity or 0))
        sold_map[item_id]["amount"] += as_decimal(d.amount)
        if item_id not in cost_map:
            cost_map[item_id] = as_decimal(getattr(d, "buy_price", 0))

    invoice_subtotal = sum(v["amount"] for v in sold_map.values())
    if invoice_subtotal <= 0:
        raise HTTPException(400, "Invalid invoice subtotal")

    returned_rows = (
        db.query(
            SalesReturnItem.item_id,
            func.coalesce(func.sum(SalesReturnItem.quantity), 0).label("qty"),
        )
        .join(SalesReturn, SalesReturn.return_id == SalesReturnItem.return_id)
        .filter(
            SalesReturn.shop_id == user.shop_id,
            SalesReturn.invoice_id == invoice.invoice_id,
            SalesReturn.status != "CANCELLED",
        )
        .group_by(SalesReturnItem.item_id)
        .all()
    )
    already_returned_qty = {int(r.item_id): int(r.qty or 0) for r in returned_rows}

    if not payload.items:
        raise HTTPException(400, "Return items required")

    return_type = _normalize_return_type(getattr(payload, "return_type", None))
    refund_mode = _normalize_refund_mode(getattr(payload, "refund_mode", None))

    cost_method_row = (
        db.query(SystemParameter)
        .filter(
            SystemParameter.shop_id == user.shop_id,
            SystemParameter.param_key == "inventory_cost_method",
        )
        .first()
    )
    cost_method = str(getattr(cost_method_row, "param_value", "") or "LAST").strip().upper()
    if cost_method not in {"LAST", "WAVG", "FIFO"}:
        cost_method = "LAST"

    return_items: list[SalesReturnItem] = []
    return_item_meta: list[tuple[SalesReturnItem, SalesReturnItemMeta]] = []
    return_subtotal = Decimal("0")
    for it in payload.items:
        if int(it.quantity or 0) <= 0:
            raise HTTPException(400, "Return quantity must be > 0")

        sold = sold_map.get(int(it.item_id))
        if not sold:
            raise HTTPException(400, f"Item not found in invoice: {it.item_id}")

        sold_qty = int(sold["qty"])
        sold_amt = sold["amount"]
        if sold_qty <= 0:
            raise HTTPException(400, f"Invalid sold quantity for item {it.item_id}")

        prev_ret = int(already_returned_qty.get(int(it.item_id), 0))
        available = sold_qty - prev_ret
        if int(it.quantity) > available:
            raise HTTPException(
                400,
                f"Return qty exceeds available for item {it.item_id} (available {available})",
            )

        unit_price = (sold_amt / Decimal(sold_qty)) if sold_qty else Decimal("0")
        line_subtotal = unit_price * Decimal(int(it.quantity))
        return_subtotal += line_subtotal

        sr_item = SalesReturnItem(
            shop_id=user.shop_id,
            item_id=int(it.item_id),
            quantity=int(it.quantity),
            unit_price=_q2(unit_price),
            line_subtotal=_q2(line_subtotal),
        )
        return_items.append(sr_item)

        cond = _normalize_condition(getattr(it, "condition", None))
        restock = getattr(it, "restock", None)
        if restock is None:
            restock = cond != "DAMAGED"
        restock = bool(restock) and cond != "DAMAGED"

        return_item_meta.append((
            sr_item,
            SalesReturnItemMeta(
                shop_id=user.shop_id,
                condition=cond,
                restock=restock,
                created_by=user.user_id,
            ),
        ))

    ratio = return_subtotal / invoice_subtotal

    invoice_total = as_decimal(invoice.total_amount)
    invoice_discount = as_decimal(invoice.discounted_amt)
    invoice_tax = as_decimal(invoice.tax_amt)
    invoice_payable = invoice_total - invoice_discount

    discount_refund = _q2(invoice_discount * ratio)
    tax_refund = _q2(invoice_tax * ratio)
    refund_amount = _q2(invoice_payable * ratio)

    customer = upsert_customer(
        db,
        shop_id=user.shop_id,
        customer_name=invoice.customer_name,
        mobile=invoice.mobile,
        gst_number=invoice.gst_number,
        created_by=user.user_id,
    )

    return_number = _new_return_number()

    wallet_txn = None
    if refund_mode == "STORE_CREDIT":
        if is_placeholder_mobile(invoice.mobile):
            raise HTTPException(400, "Valid customer mobile required for store credit")
        cust = get_customer_by_mobile(db, shop_id=user.shop_id, mobile=invoice.mobile)
        if not cust:
            raise HTTPException(400, "Customer not found for store credit")
        if refund_amount <= Decimal("0.00"):
            raise HTTPException(400, "Refund amount must be > 0 for store credit")
        wallet_txn = credit_wallet(
            db,
            shop_id=user.shop_id,
            customer=cust,
            amount=refund_amount,
            ref_type="RETURN",
            ref_no=return_number,
            note="Sales return store credit",
            created_by=user.user_id,
        )

    row = SalesReturn(
        shop_id=user.shop_id,
        branch_id=int(invoice.branch_id or user.branch_id),
        return_number=return_number,
        invoice_id=invoice.invoice_id,
        invoice_number=invoice.invoice_number,
        customer_id=(customer.customer_id if customer else None),
        customer_mobile=normalize_mobile(invoice.mobile),
        subtotal_amount=_q2(return_subtotal),
        tax_amount=tax_refund,
        discount_amount=discount_refund,
        refund_amount=refund_amount,
        reason=payload.reason,
        status="COMPLETED",
        created_by=user.user_id,
        created_on=business_dt,
    )
    db.add(row)
    db.flush()

    for item in return_items:
        item.return_id = row.return_id
        db.add(item)
    db.flush()

    # Persist return metadata
    meta = SalesReturnMeta(
        shop_id=user.shop_id,
        return_id=row.return_id,
        return_type=return_type,
        refund_mode=refund_mode,
        wallet_txn_id=(wallet_txn.wallet_txn_id if wallet_txn else None),
        wallet_applied=bool(wallet_txn is not None),
        reason_code=(payload.reason_code if hasattr(payload, "reason_code") else None),
        note=(payload.note if hasattr(payload, "note") else None),
        created_by=user.user_id,
    )
    db.add(meta)

    # Persist per-line return metadata
    for sr_item, m in return_item_meta:
        m.return_item_id = int(sr_item.id)
        db.add(m)

    db.commit()
    db.refresh(row)

    if is_inventory_enabled(db, user.shop_id):
        item_meta_map = {
            int(m.return_item_id): m
            for m in db.query(SalesReturnItemMeta)
            .filter(SalesReturnItemMeta.shop_id == user.shop_id, SalesReturnItemMeta.return_item_id.in_([int(i.id) for i in row.items]))
            .all()
        }
        for item in row.items:
            m = item_meta_map.get(int(item.id))
            if m and not bool(m.restock):
                continue
            adjust_stock(
                db,
                user.shop_id,
                item.item_id,
                row.branch_id,
                item.quantity,
                "ADD",
                ref_no=row.return_number,
            )
            # Create return lots only when FIFO is enabled (best effort).
            if cost_method == "FIFO":
                try:
                    add_lot(
                        db,
                        shop_id=user.shop_id,
                        branch_id=row.branch_id,
                        item_id=int(item.item_id),
                        quantity=int(item.quantity or 0),
                        unit_cost=cost_map.get(int(item.item_id), Decimal("0.00")),
                        source_type="RETURN",
                        source_ref=row.return_number,
                        created_by=user.user_id,
                    )
                except Exception:
                    pass

    log_action(
        db,
        shop_id=user.shop_id,
        module="Returns",
        action="CREATE",
        record_id=row.return_number,
        new={
            "invoice_number": row.invoice_number,
            "branch_id": row.branch_id,
            "refund_amount": float(refund_amount),
            "items_count": len(row.items),
        },
        user_id=user.user_id,
    )

    meta_map, item_meta_map = _get_meta_maps(
        db, shop_id=user.shop_id, return_ids=[int(row.return_id)]
    )
    return _to_out(row, meta_map.get(int(row.return_id)), item_meta_map)


@router.post("/{return_number}/cancel", response_model=SalesReturnOut)
def cancel_return(
    return_number: str,
    db: Session = Depends(get_db),
    user=Depends(require_permission("returns", "delete")),
):
    _require_admin(user)

    row = db.query(SalesReturn).filter(
        SalesReturn.shop_id == user.shop_id,
        SalesReturn.return_number == return_number,
    ).first()
    if not row or row.status == "CANCELLED":
        raise HTTPException(404, "Return not found")

    meta = (
        db.query(SalesReturnMeta)
        .filter(SalesReturnMeta.shop_id == user.shop_id, SalesReturnMeta.return_id == row.return_id)
        .first()
    )
    item_meta_rows = (
        db.query(SalesReturnItemMeta)
        .filter(
            SalesReturnItemMeta.shop_id == user.shop_id,
            SalesReturnItemMeta.return_item_id.in_([int(i.id) for i in row.items]),
        )
        .all()
    )
    item_meta_map = {int(m.return_item_id): m for m in item_meta_rows}

    # Reverse wallet/store credit if used
    if meta and str(meta.refund_mode or "").upper() == "STORE_CREDIT":
        if row.customer_id is None:
            raise HTTPException(400, "Customer missing for store credit reversal")
        bal = get_wallet_balance(db, shop_id=user.shop_id, customer_id=int(row.customer_id))
        if bal < as_money(row.refund_amount):
            raise HTTPException(400, "Customer wallet balance insufficient to cancel this return")
        cust = db.query(Customer).filter(Customer.shop_id == user.shop_id, Customer.customer_id == row.customer_id).first()
        if not cust:
            raise HTTPException(400, "Customer not found for store credit reversal")
        debit_wallet(
            db,
            shop_id=user.shop_id,
            customer=cust,
            amount=as_money(row.refund_amount),
            ref_type="RETURN_CANCEL",
            ref_no=row.return_number,
            note="Reverse store credit (return cancelled)",
            created_by=user.user_id,
        )

    if is_inventory_enabled(db, user.shop_id):
        # Pre-check stock exists to reverse return
        for it in row.items:
            m = item_meta_map.get(int(it.id))
            if m and not bool(m.restock):
                continue
            if get_stock(db, user.shop_id, it.item_id, row.branch_id) < int(it.quantity):
                raise HTTPException(400, "Insufficient stock to cancel this return")

        for it in row.items:
            m = item_meta_map.get(int(it.id))
            if m and not bool(m.restock):
                continue
            adjust_stock(
                db,
                user.shop_id,
                it.item_id,
                row.branch_id,
                int(it.quantity),
                "REMOVE",
                ref_no=f"CAN-{row.return_number}",
            )
            if cost_method == "FIFO":
                try:
                    remove_return_lots(
                        db,
                        shop_id=user.shop_id,
                        branch_id=row.branch_id,
                        item_id=int(it.item_id),
                        quantity=int(it.quantity),
                        return_number=row.return_number,
                    )
                except ValueError as e:
                    raise HTTPException(400, str(e))

    row.status = "CANCELLED"
    db.commit()
    db.refresh(row)

    log_action(
        db,
        shop_id=user.shop_id,
        module="Returns",
        action="CANCEL",
        record_id=row.return_number,
        old={"status": "COMPLETED"},
        new={"status": row.status},
        user_id=user.user_id,
    )

    meta_map, item_meta_map = _get_meta_maps(
        db, shop_id=user.shop_id, return_ids=[int(row.return_id)]
    )
    return _to_out(row, meta_map.get(int(row.return_id)), item_meta_map)
