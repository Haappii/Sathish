from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.customer import Customer
from app.models.invoice_due import InvoiceDue
from app.models.invoice_payment import InvoicePayment
from app.models.sales_return import SalesReturn


def normalize_mobile(mobile: str | None) -> str | None:
    if not mobile:
        return None
    digits = "".join(ch for ch in str(mobile) if ch.isdigit())
    if len(digits) > 10:
        digits = digits[-10:]
    if len(digits) != 10:
        return None
    return digits


def as_decimal(value) -> Decimal:
    if value is None:
        return Decimal("0")
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except Exception:
        return Decimal("0")


def get_invoice_payable(invoice) -> Decimal:
    total = as_decimal(getattr(invoice, "total_amount", None))
    discount = as_decimal(getattr(invoice, "discounted_amt", None))
    return total - discount


def upsert_customer(
    db: Session,
    *,
    shop_id: int,
    customer_name: str | None,
    mobile: str | None,
    gst_number: str | None = None,
    email: str | None = None,
    created_by: int | None = None,
) -> Customer | None:
    mobile_n = normalize_mobile(mobile)
    name = (customer_name or "").strip()
    gst = (gst_number or "").strip() or None
    em = (email or "").strip() or None

    if not mobile_n:
        return None

    row = (
        db.query(Customer)
        .filter(
            Customer.shop_id == shop_id,
            Customer.mobile == mobile_n,
        )
        .first()
    )

    if not row:
        row = Customer(
            shop_id=shop_id,
            mobile=mobile_n,
            customer_name=name or mobile_n,
            gst_number=gst,
            email=em,
            status="ACTIVE",
            created_by=created_by,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return row

    changed = False
    if name and row.customer_name != name:
        row.customer_name = name
        changed = True
    if gst and (row.gst_number or "") != gst:
        row.gst_number = gst
        changed = True
    if em and (row.email or "") != em:
        row.email = em
        changed = True

    if changed:
        db.commit()
        db.refresh(row)

    return row


def ensure_invoice_due(
    db: Session,
    *,
    shop_id: int,
    invoice,
    customer: Customer | None,
    created_by: int | None,
) -> InvoiceDue | None:
    payment_mode = (getattr(invoice, "payment_mode", "") or "").strip().lower()
    payable = get_invoice_payable(invoice)

    due = (
        db.query(InvoiceDue)
        .filter(
            InvoiceDue.shop_id == shop_id,
            InvoiceDue.invoice_id == invoice.invoice_id,
        )
        .first()
    )

    if payment_mode != "credit":
        if due and due.status == "OPEN":
            due.status = "CANCELLED"
            due.closed_on = datetime.utcnow()
            db.commit()
        return None

    if not due:
        due = InvoiceDue(
            shop_id=shop_id,
            invoice_id=invoice.invoice_id,
            invoice_number=invoice.invoice_number,
            branch_id=invoice.branch_id,
            customer_id=(customer.customer_id if customer else None),
            original_amount=payable,
            status="OPEN",
            created_by=created_by,
        )
        db.add(due)
        db.commit()
        db.refresh(due)
        return due

    due.invoice_number = invoice.invoice_number
    due.branch_id = invoice.branch_id
    due.customer_id = customer.customer_id if customer else due.customer_id
    due.original_amount = payable
    if due.status != "OPEN":
        due.status = "OPEN"
        due.closed_on = None
    db.commit()
    db.refresh(due)
    return due


def get_paid_amount(db: Session, *, shop_id: int, invoice_id: int) -> Decimal:
    total = (
        db.query(func.coalesce(func.sum(InvoicePayment.amount), 0))
        .filter(
            InvoicePayment.shop_id == shop_id,
            InvoicePayment.invoice_id == invoice_id,
        )
        .scalar()
    )
    return as_decimal(total)


def get_returns_amount(db: Session, *, shop_id: int, invoice_id: int) -> Decimal:
    total = (
        db.query(func.coalesce(func.sum(SalesReturn.refund_amount), 0))
        .filter(
            SalesReturn.shop_id == shop_id,
            SalesReturn.invoice_id == invoice_id,
            SalesReturn.status != "CANCELLED",
        )
        .scalar()
    )
    return as_decimal(total)


def get_outstanding_amount(db: Session, due: InvoiceDue) -> Decimal:
    paid = get_paid_amount(db, shop_id=due.shop_id, invoice_id=due.invoice_id)
    returns = get_returns_amount(db, shop_id=due.shop_id, invoice_id=due.invoice_id)
    outstanding = as_decimal(due.original_amount) - paid - returns
    if outstanding < 0:
        outstanding = Decimal("0")
    return outstanding


def refresh_due_status(db: Session, due: InvoiceDue) -> InvoiceDue:
    if due.status != "OPEN":
        return due

    outstanding = get_outstanding_amount(db, due)
    if outstanding <= Decimal("0.01"):
        due.status = "CLOSED"
        due.closed_on = datetime.utcnow()
        db.commit()
        db.refresh(due)
    return due
