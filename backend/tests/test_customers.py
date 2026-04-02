"""Customers endpoint tests."""


def test_list_customers_authenticated(client, auth_headers):
    resp = client.get("/api/customers/", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_list_customers_pagination(client, auth_headers):
    resp = client.get("/api/customers/?skip=0&limit=5", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()) <= 5


def test_create_customer(client, auth_headers):
    resp = client.post(
        "/api/customers/",
        json={
            "customer_name": "Ravi Kumar",
            "mobile": "9876543210",
            "status": "ACTIVE",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["customer_name"] == "Ravi Kumar"
    assert data["mobile"] == "9876543210"


def test_create_customer_invalid_mobile(client, auth_headers):
    resp = client.post(
        "/api/customers/",
        json={"customer_name": "Bad Mobile", "mobile": "123"},
        headers=auth_headers,
    )
    assert resp.status_code == 400


def test_get_customer_by_mobile(client, auth_headers):
    # Create first
    client.post(
        "/api/customers/",
        json={"customer_name": "Priya S", "mobile": "9123456789"},
        headers=auth_headers,
    )
    resp = client.get("/api/customers/by-mobile/9123456789", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["customer_name"] == "Priya S"


def test_get_customer_not_found(client, auth_headers):
    resp = client.get("/api/customers/99999", headers=auth_headers)
    assert resp.status_code == 404


def test_search_customers(client, auth_headers):
    resp = client.get("/api/customers/search?q=Ravi", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
