from datetime import datetime, timedelta

from app.models.category import Category
from app.models.items import Item
from app.models.shop_details import ShopDetails
from app.models.table_billing import Order, OrderItem, TableMaster


def _enable_hotel_billing(db_session):
    shop = db_session.query(ShopDetails).filter(ShopDetails.shop_id == 1).first()
    previous = shop.billing_type
    shop.billing_type = "hotel"
    db_session.add(shop)
    db_session.commit()
    return previous


def _create_table(db_session, *, table_name: str) -> TableMaster:
    table = TableMaster(
        shop_id=1,
        branch_id=1,
        table_name=table_name,
        capacity=4,
        status="FREE",
    )
    db_session.add(table)
    db_session.commit()
    db_session.refresh(table)
    return table


def _create_item(db_session, *, item_name: str) -> Item:
    category = Category(
        shop_id=1,
        branch_id=1,
        category_name=f"{item_name} Category",
        category_status=True,
    )
    db_session.add(category)
    db_session.commit()
    db_session.refresh(category)

    item = Item(
        shop_id=1,
        branch_id=1,
        category_id=category.category_id,
        item_name=item_name,
        price=120.0,
        buy_price=60.0,
        mrp_price=130.0,
        item_status=True,
        is_raw_material=False,
    )
    db_session.add(item)
    db_session.commit()
    db_session.refresh(item)
    return item


def test_starting_table_sets_and_returns_table_start_time(
    client,
    auth_headers,
    db_session,
):
    previous_billing_type = _enable_hotel_billing(db_session)
    table = _create_table(db_session, table_name="T-Start-01")

    try:
        before_start = datetime.now() - timedelta(seconds=1)
        start_resp = client.get(
            f"/api/table-billing/order/by-table/{table.table_id}",
            headers=auth_headers,
        )
        after_start = datetime.now() + timedelta(seconds=1)

        assert start_resp.status_code == 200, start_resp.text

        list_resp = client.get("/api/table-billing/tables", headers=auth_headers)
        assert list_resp.status_code == 200, list_resp.text

        row = next((item for item in list_resp.json() if item["table_id"] == table.table_id), None)
        assert row is not None
        assert row["status"] == "OCCUPIED"
        assert row["order_id"] is not None
        assert row["table_start_time"] is not None
        assert row["opened_at"] == row["table_start_time"]

        started_at = datetime.fromisoformat(row["table_start_time"])
        assert before_start <= started_at <= after_start

        db_session.expire_all()
        table = db_session.query(TableMaster).filter(TableMaster.table_id == table.table_id).first()
        order = (
            db_session.query(Order)
            .filter(Order.table_id == table.table_id, Order.status == "OPEN")
            .first()
        )

        assert table is not None
        assert table.status == "OCCUPIED"
        assert table.table_start_time is not None
        assert before_start <= table.table_start_time <= after_start
        assert order is not None
    finally:
        db_session.expire_all()
        order = (
            db_session.query(Order)
            .filter(Order.table_id == table.table_id)
            .first()
        )
        table_row = (
            db_session.query(TableMaster)
            .filter(TableMaster.table_id == table.table_id)
            .first()
        )
        shop = db_session.query(ShopDetails).filter(ShopDetails.shop_id == 1).first()

        if order is not None:
            db_session.delete(order)
        if table_row is not None:
            db_session.delete(table_row)
        if shop is not None:
            shop.billing_type = previous_billing_type
            db_session.add(shop)
        db_session.commit()


def test_clear_order_removes_items_but_keeps_table_running(
    client,
    auth_headers,
    db_session,
):
    previous_billing_type = _enable_hotel_billing(db_session)
    table = _create_table(db_session, table_name="T-Clear-01")
    item = _create_item(db_session, item_name="Clear Test Item")

    try:
        start_resp = client.get(
            f"/api/table-billing/order/by-table/{table.table_id}",
            headers=auth_headers,
        )
        assert start_resp.status_code == 200, start_resp.text
        order_id = start_resp.json()["order_id"]

        add_resp = client.post(
            "/api/table-billing/order/item/add",
            params={"order_id": order_id, "item_id": item.item_id, "qty": 2},
            headers=auth_headers,
        )
        assert add_resp.status_code == 200, add_resp.text

        clear_resp = client.post(
            f"/api/table-billing/order/clear/{order_id}",
            headers=auth_headers,
        )
        assert clear_resp.status_code == 200, clear_resp.text
        assert clear_resp.json()["success"] is True
        assert clear_resp.json()["removed_count"] == 1

        refreshed = client.get(
            f"/api/table-billing/order/by-table/{table.table_id}",
            headers=auth_headers,
        )
        assert refreshed.status_code == 200, refreshed.text
        assert refreshed.json()["order_id"] == order_id
        assert refreshed.json()["items"] == []

        db_session.expire_all()
        table_row = (
            db_session.query(TableMaster)
            .filter(TableMaster.table_id == table.table_id)
            .first()
        )
        order_row = (
            db_session.query(Order)
            .filter(Order.order_id == order_id)
            .first()
        )
        item_rows = (
            db_session.query(OrderItem)
            .filter(OrderItem.order_id == order_id)
            .all()
        )

        assert table_row is not None
        assert table_row.status == "OCCUPIED"
        assert table_row.table_start_time is not None
        assert order_row is not None
        assert order_row.status == "OPEN"
        assert item_rows == []
    finally:
        db_session.expire_all()
        order = (
            db_session.query(Order)
            .filter(Order.table_id == table.table_id)
            .first()
        )
        table_row = (
            db_session.query(TableMaster)
            .filter(TableMaster.table_id == table.table_id)
            .first()
        )
        item_row = db_session.query(Item).filter(Item.item_id == item.item_id).first()
        category_row = (
            db_session.query(Category)
            .filter(Category.category_id == item.category_id)
            .first()
        )
        shop = db_session.query(ShopDetails).filter(ShopDetails.shop_id == 1).first()

        if order is not None:
            db_session.delete(order)
        if table_row is not None:
            db_session.delete(table_row)
        if item_row is not None:
            db_session.delete(item_row)
        if category_row is not None:
            db_session.delete(category_row)
        if shop is not None:
            shop.billing_type = previous_billing_type
            db_session.add(shop)
        db_session.commit()
