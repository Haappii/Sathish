from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, desc
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel

from app.db import get_db
from app.utils.permissions import require_permission

from app.models.table_billing import TableMaster, Order, OrderItem
from app.models.items import Item
from app.models.invoice import Invoice
from app.models.invoice_details import InvoiceDetail
from app.models.shop_details import ShopDetails
from app.models.table_qr import TableQrSession
from app.services.gst_service import calculate_gst

from app.services.inventory_service import adjust_stock, is_inventory_enabled
from app.services.day_close_service import is_branch_day_closed
from app.utils.shop_type import ensure_hotel_billing_type

router = APIRouter(
    prefix="/table-billing",
    tags=["Table Billing"]
)

def _end_active_qr_session(*, db: Session, shop_id: int, table_id: int) -> None:
    s = (
        db.query(TableQrSession)
        .filter(
            TableQrSession.shop_id == shop_id,
            TableQrSession.table_id == table_id,
            TableQrSession.ended_at.is_(None),
        )
        .order_by(TableQrSession.started_at.desc())
        .first()
    )
    if not s:
        return
    s.ended_at = datetime.utcnow()

def get_business_datetime(db: Session, shop_id: int) -> datetime:
    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == shop_id).first()
    business_date = (
        shop.app_date if shop and shop.app_date else datetime.utcnow().date()
    )
    return datetime.combine(business_date, datetime.now().time())

# ======================================================
# REQUEST MODEL (✅ ADDED – DOES NOT BREAK ANYTHING)
# ======================================================
class CheckoutRequest(BaseModel):
    customer_name: Optional[str] = None
    mobile: Optional[str] = None
    payment_mode: Optional[str] = "cash"
    payment_split: Optional[dict] = None
    service_charge: Optional[float] = 0


# ======================================================
# INVOICE NUMBER GENERATOR
# ======================================================
def generate_invoice_number(db: Session, shop_id: int, branch_id: int) -> str:
    last_invoice = (
        db.query(Invoice)
        .filter(Invoice.shop_id == shop_id, Invoice.branch_id == branch_id)
        .order_by(Invoice.invoice_id.desc())
        .first()
    )

    next_no = 1
    if last_invoice and last_invoice.invoice_number:
        try:
            next_no = int(last_invoice.invoice_number.split("-")[-1]) + 1
        except Exception:
            next_no = last_invoice.invoice_id + 1

    return f"INV-{str(next_no).zfill(5)}"


# ======================================================
# LIST TABLES
# ======================================================
@router.get("/tables")
def list_tables(
    db: Session = Depends(get_db),
    user = Depends(require_permission("billing", "read"))
):
    ensure_hotel_billing_type(db, user.shop_id)
    tables = (
        db.query(TableMaster)
        .filter(
            TableMaster.shop_id == user.shop_id,
            TableMaster.branch_id == user.branch_id
        )
        .order_by(TableMaster.table_name)
        .all()
    )

    result = []

    for t in tables:
        order = (
            db.query(Order)
            .filter(
                Order.shop_id == user.shop_id,
                Order.table_id == t.table_id,
                Order.branch_id == user.branch_id,
                Order.status == "OPEN"
            )
            .first()
        )

        running_total = Decimal("0.00")

        if order:
            total = (
                db.query(
                    func.coalesce(
                        func.sum(OrderItem.price * OrderItem.quantity),
                        0
                    )
                )
                .filter(OrderItem.order_id == order.order_id)
                .scalar()
            )
            running_total = Decimal(total)

        result.append({
            "table_id": t.table_id,
            "table_name": t.table_name,
            "capacity": t.capacity,
            "status": t.status,
            "opened_at": t.table_start_time,
            "running_total": float(running_total),
            "order_id": order.order_id if order else None
        })

    return result


