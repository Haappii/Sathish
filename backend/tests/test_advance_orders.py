"""Advance Orders endpoint tests."""


def test_create_and_list_advance_order(client, auth_headers):
    payload = {
        "customer_name": "Sathish",
        "customer_phone": "7904263246",
        "expected_date": "2026-04-14",
        "expected_time": "18:30",
        "notes": "Birthday order",
        "total_amount": 1000,
        "advance_amount": 500,
        "advance_payment_mode": "CASH",
        "order_items": [{"item_name": "MIXTURE", "qty": 1, "amount": 1000}],
        "branch_id": 1,
    }

    create_resp = client.post("/api/advance-orders/", json=payload, headers=auth_headers)
    assert create_resp.status_code == 200, create_resp.text
    data = create_resp.json()
    assert data["customer_name"] == "Sathish"
    assert data["status"] == "PENDING"
    assert data["expected_date"] == "2026-04-14"

    list_resp = client.get(
        "/api/advance-orders/?expected_date=2026-04-14",
        headers=auth_headers,
    )
    assert list_resp.status_code == 200, list_resp.text
    rows = list_resp.json()
    assert any(r["order_id"] == data["order_id"] for r in rows)


def test_advance_order_accepts_ddmmyyyy_date(client, auth_headers):
    payload = {
        "customer_name": "Locale Date",
        "expected_date": "14/04/2026",
        "total_amount": 300,
        "advance_amount": 100,
        "advance_payment_mode": "UPI",
        "branch_id": 1,
    }

    resp = client.post("/api/advance-orders/", json=payload, headers=auth_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["expected_date"] == "2026-04-14"


def test_update_and_delete_advance_order(client, auth_headers):
    payload = {
        "customer_name": "To Update",
        "expected_date": "2026-04-15",
        "total_amount": 400,
        "advance_amount": 150,
        "advance_payment_mode": "CARD",
        "branch_id": 1,
    }

    create_resp = client.post("/api/advance-orders/", json=payload, headers=auth_headers)
    assert create_resp.status_code == 200, create_resp.text
    order_id = create_resp.json()["order_id"]

    update_resp = client.put(
        f"/api/advance-orders/{order_id}",
        json={"status": "CONFIRMED", "notes": "Ready by 7PM"},
        headers=auth_headers,
    )
    assert update_resp.status_code == 200, update_resp.text
    assert update_resp.json()["status"] == "CONFIRMED"

    delete_resp = client.delete(f"/api/advance-orders/{order_id}", headers=auth_headers)
    assert delete_resp.status_code == 200, delete_resp.text
    assert delete_resp.json()["detail"] == "Advance order deleted"


def test_cannot_complete_advance_order_with_pending_due(client, auth_headers):
    payload = {
        "customer_name": "Due Pending",
        "expected_date": "2026-04-20",
        "total_amount": 900,
        "advance_amount": 200,
        "advance_payment_mode": "CASH",
        "branch_id": 1,
    }

    create_resp = client.post("/api/advance-orders/", json=payload, headers=auth_headers)
    assert create_resp.status_code == 200, create_resp.text
    order_id = create_resp.json()["order_id"]

    complete_resp = client.put(
        f"/api/advance-orders/{order_id}",
        json={"status": "COMPLETED"},
        headers=auth_headers,
    )
    assert complete_resp.status_code == 400, complete_resp.text
    assert "due" in complete_resp.json()["detail"].lower()


def test_collect_due_and_mark_completed(client, auth_headers):
    payload = {
        "customer_name": "Collect Balance",
        "expected_date": "2026-04-21",
        "total_amount": 1200,
        "advance_amount": 300,
        "advance_payment_mode": "UPI",
        "branch_id": 1,
    }

    create_resp = client.post("/api/advance-orders/", json=payload, headers=auth_headers)
    assert create_resp.status_code == 200, create_resp.text
    order_id = create_resp.json()["order_id"]

    collect_resp = client.post(
        f"/api/advance-orders/{order_id}/collect-due",
        json={"amount": 900, "payment_mode": "CASH", "mark_completed": True},
        headers=auth_headers,
    )
    assert collect_resp.status_code == 200, collect_resp.text
    data = collect_resp.json()
    assert data["due_after"] == 0
    assert data["status"] == "COMPLETED"
    assert data["payment_status"] == "PAID"
