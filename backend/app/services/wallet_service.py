from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.customer import Customer
from app.models.customer_wallet_txn import CustomerWalletTxn
from app.services.credit_service import normalize_mobile, as_decimal


def _q2(v: Decimal) -> Decimal:
    return v.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def as_money(value) -> Decimal:
    v = as_decimal(value)
    if v < 0:
        v = Decimal("0")
    return _q2(v)


def is_placeholder_mobile(mobile: str | None) -> bool:
    m = normalize_mobile(mobile)
    if not m:
        return True
    if m == "9999999999":
        return True
    if set(m) == {"9"}:
        return True
    return False


def get_customer_by_mobile(db: Session, *, shop_id: int, mobile: str | None) -> Customer | None:
    m = normalize_mobile(mobile)
    if not m:
        return None
    return (
        db.query(Customer)
        .filter(Customer.shop_id == shop_id, Customer.mobile == m)
        .first()
    )


def get_wallet_balance(db: Session, *, shop_id: int, customer_id: int) -> Decimal:
    credit = (
        db.query(func.coalesce(func.sum(CustomerWalletTxn.amount), 0))
        .filter(
            CustomerWalletTxn.shop_id == shop_id,
            CustomerWalletTxn.customer_id == customer_id,
            CustomerWalletTxn.txn_type == "CREDIT",
        )
        .scalar()
    )
    debit = (
        db.query(func.coalesce(func.sum(CustomerWalletTxn.amount), 0))
        .filter(
            CustomerWalletTxn.shop_id == shop_id,
            CustomerWalletTxn.customer_id == customer_id,
            CustomerWalletTxn.txn_type == "DEBIT",
        )
        .scalar()
    )
    bal = as_money(credit) - as_money(debit)
    if bal < 0:
        bal = Decimal("0.00")
    return _q2(bal)


def credit_wallet(
    db: Session,
    *,
    shop_id: int,
    customer: Customer,
    amount,
    ref_type: str | None,
    ref_no: str | None,
    note: str | None,
    created_by: int | None,
) -> CustomerWalletTxn:
    amt = as_money(amount)
    if amt <= 0:
        raise ValueError("Amount must be > 0")

    txn = CustomerWalletTxn(
        shop_id=shop_id,
        customer_id=customer.customer_id,
        mobile=str(customer.mobile),
        txn_type="CREDIT",
        amount=amt,
        ref_type=ref_type,
        ref_no=ref_no,
        note=(note or "").strip() or None,
        created_by=created_by,
    )
    db.add(txn)
    db.flush()
    return txn


def debit_wallet(
    db: Session,
    *,
    shop_id: int,
    customer: Customer,
    amount,
    ref_type: str | None,
    ref_no: str | None,
    note: str | None,
    created_by: int | None,
) -> CustomerWalletTxn:
    amt = as_money(amount)
    if amt <= 0:
        raise ValueError("Amount must be > 0")

    # Lock the customer row to prevent concurrent wallet overdrafts
    db.query(Customer).filter(
        Customer.shop_id == shop_id,
        Customer.customer_id == customer.customer_id,
    ).with_for_update().first()

    bal = get_wallet_balance(db, shop_id=shop_id, customer_id=customer.customer_id)
    if bal < amt:
        raise ValueError("Insufficient wallet balance")

    txn = CustomerWalletTxn(
        shop_id=shop_id,
        customer_id=customer.customer_id,
        mobile=str(customer.mobile),
        txn_type="DEBIT",
        amount=amt,
        ref_type=ref_type,
        ref_no=ref_no,
        note=(note or "").strip() or None,
        created_by=created_by,
    )
    db.add(txn)
    db.flush()
    return txn

