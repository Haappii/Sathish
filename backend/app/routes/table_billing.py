from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, desc
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, Optional

from pydantic import BaseModel

from app.db import get_db
from app.utils.permissions import require_permission

from app.models.table_billing import TableMaster, Order, OrderItem
from app.models.items import Item
from app.models.branch_item_price import BranchItemPrice
from app.models.invoice import Invoice
from app.models.invoice_details import InvoiceDetail
from app.models.shop_details import ShopDetails
from app.models.table_qr import TableQrSession
from app.models.branch import Branch
from app.services.gst_service import calculate_gst

from app.services.inventory_service import adjust_stock, is_inventory_enabled
from app.services.invoice_service import generate_invoice_number
from app.services.day_close_service import is_branch_day_closed
from app.utils.shop_type import ensure_hotel_billing_type

router = APIRouter(
    prefix="/table-billing",
    tags=["Table Billing"]
)

TAKEAWAY_TABLE_NAME = "__TAKEAWAY__"


def _table_started_now() -> datetime:
    return datetime.now()

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


def _running_total_for_order(db: Session, order_id: int) -> Decimal:
    total = (
        db.query(
            func.coalesce(
                func.sum(OrderItem.price * OrderItem.quantity),
                0
            )
        )
        .filter(OrderItem.order_id == order_id)
        .scalar()
    )
    return Decimal(total or 0)


def _serialize_order_items(order: Order) -> list[dict]:
    return [
        {
            "order_item_id": it.order_item_id,
            "item_id": it.item_id,
            "item_name": it.item.item_name if it.item else None,
            "price": float(it.price),
            "quantity": it.quantity,
        }
        for it in order.items
    ]

def _branch_service_charge_info(db: Session, *, shop_id: int, branch_id: int) -> dict:
    """Return service_charge and service_charge_gst as Decimals from branch settings."""
    branch = (
        db.query(Branch)
        .filter(Branch.shop_id == shop_id, Branch.branch_id == branch_id)
        .first()
    )
    zero = {"service_charge": Decimal("0.00"), "service_charge_gst": Decimal("0.00")}
    if not branch or not getattr(branch, "service_charge_required", False):
        return zero
    try:
        amount = Decimal(str(getattr(branch, "service_charge_amount", 0) or 0))
    except Exception:
        amount = Decimal("0")
    if amount < 0:
        amount = Decimal("0")
    amount = amount.quantize(Decimal("0.01"))

    gst_amt = Decimal("0.00")
    if getattr(branch, "service_charge_gst_required", False):
        try:
            gst_pct = Decimal(str(getattr(branch, "service_charge_gst_percent", 0) or 0))
        except Exception:
            gst_pct = Decimal("0")
        if gst_pct > 0:
            gst_amt = (amount * gst_pct / 100).quantize(Decimal("0.01"))

    return {"service_charge": amount, "service_charge_gst": gst_amt}


def _get_or_create_takeaway_table(*, db: Session, shop_id: int, branch_id: int) -> TableMaster:
    table = (
        db.query(TableMaster)
        .filter(
            TableMaster.shop_id == shop_id,
            TableMaster.branch_id == branch_id,
            TableMaster.table_name == TAKEAWAY_TABLE_NAME,
        )
        .first()
    )
    if table:
        return table

    table = TableMaster(
        shop_id=shop_id,
        table_name=TAKEAWAY_TABLE_NAME,
        capacity=0,
        branch_id=branch_id,
        status="FREE",
    )
    db.add(table)
    db.flush()
    return table

# ======================================================
# REQUEST MODEL (✅ ADDED – DOES NOT BREAK ANYTHING)
# ======================================================
class CheckoutRequest(BaseModel):
    customer_name: Optional[str] = None
    mobile: Optional[str] = None
    customer_gst: Optional[str] = None
    customer_email: Optional[str] = None
    payment_mode: Optional[str] = "cash"
    payment_split: Optional[dict] = None
    service_charge: Optional[float] = 0
    discounted_amt: Optional[float] = 0


class TakeawayItemRequest(BaseModel):
    item_id: int
    quantity: int
    price: Optional[float] = None


