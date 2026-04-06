"""Authentication endpoint tests."""

from datetime import date, datetime, timedelta, timezone

from app.models.shop_details import ShopDetails
from app.models.users import User


def _as_utc(dt):
    if dt is None:
        return None
    if dt.tzinfo is None or dt.tzinfo.utcoffset(dt) is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)

def test_login_success(client, seeded_db):
    resp = client.post(
        "/api/auth/login",
        json={
            "shop_id": seeded_db["shop_id"],
            "username": "fixtureadmin",
            "password": "testpass123",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user_name"] == "fixtureadmin"


def test_login_returns_business_date(client, seeded_db, db_session):
    shop = db_session.query(ShopDetails).filter(ShopDetails.shop_id == seeded_db["shop_id"]).first()
    shop.app_date = date(2026, 2, 10)
    db_session.add(shop)
    db_session.commit()

    resp = client.post(
        "/api/auth/login",
        json={
            "shop_id": seeded_db["shop_id"],
            "username": "fixtureadmin",
            "password": "testpass123",
        },
    )
    assert resp.status_code == 200
    assert resp.json()["app_date"] == "2026-02-10"


def test_login_rejects_duplicate_active_session(client, seeded_db):
    first = client.post(
        "/api/auth/login",
        json={
            "shop_id": seeded_db["shop_id"],
            "username": "fixtureadmin",
            "password": "testpass123",
        },
    )
    assert first.status_code == 200

    second = client.post(
        "/api/auth/login",
        json={
            "shop_id": seeded_db["shop_id"],
            "username": "fixtureadmin",
            "password": "testpass123",
        },
    )
    assert second.status_code == 409
    assert "already logged in" in second.json()["detail"].lower()


def test_logout_releases_user_for_next_login(client, seeded_db):
    first = client.post(
        "/api/auth/login",
        json={
            "shop_id": seeded_db["shop_id"],
            "username": "fixtureadmin",
            "password": "testpass123",
        },
    )
    assert first.status_code == 200

    headers = {"Authorization": f"Bearer {first.json()['access_token']}"}
    logout = client.post("/api/auth/logout", headers=headers)
    assert logout.status_code == 200

    second = client.post(
        "/api/auth/login",
        json={
            "shop_id": seeded_db["shop_id"],
            "username": "fixtureadmin",
            "password": "testpass123",
        },
    )
    assert second.status_code == 200


def test_ping_allows_active_session(client, seeded_db):
    login = client.post(
        "/api/auth/login",
        json={
            "shop_id": seeded_db["shop_id"],
            "username": "fixtureadmin",
            "password": "testpass123",
        },
    )
    assert login.status_code == 200

    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    ping = client.post("/api/auth/ping", headers=headers)

    assert ping.status_code == 200
    assert ping.json()["status"] == "ok"


def test_stale_session_is_rejected_on_protected_route(client, seeded_db, db_session):
    login = client.post(
        "/api/auth/login",
        json={
            "shop_id": seeded_db["shop_id"],
            "username": "fixtureadmin",
            "password": "testpass123",
        },
    )
    assert login.status_code == 200

    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    user = db_session.query(User).filter(User.user_name == "fixtureadmin").first()
    user.last_activity_at = datetime.now(timezone.utc) - timedelta(minutes=20)
    db_session.add(user)
    db_session.commit()

    resp = client.get("/api/items/", headers=headers)

    assert resp.status_code == 401
    db_session.expire_all()
    user = db_session.query(User).filter(User.user_name == "fixtureadmin").first()
    assert user.login_status is False
    assert user.active_session_id is None


def test_regular_requests_do_not_refresh_idle_timer(client, seeded_db, db_session):
    login = client.post(
        "/api/auth/login",
        json={
            "shop_id": seeded_db["shop_id"],
            "username": "fixtureadmin",
            "password": "testpass123",
        },
    )
    assert login.status_code == 200

    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    stale_last_activity = datetime.now(timezone.utc) - timedelta(minutes=2)
    user = db_session.query(User).filter(User.user_name == "fixtureadmin").first()
    user.last_activity_at = stale_last_activity
    db_session.add(user)
    db_session.commit()

    resp = client.get("/api/items/", headers=headers)

    assert resp.status_code == 200
    db_session.expire_all()
    user = db_session.query(User).filter(User.user_name == "fixtureadmin").first()
    assert _as_utc(user.last_activity_at) == _as_utc(stale_last_activity)


def test_ping_refreshes_idle_timer(client, seeded_db, db_session):
    login = client.post(
        "/api/auth/login",
        json={
            "shop_id": seeded_db["shop_id"],
            "username": "fixtureadmin",
            "password": "testpass123",
        },
    )
    assert login.status_code == 200

    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    stale_last_activity = datetime.now(timezone.utc) - timedelta(minutes=2)
    user = db_session.query(User).filter(User.user_name == "fixtureadmin").first()
    user.last_activity_at = stale_last_activity
    db_session.add(user)
    db_session.commit()

    ping = client.post("/api/auth/ping", headers=headers)

    assert ping.status_code == 200
    db_session.expire_all()
    user = db_session.query(User).filter(User.user_name == "fixtureadmin").first()
    assert _as_utc(user.last_activity_at) > _as_utc(stale_last_activity)


def test_login_wrong_password(client, seeded_db):
    resp = client.post(
        "/api/auth/login",
        json={
            "shop_id": seeded_db["shop_id"],
            "username": "fixtureadmin",
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
            "username": "fixtureadmin",
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
