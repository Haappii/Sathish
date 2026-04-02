from __future__ import annotations
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.kot import KOT, KOTItem
from app.models.table_billing import Order, OrderItem
from app.models.items import Item
from app.utils.permissions import require_permission
from app.utils.shop_type import ensure_hotel_billing_type

router = APIRouter(prefix="/kot", tags=["KOT"])


def _next_kot_number(db: Session, shop_id: int, branch_id: int) -> str:
    count = db.query(KOT).filter(
        KOT.shop_id == shop_id,
        KOT.branch_id == branch_id,
    ).count()
    return f"KOT-{branch_id}-{count + 1:04d}"


# ── CREATE KOT (send unsent items to kitchen) ─────────────────────────────────
@router.post("/create/{order_id}")
def create_kot(
    order_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("billing", "write")),
):
    ensure_hotel_billing_type(db, user.shop_id)
    order = db.query(Order).filter(
        Order.order_id == order_id,
        Order.shop_id == user.shop_id,
        Order.status == "OPEN",
    ).first()
    if not order:
        raise HTTPException(404, "Order not found or already closed")

    # Only send items that haven't been sent to kitchen yet
    pending_items = db.query(OrderItem).filter(
        OrderItem.order_id == order_id,
        OrderItem.shop_id == user.shop_id,
        OrderItem.kot_sent == False,
    ).all()

    if not pending_items:
        raise HTTPException(400, "No new items to send to kitchen")

    kot = KOT(
        shop_id=user.shop_id,
        branch_id=order.branch_id,
        order_id=order_id,
        table_id=order.table_id,
        kot_number=_next_kot_number(db, user.shop_id, order.branch_id),
        status="PENDING",
        printed_by=user.user_id,
    )
    db.add(kot)
    db.flush()

    for oi in pending_items:
        item = db.query(Item).filter(Item.item_id == oi.item_id).first()
        db.add(KOTItem(
            shop_id=user.shop_id,
            kot_id=kot.kot_id,
            order_item_id=oi.order_item_id,
            item_id=oi.item_id,
            item_name=item.item_name if item else str(oi.item_id),
            quantity=oi.quantity,
            notes=oi.notes,
            status="PENDING",
        ))
        oi.kot_sent = True
        oi.kot_sent_at = datetime.utcnow()

    db.commit()
    db.refresh(kot)

    return {
        "kot_id": kot.kot_id,
        "kot_number": kot.kot_number,
        "item_count": len(pending_items),
        "items": [
            {
                "item_name": ki.item_name,
                "quantity": ki.quantity,
                "notes": ki.notes,
            }
            for ki in kot.items
        ],
    }


# ── LIST KOTs FOR AN ORDER ────────────────────────────────────────────────────
@router.get("/order/{order_id}")
def list_kots_for_order(
    order_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("billing", "read")),
):
    kots = db.query(KOT).filter(
        KOT.order_id == order_id,
        KOT.shop_id == user.shop_id,
    ).order_by(KOT.printed_at).all()

    return [
        {
            "kot_id": k.kot_id,
            "kot_number": k.kot_number,
            "status": k.status,
            "printed_at": k.printed_at,
            "completed_at": k.completed_at,
            "items": [
                {
                    "item_name": ki.item_name,
                    "quantity": ki.quantity,
                    "notes": ki.notes,
                    "status": ki.status,
                }
                for ki in k.items
            ],
        }
        for k in kots
    ]


# ── LIST ALL PENDING KOTs (Kitchen view) ──────────────────────────────────────
@router.get("/pending")
def list_pending_kots(
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("billing", "read")),
):
    q = db.query(KOT).filter(
        KOT.shop_id == user.shop_id,
        KOT.status.in_(["PENDING", "PREPARING"]),
    )
    bid = branch_id or user.branch_id
    if bid:
        q = q.filter(KOT.branch_id == bid)
    kots = q.order_by(KOT.printed_at).all()

    return [
        {
            "kot_id": k.kot_id,
            "kot_number": k.kot_number,
            "table_id": k.table_id,
            "status": k.status,
            "printed_at": k.printed_at,
            "items": [
                {"item_name": ki.item_name, "quantity": ki.quantity, "notes": ki.notes, "status": ki.status}
                for ki in k.items
            ],
        }
        for k in kots
    ]


# ── UPDATE KOT STATUS ─────────────────────────────────────────────────────────
@router.put("/{kot_id}/status")
def update_kot_status(
    kot_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    user=Depends(require_permission("billing", "write")),
):
    valid = {"PENDING", "PREPARING", "READY", "SERVED"}
    new_status = str(payload.get("status", "")).upper()
    if new_status not in valid:
        raise HTTPException(400, f"Invalid status. Must be one of: {valid}")

    kot = db.query(KOT).filter(KOT.kot_id == kot_id, KOT.shop_id == user.shop_id).first()
    if not kot:
        raise HTTPException(404, "KOT not found")

    kot.status = new_status
    if new_status in {"READY", "SERVED"}:
        kot.completed_at = datetime.utcnow()
        for ki in kot.items:
            ki.status = new_status

    db.commit()
    return {"success": True, "kot_id": kot_id, "status": new_status}


# ── UPDATE INDIVIDUAL ITEM STATUS ─────────────────────────────────────────────
@router.put("/{kot_id}/item/{item_id}/status")
def update_kot_item_status(
    kot_id: int,
    item_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    user=Depends(require_permission("billing", "write")),
):
    valid = {"PENDING", "PREPARING", "READY", "SERVED"}
    new_status = str(payload.get("status", "")).upper()
    if new_status not in valid:
        raise HTTPException(400, f"Invalid status. Must be one of: {valid}")

    kot = db.query(KOT).filter(KOT.kot_id == kot_id, KOT.shop_id == user.shop_id).first()
    if not kot:
        raise HTTPException(404, "KOT not found")

    ki = db.query(KOTItem).filter(KOTItem.kot_id == kot_id, KOTItem.id == item_id).first()
    if not ki:
        raise HTTPException(404, "KOT item not found")

    ki.status = new_status

    # Auto-update KOT status based on all items
    all_statuses = {i.status for i in kot.items}
    if all_statuses == {"SERVED"}:
        kot.status = "SERVED"
        kot.completed_at = datetime.utcnow()
    elif "PREPARING" in all_statuses or "READY" in all_statuses:
        kot.status = "PREPARING"

    db.commit()
    return {"success": True, "item_id": item_id, "status": new_status}
