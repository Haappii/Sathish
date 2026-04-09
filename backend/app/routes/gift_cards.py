from __future__ import annotations

from datetime import datetime, date
import logging
import os
import secrets
import smtplib
import threading
from email.message import EmailMessage

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
from app.services.audit_service import log_action
from app.utils.permissions import require_permission

logger = logging.getLogger(__name__)

_SMTP_HOST = (os.getenv("SUPPORT_SMTP_HOST") or "smtp.gmail.com").strip()
_SMTP_PORT = int((os.getenv("SUPPORT_SMTP_PORT") or "465").strip())
_SENDER    = (os.getenv("SUPPORT_SENDER_EMAIL") or "").strip()
_PASSWORD  = (os.getenv("SUPPORT_SENDER_PASSWORD") or "").strip()


def _send_gift_card_email(
    to_email: str,
    customer_name: str | None,
    shop_name: str,
    code: str,
    amount: float,
    expires_on: str | None,
):
    if not (_SENDER and _PASSWORD):
        logger.warning("Gift card email skipped: SMTP credentials not configured")
        return

    name_line = f"Hi {customer_name}," if customer_name else "Hi,"
    expiry_line = f"Valid till: {expires_on}" if expires_on else "No expiry date"

    msg = EmailMessage()
    msg["Subject"] = f"Your Gift Card from {shop_name} — {code}"
    msg["From"]    = _SENDER
    msg["To"]      = to_email
    msg.set_content(
        f"{name_line}\n\n"
        f"Your gift card has been issued from {shop_name}.\n\n"
        f"  Gift Card Code : {code}\n"
        f"  Gift Value     : Rs. {amount:.2f}\n"
        f"  {expiry_line}\n\n"
        f"Present this code at checkout to redeem your gift card.\n\n"
        f"Thank you!\n{shop_name}"
    )
    msg.add_alternative(f"""
<html><body style="font-family:Arial,sans-serif;background:#f4f4f4;padding:30px;">
  <div style="max-width:480px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
    <div style="background:linear-gradient(135deg,#0f172a,#1a3353);padding:28px 32px;">
      <div style="font-size:11px;letter-spacing:3px;color:#fbbf24;text-transform:uppercase;margin-bottom:6px;">✦ Gift Card</div>
      <div style="font-size:22px;font-weight:800;color:#fff;">{shop_name}</div>
    </div>
    <div style="padding:28px 32px;">
      <p style="color:#374151;margin:0 0 20px;">{name_line}</p>
      <p style="color:#374151;margin:0 0 20px;">Your gift card has been issued. Use the code below at checkout.</p>
      <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;padding:20px;text-align:center;margin-bottom:20px;">
        <div style="font-size:11px;color:#9ca3af;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;">Gift Value</div>
        <div style="font-size:32px;font-weight:900;color:#b8860b;">Rs. {amount:.2f}</div>
      </div>
      <div style="background:#0f172a;border-radius:10px;padding:16px;text-align:center;margin-bottom:16px;">
        <div style="font-size:11px;color:rgba(255,255,255,0.4);letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;">Card Code</div>
        <div style="font-family:monospace;font-size:22px;font-weight:800;letter-spacing:5px;color:#fbbf24;">{code}</div>
      </div>
      <p style="color:#6b7280;font-size:12px;text-align:center;margin:0;">{expiry_line}</p>
    </div>
    <div style="background:#f8fafc;padding:16px 32px;text-align:center;border-top:1px solid #e5e7eb;">
      <p style="color:#9ca3af;font-size:11px;margin:0;">This is an automated message from {shop_name} via Haappii Billing</p>
    </div>
  </div>
</body></html>
""", subtype="html")

    def _send():
        try:
            with smtplib.SMTP_SSL(_SMTP_HOST, _SMTP_PORT) as smtp:
                smtp.login(_SENDER, _PASSWORD)
                smtp.send_message(msg)
            logger.info("Gift card email sent to %s", to_email)
        except Exception:
            logger.exception("Failed to send gift card email to %s", to_email)

    threading.Thread(target=_send, daemon=True).start()

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
        "customer_email": card.customer_email,
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
    customer_email = (payload.customer_email or "").strip() or None
    card = GiftCard(
        shop_id=user.shop_id,
        code=code,
        status="ACTIVE",
        initial_amount=amt,
        balance_amount=amt,
        expires_on=expires_on,
        customer_name=(payload.customer_name or "").strip() or None,
        mobile=(payload.mobile or "").strip() or None,
        customer_email=customer_email,
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

    log_action(
        db,
        shop_id=user.shop_id,
        module="GiftCards",
        action="CREATE",
        record_id=card.code,
        new={
            "gift_card_id": card.gift_card_id,
            "code": card.code,
            "amount": float(amt),
            "expires_on": card.expires_on.strftime("%Y-%m-%d") if card.expires_on else None,
            "mobile": card.mobile,
        },
        user_id=user.user_id,
    )

    # Send email to customer if email was provided
    if customer_email:
        from app.models.shop_details import ShopDetails
        shop = db.query(ShopDetails).filter(ShopDetails.shop_id == user.shop_id).first()
        shop_name = getattr(shop, "shop_name", "Store") or "Store"
        _send_gift_card_email(
            to_email=customer_email,
            customer_name=card.customer_name,
            shop_name=shop_name,
            code=card.code,
            amount=float(amt),
            expires_on=card.expires_on.strftime("%Y-%m-%d") if card.expires_on else None,
        )

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

    log_action(
        db,
        shop_id=user.shop_id,
        module="GiftCards",
        action="REDEEM",
        record_id=card.code,
        new={
            "gift_card_id": card.gift_card_id,
            "code": card.code,
            "amount": float(as_money(payload.amount)),
            "ref_type": payload.ref_type,
            "ref_no": payload.ref_no,
            "balance_after": float(as_money(card.balance_amount)),
        },
        user_id=user.user_id,
    )
    return _to_out(card)
