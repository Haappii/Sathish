from app.models.category import Category
from app.models.items import Item
from app.models.shop_details import ShopDetails
from app.models.supplier import Supplier


def _create_category(db_session, *, name: str) -> Category:
    category = Category(
        shop_id=1,
        branch_id=None,
        category_name=name,
        category_status=True,
    )
    db_session.add(category)
    db_session.commit()
    db_session.refresh(category)
    return category


def _create_item(
    db_session,
    *,
    category_id: int,
    name: str,
    is_raw_material: bool,
) -> Item:
    item = Item(
        shop_id=1,
        branch_id=None,
        category_id=category_id,
        item_name=name,
        price=120.0,
        buy_price=60.0,
        mrp_price=130.0,
        item_status=True,
        is_raw_material=is_raw_material,
    )
    db_session.add(item)
    db_session.commit()
    db_session.refresh(item)
    return item


def _create_supplier(db_session, *, name: str) -> Supplier:
    supplier = Supplier(
        shop_id=1,
        branch_id=1,
        supplier_name=name,
        phone="9876543210",
        status="ACTIVE",
    )
    db_session.add(supplier)
    db_session.commit()
    db_session.refresh(supplier)
    return supplier


def test_hotel_purchase_orders_allow_only_raw_materials(client, auth_headers, db_session):
    shop = db_session.query(ShopDetails).filter(ShopDetails.shop_id == 1).first()
    previous_billing_type = shop.billing_type
    shop.billing_type = "hotel"
    db_session.add(shop)
    db_session.commit()

    category = _create_category(db_session, name="PO Raw Materials")
    raw_item = _create_item(
        db_session,
        category_id=category.category_id,
        name="Hotel Rice Bag",
        is_raw_material=True,
    )
    selling_item = _create_item(
        db_session,
        category_id=category.category_id,
        name="Ready-to-Serve Meal",
        is_raw_material=False,
    )
    supplier = _create_supplier(db_session, name="Hotel Supplier")

    try:
        blocked = client.post(
            "/api/purchase-orders/",
            json={
                "supplier_id": supplier.supplier_id,
                "branch_id": 1,
                "items": [
                    {
                        "item_id": selling_item.item_id,
                        "qty": 2,
                        "unit_cost": 75,
                    }
                ],
            },
            headers=auth_headers,
        )

        assert blocked.status_code == 400, blocked.text
        assert "raw materials only" in blocked.json()["detail"].lower()

        allowed = client.post(
            "/api/purchase-orders/",
            json={
                "supplier_id": supplier.supplier_id,
                "branch_id": 1,
                "items": [
                    {
                        "item_id": raw_item.item_id,
                        "qty": 3,
                        "unit_cost": 42,
                    }
                ],
            },
            headers=auth_headers,
        )

        assert allowed.status_code == 200, allowed.text
        data = allowed.json()
        assert data["items"][0]["item_id"] == raw_item.item_id
        assert data["items"][0]["item_name"] == raw_item.item_name
        assert data["total_amount"] == 126.0
    finally:
        shop = db_session.query(ShopDetails).filter(ShopDetails.shop_id == 1).first()
        shop.billing_type = previous_billing_type
        db_session.add(shop)
        db_session.commit()
