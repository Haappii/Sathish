from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from fastapi import Request
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.models.items import Item
from app.models.kot import KOT, KOTItem
from app.models.system_parameters import SystemParameter
from app.models.table_billing import TableMaster, Order, OrderItem
from app.models.table_qr import QrOrder
from app.utils.permissions import require_permission
from app.utils.shop_type import ensure_hotel_billing_type


router = APIRouter(prefix="/qr-orders", tags=["QR Orders"])


class QrOrderAcceptOutItem(BaseModel):
    item_id: int
    item_name: str | None = None
    quantity: int


def _role_lower(user) -> str:
    return str(getattr(user, "role_name", "") or "").strip().lower()


def _resolve_branch_id(*, user, request: Request) -> int | None:
    """
    Admin can switch branch in UI; frontend sends `x-branch-id`.
    Non-admin is locked to their own branch_id.
    """
    role = _role_lower(user)
    if role != "admin":
        try:
            return int(getattr(user, "branch_id", None))
        except (TypeError, ValueError):
            raise HTTPException(400, "Branch required")

    header = request.headers.get("x-branch-id")
    if header in (None, ""):
        # For admin, allow listing across branches if not provided.
        return None
    try:
        return int(header)
    except (TypeError, ValueError):
        raise HTTPException(400, "Invalid branch id")


def _get_or_create_open_table_order(
    *,
    db: Session,
    shop_id: int,
    branch_id: int,
    table_id: int,
    opened_by: int | None,
) -> Order:
    order = (
        db.query(Order)
        .filter(
            Order.shop_id == shop_id,
            Order.branch_id == branch_id,
            Order.table_id == table_id,
            Order.status == "OPEN",
        )
        .first()
    )
    if order:
        return order

    table = (
        db.query(TableMaster)
        .filter(
            TableMaster.shop_id == shop_id,
            TableMaster.branch_id == branch_id,
            TableMaster.table_id == table_id,
        )
        .first()
    )
    if not table:
        raise HTTPException(404, "Table not found")

    order = Order(
        shop_id=shop_id,
        table_id=table_id,
        branch_id=branch_id,
        opened_by=opened_by,
    )
    table.status = "OCCUPIED"
    table.table_start_time = datetime.now()
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


def _next_kot_number(db: Session, shop_id: int, branch_id: int) -> str:
    count = db.query(KOT).filter(
        KOT.shop_id == shop_id,
        KOT.branch_id == branch_id,
    ).count()
    return f"KOT-{branch_id}-{count + 1:04d}"


def _is_kot_required(db: Session, *, shop_id: int, branch_id: int) -> bool:
    key = f"branch:{branch_id}:kot_required"
    row = (
        db.query(SystemParameter)
        .filter(SystemParameter.shop_id == shop_id, SystemParameter.param_key == key)
        .first()
    )
    value = str(getattr(row, "param_value", "YES") or "YES").strip().upper()
    return value != "NO"


def _create_kot_for_order_if_needed(
    *,
    db: Session,
    shop_id: int,
    branch_id: int,
    order_id: int,
    table_id: int,
    user_id: int | None,
) -> KOT | None:
    pending_items = (
        db.query(OrderItem)
        .filter(
            OrderItem.shop_id == shop_id,
            OrderItem.order_id == order_id,
            OrderItem.kot_sent == False,
        )
        .all()
    )
    if not pending_items:
        return None

    kot = KOT(
        shop_id=shop_id,
        branch_id=branch_id,
        order_id=order_id,
        table_id=table_id,
        kot_number=_next_kot_number(db, shop_id, branch_id),
        status="PENDING",
        printed_by=user_id,
    )
    db.add(kot)
    db.flush()

    item_ids = list({int(it.item_id) for it in pending_items})
    item_map = {
        int(i.item_id): i
        for i in (
            db.query(Item)
            .filter(Item.shop_id == shop_id, Item.item_id.in_(item_ids))
            .all()
        )
    } if item_ids else {}

    for oi in pending_items:
        item = item_map.get(int(oi.item_id))
        db.add(
            KOTItem(
                shop_id=shop_id,
                kot_id=kot.kot_id,
                order_item_id=oi.order_item_id,
                item_id=oi.item_id,
                item_name=item.item_name if item else str(oi.item_id),
                quantity=oi.quantity,
                notes=oi.notes,
                status="PENDING",
            )
        )
        oi.kot_sent = True
        oi.kot_sent_at = datetime.utcnow()

    return kot


