from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.customer import Customer
from app.models.invoice_due import InvoiceDue
from app.models.invoice import Invoice
from app.models.invoice_payment import InvoicePayment
from app.schemas.dues import DuePaymentCreate, DueSummary
from app.utils.auth_user import get_current_user
from app.services.audit_service import log_action
from app.services.credit_service import (
    as_decimal,
    get_paid_amount,
    get_returns_amount,
    get_outstanding_amount,
    refresh_due_status,
)

router = APIRouter(prefix="/dues", tags=["Customer Dues"])


def _require_collection_role(user):
    role = str(getattr(user, "role_name", "") or "").lower()
    if role not in {"admin", "manager", "cashier"}:
        raise HTTPException(403, "Not allowed")


def _resolve_branch(branch_id: int | None, user):
    role = str(getattr(user, "role_name", "") or "").lower()
    if role == "admin":
        return int(branch_id) if branch_id is not None else None
    return int(user.branch_id)


def _build_due_summary(db: Session, due: InvoiceDue) -> DueSummary:
    customer_name = None
    mobile = None
    if due.customer_id:
        c = (
            db.query(Customer)
            .filter(Customer.customer_id == due.customer_id, Customer.shop_id == due.shop_id)
            .first()
        )
        if c:
            customer_name = c.customer_name
            mobile = c.mobile

    paid = get_paid_amount(db, shop_id=due.shop_id, invoice_id=due.invoice_id)
    returns = get_returns_amount(db, shop_id=due.shop_id, invoice_id=due.invoice_id)
    outstanding = get_outstanding_amount(db, due)

    return DueSummary(
        due_id=due.due_id,
        invoice_id=due.invoice_id,
        invoice_number=due.invoice_number,
        branch_id=due.branch_id,
        customer_id=due.customer_id,
        customer_name=customer_name,
        mobile=mobile,
        original_amount=float(as_decimal(due.original_amount)),
        paid_amount=float(paid),
        returns_amount=float(returns),
        outstanding_amount=float(outstanding),
        status=due.status,
    )


@router.get("/open", response_model=list[DueSummary])
def list_open_dues(
    branch_id: int | None = Query(None),
    q: str | None = Query(None),
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    _require_collection_role(user)
    bid = _resolve_branch(branch_id, user)

    query = db.query(InvoiceDue).filter(
        InvoiceDue.shop_id == user.shop_id,
        InvoiceDue.status == "OPEN",
    )
    if bid is not None:
        query = query.filter(InvoiceDue.branch_id == bid)

    if q:
        s = q.strip()
        # match by invoice number, or customer mobile
        inv_match = query.filter(InvoiceDue.invoice_number.ilike(f"%{s}%"))
        # mobile match via join (best effort)
        cust_ids = (
            db.query(Customer.customer_id)
            .filter(
                Customer.shop_id == user.shop_id,
                Customer.mobile.ilike(f"%{s}%"),
            )
            .subquery()
        )
        cust_match = query.filter(InvoiceDue.customer_id.in_(cust_ids))
        query = inv_match.union_all(cust_match)

    dues = query.order_by(InvoiceDue.created_on.desc()).limit(limit).all()
    out = []
    for d in dues:
        refresh_due_status(db, d)
        if d.status != "OPEN":
            continue
        out.append(_build_due_summary(db, d))
    return out


@router.get("/by-invoice/{invoice_number}", response_model=DueSummary)
def get_due_by_invoice(
    invoice_number: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    _require_collection_role(user)

    due = (
        db.query(InvoiceDue)
        .filter(
            InvoiceDue.shop_id == user.shop_id,
            InvoiceDue.invoice_number == invoice_number,
        )
        .first()
    )
    if not due:
        raise HTTPException(404, "Due not found")

    refresh_due_status(db, due)
    return _build_due_summary(db, due)


@router.post("/pay", response_model=DueSummary)
def pay_due(
    payload: DuePaymentCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    _require_collection_role(user)

    amt = Decimal(str(payload.amount or 0))
    if amt <= 0:
        raise HTTPException(400, "Amount must be > 0")

    due = (
        db.query(InvoiceDue)
        .filter(
            InvoiceDue.shop_id == user.shop_id,
            InvoiceDue.invoice_number == payload.invoice_number,
            InvoiceDue.status == "OPEN",
        )
        .first()
    )
    if not due:
        raise HTTPException(404, "Open due not found for this invoice")

    invoice = (
        db.query(Invoice)
        .filter(Invoice.shop_id == user.shop_id, Invoice.invoice_id == due.invoice_id)
        .first()
    )
    if not invoice:
        raise HTTPException(404, "Invoice not found")

    payment = InvoicePayment(
        shop_id=user.shop_id,
        invoice_id=invoice.invoice_id,
        invoice_number=invoice.invoice_number,
        customer_id=due.customer_id,
        branch_id=due.branch_id,
        amount=amt,
        payment_mode=(payload.payment_mode or "cash"),
        reference_no=payload.reference_no,
        notes=payload.notes,
        created_by=user.user_id,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)

    log_action(
        db,
        shop_id=user.shop_id,
        module="Dues",
        action="PAYMENT",
        record_id=due.invoice_number,
        new={
            "payment_id": payment.payment_id,
            "amount": float(amt),
            "payment_mode": payment.payment_mode,
            "reference_no": payment.reference_no,
        },
        user_id=user.user_id,
    )

    refresh_due_status(db, due)
    return _build_due_summary(db, due)
