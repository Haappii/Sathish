"""
Pytest fixtures for the ShopApp backend test suite.

Uses an in-memory SQLite database so tests run fast and require no
external Postgres instance. The app's DATABASE_URL is overridden *before*
any app code is imported so that app.db.engine also uses SQLite.
"""
import os
os.environ["DATABASE_URL"] = "sqlite:///./test_shopapp.db"
os.environ.setdefault("JWT_SECRET", "test-secret-key-for-tests-only")
os.environ.setdefault("APP_ENV", "development")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event

# Import app.db AFTER setting DATABASE_URL so it picks up SQLite
from app.db import Base, get_db, engine as app_engine, SessionLocal as AppSessionLocal
from app.main import app
from app.routes.auth import limiter as auth_route_limiter

app.state.limiter.enabled = False
auth_route_limiter.enabled = False

# Enable foreign key enforcement on the shared engine
@event.listens_for(app_engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _):
    try:
        dbapi_conn.execute("PRAGMA foreign_keys=ON")
    except Exception:
        pass  # postgres ignores this; sqlite respects it


def override_get_db():
    db = AppSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


# ---------------------------------------------------------------------------
# Create all tables once per session using the SAME engine the app uses
# ---------------------------------------------------------------------------
@pytest.fixture(scope="session", autouse=True)
def create_tables():
    Base.metadata.create_all(bind=app_engine)
    yield
    Base.metadata.drop_all(bind=app_engine)


# ---------------------------------------------------------------------------
# Shared DB session
# ---------------------------------------------------------------------------
@pytest.fixture(scope="session")
def db_session(create_tables):
    db = AppSessionLocal()
    yield db
    db.close()


# ---------------------------------------------------------------------------
# Seed minimal data
# ---------------------------------------------------------------------------
@pytest.fixture(scope="session")
def seeded_db(db_session):
    """
    Seed: 1 shop, 1 branch, 1 admin role, 1 admin user.
    Returns a dict with the seeded ids.
    """
    from app.models.shop_details import ShopDetails
    from app.models.branch import Branch
    from app.models.roles import Role
    from app.models.users import User

    # Check if already seeded (session-scoped fixture may run once)
    existing = db_session.query(ShopDetails).filter_by(shop_id=1).first()
    if existing:
        role = db_session.query(Role).filter_by(role_name="admin").first()
        user = db_session.query(User).filter_by(user_name="testadmin").first()
        api_user = db_session.query(User).filter_by(user_name="fixtureadmin").first()
        branch = db_session.query(Branch).filter_by(branch_id=1).first()
        if existing.head_office_branch_id != branch.branch_id:
            existing.head_office_branch_id = branch.branch_id
            db_session.add(existing)
            db_session.commit()
        if not api_user:
            api_user = User(
                shop_id=1,
                user_name="fixtureadmin",
                password="testpass123",
                name="Fixture Admin",
                role=role.role_id,
                branch_id=branch.branch_id,
                status=True,
            )
            db_session.add(api_user)
            db_session.commit()
            db_session.refresh(api_user)
        return {
            "shop_id": 1,
            "branch_id": branch.branch_id,
            "role_id": role.role_id,
            "user_id": user.user_id,
            "api_user_id": api_user.user_id,
        }

    shop = ShopDetails(
        shop_id=1,
        shop_name="Test Shop",
        billing_type="store",
        gst_enabled=False,
        gst_mode="inclusive",
    )
    db_session.add(shop)
    db_session.flush()

    branch = Branch(
        branch_id=1,
        shop_id=1,
        branch_name="Head Office",
        type="Head Office",
        status="ACTIVE",
    )
    db_session.add(branch)
    db_session.flush()

    shop.head_office_branch_id = branch.branch_id
    db_session.add(shop)
    db_session.flush()

    role = Role(role_name="admin")
    db_session.add(role)
    db_session.flush()

    user = User(
        shop_id=1,
        user_name="testadmin",
        password="testpass123",  # plain-text; passlib legacy fallback in verify_password handles this
        name="Test Admin",
        role=role.role_id,
        branch_id=1,
        status=True,
    )
    db_session.add(user)

    api_user = User(
        shop_id=1,
        user_name="fixtureadmin",
        password="testpass123",
        name="Fixture Admin",
        role=role.role_id,
        branch_id=1,
        status=True,
    )
    db_session.add(api_user)
    db_session.commit()

    return {
        "shop_id": shop.shop_id,
        "branch_id": branch.branch_id,
        "role_id": role.role_id,
        "user_id": user.user_id,
        "api_user_id": api_user.user_id,
    }


# ---------------------------------------------------------------------------
# Test client
# ---------------------------------------------------------------------------
@pytest.fixture(scope="session")
def client(seeded_db):
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


@pytest.fixture(autouse=True)
def reset_user_sessions(db_session):
    from app.models.users import User

    db_session.query(User).filter(User.user_name == "fixtureadmin").update(
        {
            User.login_status: False,
            User.active_session_id: None,
            User.last_login_at: None,
            User.last_activity_at: None,
        },
        synchronize_session=False,
    )
    db_session.commit()
    yield
    db_session.query(User).filter(User.user_name == "fixtureadmin").update(
        {
            User.login_status: False,
            User.active_session_id: None,
            User.last_login_at: None,
            User.last_activity_at: None,
        },
        synchronize_session=False,
    )
    db_session.commit()


@pytest.fixture(scope="session")
def auth_headers(client, seeded_db):
    """Returns Bearer token headers for the seeded admin user."""
    resp = client.post(
        "/api/auth/login",
        json={
            "shop_id": seeded_db["shop_id"],
            "username": "testadmin",
            "password": "testpass123",
        },
    )
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    yield headers
    client.post("/api/auth/logout", headers=headers)
