from __future__ import annotations

from sqlalchemy.orm import Session

from app.scripts.sample_seed_common import (
    _ensure_inventory_enabled,
    _mk_branch,
    _mk_category,
    _mk_employee_and_attendance,
    _mk_invoice,
    _mk_item,
    _mk_shop,
    _mk_stock,
    _mk_user,
)


def seed_sample_shop(db: Session) -> dict:
    shop = _mk_shop(db, billing_type="store", shop_name="Sample Store")
    _ensure_inventory_enabled(db, shop_id=int(shop.shop_id))

    branch = _mk_branch(db, shop_id=int(shop.shop_id), name="Head Office", type_="Head Office")

    admin = _mk_user(
        db,
        shop_id=int(shop.shop_id),
        branch_id=int(branch.branch_id),
        username="admin",
        password="admin123",
        name="Store Admin",
        role_name="Admin",
    )
    _mk_user(
        db,
        shop_id=int(shop.shop_id),
        branch_id=int(branch.branch_id),
        username="manager",
        password="manager123",
        name="Store Manager",
        role_name="Manager",
    )

    cat = _mk_category(db, shop_id=int(shop.shop_id), name="Grocery")
    sellable = _mk_item(
        db,
        shop_id=int(shop.shop_id),
        category_id=int(cat.category_id),
        name="RICE 1KG",
        price=60,
        buy_price=45,
        mrp_price=65,
        is_raw_material=False,
        min_stock=10,
    )

    # Inventory in shops tracks sellable items
    _mk_stock(db, shop_id=int(shop.shop_id), branch_id=int(branch.branch_id), item_id=int(sellable.item_id), qty=25, min_stock=10)

    # Employee wages + a sample invoice for reports
    _mk_employee_and_attendance(db, shop_id=int(shop.shop_id), branch_id=int(branch.branch_id), user_id=int(admin.user_id), shop_date=shop.app_date)
    _mk_invoice(db, shop_id=int(shop.shop_id), branch_id=int(branch.branch_id), user_id=int(admin.user_id), item=sellable, qty=2)

    return {
        "shop_id": int(shop.shop_id),
        "branch_id": int(branch.branch_id),
        "admin_username": "admin",
        "admin_password": "admin123",
        "manager_username": "manager",
        "manager_password": "manager123",
    }


def main() -> None:
    from app.db import SessionLocal
    from app.services.role_service import ensure_core_roles

    db = SessionLocal()
    try:
        ensure_core_roles(db)
        info = seed_sample_shop(db)
        print("Seeded sample SHOP:", info)
    finally:
        db.close()


if __name__ == "__main__":
    main()

