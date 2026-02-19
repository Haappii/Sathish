from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.models.stock import Inventory
from app.models.items import Item
from app.models.system_parameters import SystemParameters
from app.models.stock_ledger import StockLedger   # ✅ ADDED


# =========================================================
# CHECK IF INVENTORY MODE IS ENABLED
# =========================================================
def is_inventory_enabled(db: Session, shop_id: int) -> bool:
    param = (
        db.query(SystemParameters)
        .filter(
            SystemParameters.shop_id == shop_id,
            SystemParameters.param_key == "inventory_enabled"
        )
        .first()
    )
    return (param and param.param_value == "YES")


# =========================================================
# ENSURE ROW EXISTS FOR ITEM + BRANCH
# =========================================================
def ensure_stock_row(db: Session, shop_id: int, item_id: int, branch_id: int) -> Inventory:
    row = (
        db.query(Inventory)
        .filter(
            Inventory.shop_id == shop_id,
            Inventory.item_id == item_id,
            Inventory.branch_id == branch_id
        )
        .first()
    )

    if not row:
        row = Inventory(
            shop_id=shop_id,
            item_id=item_id,
            branch_id=branch_id,
            quantity=0,
            min_stock=0
        )
        db.add(row)
        db.commit()
        db.refresh(row)

    return row


# =========================================================
# GET STOCK OF ONE ITEM (BRANCH-WISE)
# =========================================================
def get_stock(db: Session, shop_id: int, item_id: int, branch_id: int) -> int:
    row = (
        db.query(Inventory)
        .filter(
            Inventory.shop_id == shop_id,
            Inventory.item_id == item_id,
            Inventory.branch_id == branch_id
        )
        .first()
    )
    return row.quantity if row else 0


# =========================================================
# ADJUST STOCK (+ / −) WITH LEDGER
# =========================================================
def adjust_stock(
    db: Session,
    shop_id: int,
    item_id: int,
    branch_id: int,
    qty: int,
    mode: str,
    ref_no: str | None = None
) -> bool:

    row = ensure_stock_row(db, shop_id, item_id, branch_id)

    if mode == "ADD":
        row.quantity += qty

    elif mode == "REMOVE":
        if row.quantity < qty:
            return False
        row.quantity -= qty

    # ✅ STOCK LEDGER ENTRY
    db.add(StockLedger(
        shop_id=shop_id,
        item_id=item_id,
        branch_id=branch_id,
        change_type=mode,
        quantity=qty,
        reference_no=ref_no
    ))

    db.commit()
    db.refresh(row)
    return True


# =========================================================
# UPDATE MINIMUM STOCK
# =========================================================
def update_min_stock(db: Session, shop_id: int, item_id: int, branch_id: int, min_stock: int):
    row = ensure_stock_row(db, shop_id, item_id, branch_id)
    row.min_stock = min_stock
    db.commit()
    db.refresh(row)
    return row


# =========================================================
# LIST STOCK FOR ONE BRANCH (JOIN WITH ITEM NAME)
# =========================================================
def get_branch_stock_rows(
    db: Session,
    shop_id: int,
    branch_id: int,
    *,
    raw_only: bool = False,
    exclude_raw: bool = False,
):
    q = (
        db.query(
            Inventory.item_id,
            Item.item_name,
            Inventory.quantity,
            Inventory.min_stock
        )
        .join(Item, Item.item_id == Inventory.item_id)
        .filter(Inventory.shop_id == shop_id, Inventory.branch_id == branch_id)
        .order_by(desc(Inventory.quantity))
    )

    if raw_only:
        q = q.filter(Item.is_raw_material == True)
    if exclude_raw:
        q = q.filter(Item.is_raw_material == False)

    return q
