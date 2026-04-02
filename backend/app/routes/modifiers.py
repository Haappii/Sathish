from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.modifier import ModifierGroup, Modifier, ItemModifierGroup, OrderItemModifier
from app.utils.permissions import require_permission
from app.utils.shop_type import ensure_hotel_billing_type

router = APIRouter(prefix="/modifiers", tags=["Modifiers"])


# ── MODIFIER GROUPS ───────────────────────────────────────────────────────────

@router.get("/groups")
def list_groups(
    db: Session = Depends(get_db),
    user=Depends(require_permission("items", "read")),
):
    ensure_hotel_billing_type(db, user.shop_id)
    groups = db.query(ModifierGroup).filter(ModifierGroup.shop_id == user.shop_id).all()
    return [
        {
            "group_id": g.group_id,
            "name": g.name,
            "required": g.required,
            "multi_select": g.multi_select,
            "min_selections": g.min_selections,
            "max_selections": g.max_selections,
            "modifiers": [
                {"modifier_id": m.modifier_id, "name": m.name, "extra_price": float(m.extra_price), "is_active": m.is_active}
                for m in g.modifiers
            ],
        }
        for g in groups
    ]


@router.post("/groups")
def create_group(
    payload: dict,
    db: Session = Depends(get_db),
    user=Depends(require_permission("items", "write")),
):
    group = ModifierGroup(
        shop_id=user.shop_id,
        name=payload["name"],
        required=bool(payload.get("required", False)),
        multi_select=bool(payload.get("multi_select", True)),
        min_selections=int(payload.get("min_selections", 0)),
        max_selections=int(payload.get("max_selections", 0)),
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    return {"group_id": group.group_id, "name": group.name}


@router.put("/groups/{group_id}")
def update_group(
    group_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    user=Depends(require_permission("items", "write")),
):
    group = db.query(ModifierGroup).filter(
        ModifierGroup.group_id == group_id, ModifierGroup.shop_id == user.shop_id
    ).first()
    if not group:
        raise HTTPException(404, "Modifier group not found")

    for field in ("name", "required", "multi_select", "min_selections", "max_selections"):
        if field in payload:
            setattr(group, field, payload[field])
    db.commit()
    return {"success": True}


@router.delete("/groups/{group_id}")
def delete_group(
    group_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("items", "write")),
):
    group = db.query(ModifierGroup).filter(
        ModifierGroup.group_id == group_id, ModifierGroup.shop_id == user.shop_id
    ).first()
    if not group:
        raise HTTPException(404, "Modifier group not found")
    db.delete(group)
    db.commit()
    return {"success": True}


# ── MODIFIERS ─────────────────────────────────────────────────────────────────

@router.post("/groups/{group_id}/modifiers")
def add_modifier(
    group_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    user=Depends(require_permission("items", "write")),
):
    group = db.query(ModifierGroup).filter(
        ModifierGroup.group_id == group_id, ModifierGroup.shop_id == user.shop_id
    ).first()
    if not group:
        raise HTTPException(404, "Modifier group not found")

    mod = Modifier(
        shop_id=user.shop_id,
        group_id=group_id,
        name=payload["name"],
        extra_price=float(payload.get("extra_price", 0)),
        is_active=bool(payload.get("is_active", True)),
    )
    db.add(mod)
    db.commit()
    db.refresh(mod)
    return {"modifier_id": mod.modifier_id, "name": mod.name}


@router.put("/modifiers/{modifier_id}")
def update_modifier(
    modifier_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    user=Depends(require_permission("items", "write")),
):
    mod = db.query(Modifier).filter(
        Modifier.modifier_id == modifier_id, Modifier.shop_id == user.shop_id
    ).first()
    if not mod:
        raise HTTPException(404, "Modifier not found")

    for field in ("name", "extra_price", "is_active"):
        if field in payload:
            setattr(mod, field, payload[field])
    db.commit()
    return {"success": True}


@router.delete("/modifiers/{modifier_id}")
def delete_modifier(
    modifier_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("items", "write")),
):
    mod = db.query(Modifier).filter(
        Modifier.modifier_id == modifier_id, Modifier.shop_id == user.shop_id
    ).first()
    if not mod:
        raise HTTPException(404, "Modifier not found")
    db.delete(mod)
    db.commit()
    return {"success": True}


# ── LINK MODIFIER GROUPS TO ITEMS ─────────────────────────────────────────────

@router.get("/item/{item_id}")
def get_item_modifiers(
    item_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("items", "read")),
):
    links = db.query(ItemModifierGroup).filter(
        ItemModifierGroup.item_id == item_id,
        ItemModifierGroup.shop_id == user.shop_id,
    ).all()
    return [
        {
            "group_id": lnk.group_id,
            "name": lnk.group.name,
            "required": lnk.group.required,
            "multi_select": lnk.group.multi_select,
            "modifiers": [
                {"modifier_id": m.modifier_id, "name": m.name, "extra_price": float(m.extra_price)}
                for m in lnk.group.modifiers if m.is_active
            ],
        }
        for lnk in links
    ]


@router.post("/item/{item_id}/link/{group_id}")
def link_group_to_item(
    item_id: int,
    group_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("items", "write")),
):
    existing = db.query(ItemModifierGroup).filter(
        ItemModifierGroup.item_id == item_id,
        ItemModifierGroup.group_id == group_id,
        ItemModifierGroup.shop_id == user.shop_id,
    ).first()
    if existing:
        return {"success": True, "message": "Already linked"}

    db.add(ItemModifierGroup(shop_id=user.shop_id, item_id=item_id, group_id=group_id))
    db.commit()
    return {"success": True}


@router.delete("/item/{item_id}/link/{group_id}")
def unlink_group_from_item(
    item_id: int,
    group_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("items", "write")),
):
    link = db.query(ItemModifierGroup).filter(
        ItemModifierGroup.item_id == item_id,
        ItemModifierGroup.group_id == group_id,
        ItemModifierGroup.shop_id == user.shop_id,
    ).first()
    if not link:
        raise HTTPException(404, "Link not found")
    db.delete(link)
    db.commit()
    return {"success": True}