# ======================================================
# GET / CREATE ORDER BY TABLE
# ======================================================
@router.get("/order/by-table/{table_id}")
def get_or_create_order(
    table_id: int,
    db: Session = Depends(get_db),
    user = Depends(require_permission("billing", "write"))
):
    ensure_hotel_billing_type(db, user.shop_id)
    table = (
        db.query(TableMaster)
        .filter(
            TableMaster.shop_id == user.shop_id,
            TableMaster.table_id == table_id,
            TableMaster.branch_id == user.branch_id
        )
        .first()
    )

    if not table:
        raise HTTPException(404, "Table not found")

    order = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.item))
        .filter(
            Order.shop_id == user.shop_id,
            Order.table_id == table_id,
            Order.branch_id == user.branch_id,
            Order.status == "OPEN"
        )
        .first()
    )

    if not order:
        order = Order(
            shop_id=user.shop_id,
            table_id=table_id,
            branch_id=user.branch_id,
            opened_by=user.user_id
        )

        table.status = "OCCUPIED"
        table.table_start_time = datetime.now()

        db.add(order)
        db.commit()
        db.refresh(order)

    return {
        "order_id": order.order_id,
        "table_id": order.table_id,
        "status": order.status,
        "items": [
            {
                "order_item_id": it.order_item_id,
                "item_id": it.item_id,
                "item_name": it.item.item_name,
                "price": float(it.price),
                "quantity": it.quantity
            }
            for it in order.items
        ]
    }


# ======================================================
# ADD / UPDATE ORDER ITEM
# ======================================================
@router.post("/order/item/add")
def add_order_item(
    order_id: int,
    item_id: int,
    qty: int,
    db: Session = Depends(get_db),
    user = Depends(require_permission("billing", "write"))
):
    ensure_hotel_billing_type(db, user.shop_id)
    if qty == 0:
        raise HTTPException(400, "Quantity cannot be zero")

    order = (
        db.query(Order)
        .filter(
            Order.shop_id == user.shop_id,
            Order.order_id == order_id,
            Order.branch_id == user.branch_id,
            Order.status == "OPEN"
        )
        .first()
    )

    if not order:
        raise HTTPException(400, "Invalid order")

    item = db.query(Item).filter(
        Item.item_id == item_id,
        Item.shop_id == user.shop_id
    ).first()
    if not item:
        raise HTTPException(404, "Item not found")

    existing = (
        db.query(OrderItem)
        .filter(
            OrderItem.shop_id == user.shop_id,
            OrderItem.order_id == order_id,
            OrderItem.item_id == item_id
        )
        .first()
    )

    if existing:
        existing.quantity += qty
        if existing.quantity <= 0:
            db.delete(existing)
    else:
        if qty > 0:
            db.add(OrderItem(
                shop_id=user.shop_id,
                order_id=order_id,
                item_id=item_id,
                quantity=qty,
                price=item.price
            ))

    db.commit()
    return {"success": True}