class TakeawayCreateRequest(BaseModel):
    customer_name: Optional[str] = None
    mobile: Optional[str] = None
    notes: Optional[str] = None
    token_number: Optional[str] = None
    branch_id: Optional[int] = None
    items: list[TakeawayItemRequest]


class TransferTableRequest(BaseModel):
    from_table_id: int
    to_table_id: int


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
        .options(joinedload(TableMaster.category))
        .filter(
            TableMaster.shop_id == user.shop_id,
            TableMaster.branch_id == user.branch_id,
            TableMaster.table_name != TAKEAWAY_TABLE_NAME,
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
            running_total = _running_total_for_order(db, order.order_id)

        result.append({
            "table_id": t.table_id,
            "table_name": t.table_name,
            "capacity": t.capacity,
            "category_id": t.category_id,
            "category_name": t.category.category_name if t.category else None,
            "status": t.status,
            "table_start_time": t.table_start_time,
            "opened_at": t.table_start_time,
            "running_total": float(running_total),
            "order_id": order.order_id if order else None,
            "order_type": order.order_type if order else None,
            "customer_name": order.customer_name if order else None,
            "mobile": order.mobile if order else None,
            "notes": order.notes if order else None,
            "token_number": order.token_number if order else None,
        })

    return result


@router.get("/takeaway/orders")
def list_takeaway_orders(
    db: Session = Depends(get_db),
    user = Depends(require_permission("billing", "read"))
):
    ensure_hotel_billing_type(db, user.shop_id)
    orders = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.item))
        .filter(
            Order.shop_id == user.shop_id,
            Order.branch_id == user.branch_id,
            Order.status == "OPEN",
            Order.order_type == "TAKEAWAY"
        )
        .order_by(desc(Order.opened_at), desc(Order.order_id))
        .all()
    )

    return [
        {
            "order_id": order.order_id,
            "table_id": order.table_id,
            "order_type": order.order_type,
            "customer_name": order.customer_name,
            "mobile": order.mobile,
            "notes": order.notes,
            "token_number": order.token_number,
            "status": order.status,
            "opened_at": order.opened_at,
            "running_total": float(_running_total_for_order(db, order.order_id)),
            "items": _serialize_order_items(order),
        }
        for order in orders
    ]


