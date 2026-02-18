from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.items import Item
from app.models.stock import Inventory
from app.models.stock_ledger import StockLedger   # ✅ ADDED

from app.services.inventory_service import (
    is_inventory_enabled,
    ensure_stock_row,
    adjust_stock,
    update_min_stock,
    get_branch_stock_rows,
)

from app.services.audit_service import log_action
from app.utils.permissions import require_permission
from app.utils.shop_type import get_shop_billing_type

router = APIRouter(prefix="/inventory", tags=["Inventory"])


def resolve_branch(branch_id_param, user):
    """
    Admin  -> may use param OR active session branch
    Normal -> always forced to own branch
    """
    role = str(getattr(user, "role_name", "") or "").strip().lower()
    if role == "admin":
        branch_raw = branch_id_param if branch_id_param not in (None, "") else getattr(user, "branch_id", None)
    else:
        branch_raw = getattr(user, "branch_id", None)

    try:
        return int(branch_raw)
    except (TypeError, ValueError):
        raise HTTPException(400, "Branch required")


# =========================
# LIST STOCK
# =========================
@router.get("/list")
def list_stock(
    branch_id: int = Query(None),
    db: Session = Depends(get_db),
    user = Depends(require_permission("inventory", "read"))
):
    if not is_inventory_enabled(db, user.shop_id):
        return []

    branch = resolve_branch(branch_id, user)

    is_hotel = get_shop_billing_type(db, user.shop_id) == "hotel"
    rows = get_branch_stock_rows(db, user.shop_id, branch, raw_only=is_hotel)

    return [
        {
            "item_id": r.item_id,
            "item_name": r.item_name,
            "quantity": r.quantity,
            "min_stock": r.min_stock
        }
        for r in rows
    ]


# =========================
# ADD STOCK
# =========================
@router.post("/add")
def add_stock(
    item_id: int,
    qty: int,
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user = Depends(require_permission("inventory", "write"))
):
    if not is_inventory_enabled(db, user.shop_id):
        raise HTTPException(400, "Inventory mode disabled")

    branch = resolve_branch(branch_id, user)

    is_hotel = get_shop_billing_type(db, user.shop_id) == "hotel"
    if is_hotel:
        it = (
            db.query(Item)
            .filter(Item.item_id == item_id, Item.shop_id == user.shop_id)
            .first()
        )
        if not it:
            raise HTTPException(404, "Item not found")
        if not bool(getattr(it, "is_raw_material", False)):
            raise HTTPException(400, "Inventory is for raw materials only")

    ensure_stock_row(db, user.shop_id, item_id, branch)
    adjust_stock(db, user.shop_id, item_id, branch, qty, "ADD")

    log_action(
        db,
        shop_id=user.shop_id,
        module="Inventory",
        action="STOCK_ADD",
        record_id=f"{item_id}@{branch}",
        new={"item_id": item_id, "branch_id": branch, "qty": qty},
        user_id=user.user_id,
    )

    return {"success": True, "message": "Stock increased"}


# =========================
# REMOVE STOCK
# =========================
@router.post("/remove")
def remove_stock(
    item_id: int,
    qty: int,
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user = Depends(require_permission("inventory", "write"))
):
    if not is_inventory_enabled(db, user.shop_id):
        raise HTTPException(400, "Inventory mode disabled")

    branch = resolve_branch(branch_id, user)

    is_hotel = get_shop_billing_type(db, user.shop_id) == "hotel"
    if is_hotel:
        it = (
            db.query(Item)
            .filter(Item.item_id == item_id, Item.shop_id == user.shop_id)
            .first()
        )
        if not it:
            raise HTTPException(404, "Item not found")
        if not bool(getattr(it, "is_raw_material", False)):
            raise HTTPException(400, "Inventory is for raw materials only")

    ensure_stock_row(db, user.shop_id, item_id, branch)
    ok = adjust_stock(db, user.shop_id, item_id, branch, qty, "REMOVE")

    if not ok:
        raise HTTPException(400, "Insufficient stock")

    log_action(
        db,
        shop_id=user.shop_id,
        module="Inventory",
        action="STOCK_REMOVE",
        record_id=f"{item_id}@{branch}",
        new={"item_id": item_id, "branch_id": branch, "qty": qty},
        user_id=user.user_id,
    )

    return {"success": True, "message": "Stock reduced"}