# ======================================================
# CHECKOUT ORDER (✅ FIXED – CUSTOMER DETAILS SAVED)
# ======================================================
@router.post("/order/checkout/{order_id}")
def checkout_order(
    order_id: int,
    payload: CheckoutRequest,   # ✅ ADDED (frontend already sends this)
    db: Session = Depends(get_db),
    user = Depends(require_permission("billing", "write"))
):
    ensure_hotel_billing_type(db, user.shop_id)
    business_dt = get_business_datetime(db, user.shop_id)
    if is_branch_day_closed(db, user.shop_id, user.branch_id, business_dt):
        raise HTTPException(403, "Day closed for this branch")
    order = (
        db.query(Order)
        .options(joinedload(Order.items))
        .filter(
            Order.shop_id == user.shop_id,
            Order.order_id == order_id,
            Order.branch_id == user.branch_id,
            Order.status == "OPEN"
        )
        .first()
    )

    if not order or not order.items:
        raise HTTPException(400, "Invalid or empty order")

    subtotal = sum(
        Decimal(it.price) * it.quantity
        for it in order.items
    )

    service_charge = Decimal(str(payload.service_charge or 0))
    if service_charge < 0:
        raise HTTPException(400, "Service charge cannot be negative")
    service_charge = service_charge.quantize(Decimal("0.01"))

    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == user.shop_id).first()
    tax_amt, total = calculate_gst(subtotal, shop)
    grand_total = (total + service_charge).quantize(Decimal("0.01"))

    payment_split = payload.payment_split if isinstance(payload.payment_split, dict) else {}
    if service_charge > 0:
        payment_split = dict(payment_split or {})
        payment_split["service_charge"] = float(service_charge)

    invoice = Invoice(
        shop_id=user.shop_id,
        invoice_number=generate_invoice_number(db, user.shop_id, order.branch_id),
        branch_id=order.branch_id,
        created_user=user.user_id,
        created_time=business_dt,
        total_amount=grand_total,
        tax_amt=tax_amt,
        discounted_amt=0,

        # ✅ THIS WAS MISSING
        customer_name=payload.customer_name,
        mobile=payload.mobile,
        payment_mode=payload.payment_mode or "cash",
        payment_split=(payment_split or None)
    )

    db.add(invoice)
    db.commit()
    db.refresh(invoice)

    item_ids = [it.item_id for it in order.items]
    item_map = {
        i.item_id: i
        for i in db.query(Item).filter(
            Item.shop_id == user.shop_id,
            Item.item_id.in_(item_ids)
        ).all()
    }

    for it in order.items:
        item = item_map.get(it.item_id)
        db.add(InvoiceDetail(
            shop_id=user.shop_id,
            invoice_id=invoice.invoice_id,
            item_id=it.item_id,
            quantity=it.quantity,
            amount=it.price * it.quantity,
            buy_price=(item.buy_price if item else 0),
            mrp_price=(item.mrp_price if item else 0)
        ))

        if is_inventory_enabled(db, user.shop_id):
            adjust_stock(
                db,
                user.shop_id,
                it.item_id,
                order.branch_id,
                it.quantity,
                "REMOVE",
                ref_no=f"TBL-{order.order_id}"
            )

    order.status = "CLOSED"
    order.closed_at = datetime.now()
    order.table.status = "FREE"
    order.table.table_start_time = None
    _end_active_qr_session(db=db, shop_id=int(user.shop_id), table_id=int(order.table_id))

    db.commit()

    return {
        "success": True,
        "invoice_number": invoice.invoice_number
    }


# ======================================================
# CANCEL ORDER
# ======================================================
@router.post("/order/cancel/{order_id}")
def cancel_order(
    order_id: int,
    db: Session = Depends(get_db),
    user = Depends(require_permission("billing", "write"))
):
    ensure_hotel_billing_type(db, user.shop_id)
    order = (
        db.query(Order)
        .filter(
            Order.shop_id == user.shop_id,
            Order.order_id == order_id,
            Order.branch_id == user.branch_id,
            Order.status == "OPEN"
        )
        .first()
    )

    if not order:
        raise HTTPException(404, "Order not found")

    for it in order.items:
        db.delete(it)

    order.status = "CANCELLED"
    order.closed_at = datetime.now()
    order.table.status = "FREE"
    order.table.table_start_time = None
    _end_active_qr_session(db=db, shop_id=int(user.shop_id), table_id=int(order.table_id))

    db.commit()

    return {
        "success": True,
        "message": "Order cancelled and table freed"
    }


# ======================================================
# LATEST CUSTOMER BY MOBILE
# ======================================================
@router.get("/latest-by-mobile/{mobile}")
def latest_invoice_by_mobile(
    mobile: str,
    db: Session = Depends(get_db),
    user = Depends(require_permission("billing", "read"))
):
    ensure_hotel_billing_type(db, user.shop_id)
    invoice = (
        db.query(Invoice)
        .filter(
            Invoice.shop_id == user.shop_id,
            Invoice.mobile == mobile,
            Invoice.branch_id == user.branch_id
        )
        .order_by(desc(Invoice.created_time))
        .first()
    )

    if not invoice:
        raise HTTPException(404, "Customer not found")

    return {
        "customer_name": invoice.customer_name,
        "mobile": invoice.mobile
    }