@router.post("/takeaway")
def create_takeaway_order(
    payload: TakeawayCreateRequest,
    db: Session = Depends(get_db),
    user = Depends(require_permission("billing", "write"))
):
    ensure_hotel_billing_type(db, user.shop_id)
    if not payload.items:
        raise HTTPException(400, "Add at least one item")

    takeaway_table = _get_or_create_takeaway_table(
        db=db,
        shop_id=int(user.shop_id),
        branch_id=int(user.branch_id),
    )

    item_ids = [int(it.item_id) for it in payload.items]
    item_map = {
        int(item.item_id): item
        for item in db.query(Item)
        .filter(
            Item.shop_id == user.shop_id,
            Item.item_id.in_(item_ids),
        )
        .all()
    }
    overrides = {
        int(row.item_id): row
        for row in db.query(BranchItemPrice)
        .filter(
            BranchItemPrice.shop_id == user.shop_id,
            BranchItemPrice.branch_id == user.branch_id,
            BranchItemPrice.item_id.in_(item_ids),
        )
        .all()
    }

    order = Order(
        shop_id=user.shop_id,
        table_id=takeaway_table.table_id,
        branch_id=user.branch_id,
        order_type="TAKEAWAY",
        customer_name=(payload.customer_name or "").strip() or "Walk-in",
        mobile=(payload.mobile or "").strip() or None,
        notes=(payload.notes or "").strip() or None,
        token_number=(payload.token_number or "").strip() or None,
        opened_by=user.user_id
    )
    db.add(order)
    db.flush()

    if not order.token_number:
        order.token_number = f"T-{order.order_id:03d}"

    for row in payload.items:
        if int(row.quantity) <= 0:
            raise HTTPException(400, "Item quantity must be greater than zero")

        item = item_map.get(int(row.item_id))
        if not item:
            raise HTTPException(404, f"Item not found: {row.item_id}")

        override = overrides.get(int(row.item_id))
        if override and not override.item_status:
            raise HTTPException(400, f"{item.item_name} is unavailable in this branch")

        price_to_use = float(override.price) if override else float(item.price or 0)
        db.add(OrderItem(
            shop_id=user.shop_id,
            order_id=order.order_id,
            item_id=item.item_id,
            quantity=int(row.quantity),
            price=price_to_use
        ))

    db.commit()
    db.refresh(order)

    return {
        "success": True,
        "order_id": order.order_id,
        "token_number": order.token_number
    }


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

    table_status_updated = False

    if not order:
        table_started_at = _table_started_now()
        order = Order(
            shop_id=user.shop_id,
            table_id=table_id,
            branch_id=user.branch_id,
            opened_by=user.user_id
        )

        table.status = "OCCUPIED"
        table.table_start_time = table_started_at
        table_status_updated = True

        db.add(order)
        db.commit()
        db.refresh(order)
    else:
        # Keep table state aligned when an OPEN order already exists.
        if str(table.status or "").upper() != "OCCUPIED":
            table.status = "OCCUPIED"
            table_status_updated = True
        if not table.table_start_time:
            table.table_start_time = order.opened_at or _table_started_now()
            table_status_updated = True

        if table_status_updated:
            db.commit()

    sc_info = _branch_service_charge_info(db, shop_id=user.shop_id, branch_id=int(user.branch_id))
    return {
        "order_id": order.order_id,
        "table_id": order.table_id,
        "table_name": table.table_name,
        "status": order.status,
        "items": _serialize_order_items(order),
        "service_charge": float(sc_info["service_charge"]),
        "service_charge_gst": float(sc_info["service_charge_gst"]),
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

    override = (
        db.query(BranchItemPrice)
        .filter(
            BranchItemPrice.shop_id == user.shop_id,
            BranchItemPrice.branch_id == user.branch_id,
            BranchItemPrice.item_id == item_id,
        )
        .first()
    )
    if override and not override.item_status:
        raise HTTPException(400, "Item unavailable in this branch")
    price_to_use = float(override.price) if override else float(item.price or 0)

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
        existing.price = price_to_use
        if existing.quantity <= 0:
            db.delete(existing)
    else:
        if qty > 0:
            db.add(OrderItem(
                shop_id=user.shop_id,
                order_id=order_id,
                item_id=item_id,
                quantity=qty,
                price=price_to_use
            ))

    db.commit()
    return {"success": True}


@router.post("/order/clear/{order_id}")
def clear_order(
    order_id: int,
    db: Session = Depends(get_db),
    user = Depends(require_permission("billing", "write"))
):
    ensure_hotel_billing_type(db, user.shop_id)
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

    if not order:
        raise HTTPException(404, "Order not found")

    removed_count = 0
    for it in list(order.items):
        db.delete(it)
        removed_count += 1

    db.commit()
    return {
        "success": True,
        "removed_count": removed_count,
        "message": "Order cleared"
    }


@router.post("/order/transfer")
def transfer_order_to_table(
    payload: TransferTableRequest,
    db: Session = Depends(get_db),
    user = Depends(require_permission("billing", "write"))
):
    ensure_hotel_billing_type(db, user.shop_id)

    from_table_id = int(payload.from_table_id)
    to_table_id = int(payload.to_table_id)

    if from_table_id == to_table_id:
        raise HTTPException(400, "Source and destination table cannot be the same")

    from_table = (
        db.query(TableMaster)
        .filter(
            TableMaster.shop_id == user.shop_id,
            TableMaster.branch_id == user.branch_id,
            TableMaster.table_id == from_table_id,
            TableMaster.table_name != TAKEAWAY_TABLE_NAME,
        )
        .first()
    )
    if not from_table:
        raise HTTPException(404, "Source table not found")

    to_table = (
        db.query(TableMaster)
        .filter(
            TableMaster.shop_id == user.shop_id,
            TableMaster.branch_id == user.branch_id,
            TableMaster.table_id == to_table_id,
            TableMaster.table_name != TAKEAWAY_TABLE_NAME,
        )
        .first()
    )
    if not to_table:
        raise HTTPException(404, "Destination table not found")

    order = (
        db.query(Order)
        .filter(
            Order.shop_id == user.shop_id,
            Order.branch_id == user.branch_id,
            Order.table_id == from_table_id,
            Order.status == "OPEN",
        )
        .first()
    )
    if not order:
        raise HTTPException(404, "No open order found on source table")

    destination_open_order = (
        db.query(Order)
        .filter(
            Order.shop_id == user.shop_id,
            Order.branch_id == user.branch_id,
            Order.table_id == to_table_id,
            Order.status == "OPEN",
        )
        .first()
    )
    if destination_open_order:
        raise HTTPException(400, "Destination table already has an open order")

    started_at = from_table.table_start_time or order.opened_at or _table_started_now()

    order.table_id = to_table_id
    to_table.status = "OCCUPIED"
    to_table.table_start_time = started_at

    from_table.status = "FREE"
    from_table.table_start_time = None
    _end_active_qr_session(db=db, shop_id=int(user.shop_id), table_id=from_table_id)

    db.commit()

    return {
        "success": True,
        "order_id": order.order_id,
        "from_table_id": from_table_id,
        "from_table_name": from_table.table_name,
        "to_table_id": to_table_id,
        "to_table_name": to_table.table_name,
    }


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

    sc_info = _branch_service_charge_info(db, shop_id=user.shop_id, branch_id=int(user.branch_id))
    service_charge = sc_info["service_charge"]
    service_charge_gst = sc_info["service_charge_gst"]

    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == user.shop_id).first()
    tax_amt, total = calculate_gst(subtotal, shop)
    discount_amt = Decimal(str(payload.discounted_amt or 0))
    if discount_amt < 0:
        discount_amt = Decimal("0")
    gross_total = (total + service_charge + service_charge_gst)
    if discount_amt > gross_total:
        discount_amt = gross_total
    grand_total = (gross_total - discount_amt).quantize(Decimal("1"), rounding=ROUND_HALF_UP)

    payment_split = payload.payment_split if isinstance(payload.payment_split, dict) else {}
    if payload.customer_email:
        payment_split = dict(payment_split or {})
        payment_split["customer_email"] = str(payload.customer_email).strip()
    if payload.customer_gst:
        payment_split = dict(payment_split or {})
        payment_split["customer_gst"] = str(payload.customer_gst).strip().upper()
    if discount_amt > 0:
        payment_split = dict(payment_split or {})
        payment_split["discounted_amt"] = float(discount_amt)
    if service_charge > 0:
        payment_split = dict(payment_split or {})
        payment_split["service_charge"] = float(service_charge)
        if service_charge_gst > 0:
            payment_split["service_charge_gst"] = float(service_charge_gst)

    invoice = Invoice(
        shop_id=user.shop_id,
        invoice_number=generate_invoice_number(db, shop_id=user.shop_id, branch_id=order.branch_id),
        branch_id=order.branch_id,
        created_user=user.user_id,
        created_time=business_dt,
        total_amount=grand_total,
        tax_amt=tax_amt,
        discounted_amt=float(discount_amt),

        # ✅ THIS WAS MISSING
        customer_name=payload.customer_name,
        mobile=payload.mobile,
        gst_number=(str(payload.customer_gst).strip().upper() if payload.customer_gst else None),
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
    order.table.status = "PAID"
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
@router.api_route("/order/cancel/{order_id}", methods=["POST", "PUT", "DELETE"])
@router.api_route("/orders/{order_id}/cancel", methods=["POST", "PUT", "DELETE"])
@router.api_route("/order/{order_id}/cancel", methods=["POST", "PUT", "DELETE"])
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


@router.api_route("/order/cancel", methods=["POST", "PUT", "DELETE"])
def cancel_order_compat(
    order_id: Optional[int] = Query(default=None),
    payload: Optional[Dict[str, Any]] = Body(default=None),
    db: Session = Depends(get_db),
    user = Depends(require_permission("billing", "write"))
):
    ensure_hotel_billing_type(db, user.shop_id)

    resolved_order_id: Optional[int] = order_id
    if resolved_order_id is None and isinstance(payload, dict):
        try:
            resolved_order_id = int(payload.get("order_id")) if payload.get("order_id") is not None else None
        except Exception:
            resolved_order_id = None

    if not resolved_order_id:
        raise HTTPException(422, "order_id is required")

    order = (
        db.query(Order)
        .filter(
            Order.shop_id == user.shop_id,
            Order.order_id == resolved_order_id,
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
