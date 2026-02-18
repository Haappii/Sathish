from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.branch import Branch
from app.models.category import Category
from app.models.items import Item
from app.models.shop_details import ShopDetails
from app.models.table_billing import TableMaster
from app.models.table_qr import TableQrSession, TableQrToken, QrOrder, QrOrderItem
from app.utils.shop_type import ensure_hotel_billing_type


router = APIRouter(prefix="/public/qr", tags=["Public QR"])


class PublicQrOrderItemIn(BaseModel):
    item_id: int
    quantity: int = Field(ge=1, le=999)


class PublicQrOrderIn(BaseModel):
    customer_name: str = Field(min_length=1, max_length=120)
    mobile: str = Field(min_length=6, max_length=20)
    email: str | None = Field(default=None, max_length=120)
    items: list[PublicQrOrderItemIn] = Field(min_length=1)


class PublicQrStartIn(BaseModel):
    customer_name: str | None = Field(default=None, max_length=120)
    mobile: str = Field(min_length=6, max_length=20)
    email: str | None = Field(default=None, max_length=120)


class PublicQrBootstrapIn(BaseModel):
    mobile: str = Field(min_length=6, max_length=20)


def _only_digits(v: str | None) -> str:
    return "".join(ch for ch in str(v or "") if ch.isdigit())


def _get_active_qr_session(*, db: Session, shop_id: int, table_id: int) -> TableQrSession | None:
    return (
        db.query(TableQrSession)
        .filter(
            TableQrSession.shop_id == shop_id,
            TableQrSession.table_id == table_id,
            TableQrSession.ended_at.is_(None),
        )
        .order_by(TableQrSession.started_at.desc())
        .first()
    )


def _end_active_qr_session(*, db: Session, shop_id: int, table_id: int) -> None:
    s = _get_active_qr_session(db=db, shop_id=shop_id, table_id=table_id)
    if not s:
        return
    s.ended_at = datetime.utcnow()
    db.commit()


def _ensure_qr_table_access(
    *,
    db: Session,
    tok: TableQrToken,
    table: TableMaster,
    mobile: str,
    customer_name: str | None = None,
    email: str | None = None,
) -> TableQrSession:
    """
    Enforce the "occupied table mobile lock":
    - If table is FREE: create/replace an active session and allow.
    - If table is OCCUPIED: allow only if an active session exists and mobile matches.
      If no session exists, deny (occupied via cashier / legacy).
    """
    digits = _only_digits(mobile)
    if len(digits) < 6:
        raise HTTPException(400, "Invalid mobile number")

    active = _get_active_qr_session(db=db, shop_id=int(tok.shop_id), table_id=int(tok.table_id))

    if str(getattr(table, "status", "") or "").upper() != "OCCUPIED":
        if active:
            active.ended_at = datetime.utcnow()
            db.commit()

        s = TableQrSession(
            shop_id=int(tok.shop_id),
            branch_id=int(tok.branch_id),
            table_id=int(tok.table_id),
            qr_token_id=int(tok.id),
            customer_name=(customer_name.strip() if customer_name else None),
            mobile=digits,
            email=(email.strip() if email else None),
            started_at=datetime.utcnow(),
            ended_at=None,
        )
        db.add(s)
        db.commit()
        db.refresh(s)
        return s

    # Table is OCCUPIED
    if not active:
        raise HTTPException(409, "Table is already occupied")
    if _only_digits(active.mobile) != digits:
        raise HTTPException(409, "Table is already occupied")
    return active


def _mark_table_running(*, db: Session, table: TableMaster) -> None:
    """
    Flip the table to RUNNING (OCCUPIED) as soon as the public flow starts,
    instead of waiting for cashier acceptance.
    """
    if not table:
        return
    if table.status != "OCCUPIED":
        table.status = "OCCUPIED"
    if not getattr(table, "table_start_time", None):
        table.table_start_time = datetime.utcnow()
    db.commit()


