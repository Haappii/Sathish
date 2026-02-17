from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.models.items import Item
from app.models.table_billing import TableMaster, Order, OrderItem
from app.models.table_qr import QrOrder
from app.utils.permissions import require_permission
from app.utils.shop_type import ensure_hotel_billing_type


router = APIRouter(prefix="/qr-orders", tags=["QR Orders"])


class QrOrderAcceptOutItem(BaseModel):
    item_id: int
    item_name: str | None = None
    quantity: int


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
    table.table_start_time = datetime.utcnow()
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


@router.get("/pending")
def list_pending_qr_orders(
    db: Session = Depends(get_db),
    user=Depends(require_permission("qr_orders", "read")),
):
    ensure_hotel_billing_type(db, int(user.shop_id))

    q = (
        db.query(QrOrder)
        .options(joinedload(QrOrder.items))
        .filter(
            QrOrder.shop_id == user.shop_id,
            QrOrder.branch_id == user.branch_id,
            QrOrder.status == "PENDING",
        )
        .order_by(QrOrder.created_at.desc())
    )
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
    db: Session = Depends(get_db),
    user=Depends(require_permission("qr_orders", "write")),
):
    ensure_hotel_billing_type(db, int(user.shop_id))

    qr = (
        db.query(QrOrder)
        .options(joinedload(QrOrder.items))
        .filter(
            QrOrder.shop_id == user.shop_id,
            QrOrder.branch_id == user.branch_id,
            QrOrder.qr_order_id == qr_order_id,
        )
        .first()
    )
    if not qr:
        raise HTTPException(404, "QR order not found")
    if qr.status != "PENDING":
        raise HTTPException(400, f"QR order already {qr.status}")

    order = _get_or_create_open_table_order(
        db=db,
        shop_id=int(user.shop_id),
        branch_id=int(user.branch_id),
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

    db.commit()

    table = (
        db.query(TableMaster)
        .filter(
            TableMaster.shop_id == user.shop_id,
            TableMaster.branch_id == user.branch_id,
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
    db: Session = Depends(get_db),
    user=Depends(require_permission("qr_orders", "write")),
):
    ensure_hotel_billing_type(db, int(user.shop_id))

    qr = (
        db.query(QrOrder)
        .filter(
            QrOrder.shop_id == user.shop_id,
            QrOrder.branch_id == user.branch_id,
            QrOrder.qr_order_id == qr_order_id,
        )
        .first()
    )
    if not qr:
        raise HTTPException(404, "QR order not found")
    if qr.status != "PENDING":
        raise HTTPException(400, f"QR order already {qr.status}")

    qr.status = "REJECTED"
    qr.accepted_at = datetime.utcnow()
    qr.accepted_by = int(getattr(user, "user_id", None) or 0) or None
    db.commit()
    return {"success": True}

