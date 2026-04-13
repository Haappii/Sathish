from __future__ import annotations

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.advance_order import AdvanceOrder
from app.utils.permissions import require_permission

router = APIRouter(prefix="/advance-orders", tags=["Advance Orders"])

VALID_STATUSES = {"PENDING", "CONFIRMED", "READY", "COMPLETED", "CANCELLED"}


def _to_out(o: AdvanceOrder) -> dict:
    return {
        "order_id": o.order_id,
        "customer_name": o.customer_name,
        "customer_phone": o.customer_phone,
        "order_items": o.order_items or [],
        "expected_date": str(o.expected_date) if o.expected_date else None,
        "expected_time": o.expected_time,
        "notes": o.notes,
        "total_amount": float(o.total_amount or 0),
        "advance_amount": float(o.advance_amount or 0),
        "advance_payment_mode": o.advance_payment_mode,
        "status": o.status,
        "cancel_reason": o.cancel_reason,
        "created_at": o.created_at,
        "branch_id": o.branch_id,
    }


# ── LIST ──────────────────────────────────────────────────────────────────────
@router.get("/")
def list_advance_orders(
    expected_date: str | None = Query(None),
    status: str | None = Query(None),
    branch_id: int | None = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_permission("billing", "read")),
):
    q = db.query(AdvanceOrder).filter(AdvanceOrder.shop_id == user.shop_id)

    bid = branch_id or user.branch_id
    if bid:
        q = q.filter(AdvanceOrder.branch_id == bid)

    if expected_date:
        try:
            d = date.fromisoformat(expected_date)
            q = q.filter(AdvanceOrder.expected_date == d)
        except ValueError:
            raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD")

    if status:
        q = q.filter(AdvanceOrder.status == status.upper())

    rows = q.order_by(AdvanceOrder.expected_date, AdvanceOrder.created_at).all()
    return [_to_out(r) for r in rows]


# ── CREATE ────────────────────────────────────────────────────────────────────
@router.post("/")
def create_advance_order(
    payload: dict,
    db: Session = Depends(get_db),
    user=Depends(require_permission("billing", "write")),
):
    if not str(payload.get("customer_name") or "").strip():
        raise HTTPException(400, "customer_name is required")
    if not payload.get("expected_date"):
        raise HTTPException(400, "expected_date is required")

    try:
        exp_date = date.fromisoformat(str(payload["expected_date"]))
    except ValueError:
        raise HTTPException(400, "expected_date must be YYYY-MM-DD")

    order = AdvanceOrder(
        shop_id=user.shop_id,
        branch_id=int(payload.get("branch_id") or user.branch_id or 0),
        customer_name=str(payload["customer_name"]).strip(),
        customer_phone=str(payload.get("customer_phone") or "").strip() or None,
        order_items=payload.get("order_items") or [],
        expected_date=exp_date,
        expected_time=str(payload.get("expected_time") or "").strip() or None,
        notes=str(payload.get("notes") or "").strip() or None,
        total_amount=float(payload.get("total_amount") or 0),
        advance_amount=float(payload.get("advance_amount") or 0),
        advance_payment_mode=str(payload.get("advance_payment_mode") or "").strip() or None,
        status="PENDING",
        created_by=getattr(user, "user_id", None),
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return _to_out(order)


# ── GET ONE ───────────────────────────────────────────────────────────────────
@router.get("/{order_id}")
def get_advance_order(
    order_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("billing", "read")),
):
    order = (
        db.query(AdvanceOrder)
        .filter(AdvanceOrder.order_id == order_id, AdvanceOrder.shop_id == user.shop_id)
        .first()
    )
    if not order:
        raise HTTPException(404, "Advance order not found")
    return _to_out(order)


# ── UPDATE ────────────────────────────────────────────────────────────────────
@router.put("/{order_id}")
def update_advance_order(
    order_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    user=Depends(require_permission("billing", "write")),
):
    order = (
        db.query(AdvanceOrder)
        .filter(AdvanceOrder.order_id == order_id, AdvanceOrder.shop_id == user.shop_id)
        .first()
    )
    if not order:
        raise HTTPException(404, "Advance order not found")

    if order.status == "COMPLETED":
        raise HTTPException(400, "Completed order cannot be modified")

    if "customer_name" in payload:
        order.customer_name = str(payload["customer_name"]).strip()
    if "customer_phone" in payload:
        order.customer_phone = str(payload.get("customer_phone") or "").strip() or None
    if "order_items" in payload:
        order.order_items = payload["order_items"] or []
    if "expected_date" in payload:
        try:
            order.expected_date = date.fromisoformat(str(payload["expected_date"]))
        except ValueError:
            raise HTTPException(400, "expected_date must be YYYY-MM-DD")
    if "expected_time" in payload:
        order.expected_time = str(payload.get("expected_time") or "").strip() or None
    if "notes" in payload:
        order.notes = str(payload.get("notes") or "").strip() or None
    if "total_amount" in payload:
        order.total_amount = float(payload["total_amount"] or 0)
    if "advance_amount" in payload:
        order.advance_amount = float(payload["advance_amount"] or 0)
    if "advance_payment_mode" in payload:
        order.advance_payment_mode = str(payload.get("advance_payment_mode") or "").strip() or None
    if "status" in payload:
        new_status = str(payload["status"]).upper()
        if new_status not in VALID_STATUSES:
            raise HTTPException(400, f"Invalid status. Must be one of: {', '.join(VALID_STATUSES)}")
        if new_status == "CANCELLED" and order.status not in ("PENDING", "CONFIRMED"):
            raise HTTPException(400, "Only PENDING or CONFIRMED orders can be cancelled")
        order.status = new_status
        if new_status == "CANCELLED":
            order.cancel_reason = str(payload.get("cancel_reason") or "").strip() or None

    order.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(order)
    return _to_out(order)


# ── DELETE ────────────────────────────────────────────────────────────────────
@router.delete("/{order_id}")
def delete_advance_order(
    order_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("billing", "write")),
):
    order = (
        db.query(AdvanceOrder)
        .filter(AdvanceOrder.order_id == order_id, AdvanceOrder.shop_id == user.shop_id)
        .first()
    )
    if not order:
        raise HTTPException(404, "Advance order not found")
    if order.status == "COMPLETED":
        raise HTTPException(400, "Completed orders cannot be deleted")
    db.delete(order)
    db.commit()
    return {"detail": "Advance order deleted"}
