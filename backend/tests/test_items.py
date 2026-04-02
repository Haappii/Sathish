"""Items endpoint tests."""
import pytest


def test_list_items_authenticated(client, auth_headers):
    resp = client.get("/api/items/", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_list_items_pagination(client, auth_headers):
    resp = client.get("/api/items/?skip=0&limit=10", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
    assert len(resp.json()) <= 10


def test_list_items_limit_enforced(client, auth_headers):
    # limit above max (2000) should be rejected
    resp = client.get("/api/items/?limit=9999", headers=auth_headers)
    assert resp.status_code == 422


def test_create_item_missing_category(client, auth_headers):
    resp = client.post(
        "/api/items/",
        json={
            "item_name": "Ghost Item",
            "category_id": 9999,
            "price": 10.0,
            "buy_price": 5.0,
            "mrp_price": 12.0,
            "item_status": True,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 400


def test_create_and_list_item(client, auth_headers, db_session):
    # First create a category directly in the DB
    from app.models.category import Category
    cat = Category(shop_id=1, branch_id=None, category_name="TestCat", category_status=True)
    db_session.add(cat)
    db_session.commit()
    db_session.refresh(cat)

    resp = client.post(
        "/api/items/",
        json={
            "item_name": "Test Widget",
            "category_id": cat.category_id,
            "price": 99.0,
            "buy_price": 50.0,
            "mrp_price": 110.0,
            "item_status": True,
            "min_stock": 5,
        },
        headers={**auth_headers, "x-branch-id": "1"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["item_name"] == "Test Widget"
    assert data["price"] == 99.0

    # Verify it appears in the list
    list_resp = client.get("/api/items/", headers={**auth_headers, "x-branch-id": "1"})
    names = [i["item_name"] for i in list_resp.json()]
    assert "Test Widget" in names
