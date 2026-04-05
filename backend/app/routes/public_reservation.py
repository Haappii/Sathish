from __future__ import annotations

import logging
import os
import smtplib
import uuid
from datetime import date, datetime
from email.message import EmailMessage

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.reservation import TableReservation
from app.models.shop_details import ShopDetails
from app.models.branch import Branch
from app.models.table_billing import TableMaster

router = APIRouter(prefix="/public/reservations", tags=["Public Reservations"])

logger = logging.getLogger("uvicorn.error")

# ── Email helpers (reuse support SMTP config) ──────────────────────────────────

_SMTP_ENABLED = (os.getenv("SUPPORT_EMAIL_ENABLED") or "").strip().lower() in {"1", "true", "yes", "y"}
_SENDER_EMAIL = (os.getenv("SUPPORT_SENDER_EMAIL") or "").strip()
_SENDER_PASSWORD = (os.getenv("SUPPORT_SENDER_PASSWORD") or "").strip()
_SMTP_HOST = (os.getenv("SUPPORT_SMTP_HOST") or "smtp.gmail.com").strip()
_SMTP_PORT = int((os.getenv("SUPPORT_SMTP_PORT") or "465").strip())

_APP_URL = (os.getenv("APP_URL") or "http://localhost:5173/").rstrip("/")


def _send_payment_email(to_email: str, subject: str, body: str) -> bool:
    """Send email to customer. Returns True if sent successfully."""
    if not (_SMTP_ENABLED and _SENDER_EMAIL and _SENDER_PASSWORD):
        return False
    try:
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = _SENDER_EMAIL
        msg["To"] = to_email
        msg.set_content(body)
        with smtplib.SMTP_SSL(_SMTP_HOST, _SMTP_PORT) as smtp:
            smtp.login(_SENDER_EMAIL, _SENDER_PASSWORD)
            smtp.send_message(msg)
        return True
    except Exception as exc:
        logger.warning("Failed to send reservation email: %s", exc)
        return False


def _build_payment_email(shop_name: str, customer_name: str, res_date: str,
                          res_time: str, guests: int, payment_link: str) -> tuple[str, str]:
    subject = f"Complete Your Table Reservation at {shop_name}"
    body = (
        f"Dear {customer_name},\n\n"
        f"Your table reservation request has been received!\n\n"
        f"Reservation Details:\n"
        f"  Date   : {res_date}\n"
        f"  Time   : {res_time}\n"
        f"  Guests : {guests}\n\n"
        f"To confirm your booking, please complete the payment using the link below:\n"
        f"{payment_link}\n\n"
        f"Your reservation will be approved by the restaurant after payment verification.\n\n"
        f"Thank you,\n{shop_name}"
    )
    return subject, body


# ── Public endpoints ───────────────────────────────────────────────────────────

@router.get("/shop-info")
def get_shop_info(
    shop_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """Return public shop/branch info needed to render the booking form."""
    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == shop_id).first()
    if not shop:
        raise HTTPException(404, "Shop not found")

    branches = (
        db.query(Branch)
        .filter(Branch.shop_id == shop_id, Branch.status == "ACTIVE")
        .all()
    )

    return {
        "shop_id": shop.shop_id,
        "shop_name": shop.shop_name or "",
        "address": shop.address_line1 or "",
        "mobile": shop.mobile or "",
        "upi_id": shop.upi_id or "",
        "reservation_advance": float(shop.reservation_advance or 0),
        "branches": [
            {"branch_id": b.branch_id, "branch_name": b.branch_name}
            for b in branches
        ],
    }


