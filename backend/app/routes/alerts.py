from __future__ import annotations

from datetime import datetime, date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.branch import Branch
from app.models.day_close import BranchDayClose
from app.models.cash_drawer import CashShift
from app.models.items import Item
from app.models.shop_details import ShopDetails
from app.models.stock import Inventory
from app.services.inventory_service import is_inventory_enabled
from app.utils.permissions import require_permission

router = APIRouter(prefix="/alerts", tags=["Alerts"])


def resolve_branch(branch_id_param, user) -> int | None:
    role = str(getattr(user, "role_name", "") or "").strip().lower()
    if role == "admin":
        if branch_id_param in (None, "", "all"):
            return None
        try:
            return int(branch_id_param)
        except (TypeError, ValueError):
            raise HTTPException(400, "Invalid branch_id")
    try:
        return int(getattr(user, "branch_id", None))
    except (TypeError, ValueError):
        raise HTTPException(400, "Branch required")


def business_date(db: Session, shop_id: int) -> date:
    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == shop_id).first()
    return shop.app_date if shop and shop.app_date else datetime.utcnow().date()


@router.get("/summary")
def alerts_summary(
    branch_id: int | str | None = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_permission("alerts", "read")),
):
    bid = resolve_branch(branch_id, user)
    d = business_date(db, user.shop_id)

    # Low stock
    low_stock_items = []
    low_stock_count = 0
    if is_inventory_enabled(db, user.shop_id):
        q = (
            db.query(
                Inventory.item_id,
                Item.item_name,
                Inventory.quantity,
                Inventory.min_stock,
            )
            .join(Item, Item.item_id == Inventory.item_id)
            .filter(Inventory.shop_id == user.shop_id)
            .filter(Inventory.min_stock > 0, Inventory.quantity < Inventory.min_stock)
        )
        if bid is not None:
            q = q.filter(Inventory.branch_id == bid)
        low_stock_count = int(q.count() or 0)
        rows = q.order_by((Inventory.min_stock - Inventory.quantity).desc()).limit(10).all()
        low_stock_items = [
            {
                "item_id": r.item_id,
                "item_name": r.item_name,
                "quantity": int(r.quantity or 0),
                "min_stock": int(r.min_stock or 0),
                "short_by": int(r.min_stock or 0) - int(r.quantity or 0),
            }
            for r in rows
        ]

    # Day-close pending (shop date)
    branches = (
        db.query(Branch)
        .filter(Branch.shop_id == user.shop_id, Branch.status == "ACTIVE")
        .order_by(Branch.branch_id)
        .all()
    )
    closed_ids = set(
        r[0]
        for r in db.query(BranchDayClose.branch_id)
        .filter(BranchDayClose.shop_id == user.shop_id, BranchDayClose.close_date == d)
        .all()
    )
    day_close_pending = [
        {"branch_id": b.branch_id, "branch_name": b.branch_name}
        for b in branches
        if b.branch_id not in closed_ids and (bid is None or b.branch_id == bid)
    ]

    # Open cashier shifts
    shift_q = (
        db.query(CashShift.branch_id, func.count(CashShift.shift_id).label("open_shifts"))
        .filter(CashShift.shop_id == user.shop_id, CashShift.status == "OPEN")
    )
    if bid is not None:
        shift_q = shift_q.filter(CashShift.branch_id == bid)
    open_shift_rows = shift_q.group_by(CashShift.branch_id).all()
    open_shifts = [
        {"branch_id": r.branch_id, "open_shifts": int(r.open_shifts or 0)}
        for r in open_shift_rows
    ]

    return {
        "business_date": d.strftime("%Y-%m-%d"),
        "low_stock_count": low_stock_count,
        "low_stock_top": low_stock_items,
        "day_close_pending": day_close_pending,
        "open_shifts": open_shifts,
    }

