from __future__ import annotations
from datetime import datetime, date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.reservation import TableReservation
from app.utils.permissions import require_permission
from app.utils.shop_type import ensure_hotel_billing_type

router = APIRouter(prefix="/reservations", tags=["Reservations"])


def _to_out(r: TableReservation) -> dict:
    return {
        "reservation_id": r.reservation_id,
        "customer_name": r.customer_name,
        "mobile": r.mobile,
        "email": r.email,
        "table_id": r.table_id,
        "reservation_date": str(r.reservation_date),
        "reservation_time": r.reservation_time,
        "guests": r.guests,
        "notes": r.notes,
        "status": r.status,
        "payment_status": r.payment_status or "UNPAID",
        "created_at": r.created_at,
        "confirmed_at": r.confirmed_at,
        "seated_at": r.seated_at,
        "cancelled_at": r.cancelled_at,
        "cancel_reason": r.cancel_reason,
    }


# ── LIST ──────────────────────────────────────────────────────────────────────
@router.get("/")
def list_reservations(
    reservation_date: str | None = Query(None),
    status: str | None = Query(None),
    branch_id: int | None = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_permission("billing", "read")),
):
    ensure_hotel_billing_type(db, user.shop_id)
    q = db.query(TableReservation).filter(TableReservation.shop_id == user.shop_id)

    bid = branch_id or user.branch_id
    if bid:
        q = q.filter(TableReservation.branch_id == bid)

    if reservation_date:
        try:
            d = date.fromisoformat(reservation_date)
            q = q.filter(TableReservation.reservation_date == d)
        except ValueError:
            raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD")

    if status:
        q = q.filter(TableReservation.status == status.upper())

    rows = q.order_by(TableReservation.reservation_date, TableReservation.reservation_time).all()
    return [_to_out(r) for r in rows]


# ── CREATE ────────────────────────────────────────────────────────────────────
@router.post("/")
def create_reservation(
    payload: dict,
    db: Session = Depends(get_db),
    user=Depends(require_permission("billing", "write")),
):
    if not payload.get("customer_name"):
        raise HTTPException(400, "customer_name is required")
    if not payload.get("mobile"):
        raise HTTPException(400, "mobile is required")
    if not payload.get("reservation_date"):
        raise HTTPException(400, "reservation_date is required")
    if not payload.get("reservation_time"):
        raise HTTPException(400, "reservation_time is required")

    try:
        res_date = date.fromisoformat(payload["reservation_date"])
    except ValueError:
        raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD")

    branch_id = int(payload.get("branch_id") or user.branch_id or 0)
    if not branch_id:
        raise HTTPException(400, "branch_id is required")

    row = TableReservation(
        shop_id=user.shop_id,
        branch_id=branch_id,
        table_id=payload.get("table_id"),
        customer_name=payload["customer_name"].strip(),
        mobile=payload["mobile"].strip(),
        email=(payload.get("email") or "").strip() or None,
        reservation_date=res_date,
        reservation_time=payload["reservation_time"].strip(),
        guests=int(payload.get("guests", 1)),
        notes=(payload.get("notes") or "").strip() or None,
        status="PENDING",
        created_by=user.user_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_out(row)


# ── GET ONE ───────────────────────────────────────────────────────────────────
@router.get("/{reservation_id}")
def get_reservation(
    reservation_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("billing", "read")),
):
    row = db.query(TableReservation).filter(
        TableReservation.reservation_id == reservation_id,
        TableReservation.shop_id == user.shop_id,
    ).first()
    if not row:
        raise HTTPException(404, "Reservation not found")
    return _to_out(row)


# ── UPDATE STATUS ─────────────────────────────────────────────────────────────
@router.put("/{reservation_id}/status")
def update_status(
    reservation_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    user=Depends(require_permission("billing", "write")),
):
    valid = {"PENDING", "CONFIRMED", "SEATED", "CANCELLED", "NO_SHOW"}
    new_status = str(payload.get("status", "")).upper()
    if new_status not in valid:
        raise HTTPException(400, f"Invalid status. Must be one of: {valid}")

    row = db.query(TableReservation).filter(
        TableReservation.reservation_id == reservation_id,
        TableReservation.shop_id == user.shop_id,
    ).first()
    if not row:
        raise HTTPException(404, "Reservation not found")

    row.status = new_status
    now = datetime.utcnow()

    if new_status == "CONFIRMED":
        row.confirmed_at = now
    elif new_status == "SEATED":
        row.seated_at = now
    elif new_status == "CANCELLED":
        row.cancelled_at = now
        row.cancel_reason = (payload.get("cancel_reason") or "").strip() or None

    db.commit()
    return _to_out(row)


# ── UPDATE TABLE ASSIGNMENT ───────────────────────────────────────────────────
@router.put("/{reservation_id}")
def update_reservation(
    reservation_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    user=Depends(require_permission("billing", "write")),
):
    row = db.query(TableReservation).filter(
        TableReservation.reservation_id == reservation_id,
        TableReservation.shop_id == user.shop_id,
    ).first()
    if not row:
        raise HTTPException(404, "Reservation not found")

    for field in ("customer_name", "mobile", "email", "table_id", "reservation_time", "guests", "notes"):
        if field in payload:
            setattr(row, field, payload[field])

    if "reservation_date" in payload:
        try:
            row.reservation_date = date.fromisoformat(payload["reservation_date"])
        except ValueError:
            raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD")

    db.commit()
    return _to_out(row)


# ── DELETE ────────────────────────────────────────────────────────────────────
@router.delete("/{reservation_id}")
def delete_reservation(
    reservation_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("billing", "write")),
):
    row = db.query(TableReservation).filter(
        TableReservation.reservation_id == reservation_id,
        TableReservation.shop_id == user.shop_id,
    ).first()
    if not row:
        raise HTTPException(404, "Reservation not found")
    db.delete(row)
    db.commit()
    return {"success": True}