# =========================
# UPDATE MIN STOCK
# =========================
@router.post("/min-stock")
def set_min_stock(
    item_id: int,
    min_stock: int,
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user = Depends(require_permission("inventory", "write"))
):
    if not is_inventory_enabled(db, user.shop_id):
        raise HTTPException(400, "Inventory mode disabled")

    branch = resolve_branch(branch_id, user)

    is_hotel = get_shop_billing_type(db, user.shop_id) == "hotel"
    if is_hotel:
        it = (
            db.query(Item)
            .filter(Item.item_id == item_id, Item.shop_id == user.shop_id)
            .first()
        )
        if not it:
            raise HTTPException(404, "Item not found")
        if not bool(getattr(it, "is_raw_material", False)):
            raise HTTPException(400, "Inventory is for raw materials only")

    update_min_stock(db, user.shop_id, item_id, branch, min_stock)

    log_action(
        db,
        shop_id=user.shop_id,
        module="Inventory",
        action="MIN_STOCK",
        record_id=f"{item_id}@{branch}",
        new={"item_id": item_id, "branch_id": branch, "min_stock": min_stock},
        user_id=user.user_id,
    )

    return {"success": True, "message": "Min stock updated"}


# =========================
# STOCK HISTORY (LEDGER)
# =========================
@router.get("/history")
def stock_history(
    item_id: int = Query(...),
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user = Depends(require_permission("inventory", "read"))
):
    if not is_inventory_enabled(db, user.shop_id):
        return []

    branch = resolve_branch(branch_id, user)
    is_hotel = get_shop_billing_type(db, user.shop_id) == "hotel"

    if is_hotel:
        it = (
            db.query(Item)
            .filter(Item.item_id == item_id, Item.shop_id == user.shop_id)
            .first()
        )
        if not it:
            raise HTTPException(404, "Item not found")
        if not bool(getattr(it, "is_raw_material", False)):
            return []

    rows = (
        db.query(StockLedger)
        .filter(
            StockLedger.item_id == item_id,
            StockLedger.branch_id == branch,
            StockLedger.shop_id == user.shop_id
        )
        .order_by(StockLedger.created_time.desc())
        .limit(100)
        .all()
    )

    return [
        {
            "mode": r.change_type,
            "qty": r.quantity,
            "ref_no": r.reference_no,
            "created_time": r.created_time.strftime("%Y-%m-%d %H:%M")
        }
        for r in rows
    ]


# =========================
# REORDER ALERTS
# =========================
@router.get("/reorder-alerts")
def reorder_alerts(
    branch_id: int | None = Query(None),
    db: Session = Depends(get_db),
    user = Depends(require_permission("inventory", "read"))
):
    if not is_inventory_enabled(db, user.shop_id):
        return []

    branch = resolve_branch(branch_id, user)
    is_hotel = get_shop_billing_type(db, user.shop_id) == "hotel"

    q = (
        db.query(
            Inventory.item_id,
            Item.item_name,
            Inventory.quantity,
            Inventory.min_stock
        )
        .join(Item, Item.item_id == Inventory.item_id)
        .filter(
            Inventory.shop_id == user.shop_id,
            Inventory.branch_id == branch,
            Inventory.min_stock > 0,
            Inventory.quantity < Inventory.min_stock
        )
    )
    if is_hotel:
        q = q.filter(Item.is_raw_material == True)

    rows = q.order_by((Inventory.min_stock - Inventory.quantity).desc()).all()

    return [
        {
            "item_id": r.item_id,
            "item_name": r.item_name,
            "quantity": r.quantity,
            "min_stock": r.min_stock,
            "short_by": int(r.min_stock or 0) - int(r.quantity or 0)
        }
        for r in rows
    ]