@router.get("/{token}/bootstrap")
def public_qr_bootstrap(
    token: str,
    db: Session = Depends(get_db),
):
    tok = (
        db.query(TableQrToken)
        .filter(TableQrToken.token == token, TableQrToken.active == True)
        .first()
    )
    if not tok:
        raise HTTPException(404, "Invalid QR token")

    ensure_hotel_billing_type(db, int(tok.shop_id))

    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == tok.shop_id).first()
    table = db.query(TableMaster).filter(TableMaster.table_id == tok.table_id, TableMaster.shop_id == tok.shop_id).first()
    branch = db.query(Branch).filter(Branch.branch_id == tok.branch_id).first()

    if not shop or not table:
        raise HTTPException(404, "Invalid QR token")

    # If table is OCCUPIED, don't reveal menu unless mobile matches the active QR session.
    if str(getattr(table, "status", "") or "").upper() == "OCCUPIED":
        active = _get_active_qr_session(db=db, shop_id=int(tok.shop_id), table_id=int(tok.table_id))
        if not active:
            raise HTTPException(409, "Table is already occupied")

        return {
            "locked": True,
            "requires_mobile": True,
            "shop": {
                "shop_id": shop.shop_id,
                "shop_name": shop.shop_name,
                "mobile": shop.mobile,
                "gst_number": shop.gst_number,
                "logo_url": getattr(shop, "logo_url", None),
            },
            "branch": {
                "branch_id": tok.branch_id,
                "branch_name": getattr(branch, "branch_name", None),
            },
            "table": {
                "table_id": table.table_id,
                "table_name": table.table_name,
                "capacity": table.capacity,
            },
        }

    cats = (
        db.query(Category)
        .filter(Category.shop_id == tok.shop_id, Category.category_status == True)
        .order_by(Category.category_name)
        .all()
    )
    items = (
        db.query(Item)
        .filter(Item.shop_id == tok.shop_id, Item.item_status == True)
        .order_by(Item.item_name)
        .all()
    )

    return {
        "locked": False,
        "requires_mobile": False,
        "shop": {
            "shop_id": shop.shop_id,
            "shop_name": shop.shop_name,
            "mobile": shop.mobile,
            "gst_number": shop.gst_number,
            "logo_url": getattr(shop, "logo_url", None),
        },
        "branch": {
            "branch_id": tok.branch_id,
            "branch_name": getattr(branch, "branch_name", None),
        },
        "table": {
            "table_id": table.table_id,
            "table_name": table.table_name,
            "capacity": table.capacity,
        },
        "categories": [
            {"category_id": c.category_id, "category_name": c.category_name}
            for c in cats
        ],
        "items": [
            {
                "item_id": i.item_id,
                "item_name": i.item_name,
                "category_id": i.category_id,
                "price": float(i.price or 0),
                "image_filename": i.image_filename,
            }
            for i in items
        ],
    }


@router.post("/{token}/bootstrap")
def public_qr_bootstrap_with_mobile(
    token: str,
    payload: PublicQrBootstrapIn,
    db: Session = Depends(get_db),
):
    """
    Fetch the menu for an OCCUPIED table after verifying the mobile number.
    """
    tok = (
        db.query(TableQrToken)
        .filter(TableQrToken.token == token, TableQrToken.active == True)
        .first()
    )
    if not tok:
        raise HTTPException(404, "Invalid QR token")

    ensure_hotel_billing_type(db, int(tok.shop_id))

    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == tok.shop_id).first()
    table = db.query(TableMaster).filter(TableMaster.table_id == tok.table_id, TableMaster.shop_id == tok.shop_id).first()
    branch = db.query(Branch).filter(Branch.branch_id == tok.branch_id).first()

    if not shop or not table:
        raise HTTPException(404, "Invalid QR token")

    if str(getattr(table, "status", "") or "").upper() == "OCCUPIED":
        _ensure_qr_table_access(db=db, tok=tok, table=table, mobile=payload.mobile)

    cats = (
        db.query(Category)
        .filter(Category.shop_id == tok.shop_id, Category.category_status == True)
        .order_by(Category.category_name)
        .all()
    )
    items = (
        db.query(Item)
        .filter(Item.shop_id == tok.shop_id, Item.item_status == True)
        .order_by(Item.item_name)
        .all()
    )

    return {
        "locked": False,
        "requires_mobile": False,
        "shop": {
            "shop_id": shop.shop_id,
            "shop_name": shop.shop_name,
            "mobile": shop.mobile,
            "gst_number": shop.gst_number,
            "logo_url": getattr(shop, "logo_url", None),
        },
        "branch": {
            "branch_id": tok.branch_id,
            "branch_name": getattr(branch, "branch_name", None),
        },
        "table": {
            "table_id": table.table_id,
            "table_name": table.table_name,
            "capacity": table.capacity,
        },
        "categories": [
            {"category_id": c.category_id, "category_name": c.category_name}
            for c in cats
        ],
        "items": [
            {
                "item_id": i.item_id,
                "item_name": i.item_name,
                "category_id": i.category_id,
                "price": float(i.price or 0),
                "image_filename": i.image_filename,
            }
            for i in items
        ],
    }