@router.get("/pending")
def list_pending_qr_orders(
    request: Request,
    db: Session = Depends(get_db),
    user=Depends(require_permission("qr_orders", "read")),
):
    ensure_hotel_billing_type(db, int(user.shop_id))

    branch_id = _resolve_branch_id(user=user, request=request)

    q = (
        db.query(QrOrder)
        .options(joinedload(QrOrder.items))
        .filter(
            QrOrder.shop_id == user.shop_id,
            QrOrder.status == "PENDING",
        )
        .order_by(QrOrder.created_at.desc())
    )
    if branch_id is not None:
        q = q.filter(QrOrder.branch_id == branch_id)
    rows = q.all()

    table_ids = list({r.table_id for r in rows})
    table_map = {
        t.table_id: t
        for t in db.query(TableMaster)
        .filter(TableMaster.shop_id == user.shop_id, TableMaster.table_id.in_(table_ids))
        .all()
    } if table_ids else {}

    out = []
    for r in rows:
        t = table_map.get(r.table_id)
        out.append(
            {
                "qr_order_id": r.qr_order_id,
                "table_id": r.table_id,
                "table_name": getattr(t, "table_name", None),
                "customer_name": r.customer_name,
                "mobile": r.mobile,
                "email": r.email,
                "status": r.status,
                "created_at": r.created_at,
                "item_count": sum(int(x.quantity or 0) for x in (r.items or [])),
                "items": [
                    {
                        "item_id": x.item_id,
                        "item_name": x.item_name,
                        "quantity": x.quantity,
                    }
                    for x in (r.items or [])
                ],
            }
        )

    return out


@router.post("/{qr_order_id}/accept")
def accept_qr_order(
    qr_order_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user=Depends(require_permission("qr_orders", "write")),
):
    ensure_hotel_billing_type(db, int(user.shop_id))

    qr = (
        db.query(QrOrder)
        .options(joinedload(QrOrder.items))
        .filter(
            QrOrder.shop_id == user.shop_id,
            QrOrder.qr_order_id == qr_order_id,
        )
        .first()
    )
    if not qr:
        raise HTTPException(404, "QR order not found")
    if _role_lower(user) != "admin" and int(qr.branch_id) != int(getattr(user, "branch_id", 0) or 0):
        raise HTTPException(403, "Not allowed")
    if qr.status != "PENDING":
        raise HTTPException(400, f"QR order already {qr.status}")

    order = _get_or_create_open_table_order(
        db=db,
        shop_id=int(user.shop_id),
        branch_id=int(qr.branch_id),
        table_id=int(qr.table_id),
        opened_by=int(getattr(user, "user_id", None) or 0) or None,
    )

    items = list(qr.items or [])
    if not items:
        raise HTTPException(400, "No items in order")

    item_ids = list({int(x.item_id) for x in items})
    db_items = (
        db.query(Item)
        .filter(Item.shop_id == user.shop_id, Item.item_id.in_(item_ids))
        .all()
    )
    item_map = {i.item_id: i for i in db_items}

    for it in items:
        existing = (
            db.query(OrderItem)
            .filter(
                OrderItem.shop_id == user.shop_id,
                OrderItem.order_id == order.order_id,
                OrderItem.item_id == it.item_id,
            )
            .first()
        )
        price = Decimal(str(item_map.get(it.item_id).price if item_map.get(it.item_id) else it.unit_price or 0)).quantize(
            Decimal("0.01")
        )
        if existing:
            existing.quantity += int(it.quantity)
            if existing.quantity <= 0:
                db.delete(existing)
        else:
            db.add(
                OrderItem(
                    shop_id=user.shop_id,
                    order_id=order.order_id,
                    item_id=it.item_id,
                    quantity=int(it.quantity),
                    price=price,
                )
            )

    qr.status = "ACCEPTED"
    qr.accepted_at = datetime.utcnow()
    qr.accepted_by = int(getattr(user, "user_id", None) or 0) or None
    qr.linked_table_order_id = order.order_id

    if _is_kot_required(db, shop_id=int(user.shop_id), branch_id=int(qr.branch_id)):
        _create_kot_for_order_if_needed(
            db=db,
            shop_id=int(user.shop_id),
            branch_id=int(qr.branch_id),
            order_id=int(order.order_id),
            table_id=int(qr.table_id),
            user_id=int(getattr(user, "user_id", None) or 0) or None,
        )

    db.commit()

    table = (
        db.query(TableMaster)
        .filter(
            TableMaster.shop_id == user.shop_id,
            TableMaster.branch_id == int(qr.branch_id),
            TableMaster.table_id == qr.table_id,
        )
        .first()
    )

    return {
        "success": True,
        "qr_order_id": qr.qr_order_id,
        "order_id": order.order_id,
        "table_id": qr.table_id,
        "table_name": getattr(table, "table_name", None),
        "items": [
            {"item_id": x.item_id, "item_name": x.item_name, "quantity": x.quantity}
            for x in items
        ],
    }


@router.post("/{qr_order_id}/reject")
def reject_qr_order(
    qr_order_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user=Depends(require_permission("qr_orders", "write")),
):
    ensure_hotel_billing_type(db, int(user.shop_id))

    qr = (
        db.query(QrOrder)
        .filter(
            QrOrder.shop_id == user.shop_id,
            QrOrder.qr_order_id == qr_order_id,
        )
        .first()
    )
    if not qr:
        raise HTTPException(404, "QR order not found")
    if _role_lower(user) != "admin" and int(qr.branch_id) != int(getattr(user, "branch_id", 0) or 0):
        raise HTTPException(403, "Not allowed")
    if qr.status != "PENDING":
        raise HTTPException(400, f"QR order already {qr.status}")

    qr.status = "REJECTED"
    qr.accepted_at = datetime.utcnow()
    qr.accepted_by = int(getattr(user, "user_id", None) or 0) or None
    db.commit()
    return {"success": True}