@router.get("/tables")
def get_public_tables(
    shop_id: int = Query(...),
    branch_id: int = Query(...),
    reservation_date: str | None = Query(None),
    reservation_time: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """Return available tables for a branch (no auth required).
    Filters out tables already booked for the given date/time."""
    tables = (
        db.query(TableMaster)
        .filter(
            TableMaster.shop_id == shop_id,
            TableMaster.branch_id == branch_id,
        )
        .order_by(TableMaster.table_name)
        .all()
    )

    # Find table IDs already booked for this date + time
    booked_ids: set[int] = set()
    if reservation_date:
        try:
            res_date = date.fromisoformat(reservation_date)
            q = (
                db.query(TableReservation.table_id)
                .filter(
                    TableReservation.shop_id == shop_id,
                    TableReservation.branch_id == branch_id,
                    TableReservation.reservation_date == res_date,
                    TableReservation.table_id.isnot(None),
                    TableReservation.status.in_(["PENDING", "CONFIRMED"]),
                )
            )
            if reservation_time:
                q = q.filter(TableReservation.reservation_time == reservation_time)
            booked_ids = {r.table_id for r in q.all()}
        except ValueError:
            pass

    return [
        {
            "table_id": t.table_id,
            "table_name": t.table_name,
            "capacity": t.capacity,
        }
        for t in tables
        if t.table_id not in booked_ids
    ]


@router.post("/")
def create_public_reservation(
    payload: dict,
    db: Session = Depends(get_db),
):
    """Create a reservation without authentication (public booking form)."""
    shop_id = payload.get("shop_id")
    branch_id = payload.get("branch_id")
    customer_name = (payload.get("customer_name") or "").strip()
    mobile = (payload.get("mobile") or "").strip()
    email = (payload.get("email") or "").strip() or None
    reservation_date_str = payload.get("reservation_date")
    reservation_time = (payload.get("reservation_time") or "").strip()

    if not shop_id:
        raise HTTPException(400, "shop_id is required")
    if not branch_id:
        raise HTTPException(400, "branch_id is required")
    if not customer_name:
        raise HTTPException(400, "customer_name is required")
    if not mobile:
        raise HTTPException(400, "mobile is required")
    if not reservation_date_str:
        raise HTTPException(400, "reservation_date is required")
    if not reservation_time:
        raise HTTPException(400, "reservation_time is required")

    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == int(shop_id)).first()
    if not shop:
        raise HTTPException(404, "Shop not found")

    try:
        res_date = date.fromisoformat(reservation_date_str)
    except ValueError:
        raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD")

    # Check table availability if a specific table was requested
    table_id = payload.get("table_id") or None
    if table_id:
        conflict = db.query(TableReservation).filter(
            TableReservation.shop_id == int(shop_id),
            TableReservation.branch_id == int(branch_id),
            TableReservation.table_id == int(table_id),
            TableReservation.reservation_date == res_date,
            TableReservation.reservation_time == reservation_time,
            TableReservation.status.in_(["PENDING", "CONFIRMED"]),
        ).first()
        if conflict:
            raise HTTPException(409, "This table is already booked for the selected date and time. Please choose a different table or time.")

    # Generate unique payment token
    payment_token = uuid.uuid4().hex + uuid.uuid4().hex[:16]  # 48-char token

    advance_amount = float(shop.reservation_advance or 0)

    row = TableReservation(
        shop_id=int(shop_id),
        branch_id=int(branch_id),
        table_id=int(table_id) if table_id else None,
        customer_name=customer_name,
        mobile=mobile,
        email=email,
        reservation_date=res_date,
        reservation_time=reservation_time,
        guests=int(payload.get("guests") or 1),
        notes=(payload.get("notes") or "").strip() or None,
        status="PENDING",
        payment_token=payment_token,
        payment_status="UNPAID",
        advance_amount=advance_amount,
        created_by=None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    # Send payment link email if customer provided email
    email_sent = False
    if email:
        payment_link = f"{_APP_URL}/pay?token={payment_token}"
        subject, body = _build_payment_email(
            shop_name=shop.shop_name or "Restaurant",
            customer_name=customer_name,
            res_date=str(res_date),
            res_time=reservation_time,
            guests=int(payload.get("guests") or 1),
            payment_link=payment_link,
        )
        email_sent = _send_payment_email(email, subject, body)

    return {
        "reservation_id": row.reservation_id,
        "customer_name": row.customer_name,
        "reservation_date": str(row.reservation_date),
        "reservation_time": row.reservation_time,
        "guests": row.guests,
        "status": row.status,
        "shop_name": shop.shop_name or "",
        "email_sent": email_sent,
        "has_email": bool(email),
    }


@router.get("/pay/{token}")
def get_payment_info(
    token: str,
    db: Session = Depends(get_db),
):
    """Get reservation details by payment token (for payment confirmation page)."""
    row = db.query(TableReservation).filter(
        TableReservation.payment_token == token
    ).first()
    if not row:
        raise HTTPException(404, "Payment link not found or expired")

    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == row.shop_id).first()

    return {
        "reservation_id": row.reservation_id,
        "customer_name": row.customer_name,
        "reservation_date": str(row.reservation_date),
        "reservation_time": row.reservation_time,
        "guests": row.guests,
        "notes": row.notes,
        "status": row.status,
        "payment_status": row.payment_status,
        "advance_amount": float(row.advance_amount or 0),
        "shop_name": shop.shop_name if shop else "",
        "shop_mobile": shop.mobile if shop else "",
        "upi_id": shop.upi_id if shop else "",
    }


@router.post("/pay/{token}")
def confirm_payment(
    token: str,
    db: Session = Depends(get_db),
):
    """Customer confirms they have made the payment."""
    row = db.query(TableReservation).filter(
        TableReservation.payment_token == token
    ).first()
    if not row:
        raise HTTPException(404, "Payment link not found or expired")

    if row.status in ("CANCELLED", "NO_SHOW"):
        raise HTTPException(400, "This reservation has been cancelled")

    if row.payment_status == "PAID":
        return {"success": True, "already_paid": True}

    row.payment_status = "PAID"
    db.commit()

    return {"success": True, "already_paid": False}
