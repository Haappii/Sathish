from __future__ import annotations
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.models.kot import KOT, KOTItem
from app.models.table_billing import Order, OrderItem
from app.models.items import Item
from app.routes.invoice import resolve_branch_optional
from app.utils.permissions import require_permission
from app.utils.shop_type import ensure_hotel_billing_type

router = APIRouter(prefix="/kot", tags=["KOT"])

ORDER_LIVE_FLOW = [
    {"key": "ORDER_PLACED", "label": "Order Placed", "kot_status": "PENDING", "step_index": 0},
    {"key": "ORDER_PREPARING", "label": "Order Preparing", "kot_status": "PREPARING", "step_index": 1},
    {"key": "FOOD_PREPARED", "label": "Food Prepared", "kot_status": "READY", "step_index": 2},
    {"key": "MOVED_TO_TABLE", "label": "Moved To Table", "kot_status": "SERVED", "step_index": 3},
]
ORDER_LIVE_META = {row["key"]: row for row in ORDER_LIVE_FLOW}
ORDER_LIVE_TO_KOT = {row["key"]: row["kot_status"] for row in ORDER_LIVE_FLOW}
KOT_TO_ORDER_LIVE = {row["kot_status"]: row["key"] for row in ORDER_LIVE_FLOW}


class OrderLiveStatusPayload(BaseModel):
    status: str


def _next_kot_number(db: Session, shop_id: int, branch_id: int) -> str:
    count = db.query(KOT).filter(
        KOT.shop_id == shop_id,
        KOT.branch_id == branch_id,
    ).count()
    return f"KOT-{branch_id}-{count + 1:04d}"


def _derive_order_live_status(kots: list[KOT]) -> dict:
    statuses = [str(getattr(k, "status", "") or "PENDING").upper() for k in (kots or [])]
    if not statuses:
        return {
            "status": "AWAITING_KOT",
            "label": "Awaiting KOT",
            "step_index": -1,
            "next_status": "ORDER_PLACED",
        }

    if all(s == "PENDING" for s in statuses):
        key = "ORDER_PLACED"
    elif all(s == "SERVED" for s in statuses):
        key = "MOVED_TO_TABLE"
    elif all(s in {"READY", "SERVED"} for s in statuses):
        key = "FOOD_PREPARED"
    else:
        key = "ORDER_PREPARING"

    meta = ORDER_LIVE_META[key]
    next_index = meta["step_index"] + 1
    next_status = ORDER_LIVE_FLOW[next_index]["key"] if next_index < len(ORDER_LIVE_FLOW) else None
    return {
        "status": key,
        "label": meta["label"],
        "step_index": meta["step_index"],
        "next_status": next_status,
    }


