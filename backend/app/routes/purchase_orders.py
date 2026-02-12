from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime

from app.db import get_db
from app.utils.auth_user import get_current_user
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem
from app.models.supplier import Supplier
from app.models.items import Item
from app.models.shop_details import ShopDetails
from app.schemas.purchase_order import (
    PurchaseOrderCreate,
    PurchaseOrderResponse,
    PurchaseOrderReceive,
    PurchaseOrderPayment
)
from app.services.day_close_service import is_branch_day_closed
from app.services.inventory_service import adjust_stock
from app.services.audit_service import log_action

router = APIRouter(prefix="/purchase-orders", tags=["Purchase Orders"])


def manager_or_admin(user):
    role = str(user.role_name or "").lower()
    if role not in ["manager", "admin"]:
        raise HTTPException(403, "Manager/Admin access required")


def resolve_branch(branch_id_param, user):
    if str(user.role_name).lower() == "admin":
        return int(branch_id_param or user.branch_id)
    return int(user.branch_id)


def get_business_date(db: Session, shop_id: int):
    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == shop_id).first()
    return shop.app_date if shop and shop.app_date else datetime.utcnow().date()


def generate_po_number():
    return f"PO-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"


@router.get("/", response_model=list[PurchaseOrderResponse])
def list_pos(
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    manager_or_admin(user)
    bid = resolve_branch(branch_id, user)
    rows = (
        db.query(PurchaseOrder)
        .filter(PurchaseOrder.branch_id == bid, PurchaseOrder.shop_id == user.shop_id)
        .order_by(PurchaseOrder.po_id.desc())
        .all()
    )
    return rows


@router.get("/{po_id}", response_model=PurchaseOrderResponse)
def get_po(
    po_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    manager_or_admin(user)
    po = db.query(PurchaseOrder).filter(
        PurchaseOrder.po_id == po_id,
        PurchaseOrder.shop_id == user.shop_id
    ).first()
    if not po:
        raise HTTPException(404, "PO not found")
    if str(user.role_name).lower() != "admin" and po.branch_id != user.branch_id:
        raise HTTPException(403, "Not allowed")
    return po


@router.post("/", response_model=PurchaseOrderResponse)
def create_po(
    payload: PurchaseOrderCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    manager_or_admin(user)
    bid = resolve_branch(payload.branch_id, user)
    business_date = get_business_date(db, user.shop_id)
    if is_branch_day_closed(db, user.shop_id, bid, business_date):
        raise HTTPException(403, "Day closed for this branch")

    supplier = db.query(Supplier).filter(
        Supplier.supplier_id == payload.supplier_id,
        Supplier.branch_id == bid,
        Supplier.status == "ACTIVE",
        Supplier.shop_id == user.shop_id
    ).first()
    if not supplier:
        raise HTTPException(400, "Supplier not found")

    if not payload.items:
        raise HTTPException(400, "Add items to PO")

    po = PurchaseOrder(
        po_number=generate_po_number(),
        shop_id=user.shop_id,
        supplier_id=payload.supplier_id,
        branch_id=bid,
        order_date=business_date,
        expected_date=datetime.strptime(payload.expected_date, "%Y-%m-%d").date()
        if payload.expected_date else None,
        status=(payload.status or "DRAFT"),
        payment_status=(payload.payment_status or "UNPAID"),
        notes=payload.notes,
        created_by=user.user_id
    )

    total = 0
    for it in payload.items:
        item = db.query(Item).filter(
            Item.item_id == it.item_id,
            Item.shop_id == user.shop_id
        ).first()
        if not item:
            raise HTTPException(400, f"Item not found: {it.item_id}")
        qty = int(it.qty or 0)
        if qty <= 0:
            raise HTTPException(400, "Qty must be > 0")

        unit_cost = float(it.unit_cost) if it.unit_cost is not None else float(item.buy_price or 0)
        sell_price = float(it.sell_price) if it.sell_price is not None else float(item.price or 0)
        mrp_price = float(it.mrp_price) if it.mrp_price is not None else float(item.mrp_price or 0)
        line_total = qty * unit_cost
        total += line_total

        po.items.append(PurchaseOrderItem(
            shop_id=user.shop_id,
            item_id=item.item_id,
            item_name=item.item_name,
            qty_ordered=qty,
            qty_received=0,
            unit_cost=unit_cost,
            sell_price=sell_price,
            mrp_price=mrp_price,
            line_total=line_total
        ))

    po.total_amount = total
    db.add(po)
    db.commit()
    db.refresh(po)

    log_action(
        db,
        shop_id=user.shop_id,
        module="PurchaseOrders",
        action="CREATE",
        record_id=po.po_number,
        new={
            "po_id": po.po_id,
            "branch_id": po.branch_id,
            "supplier_id": po.supplier_id,
            "status": po.status,
            "payment_status": po.payment_status,
            "total_amount": po.total_amount,
        },
        user_id=user.user_id,
    )
    return po


@router.post("/{po_id}/receive", response_model=PurchaseOrderResponse)
def receive_po(
    po_id: int,
    payload: PurchaseOrderReceive,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    manager_or_admin(user)
    po = db.query(PurchaseOrder).filter(
        PurchaseOrder.po_id == po_id,
        PurchaseOrder.shop_id == user.shop_id
    ).first()
    if not po:
        raise HTTPException(404, "PO not found")
    if str(user.role_name).lower() != "admin" and po.branch_id != user.branch_id:
        raise HTTPException(403, "Not allowed")

    business_date = get_business_date(db, user.shop_id)
    if is_branch_day_closed(db, user.shop_id, po.branch_id, business_date):
        raise HTTPException(403, "Day closed for this branch")

    if not payload.items:
        raise HTTPException(400, "No receive items")

    receive_map = {x.item_id: x.qty_received for x in payload.items}

    for item in po.items:
        if item.item_id not in receive_map:
            continue
        qty_in = int(receive_map[item.item_id] or 0)
        if qty_in <= 0:
            continue
        remaining = item.qty_ordered - item.qty_received
        if qty_in > remaining:
            raise HTTPException(400, f"Qty exceeds remaining for {item.item_name}")
        item.qty_received += qty_in
        adjust_stock(db, user.shop_id, item.item_id, po.branch_id, qty_in, "ADD", ref_no=po.po_number)

    # update status
    all_received = all(i.qty_received >= i.qty_ordered for i in po.items)
    if all_received:
        po.status = "CLOSED"
    else:
        po.status = "PARTIALLY_RECEIVED" if any(i.qty_received > 0 for i in po.items) else po.status

    db.commit()
    db.refresh(po)

    log_action(
        db,
        shop_id=user.shop_id,
        module="PurchaseOrders",
        action="RECEIVE",
        record_id=po.po_number,
        new={
            "po_id": po.po_id,
            "branch_id": po.branch_id,
            "status": po.status,
            "received_items": len(payload.items or []),
        },
        user_id=user.user_id,
    )
    return po


@router.post("/{po_id}/payment", response_model=PurchaseOrderResponse)
def update_payment(
    po_id: int,
    payload: PurchaseOrderPayment,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    manager_or_admin(user)
    po = db.query(PurchaseOrder).filter(
        PurchaseOrder.po_id == po_id,
        PurchaseOrder.shop_id == user.shop_id
    ).first()
    if not po:
        raise HTTPException(404, "PO not found")
    if str(user.role_name).lower() != "admin" and po.branch_id != user.branch_id:
        raise HTTPException(403, "Not allowed")

    po.payment_status = payload.payment_status
    po.paid_amount = float(payload.paid_amount or 0)
    db.commit()
    db.refresh(po)

    log_action(
        db,
        shop_id=user.shop_id,
        module="PurchaseOrders",
        action="PAYMENT",
        record_id=po.po_number,
        new={
            "po_id": po.po_id,
            "payment_status": po.payment_status,
            "paid_amount": po.paid_amount,
        },
        user_id=user.user_id,
    )
    return po
