from __future__ import annotations

from datetime import datetime, date

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.gift_card import GiftCard
from app.models.gift_card_txn import GiftCardTxn


def as_money(value) -> float:
    try:
        v = float(value or 0)
    except Exception:
        v = 0.0
    return round(v, 2)


def normalize_code(code: str) -> str:
    return str(code or "").strip().upper().replace(" ", "")


def is_expired(expires_on: date | None) -> bool:
    if not expires_on:
        return False
    return expires_on < datetime.utcnow().date()


def get_card_by_code(db: Session, *, shop_id: int, code: str) -> GiftCard | None:
    c = normalize_code(code)
    if not c:
        return None
    return (
        db.query(GiftCard)
        .filter(GiftCard.shop_id == shop_id, GiftCard.code == c)
        .first()
    )


def redeem_card(
    db: Session,
    *,
    shop_id: int,
    code: str,
    amount: float,
    ref_type: str | None,
    ref_no: str | None,
    user_id: int | None,
) -> GiftCard:
    c = normalize_code(code)
    if not c:
        raise HTTPException(400, "Gift card code required")
    amt = as_money(amount)
    if amt <= 0:
        raise HTTPException(400, "Redeem amount must be > 0")

    card = (
        db.query(GiftCard)
        .filter(GiftCard.shop_id == shop_id, GiftCard.code == c)
        .with_for_update()
        .first()
    )
    if not card:
        raise HTTPException(404, "Gift card not found")
    if str(card.status or "").upper() != "ACTIVE":
        raise HTTPException(400, f"Gift card is not active ({card.status})")
    if is_expired(card.expires_on):
        raise HTTPException(400, "Gift card expired")

    bal = as_money(card.balance_amount)
    if bal < amt:
        raise HTTPException(400, "Insufficient gift card balance")

    new_bal = as_money(bal - amt)
    card.balance_amount = new_bal
    if new_bal <= 0:
        card.status = "REDEEMED"
        card.redeemed_on = datetime.utcnow()

    db.add(GiftCardTxn(
        shop_id=shop_id,
        gift_card_id=card.gift_card_id,
        txn_type="REDEEM",
        amount=amt,
        ref_type=(str(ref_type or "MANUAL").strip().upper() or "MANUAL"),
        ref_no=(str(ref_no or "").strip() or None),
        balance_after=new_bal,
        created_by=user_id,
    ))
    db.add(card)
    return card