def _serialize_tracking_order(order: Order, kots: list[KOT]) -> dict:
    live = _derive_order_live_status(kots)
    total_qty = sum(int(getattr(it, "quantity", 0) or 0) for it in (order.items or []))
    return {
        "order_id": order.order_id,
        "table_id": order.table_id,
        "table_name": order.table.table_name if getattr(order, "table", None) else None,
        "branch_id": order.branch_id,
        "order_type": order.order_type,
        "customer_name": order.customer_name,
        "mobile": order.mobile,
        "notes": order.notes,
        "token_number": order.token_number,
        "opened_at": order.opened_at,
        "status": live["status"],
        "status_label": live["label"],
        "step_index": live["step_index"],
        "next_status": live["next_status"],
        "has_kot": bool(kots),
        "kot_count": len(kots),
        "item_count": len(order.items or []),
        "total_qty": total_qty,
        "items": [
            {
                "order_item_id": it.order_item_id,
                "item_id": it.item_id,
                "item_name": it.item.item_name if it.item else None,
                "quantity": it.quantity,
                "price": float(it.price or 0),
                "kot_sent": bool(it.kot_sent),
                "kot_sent_at": it.kot_sent_at,
            }
            for it in (order.items or [])
        ],
        "kots": [
            {
                "kot_id": k.kot_id,
                "kot_number": k.kot_number,
                "status": k.status,
                "printed_at": k.printed_at,
                "completed_at": k.completed_at,
                "item_count": len(k.items or []),
            }
            for k in (kots or [])
        ],
    }


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
    all_kots = (
        db.query(KOT)
        .options(joinedload(KOT.items))
        .filter(
            KOT.shop_id == user.shop_id,
            KOT.order_id == order_id,
        )
        .order_by(KOT.printed_at.asc(), KOT.kot_id.asc())
        .all()
    )
    live = _derive_order_live_status(all_kots)

    return {
        "kot_id": kot.kot_id,
        "kot_number": kot.kot_number,
        "order_id": order_id,
        "item_count": len(pending_items),
        "order_live_status": live["status"],
        "order_live_label": live["label"],
        "items": [
            {
                "item_id": ki.item_id,
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
@router.get("/tracking/orders")
def list_tracking_orders(
    request: Request,
    include_without_kot: bool = False,
    db: Session = Depends(get_db),
    user=Depends(require_permission("billing", "read")),
):
    ensure_hotel_billing_type(db, user.shop_id)
    branch_id = resolve_branch_optional(user, request.headers.get("x-branch-id"))

    q = (
        db.query(Order)
        .options(
            joinedload(Order.table),
            joinedload(Order.items).joinedload(OrderItem.item),
        )
        .filter(
            Order.shop_id == user.shop_id,
            Order.status == "OPEN",
        )
        .order_by(Order.opened_at.asc(), Order.order_id.asc())
    )
    if branch_id is not None:
        q = q.filter(Order.branch_id == branch_id)
    orders = q.all()

    order_ids = [int(o.order_id) for o in orders]
    kot_rows = (
        db.query(KOT)
        .options(joinedload(KOT.items))
        .filter(
            KOT.shop_id == user.shop_id,
            KOT.order_id.in_(order_ids),
        )
        .order_by(KOT.printed_at.asc(), KOT.kot_id.asc())
        .all()
        if order_ids
        else []
    )

    kot_map: dict[int, list[KOT]] = {}
    for kot in kot_rows:
        kot_map.setdefault(int(kot.order_id), []).append(kot)

    result = []
    for order in orders:
        kots = kot_map.get(int(order.order_id), [])
        if not include_without_kot and not kots:
            continue
        result.append(_serialize_tracking_order(order, kots))

    return result


@router.put("/tracking/order/{order_id}/status")
def update_tracking_order_status(
    order_id: int,
    payload: OrderLiveStatusPayload,
    request: Request,
    db: Session = Depends(get_db),
    user=Depends(require_permission("billing", "write")),
):
    ensure_hotel_billing_type(db, user.shop_id)
    branch_id = resolve_branch_optional(user, request.headers.get("x-branch-id"))

    requested = str(payload.status or "").strip().upper()
    requested = KOT_TO_ORDER_LIVE.get(requested, requested)
    if requested not in ORDER_LIVE_TO_KOT:
        raise HTTPException(
            400,
            "Invalid status. Must be one of: ORDER_PLACED, ORDER_PREPARING, FOOD_PREPARED, MOVED_TO_TABLE",
        )

    q = (
        db.query(Order)
        .options(
            joinedload(Order.table),
            joinedload(Order.items).joinedload(OrderItem.item),
        )
        .filter(
            Order.shop_id == user.shop_id,
            Order.order_id == order_id,
            Order.status == "OPEN",
        )
    )
    if branch_id is not None:
        q = q.filter(Order.branch_id == branch_id)
    order = q.first()
    if not order:
        raise HTTPException(404, "Open order not found")

    kots = (
        db.query(KOT)
        .options(joinedload(KOT.items))
        .filter(
            KOT.shop_id == user.shop_id,
            KOT.order_id == order_id,
        )
        .order_by(KOT.printed_at.asc(), KOT.kot_id.asc())
        .all()
    )
    if not kots:
        raise HTTPException(400, "Generate KOT before updating order live status")

    target_kot_status = ORDER_LIVE_TO_KOT[requested]
    now = datetime.utcnow()
    for kot in kots:
        kot.status = target_kot_status
        kot.completed_at = now if target_kot_status in {"READY", "SERVED"} else None
        for ki in kot.items:
            ki.status = target_kot_status

    db.commit()

    return {
        "success": True,
        **_serialize_tracking_order(order, kots),
    }


@router.get("/pending")
def list_pending_kots(
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("billing", "read")),
):
    q = db.query(KOT).filter(
        KOT.shop_id == user.shop_id,
        KOT.status.in_(["PENDING", "PREPARING", "READY"]),
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
    kot.completed_at = datetime.utcnow() if new_status in {"READY", "SERVED"} else None
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
    elif all_statuses.issubset({"READY", "SERVED"}) and "READY" in all_statuses:
        kot.status = "READY"
        kot.completed_at = datetime.utcnow()
    elif "PREPARING" in all_statuses:
        kot.status = "PREPARING"
        kot.completed_at = None
    else:
        kot.status = "PENDING"
        kot.completed_at = None

    db.commit()
    return {"success": True, "item_id": item_id, "status": new_status}
