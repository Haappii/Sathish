from __future__ import annotations

from datetime import datetime, date
import secrets

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.gift_card import GiftCard
from app.models.gift_card_txn import GiftCardTxn
from app.schemas.gift_card import GiftCardCreate, GiftCardRedeem, GiftCardOut
from app.services.gift_card_service import (
    as_money,
    normalize_code,
    is_expired,
    get_card_by_code,
    redeem_card,
)
from app.utils.permissions import require_permission

router = APIRouter(prefix="/gift-cards", tags=["Gift Cards"])


def _now():
    return datetime.utcnow()


def _generate_code(db: Session, shop_id: int) -> str:
    for _ in range(20):
        suffix = secrets.token_hex(3).upper()
        code = f"GC-{suffix}"
        exists = (
            db.query(GiftCard.gift_card_id)
            .filter(GiftCard.shop_id == shop_id, GiftCard.code == code)
            .first()
            is not None
        )
        if not exists:
            return code
    raise HTTPException(500, "Unable to generate gift card code")


def _to_out(card: GiftCard) -> dict:
    return {
        "gift_card_id": int(card.gift_card_id),
        "code": card.code,
        "status": card.status,
        "initial_amount": float(card.initial_amount or 0),
        "balance_amount": float(card.balance_amount or 0),
        "issued_on": card.issued_on.strftime("%Y-%m-%d %H:%M") if card.issued_on else None,
        "expires_on": card.expires_on.strftime("%Y-%m-%d") if card.expires_on else None,
        "redeemed_on": card.redeemed_on.strftime("%Y-%m-%d %H:%M") if card.redeemed_on else None,
        "customer_name": card.customer_name,
        "mobile": card.mobile,
        "note": card.note,
    }


@router.post("/create", response_model=GiftCardOut)
def create_gift_card(
    payload: GiftCardCreate,
    db: Session = Depends(get_db),
    user=Depends(require_permission("gift_cards", "write")),
):
    amt = as_money(payload.amount)
    if amt <= 0:
        raise HTTPException(400, "Amount must be > 0")

    expires_on = payload.expires_on
    if expires_on and expires_on < datetime.utcnow().date():
        raise HTTPException(400, "Expiry date must be today or future")

    code = _generate_code(db, int(user.shop_id))
    card = GiftCard(
        shop_id=user.shop_id,
        code=code,
        status="ACTIVE",
        initial_amount=amt,
        balance_amount=amt,
        expires_on=expires_on,
        customer_name=(payload.customer_name or "").strip() or None,
        mobile=(payload.mobile or "").strip() or None,
        note=(payload.note or "").strip() or None,
        created_by=user.user_id,
    )
    db.add(card)
    db.commit()
    db.refresh(card)

    db.add(GiftCardTxn(
        shop_id=user.shop_id,
        gift_card_id=card.gift_card_id,
        txn_type="ISSUE",
        amount=amt,
        ref_type="ISSUE",
        ref_no=card.code,
        balance_after=amt,
        created_by=user.user_id,
    ))
    db.commit()
    db.refresh(card)
    return _to_out(card)


@router.get("/by-code/{code}", response_model=GiftCardOut)
def get_gift_card(
    code: str,
    db: Session = Depends(get_db),
    user=Depends(require_permission("gift_cards", "read")),
):
    card = get_card_by_code(db, shop_id=user.shop_id, code=code)
    if not card:
        raise HTTPException(404, "Gift card not found")
    return _to_out(card)


@router.get("/list", response_model=list[GiftCardOut])
def list_gift_cards(
    q: str | None = Query(None),
    status: str | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    user=Depends(require_permission("gift_cards", "read")),
):
    query = db.query(GiftCard).filter(GiftCard.shop_id == user.shop_id)

    if status:
        query = query.filter(GiftCard.status == str(status).strip().upper())

    if q:
        s = f"%{str(q).strip().upper()}%"
        query = query.filter((GiftCard.code.ilike(s)) | (GiftCard.mobile.ilike(s)))

    rows = query.order_by(GiftCard.gift_card_id.desc()).limit(limit).all()
    return [_to_out(r) for r in rows]


@router.post("/redeem", response_model=GiftCardOut)
def redeem_gift_card(
    payload: GiftCardRedeem,
    db: Session = Depends(get_db),
    user=Depends(require_permission("gift_cards", "write")),
):
    card = redeem_card(
        db,
        shop_id=user.shop_id,
        code=payload.code,
        amount=payload.amount,
        ref_type=payload.ref_type,
        ref_no=payload.ref_no,
        user_id=user.user_id,
    )
    db.commit()
    db.refresh(card)
    return _to_out(card)
