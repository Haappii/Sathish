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
from app.models.shop_details import ShopDetails
from app.schemas.returns import SalesReturnCreate, SalesReturnOut
from app.services.audit_service import log_action
from app.services.credit_service import as_decimal, normalize_mobile, upsert_customer
from app.services.day_close_service import is_branch_day_closed
from app.services.inventory_service import is_inventory_enabled, adjust_stock, get_stock
from app.utils.auth_user import get_current_user

router = APIRouter(prefix="/returns", tags=["Sales Returns"])


def _require_return_role(user):
    role = str(getattr(user, "role_name", "") or "").lower()
    if role not in {"admin", "manager"}:
        raise HTTPException(403, "Manager/Admin access required")


def _require_admin(user):
    role = str(getattr(user, "role_name", "") or "").lower()
    if role != "admin":
        raise HTTPException(403, "Admin access required")


def _get_business_date(db: Session, shop_id: int):
    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == shop_id).first()
    return shop.app_date if shop and shop.app_date else datetime.utcnow().date()


def _new_return_number() -> str:
    return f"RET-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6].upper()}"


def _q2(v: Decimal) -> Decimal:
    return v.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


@router.get("/list", response_model=list[SalesReturnOut])
def list_returns(
    from_date: str,
    to_date: str,
    branch_id: int | None = Query(None),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    _require_return_role(user)

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

    return query.order_by(SalesReturn.return_id.desc()).all()


@router.get("/{return_number}", response_model=SalesReturnOut)
def get_return(
    return_number: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    _require_return_role(user)

    row = db.query(SalesReturn).filter(
        SalesReturn.shop_id == user.shop_id,
        SalesReturn.return_number == return_number,
    ).first()
    if not row or row.status == "CANCELLED":
        raise HTTPException(404, "Return not found")

    if str(getattr(user, "role_name", "") or "").lower() != "admin":
        if row.branch_id != user.branch_id:
            raise HTTPException(403, "Not allowed")

    return row


@router.post("/", response_model=SalesReturnOut)
def create_return(
    payload: SalesReturnCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    _require_return_role(user)

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
    for d in details:
        item_id = int(d.item_id)
        sold_map.setdefault(item_id, {"qty": Decimal("0"), "amount": Decimal("0")})
        sold_map[item_id]["qty"] += Decimal(int(d.quantity or 0))
        sold_map[item_id]["amount"] += as_decimal(d.amount)

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

    return_items: list[SalesReturnItem] = []
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

        return_items.append(
            SalesReturnItem(
                shop_id=user.shop_id,
                item_id=int(it.item_id),
                quantity=int(it.quantity),
                unit_price=_q2(unit_price),
                line_subtotal=_q2(line_subtotal),
            )
        )

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

    row = SalesReturn(
        shop_id=user.shop_id,
        branch_id=int(invoice.branch_id or user.branch_id),
        return_number=_new_return_number(),
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
    )
    db.add(row)
    db.flush()

    for item in return_items:
        item.return_id = row.return_id
        db.add(item)

    db.commit()
    db.refresh(row)

    if is_inventory_enabled(db, user.shop_id):
        for item in row.items:
            adjust_stock(
                db,
                user.shop_id,
                item.item_id,
                row.branch_id,
                item.quantity,
                "ADD",
                ref_no=row.return_number,
            )

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

    return row


@router.post("/{return_number}/cancel", response_model=SalesReturnOut)
def cancel_return(
    return_number: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    _require_admin(user)

    row = db.query(SalesReturn).filter(
        SalesReturn.shop_id == user.shop_id,
        SalesReturn.return_number == return_number,
    ).first()
    if not row or row.status == "CANCELLED":
        raise HTTPException(404, "Return not found")

    if is_inventory_enabled(db, user.shop_id):
        # Pre-check stock exists to reverse return
        for it in row.items:
            if get_stock(db, user.shop_id, it.item_id, row.branch_id) < int(it.quantity):
                raise HTTPException(400, "Insufficient stock to cancel this return")

        for it in row.items:
            adjust_stock(
                db,
                user.shop_id,
                it.item_id,
                row.branch_id,
                int(it.quantity),
                "REMOVE",
                ref_no=f"CAN-{row.return_number}",
            )

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

    return row
