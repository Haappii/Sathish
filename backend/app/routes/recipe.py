from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from decimal import Decimal

from app.db import get_db
from app.models.recipe import Recipe, RecipeIngredient
from app.models.items import Item
from app.utils.permissions import require_permission
from app.utils.shop_type import ensure_hotel_billing_type

router = APIRouter(prefix="/recipes", tags=["Recipes"])


def _food_cost(recipe: Recipe) -> float:
    """Calculate total ingredient cost for one serving of the recipe."""
    total = Decimal("0")
    for ing in recipe.ingredients:
        total += Decimal(str(ing.quantity)) * Decimal(str(ing.cost_per_unit or 0))
    servings = recipe.serving_size or 1
    return round(float(total / servings), 2)


def _to_out(recipe: Recipe, selling_price: float = 0) -> dict:
    cost = _food_cost(recipe)
    margin = round(selling_price - cost, 2) if selling_price else 0
    margin_pct = round((margin / selling_price) * 100, 1) if selling_price else 0
    return {
        "recipe_id": recipe.recipe_id,
        "item_id": recipe.item_id,
        "item_name": recipe.item.item_name if recipe.item else None,
        "selling_price": selling_price,
        "serving_size": recipe.serving_size,
        "notes": recipe.notes,
        "food_cost": cost,
        "gross_margin": margin,
        "margin_pct": margin_pct,
        "ingredients": [
            {
                "id": ing.id,
                "ingredient_item_id": ing.ingredient_item_id,
                "ingredient_name": ing.ingredient.item_name if ing.ingredient else None,
                "quantity": float(ing.quantity),
                "unit": ing.unit,
                "cost_per_unit": float(ing.cost_per_unit or 0),
                "line_cost": round(float(ing.quantity) * float(ing.cost_per_unit or 0), 2),
            }
            for ing in recipe.ingredients
        ],
    }


# ── LIST ALL RECIPES ──────────────────────────────────────────────────────────
@router.get("/")
def list_recipes(
    db: Session = Depends(get_db),
    user=Depends(require_permission("items", "read")),
):
    ensure_hotel_billing_type(db, user.shop_id)
    recipes = db.query(Recipe).filter(Recipe.shop_id == user.shop_id).all()
    result = []
    for r in recipes:
        price = float(r.item.selling_price or 0) if r.item and hasattr(r.item, "selling_price") else 0
        result.append(_to_out(r, price))
    return result


# ── GET ONE ───────────────────────────────────────────────────────────────────
@router.get("/{item_id}")
def get_recipe(
    item_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("items", "read")),
):
    recipe = db.query(Recipe).filter(
        Recipe.item_id == item_id, Recipe.shop_id == user.shop_id
    ).first()
    if not recipe:
        raise HTTPException(404, "Recipe not found for this item")

    item = db.query(Item).filter(Item.item_id == item_id).first()
    price = float(item.selling_price or 0) if item and hasattr(item, "selling_price") else 0
    return _to_out(recipe, price)


# ── CREATE / UPSERT RECIPE ────────────────────────────────────────────────────
@router.post("/")
def create_recipe(
    payload: dict,
    db: Session = Depends(get_db),
    user=Depends(require_permission("items", "write")),
):
    item_id = int(payload.get("item_id", 0))
    if not item_id:
        raise HTTPException(400, "item_id is required")

    item = db.query(Item).filter(Item.item_id == item_id, Item.shop_id == user.shop_id).first()
    if not item:
        raise HTTPException(404, "Item not found")

    existing = db.query(Recipe).filter(
        Recipe.item_id == item_id, Recipe.shop_id == user.shop_id
    ).first()
    if existing:
        raise HTTPException(400, "Recipe already exists for this item. Use PUT to update.")

    recipe = Recipe(
        shop_id=user.shop_id,
        item_id=item_id,
        serving_size=int(payload.get("serving_size", 1)),
        notes=(payload.get("notes") or "").strip() or None,
    )
    db.add(recipe)
    db.flush()

    for ing_data in payload.get("ingredients", []):
        db.add(RecipeIngredient(
            shop_id=user.shop_id,
            recipe_id=recipe.recipe_id,
            ingredient_item_id=int(ing_data["ingredient_item_id"]),
            quantity=float(ing_data["quantity"]),
            unit=(ing_data.get("unit") or "").strip() or None,
            cost_per_unit=float(ing_data.get("cost_per_unit", 0)),
        ))

    db.commit()
    db.refresh(recipe)
    price = float(item.selling_price or 0) if hasattr(item, "selling_price") else 0
    return _to_out(recipe, price)


# ── UPDATE RECIPE ─────────────────────────────────────────────────────────────
@router.put("/{recipe_id}")
def update_recipe(
    recipe_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    user=Depends(require_permission("items", "write")),
):
    recipe = db.query(Recipe).filter(
        Recipe.recipe_id == recipe_id, Recipe.shop_id == user.shop_id
    ).first()
    if not recipe:
        raise HTTPException(404, "Recipe not found")

    if "serving_size" in payload:
        recipe.serving_size = int(payload["serving_size"])
    if "notes" in payload:
        recipe.notes = (payload["notes"] or "").strip() or None

    # Replace ingredients if provided
    if "ingredients" in payload:
        for ing in recipe.ingredients:
            db.delete(ing)
        db.flush()
        for ing_data in payload["ingredients"]:
            db.add(RecipeIngredient(
                shop_id=user.shop_id,
                recipe_id=recipe_id,
                ingredient_item_id=int(ing_data["ingredient_item_id"]),
                quantity=float(ing_data["quantity"]),
                unit=(ing_data.get("unit") or "").strip() or None,
                cost_per_unit=float(ing_data.get("cost_per_unit", 0)),
            ))

    db.commit()
    db.refresh(recipe)
    item = recipe.item
    price = float(item.selling_price or 0) if item and hasattr(item, "selling_price") else 0
    return _to_out(recipe, price)


# ── DELETE RECIPE ─────────────────────────────────────────────────────────────
@router.delete("/{recipe_id}")
def delete_recipe(
    recipe_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("items", "write")),
):
    recipe = db.query(Recipe).filter(
        Recipe.recipe_id == recipe_id, Recipe.shop_id == user.shop_id
    ).first()
    if not recipe:
        raise HTTPException(404, "Recipe not found")
    db.delete(recipe)
    db.commit()
    return {"success": True}
