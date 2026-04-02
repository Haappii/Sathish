from __future__ import annotations
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.delivery import DeliveryBoy, DeliveryAssignment
from app.utils.permissions import require_permission
from app.utils.shop_type import ensure_hotel_billing_type

router = APIRouter(prefix="/delivery", tags=["Delivery"])


# ── DELIVERY BOYS ─────────────────────────────────────────────────────────────

@router.get("/boys")
def list_delivery_boys(
    active_only: bool = True,
    db: Session = Depends(get_db),
    user=Depends(require_permission("billing", "read")),
):
    ensure_hotel_billing_type(db, user.shop_id)
    q = db.query(DeliveryBoy).filter(DeliveryBoy.shop_id == user.shop_id)
    if active_only:
        q = q.filter(DeliveryBoy.is_active == True)
    q = q.filter(DeliveryBoy.branch_id == user.branch_id)
    return [
        {
            "delivery_boy_id": b.delivery_boy_id,
            "name": b.name,
            "mobile": b.mobile,
            "is_active": b.is_active,
        }
        for b in q.all()
    ]


@router.post("/boys")
def create_delivery_boy(
    payload: dict,
    db: Session = Depends(get_db),
    user=Depends(require_permission("billing", "write")),
):
    if not payload.get("name"):
        raise HTTPException(400, "name is required")
    if not payload.get("mobile"):
        raise HTTPException(400, "mobile is required")

    boy = DeliveryBoy(
        shop_id=user.shop_id,
        branch_id=int(payload.get("branch_id") or user.branch_id),
        name=payload["name"].strip(),
        mobile=payload["mobile"].strip(),
        is_active=True,
    )
    db.add(boy)
    db.commit()
    db.refresh(boy)
    return {"delivery_boy_id": boy.delivery_boy_id, "name": boy.name}


@router.put("/boys/{delivery_boy_id}")
def update_delivery_boy(
    delivery_boy_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    user=Depends(require_permission("billing", "write")),
):
    boy = db.query(DeliveryBoy).filter(
        DeliveryBoy.delivery_boy_id == delivery_boy_id,
        DeliveryBoy.shop_id == user.shop_id,
    ).first()
    if not boy:
        raise HTTPException(404, "Delivery boy not found")

    for field in ("name", "mobile", "is_active"):
        if field in payload:
            setattr(boy, field, payload[field])
    db.commit()
    return {"success": True}


@router.delete("/boys/{delivery_boy_id}")
def delete_delivery_boy(
    delivery_boy_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("billing", "write")),
):
    boy = db.query(DeliveryBoy).filter(
        DeliveryBoy.delivery_boy_id == delivery_boy_id,
        DeliveryBoy.shop_id == user.shop_id,
    ).first()
    if not boy:
        raise HTTPException(404, "Delivery boy not found")
    boy.is_active = False
    db.commit()
    return {"success": True}


# ── DELIVERY ASSIGNMENTS ──────────────────────────────────────────────────────

def _to_out(a: DeliveryAssignment) -> dict:
    return {
        "assignment_id": a.assignment_id,
        "delivery_boy_id": a.delivery_boy_id,
        "delivery_boy_name": a.delivery_boy.name if a.delivery_boy else None,
        "delivery_boy_mobile": a.delivery_boy.mobile if a.delivery_boy else None,
        "order_id": a.order_id,
        "online_order_id": a.online_order_id,
        "customer_name": a.customer_name,
        "mobile": a.mobile,
        "address": a.address,
        "status": a.status,
        "assigned_at": a.assigned_at,
        "picked_up_at": a.picked_up_at,
        "delivered_at": a.delivered_at,
        "notes": a.notes,
    }


@router.get("/assignments")
def list_assignments(
    status: str | None = Query(None),
    delivery_boy_id: int | None = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_permission("billing", "read")),
):
    q = db.query(DeliveryAssignment).filter(
        DeliveryAssignment.shop_id == user.shop_id,
        DeliveryAssignment.branch_id == user.branch_id,
    )
    if status:
        q = q.filter(DeliveryAssignment.status == status.upper())
    if delivery_boy_id:
        q = q.filter(DeliveryAssignment.delivery_boy_id == delivery_boy_id)

    rows = q.order_by(DeliveryAssignment.assigned_at.desc()).limit(200).all()
    return [_to_out(a) for a in rows]


@router.post("/assignments")
def create_assignment(
    payload: dict,
    db: Session = Depends(get_db),
    user=Depends(require_permission("billing", "write")),
):
    if not payload.get("delivery_boy_id"):
        raise HTTPException(400, "delivery_boy_id is required")

    boy = db.query(DeliveryBoy).filter(
        DeliveryBoy.delivery_boy_id == int(payload["delivery_boy_id"]),
        DeliveryBoy.shop_id == user.shop_id,
        DeliveryBoy.is_active == True,
    ).first()
    if not boy:
        raise HTTPException(404, "Delivery boy not found or inactive")

    assignment = DeliveryAssignment(
        shop_id=user.shop_id,
        branch_id=user.branch_id,
        delivery_boy_id=boy.delivery_boy_id,
        order_id=payload.get("order_id"),
        online_order_id=payload.get("online_order_id"),
        customer_name=(payload.get("customer_name") or "").strip() or None,
        mobile=(payload.get("mobile") or "").strip() or None,
        address=(payload.get("address") or "").strip() or None,
        status="ASSIGNED",
        notes=(payload.get("notes") or "").strip() or None,
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return _to_out(assignment)


@router.put("/assignments/{assignment_id}/status")
def update_assignment_status(
    assignment_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    user=Depends(require_permission("billing", "write")),
):
    valid = {"ASSIGNED", "PICKED_UP", "DELIVERED", "FAILED"}
    new_status = str(payload.get("status", "")).upper()
    if new_status not in valid:
        raise HTTPException(400, f"Invalid status. Must be one of: {valid}")

    assignment = db.query(DeliveryAssignment).filter(
        DeliveryAssignment.assignment_id == assignment_id,
        DeliveryAssignment.shop_id == user.shop_id,
    ).first()
    if not assignment:
        raise HTTPException(404, "Assignment not found")

    assignment.status = new_status
    now = datetime.utcnow()
    if new_status == "PICKED_UP":
        assignment.picked_up_at = now
    elif new_status == "DELIVERED":
        assignment.delivered_at = now

    db.commit()
    return _to_out(assignment)
