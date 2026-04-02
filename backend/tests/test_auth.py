"""Authentication endpoint tests."""
import pytest


def test_login_success(client, seeded_db):
    resp = client.post(
        "/api/auth/login",
        json={
            "shop_id": seeded_db["shop_id"],
            "username": "testadmin",
            "password": "testpass123",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user_name"] == "testadmin"


def test_login_wrong_password(client, seeded_db):
    resp = client.post(
        "/api/auth/login",
        json={
            "shop_id": seeded_db["shop_id"],
            "username": "testadmin",
            "password": "wrongpassword",
        },
    )
    assert resp.status_code == 400


def test_login_unknown_user(client, seeded_db):
    resp = client.post(
        "/api/auth/login",
        json={
            "shop_id": seeded_db["shop_id"],
            "username": "nobody",
            "password": "testpass123",
        },
    )
    assert resp.status_code == 400


def test_login_invalid_shop(client):
    resp = client.post(
        "/api/auth/login",
        json={
            "shop_id": 9999,
            "username": "testadmin",
            "password": "testpass123",
        },
    )
    assert resp.status_code == 400


def test_login_missing_shop_id(client):
    resp = client.post(
        "/api/auth/login",
        json={"username": "testadmin", "password": "testpass123"},
    )
    assert resp.status_code == 400


def test_protected_route_without_token(client):
    resp = client.get("/api/items/")
    assert resp.status_code == 401


def test_protected_route_with_invalid_token(client):
    resp = client.get(
        "/api/items/",
        headers={"Authorization": "Bearer totally.fake.token"},
    )
    assert resp.status_code == 401
