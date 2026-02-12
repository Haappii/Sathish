from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db import get_db
from app.models.item_price import ItemPrice
from app.models.items import Item
from app.schemas.pricing import ItemPriceUpsert, ItemPriceOut, PriceLevelOut
from app.services.audit_service import log_action
from app.utils.permissions import require_permission

router = APIRouter(prefix="/pricing", tags=["Pricing"])


@router.get("/levels", response_model=list[PriceLevelOut])
def list_levels(
    db: Session = Depends(get_db),
    user=Depends(require_permission("pricing", "read")),
):
    rows = (
        db.query(ItemPrice.level, func.count(ItemPrice.price_id).label("count"))
        .filter(ItemPrice.shop_id == user.shop_id)
        .group_by(ItemPrice.level)
        .order_by(ItemPrice.level)
        .all()
    )
    return [{"level": r.level, "count": int(r.count or 0)} for r in rows]


@router.get("/item/{item_id}", response_model=list[ItemPriceOut])
def get_item_prices(
    item_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("pricing", "read")),
):
    item = (
        db.query(Item)
        .filter(Item.item_id == item_id, Item.shop_id == user.shop_id)
        .first()
    )
    if not item:
        raise HTTPException(404, "Item not found")

    return (
        db.query(ItemPrice)
        .filter(
            ItemPrice.shop_id == user.shop_id,
            ItemPrice.item_id == item_id,
        )
        .order_by(ItemPrice.level)
        .all()
    )


@router.get("/all", response_model=list[ItemPriceOut])
def list_all_prices(
    db: Session = Depends(get_db),
    user=Depends(require_permission("pricing", "read")),
):
    return (
        db.query(ItemPrice)
        .filter(ItemPrice.shop_id == user.shop_id)
        .order_by(ItemPrice.item_id, ItemPrice.level)
        .all()
    )


@router.post("/upsert", response_model=ItemPriceOut)
def upsert_item_price(
    payload: ItemPriceUpsert,
    db: Session = Depends(get_db),
    user=Depends(require_permission("pricing", "write")),
):
    item = (
        db.query(Item)
        .filter(Item.item_id == payload.item_id, Item.shop_id == user.shop_id)
        .first()
    )
    if not item:
        raise HTTPException(404, "Item not found")

    level = str(payload.level or "").strip().upper()
    if not level:
        raise HTTPException(400, "level is required")

    price_value = float(payload.price or 0)
    if price_value < 0:
        raise HTTPException(400, "price must be >= 0")

    row = (
        db.query(ItemPrice)
        .filter(
            ItemPrice.shop_id == user.shop_id,
            ItemPrice.item_id == int(payload.item_id),
            ItemPrice.level == level,
        )
        .first()
    )

    if not row:
        row = ItemPrice(
            shop_id=user.shop_id,
            item_id=int(payload.item_id),
            level=level,
            price=price_value,
            created_by=user.user_id,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        action = "CREATE"
    else:
        old_price = float(row.price or 0)
        row.price = price_value
        db.commit()
        db.refresh(row)
        action = "UPDATE"

        log_action(
            db,
            shop_id=user.shop_id,
            module="Pricing",
            action="PRICE_UPDATE",
            record_id=f"{row.item_id}:{row.level}",
            old={"price": old_price},
            new={"price": float(row.price or 0)},
            user_id=user.user_id,
        )

    if action == "CREATE":
        log_action(
            db,
            shop_id=user.shop_id,
            module="Pricing",
            action="PRICE_CREATE",
            record_id=f"{row.item_id}:{row.level}",
            new={"price": float(row.price or 0)},
            user_id=user.user_id,
        )

    return row
