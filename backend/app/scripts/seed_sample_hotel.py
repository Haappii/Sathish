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


def seed_sample_hotel(db: Session) -> dict:
    shop = _mk_shop(db, billing_type="hotel", shop_name="Sample Hotel")
    _ensure_inventory_enabled(db, shop_id=int(shop.shop_id))

    branch = _mk_branch(db, shop_id=int(shop.shop_id), name="Head Office", type_="Head Office")

    admin = _mk_user(
        db,
        shop_id=int(shop.shop_id),
        branch_id=int(branch.branch_id),
        username="admin",
        password="admin123",
        name="Hotel Admin",
        role_name="Admin",
    )
    _mk_user(
        db,
        shop_id=int(shop.shop_id),
        branch_id=int(branch.branch_id),
        username="manager",
        password="manager123",
        name="Hotel Manager",
        role_name="Manager",
    )

    cat_raw = _mk_category(db, shop_id=int(shop.shop_id), name="Raw Materials")
    cat_menu = _mk_category(db, shop_id=int(shop.shop_id), name="Menu")

    raw_rice = _mk_item(
        db,
        shop_id=int(shop.shop_id),
        category_id=int(cat_raw.category_id),
        name="RICE (RAW)",
        price=0,
        buy_price=0,
        mrp_price=0,
        is_raw_material=True,
        min_stock=5,
    )
    raw_oil = _mk_item(
        db,
        shop_id=int(shop.shop_id),
        category_id=int(cat_raw.category_id),
        name="OIL (RAW)",
        price=0,
        buy_price=0,
        mrp_price=0,
        is_raw_material=True,
        min_stock=2,
    )

    menu_item = _mk_item(
        db,
        shop_id=int(shop.shop_id),
        category_id=int(cat_menu.category_id),
        name="VEG FRIED RICE",
        price=120,
        buy_price=0,
        mrp_price=0,
        is_raw_material=False,
        min_stock=0,
    )

    # Inventory in hotels tracks raw materials only
    _mk_stock(db, shop_id=int(shop.shop_id), branch_id=int(branch.branch_id), item_id=int(raw_rice.item_id), qty=20, min_stock=5)
    _mk_stock(db, shop_id=int(shop.shop_id), branch_id=int(branch.branch_id), item_id=int(raw_oil.item_id), qty=10, min_stock=2)

    _mk_employee_and_attendance(db, shop_id=int(shop.shop_id), branch_id=int(branch.branch_id), user_id=int(admin.user_id), shop_date=shop.app_date)
    _mk_invoice(db, shop_id=int(shop.shop_id), branch_id=int(branch.branch_id), user_id=int(admin.user_id), item=menu_item, qty=2)

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
        info = seed_sample_hotel(db)
        print("Seeded sample HOTEL:", info)
    finally:
        db.close()


if __name__ == "__main__":
    main()

