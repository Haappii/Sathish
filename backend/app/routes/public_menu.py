import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.branch import Branch
from app.models.category import Category
from app.models.items import Item
from app.models.public_menu_token import PublicMenuToken
from app.models.shop_details import ShopDetails
from app.models.system_parameters import SystemParameters
from app.services.branch_item_price_service import branch_price_map

router = APIRouter(prefix="/public/menu", tags=["Public Menu"])


def _make_slug(shop_name: str, branch_name: str) -> str:
    raw = f"{shop_name} {branch_name}".lower().strip()
    slug = re.sub(r"[^a-z0-9\s-]", "", raw)
    slug = re.sub(r"[\s]+", "-", slug)
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug or "menu"


def _load_discount(db: Session, shop_id: int, branch_id: int) -> dict:
    keys = {
        "enabled": f"branch:{branch_id}:default_discount_enabled",
        "type": f"branch:{branch_id}:default_discount_type",
        "value": f"branch:{branch_id}:default_discount_value",
    }
    rows = (
        db.query(SystemParameters.param_key, SystemParameters.param_value)
        .filter(SystemParameters.shop_id == shop_id, SystemParameters.param_key.in_(keys.values()))
        .all()
    )
    pmap = {k: v for k, v in rows}

    enabled = str(pmap.get(keys["enabled"], "NO") or "NO").strip().upper() == "YES"
    dtype = str(pmap.get(keys["type"], "flat") or "flat").strip().lower()
    if dtype in {"percent", "percentage", "%", "pct"}:
        dtype = "percent"
    else:
        dtype = "flat"
    try:
        dval = float(pmap.get(keys["value"], "0") or 0)
    except Exception:
        dval = 0.0
    if dval < 0:
        dval = 0.0

    return {"enabled": enabled, "type": dtype, "value": dval}


def _bootstrap(token: str, db: Session):
    tok = (
        db.query(PublicMenuToken)
        .filter(PublicMenuToken.token == token, PublicMenuToken.active == True)
        .first()
    )
    if not tok:
        raise HTTPException(404, "Menu not found or disabled")

    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == tok.shop_id).first()
    branch = db.query(Branch).filter(Branch.branch_id == tok.branch_id).first()
    if not shop or not branch:
        raise HTTPException(404, "Menu not found")

    cats = (
        db.query(Category)
        .filter(Category.shop_id == tok.shop_id, Category.category_status == True)
        .order_by(Category.category_name)
        .all()
    )
    items = (
        db.query(Item)
        .filter(
            Item.shop_id == tok.shop_id,
            Item.item_status == True,
            Item.is_raw_material == False,
        )
        .order_by(Item.item_name)
        .all()
    )

    bp = branch_price_map(
        db,
        shop_id=int(tok.shop_id),
        branch_id=int(tok.branch_id),
        item_ids=[i.item_id for i in items],
    )

    item_list = []
    for i in items:
        override = bp.get(int(i.item_id))
        if override and getattr(override, "item_status", True) is False:
            continue
        price = float(override.price) if override and override.price is not None else float(i.price or 0)
        item_list.append({
            "item_id": i.item_id,
            "item_name": i.item_name,
            "category_id": i.category_id,
            "price": price,
            "image_filename": i.image_filename,
        })

    discount = _load_discount(db, int(tok.shop_id), int(tok.branch_id))

    return {
        "shop": {
            "shop_name": shop.shop_name,
            "logo_url": getattr(shop, "logo_url", None),
            "gst_enabled": bool(getattr(shop, "gst_enabled", False)),
            "gst_percent": float(getattr(shop, "gst_percent", 0) or 0),
            "gst_mode": str(getattr(shop, "gst_mode", "inclusive") or "inclusive").lower(),
        },
        "branch": {
            "branch_name": branch.branch_name,
            "address_line1": getattr(branch, "address_line1", ""),
            "city": getattr(branch, "city", ""),
            "state": getattr(branch, "state", ""),
            "pincode": getattr(branch, "pincode", ""),
        },
        "discount": discount,
        "categories": [
            {"category_id": c.category_id, "category_name": c.category_name}
            for c in cats
        ],
        "items": item_list,
        "slug": _make_slug(shop.shop_name or "", branch.branch_name or ""),
    }


@router.get("/{slug}/{token}/bootstrap")
def public_menu_bootstrap_with_slug(slug: str, token: str, db: Session = Depends(get_db)):
    return _bootstrap(token, db)


@router.get("/{token}/bootstrap")
def public_menu_bootstrap(token: str, db: Session = Depends(get_db)):
    return _bootstrap(token, db)