@router.post("/{token}/start")
def public_qr_start(
    token: str,
    payload: PublicQrStartIn | None = None,
    db: Session = Depends(get_db),
):
    """
    Called after the customer enters details (before ordering),
    to move the table from IDLE->RUNNING in the cashier UI.
    """
    tok = (
        db.query(TableQrToken)
        .filter(TableQrToken.token == token, TableQrToken.active == True)
        .first()
    )
    if not tok:
        raise HTTPException(404, "Invalid QR token")

    ensure_hotel_billing_type(db, int(tok.shop_id))

    table = (
        db.query(TableMaster)
        .filter(TableMaster.table_id == tok.table_id, TableMaster.shop_id == tok.shop_id)
        .first()
    )
    if not table:
        raise HTTPException(404, "Invalid QR token")

    # Enforce lock when table is already occupied. If the table is FREE and a payload is provided,
    # create the active QR session for this table using the customer's mobile.
    if payload is not None:
        _ensure_qr_table_access(
            db=db,
            tok=tok,
            table=table,
            mobile=payload.mobile,
            customer_name=payload.customer_name,
            email=payload.email,
        )

    _mark_table_running(db=db, table=table)
    return {"success": True, "table_id": table.table_id, "status": table.status}


@router.post("/{token}/order")
def public_qr_create_order(
    token: str,
    payload: PublicQrOrderIn,
    db: Session = Depends(get_db),
):
    tok = (
        db.query(TableQrToken)
        .filter(TableQrToken.token == token, TableQrToken.active == True)
        .first()
    )
    if not tok:
        raise HTTPException(404, "Invalid QR token")

    ensure_hotel_billing_type(db, int(tok.shop_id))

    table = db.query(TableMaster).filter(TableMaster.table_id == tok.table_id, TableMaster.shop_id == tok.shop_id).first()
    if not table:
        raise HTTPException(404, "Invalid QR token")

    # Enforce mobile lock if the table is already occupied.
    _ensure_qr_table_access(
        db=db,
        tok=tok,
        table=table,
        mobile=payload.mobile,
        customer_name=payload.customer_name,
        email=payload.email,
    )

    # Ensure table shows as RUNNING once an order is placed (even if /start wasn't called).
    _mark_table_running(db=db, table=table)

    req_items = payload.items or []
    item_ids = list({int(x.item_id) for x in req_items})
    db_items = (
        db.query(Item)
        .filter(Item.shop_id == tok.shop_id, Item.item_id.in_(item_ids), Item.item_status == True)
        .all()
    )
    item_map = {i.item_id: i for i in db_items}
    if len(item_map) != len(item_ids):
        raise HTTPException(400, "One or more items are invalid")

    order = QrOrder(
        shop_id=tok.shop_id,
        branch_id=tok.branch_id,
        table_id=tok.table_id,
        qr_token_id=tok.id,
        customer_name=payload.customer_name.strip(),
        mobile=str(payload.mobile).strip(),
        email=(payload.email.strip() if payload.email else None),
        status="PENDING",
        created_at=datetime.utcnow(),
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    for it in req_items:
        item = item_map.get(int(it.item_id))
        db.add(
            QrOrderItem(
                shop_id=tok.shop_id,
                qr_order_id=order.qr_order_id,
                item_id=item.item_id,
                item_name=item.item_name,
                unit_price=Decimal(str(item.price or 0)).quantize(Decimal("0.01")),
                quantity=int(it.quantity),
            )
        )
    db.commit()

    return {
        "success": True,
        "qr_order_id": order.qr_order_id,
        "status": order.status,
    }
