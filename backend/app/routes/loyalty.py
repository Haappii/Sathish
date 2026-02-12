from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.customer import Customer
from app.models.loyalty import LoyaltyAccount, LoyaltyTransaction
from app.schemas.loyalty import LoyaltyAccountOut, LoyaltyAdjust, LoyaltyRedeem, LoyaltyTxnOut
from app.services.audit_service import log_action
from app.utils.permissions import require_permission

router = APIRouter(prefix="/loyalty", tags=["Loyalty"])


def _get_customer_by_mobile(db: Session, *, shop_id: int, mobile: str) -> Customer | None:
    m = str(mobile or "").strip()
    return (
        db.query(Customer)
        .filter(Customer.shop_id == shop_id, Customer.mobile == m, Customer.status == "ACTIVE")
        .first()
    )


def _get_or_create_account(db: Session, *, shop_id: int, customer_id: int) -> LoyaltyAccount:
    acc = (
        db.query(LoyaltyAccount)
        .filter(LoyaltyAccount.shop_id == shop_id, LoyaltyAccount.customer_id == customer_id)
        .first()
    )
    if acc:
        return acc
    acc = LoyaltyAccount(shop_id=shop_id, customer_id=customer_id, points_balance=0)
    db.add(acc)
    db.commit()
    db.refresh(acc)
    return acc


@router.get("/account/by-mobile/{mobile}", response_model=LoyaltyAccountOut)
def get_account_by_mobile(
    mobile: str,
    db: Session = Depends(get_db),
    user=Depends(require_permission("loyalty", "read")),
):
    cust = _get_customer_by_mobile(db, shop_id=user.shop_id, mobile=mobile)
    if not cust:
        raise HTTPException(404, "Customer not found")
    acc = _get_or_create_account(db, shop_id=user.shop_id, customer_id=cust.customer_id)
    return {
        "customer_id": cust.customer_id,
        "customer_name": cust.customer_name,
        "mobile": cust.mobile,
        "points_balance": int(acc.points_balance or 0),
        "tier": acc.tier,
        "updated_at": acc.updated_at,
    }


@router.post("/adjust", response_model=LoyaltyAccountOut)
def adjust_points(
    payload: LoyaltyAdjust,
    db: Session = Depends(get_db),
    user=Depends(require_permission("loyalty", "write")),
):
    cust = _get_customer_by_mobile(db, shop_id=user.shop_id, mobile=payload.mobile)
    if not cust:
        raise HTTPException(404, "Customer not found")
    acc = _get_or_create_account(db, shop_id=user.shop_id, customer_id=cust.customer_id)

    delta = int(payload.points or 0)
    if delta == 0:
        raise HTTPException(400, "points must be non-zero")
    new_balance = int(acc.points_balance or 0) + delta
    if new_balance < 0:
        raise HTTPException(400, "Insufficient points")

    acc.points_balance = new_balance
    db.add(LoyaltyTransaction(
        shop_id=user.shop_id,
        account_id=acc.account_id,
        customer_id=cust.customer_id,
        txn_type="ADJUST",
        points=delta,
        notes=payload.notes,
        created_by=user.user_id,
    ))
    db.commit()
    db.refresh(acc)

    log_action(
        db,
        shop_id=user.shop_id,
        module="Loyalty",
        action="ADJUST",
        record_id=str(cust.customer_id),
        new={"delta": delta, "balance": int(acc.points_balance or 0)},
        user_id=user.user_id,
    )

    return {
        "customer_id": cust.customer_id,
        "customer_name": cust.customer_name,
        "mobile": cust.mobile,
        "points_balance": int(acc.points_balance or 0),
        "tier": acc.tier,
        "updated_at": acc.updated_at,
    }


@router.post("/redeem", response_model=LoyaltyAccountOut)
def redeem_points(
    payload: LoyaltyRedeem,
    db: Session = Depends(get_db),
    user=Depends(require_permission("loyalty", "write")),
):
    cust = _get_customer_by_mobile(db, shop_id=user.shop_id, mobile=payload.mobile)
    if not cust:
        raise HTTPException(404, "Customer not found")
    acc = _get_or_create_account(db, shop_id=user.shop_id, customer_id=cust.customer_id)

    pts = int(payload.points or 0)
    if pts <= 0:
        raise HTTPException(400, "points must be > 0")

    bal = int(acc.points_balance or 0)
    if bal < pts:
        raise HTTPException(400, "Insufficient points")

    acc.points_balance = bal - pts
    db.add(LoyaltyTransaction(
        shop_id=user.shop_id,
        account_id=acc.account_id,
        customer_id=cust.customer_id,
        txn_type="REDEEM",
        points=-pts,
        invoice_id=payload.invoice_id,
        notes=payload.notes,
        created_by=user.user_id,
    ))
    db.commit()
    db.refresh(acc)

    log_action(
        db,
        shop_id=user.shop_id,
        module="Loyalty",
        action="REDEEM",
        record_id=str(cust.customer_id),
        new={"points": pts, "balance": int(acc.points_balance or 0)},
        user_id=user.user_id,
    )

    return {
        "customer_id": cust.customer_id,
        "customer_name": cust.customer_name,
        "mobile": cust.mobile,
        "points_balance": int(acc.points_balance or 0),
        "tier": acc.tier,
        "updated_at": acc.updated_at,
    }


@router.get("/transactions/{customer_id}", response_model=list[LoyaltyTxnOut])
def list_transactions(
    customer_id: int,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    user=Depends(require_permission("loyalty", "read")),
):
    acc = (
        db.query(LoyaltyAccount)
        .filter(LoyaltyAccount.shop_id == user.shop_id, LoyaltyAccount.customer_id == customer_id)
        .first()
    )
    if not acc:
        return []

    return (
        db.query(LoyaltyTransaction)
        .filter(LoyaltyTransaction.shop_id == user.shop_id, LoyaltyTransaction.account_id == acc.account_id)
        .order_by(LoyaltyTransaction.txn_id.desc())
        .limit(limit)
        .all()
    )

