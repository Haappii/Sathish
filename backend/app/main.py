from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.db import engine, Base, SessionLocal
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.config import settings
import logging
import os
from pathlib import Path

from app.utils.passwords import encode_password

# ======================================================
# MODELS (IMPORT ALL MODELS BEFORE create_all)
# ======================================================
import app.models.roles
import app.models.users
import app.models.category
import app.models.items
import app.models.invoice
import app.models.invoice_details
import app.models.invoice_archive
import app.models.shop_details
import app.models.stock
import app.models.stock_ledger
import app.models.system_parameters
import app.models.branch
import app.models.day_close
import app.models.month_close
import app.models.branch_expense
import app.models.branch_expense
import app.models.supplier
import app.models.purchase_order
import app.models.onboard_codes
import app.models.audit_log
import app.models.support_ticket
import app.models.customer
import app.models.invoice_due
import app.models.invoice_payment
import app.models.sales_return
import app.models.sales_return_meta
import app.models.stock_transfer
import app.models.invoice_draft
import app.models.role_permission
import app.models.cash_drawer
import app.models.supplier_ledger
import app.models.purchase_order_attachment
import app.models.stock_audit
import app.models.item_price
import app.models.coupon
import app.models.loyalty
import app.models.invoice_discount
import app.models.item_lot
import app.models.online_order
import app.models.employee
import app.models.customer_wallet_txn
import app.models.gift_card
import app.models.gift_card_txn
import app.models.subscription_plan
import app.models.bulk_import_log

# ⭐ TABLE BILLING MODELS (IMPORTANT)
import app.models.table_billing
import app.models.table_qr
import app.models.platform_onboard_request
import app.models.platform_user

# ⭐ HOTEL FEATURE MODELS
import app.models.kot
import app.models.modifier
import app.models.reservation
import app.models.recipe
import app.models.delivery


from app.models.users import User
from app.models.roles import Role
from app.models.branch import Branch
from app.models.platform_user import PlatformUser


# ======================================================
# RATE LIMITER
# ======================================================
limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])

# ======================================================
# FASTAPI APP
# ======================================================
app = FastAPI(
    title="Shop Billing Application API",
    version="1.0.0"
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

logger = logging.getLogger("uvicorn.error")


# ======================================================
# STATIC FILES (UPLOADS)
# ======================================================
os.makedirs("uploads", exist_ok=True)
app.mount(
    "/api/uploads",
    StaticFiles(directory="uploads"),
    name="uploads"
)

# ======================================================
# STATIC FILES (DOWNLOADS)
# Stored in: <project_root>/downloads/
# Used by About page for APK/desktop installer downloads.
# ======================================================
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DOWNLOADS_DIR = PROJECT_ROOT / "downloads"
DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
app.mount(
    "/downloads",
    StaticFiles(directory=str(DOWNLOADS_DIR)),
    name="downloads"
)

# ======================================================
# STATIC FILES (ITEM IMAGES)
# Stored in: frontend/src/assets/items/{item_id}.{ext}
# ======================================================
ITEM_IMAGES_DIR = PROJECT_ROOT / "frontend" / "src" / "assets" / "items"
ITEM_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
app.mount(
    "/api/item-images",
    StaticFiles(directory=str(ITEM_IMAGES_DIR)),
    name="item-images"
)

# ======================================================
# STATIC FILES (SHOP LOGOS)
# Stored in: frontend/src/assets/logo/logo_{shop_name}_{shop_id}.png
# ======================================================
SHOP_LOGOS_DIR = PROJECT_ROOT / "frontend" / "src" / "assets" / "logo"
SHOP_LOGOS_DIR.mkdir(parents=True, exist_ok=True)
app.mount(
    "/api/shop-logos",
    StaticFiles(directory=str(SHOP_LOGOS_DIR)),
    name="shop-logos"
)


# ======================================================
# MIDDLEWARES (order matters — outermost first)
# ======================================================
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(SlowAPIMiddleware)

# ======================================================
# CORS
# ======================================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ======================================================
# SEED DEFAULT DATA
# ======================================================
def seed_defaults():
    db: Session = SessionLocal()

    # ---- CORE ROLES ----
    from app.services.role_service import ensure_core_roles

    roles = ensure_core_roles(db)
    admin_role = roles.get("admin")

    # ---- DEFAULT SHOP ----
    from app.models.shop_details import ShopDetails

    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == 1).first()
    if not shop:
        shop = ShopDetails(
            shop_id=1,
            shop_name="Default Shop",
            billing_type="store",
            gst_enabled=False,
            gst_mode="inclusive",
        )
        db.add(shop)
        db.commit()
        db.refresh(shop)

    # ---- HEAD OFFICE BRANCH ----
    ho_branch = db.query(Branch).filter(
        Branch.branch_id == 1,
        Branch.shop_id == 1,
    ).first()

    if not ho_branch:
        ho_branch = Branch(
            branch_id=1,
            shop_id=1,
            branch_name="Head Office",
            type="Head Office",
            status="ACTIVE"
        )
        db.add(ho_branch)
        db.commit()

    if getattr(shop, "head_office_branch_id", None) != ho_branch.branch_id:
        shop.head_office_branch_id = ho_branch.branch_id
        db.add(shop)
        db.commit()

    # ---- ADMIN USER ----
    admin = db.query(User).filter(
        User.user_name == "admin",
        User.shop_id == 1,
    ).first()

    if not admin:
        admin = User(
            shop_id=1,
            user_name="admin",
            password=encode_password("admin123"),     # project convention
            name="System Admin",
            role=admin_role.role_id,
            branch_id=1,
            status=True
        )
        db.add(admin)
        db.commit()

    db.close()


def seed_platform_owner_defaults():
    db: Session = SessionLocal()
    try:
        exists = db.query(PlatformUser.platform_user_id).first()
        if exists is None:
            db.add(
                PlatformUser(
                    username="Admin",
                    password=encode_password("admin123"),
                    status=True,
                )
            )
            db.commit()
    finally:
        db.close()


def _auto_migrate_demo_expiry() -> None:
    """
    Lightweight, safe schema patch for the demo/expiry feature.

    This avoids manual SQL runs on environments that don't use Alembic.
    Only runs on Postgres and uses IF NOT EXISTS to stay idempotent.
    """
    try:
        if engine.dialect.name != "postgresql":
            return
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    ALTER TABLE IF EXISTS shop_details
                      ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT FALSE,
                      ADD COLUMN IF NOT EXISTS expires_on DATE,
                      ADD COLUMN IF NOT EXISTS plan VARCHAR(30) DEFAULT 'TRIAL',
                      ADD COLUMN IF NOT EXISTS paid_until DATE,
                      ADD COLUMN IF NOT EXISTS last_payment_on DATE,
                      ADD COLUMN IF NOT EXISTS total_paid NUMERIC(12,2) DEFAULT 0;
                    """
                )
            )
            conn.execute(
                text(
                    """
                    ALTER TABLE IF EXISTS support_tickets
                      ADD COLUMN IF NOT EXISTS provisioned_shop_id INTEGER,
                      ADD COLUMN IF NOT EXISTS provisioned_branch_id INTEGER,
                      ADD COLUMN IF NOT EXISTS provisioned_admin_user_id INTEGER,
                      ADD COLUMN IF NOT EXISTS provisioned_expires_on DATE,
                      ADD COLUMN IF NOT EXISTS decided_by VARCHAR(120),
                      ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;
                    """
                )
            )
    except Exception as e:
        # Don't take down the API due to a migration/DDL issue.
        logger.exception("Auto-migration (demo expiry) failed: %s", e)


def _auto_migrate_table_billing() -> None:
    """
    Backfill schema changes for table billing on existing Postgres databases.

    SQLAlchemy create_all() will not alter existing tables, so newer ORM fields
    such as orders.order_type must be added explicitly to avoid runtime 500s.
    """
    try:
        if engine.dialect.name != "postgresql":
            return
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    ALTER TABLE IF EXISTS tables_master
                      ADD COLUMN IF NOT EXISTS table_start_time TIMESTAMP;

                    ALTER TABLE IF EXISTS orders
                      ADD COLUMN IF NOT EXISTS order_type VARCHAR(20),
                      ADD COLUMN IF NOT EXISTS customer_name VARCHAR(120),
                      ADD COLUMN IF NOT EXISTS mobile VARCHAR(20),
                      ADD COLUMN IF NOT EXISTS notes VARCHAR(300),
                      ADD COLUMN IF NOT EXISTS token_number VARCHAR(20);

                    UPDATE orders
                    SET order_type = 'DINE_IN'
                    WHERE order_type IS NULL;

                    ALTER TABLE IF EXISTS orders
                      ALTER COLUMN order_type SET DEFAULT 'DINE_IN',
                      ALTER COLUMN order_type SET NOT NULL;

                    ALTER TABLE IF EXISTS order_items
                      ADD COLUMN IF NOT EXISTS notes VARCHAR(300),
                      ADD COLUMN IF NOT EXISTS kot_sent BOOLEAN,
                      ADD COLUMN IF NOT EXISTS kot_sent_at TIMESTAMP;

                    UPDATE order_items
                    SET kot_sent = FALSE
                    WHERE kot_sent IS NULL;

                    ALTER TABLE IF EXISTS order_items
                      ALTER COLUMN kot_sent SET DEFAULT FALSE,
                      ALTER COLUMN kot_sent SET NOT NULL;
                    """
                )
            )
    except Exception as e:
        logger.exception("Auto-migration (table billing) failed: %s", e)


def _auto_migrate_bulk_import_log() -> None:
    try:
        if engine.dialect.name != "postgresql":
            return
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    ALTER TABLE IF EXISTS bulk_import_logs
                      ADD COLUMN IF NOT EXISTS rows_json JSONB;
                    """
                )
            )
    except Exception as e:
        logger.exception("Auto-migration (bulk_import_log) failed: %s", e)


def _auto_migrate_branch_service_charge() -> None:
    """
    Backfill branch-level service charge fields on existing Postgres databases.

    Fresh databases get these columns from create_all(), but older databases need
    an explicit ALTER TABLE because SQLAlchemy won't mutate existing tables.
    """
    try:
        if engine.dialect.name != "postgresql":
            return
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    ALTER TABLE IF EXISTS branch
                      ADD COLUMN IF NOT EXISTS service_charge_required BOOLEAN DEFAULT FALSE,
                      ADD COLUMN IF NOT EXISTS service_charge_amount NUMERIC(10, 2) DEFAULT 0;

                    UPDATE branch
                    SET service_charge_required = FALSE
                    WHERE service_charge_required IS NULL;

                    UPDATE branch
                    SET service_charge_amount = 0
                    WHERE service_charge_amount IS NULL;
                    """
                )
            )
    except Exception as e:
        logger.exception("Auto-migration (branch service charge) failed: %s", e)


def _auto_migrate_head_office_branch() -> None:
    """
    Add the preferred head-office branch pointer for existing Postgres databases.
    """
    try:
        if engine.dialect.name != "postgresql":
            return
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    ALTER TABLE IF EXISTS shop_details
                      ADD COLUMN IF NOT EXISTS head_office_branch_id INTEGER;

                    DO $$
                    BEGIN
                      IF NOT EXISTS (
                        SELECT 1
                        FROM pg_constraint
                        WHERE conname = 'fk_shop_details_head_office_branch'
                      ) THEN
                        ALTER TABLE shop_details
                          ADD CONSTRAINT fk_shop_details_head_office_branch
                          FOREIGN KEY (head_office_branch_id)
                          REFERENCES branch(branch_id)
                          ON DELETE SET NULL;
                      END IF;
                    END $$;

                    WITH resolved AS (
                      SELECT
                        s.shop_id,
                        COALESCE(
                          (
                            SELECT b.branch_id
                            FROM branch b
                            WHERE b.shop_id = s.shop_id
                              AND (
                                LOWER(COALESCE(b.type, '')) LIKE '%head%'
                                OR LOWER(COALESCE(b.branch_name, '')) LIKE '%head%'
                              )
                            ORDER BY b.branch_id
                            LIMIT 1
                          ),
                          (
                            SELECT b.branch_id
                            FROM branch b
                            WHERE b.shop_id = s.shop_id
                              AND UPPER(COALESCE(b.status, 'ACTIVE')) = 'ACTIVE'
                            ORDER BY b.branch_id
                            LIMIT 1
                          )
                        ) AS branch_id
                      FROM shop_details s
                    )
                    UPDATE shop_details s
                    SET head_office_branch_id = resolved.branch_id
                    FROM resolved
                    WHERE s.shop_id = resolved.shop_id
                      AND s.head_office_branch_id IS NULL
                      AND resolved.branch_id IS NOT NULL;
                    """
                )
            )
    except Exception as e:
        logger.exception("Auto-migration (head office branch) failed: %s", e)


def _auto_migrate_user_session_tracking() -> None:
    """
    Add server-tracked user session columns for single-login enforcement.
    """
    try:
        if engine.dialect.name != "postgresql":
            return
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    ALTER TABLE IF EXISTS users
                      ADD COLUMN IF NOT EXISTS active_session_id VARCHAR(120),
                      ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
                      ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

                    UPDATE users
                    SET login_status = FALSE,
                        active_session_id = NULL
                    WHERE COALESCE(login_status, FALSE) = TRUE
                      AND COALESCE(active_session_id, '') = '';
                    """
                )
            )
    except Exception as e:
        logger.exception("Auto-migration (user session tracking) failed: %s", e)


def _auto_migrate_branch_service_charge_gst() -> None:
    """
    Add GST-on-service-charge columns to the branch table for existing databases.
    """
    try:
        if engine.dialect.name != "postgresql":
            return
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    ALTER TABLE IF EXISTS branch
                      ADD COLUMN IF NOT EXISTS service_charge_gst_required BOOLEAN DEFAULT FALSE,
                      ADD COLUMN IF NOT EXISTS service_charge_gst_percent NUMERIC(5, 2) DEFAULT 0;

                    UPDATE branch SET service_charge_gst_required = FALSE WHERE service_charge_gst_required IS NULL;
                    UPDATE branch SET service_charge_gst_percent = 0 WHERE service_charge_gst_percent IS NULL;
                    """
                )
            )
    except Exception as e:
        logger.exception("Auto-migration (branch service charge GST) failed: %s", e)


def _auto_migrate_table_name_unique_constraint() -> None:
    """
    Replace the old unique constraint on (shop_id, branch_id, table_name) with
    one that includes category_id, so the same table name is allowed in different
    categories (e.g. "Table 1" in both "1st Floor" and "2nd Floor").
    """
    try:
        if engine.dialect.name != "postgresql":
            return
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    DO $$
                    DECLARE
                        r RECORD;
                    BEGIN
                        FOR r IN
                            SELECT DISTINCT c.conname
                            FROM pg_constraint c
                            JOIN pg_class t ON t.oid = c.conrelid
                            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
                            WHERE t.relname = 'tables_master'
                              AND c.contype = 'u'
                              AND a.attname = 'table_name'
                              AND c.conname != 'uq_tables_master_shop_branch_category_name'
                        LOOP
                            EXECUTE 'ALTER TABLE tables_master DROP CONSTRAINT IF EXISTS '
                                    || quote_ident(r.conname);
                        END LOOP;
                    END $$;

                    ALTER TABLE tables_master
                        ADD CONSTRAINT uq_tables_master_shop_branch_category_name
                        UNIQUE (shop_id, branch_id, category_id, table_name)
                        DEFERRABLE INITIALLY DEFERRED;
                    """
                )
            )
    except Exception as e:
        logger.exception("Auto-migration (table name unique constraint) failed: %s", e)


@app.on_event("startup")
def _startup_db_init():
    """
    Initialize DB schema and seed defaults.
    Keep startup resilient: if DB is down/misconfigured, don't hang the web server.
    """
    # Validate security config — warns in dev, raises in production.
    settings.validate()

    try:
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        logger.exception("DB create_all failed: %s", e)

    _auto_migrate_demo_expiry()
    _auto_migrate_table_billing()
    _auto_migrate_bulk_import_log()
    _auto_migrate_branch_service_charge()
    _auto_migrate_branch_service_charge_gst()
    _auto_migrate_head_office_branch()
    _auto_migrate_user_session_tracking()
    _auto_migrate_table_name_unique_constraint()

    try:
        # Optional dev helper: wipe DB + seed sample data on restart.
        seed_defaults()
    except Exception as e:
        logger.exception("DB seed_defaults failed: %s", e)

    try:
        seed_platform_owner_defaults()
    except Exception as e:
        logger.exception("DB seed_platform_owner_defaults failed: %s", e)


# ======================================================
# ROUTERS
# ======================================================
from app.routes import (
    auth,
    users,
    category,
    items,
    pricing,
    invoice,
    dashboard,
    shop,
    reports,
    roles,
    analytics,
    alerts,
    cash_drawer,
    coupons,
    loyalty,
    supplier_ledger,
    stock_audits,
    item_lots,
    online_orders,
    inventory,
    parameter,
    customers,
    employees,
    dues,
    returns,
    stock_transfers,
    invoice_draft,
    permissions,
)

from app.routes import inventory_bulk
from app.routes import branch_routes, auth_branch
from app.routes import support_chat
from app.routes import setup_onboard
from app.routes import day_close
from app.routes import expenses
from app.routes import suppliers
from app.routes import purchase_orders
from app.routes import gift_cards
from app.routes import platform_owner
from app.routes import bulk_import_logs

# ---------- REPORT ROUTES ----------
from app.routes import categorysales
from app.routes import category_item_count
from app.routes import category_item_details
from app.routes.branch_sales import router as branch_sales_router

# ⭐ TABLE BILLING ROUTER
from app.routes.table_billing import router as table_billing_router
from app.routes.table_management import router as table_management_router
from app.routes.table_category import router as table_category_router
from app.routes.table_qr import router as table_qr_router
from app.routes.public_qr import router as public_qr_router
from app.routes.public_reservation import router as public_reservation_router
from app.routes.qr_orders import router as qr_orders_router

# ⭐ HOTEL FEATURE ROUTERS
from app.routes.kot import router as kot_router
from app.routes.modifiers import router as modifiers_router
from app.routes.reservation import router as reservation_router
from app.routes.recipe import router as recipe_router
from app.routes.delivery import router as delivery_router
from app.routes.kds import router as kds_router


# ======================================================
# CORE ROUTES
# ======================================================
app.include_router(auth.router,       prefix="/api")
app.include_router(users.router,      prefix="/api")
app.include_router(category.router,   prefix="/api")
app.include_router(items.router,      prefix="/api")
app.include_router(pricing.router,    prefix="/api")
app.include_router(invoice.router,    prefix="/api")
app.include_router(dashboard.router,  prefix="/api")
app.include_router(shop.router,       prefix="/api")
app.include_router(reports.router,    prefix="/api")
app.include_router(roles.router,      prefix="/api")
app.include_router(analytics.router,  prefix="/api")
app.include_router(permissions.router, prefix="/api")
app.include_router(alerts.router,     prefix="/api")
app.include_router(cash_drawer.router, prefix="/api")
app.include_router(coupons.router,     prefix="/api")
app.include_router(loyalty.router,     prefix="/api")
app.include_router(supplier_ledger.router, prefix="/api")
app.include_router(stock_audits.router, prefix="/api")
app.include_router(item_lots.router,   prefix="/api")
app.include_router(online_orders.router, prefix="/api")
app.include_router(inventory.router,  prefix="/api")
app.include_router(parameter.router,  prefix="/api")
app.include_router(inventory_bulk.router, prefix="/api")
app.include_router(customers.router,  prefix="/api")
app.include_router(employees.router,  prefix="/api")
app.include_router(dues.router,       prefix="/api")
app.include_router(returns.router,    prefix="/api")
app.include_router(stock_transfers.router, prefix="/api")
app.include_router(invoice_draft.router, prefix="/api")

# ---------- BRANCH ----------
app.include_router(branch_routes.router, prefix="/api")
app.include_router(auth_branch.router,   prefix="/api")

# ---------- SUPPORT CHAT ----------
app.include_router(support_chat.router,  prefix="/api")
app.include_router(setup_onboard.router, prefix="/api")
app.include_router(day_close.router,     prefix="/api")
app.include_router(expenses.router,      prefix="/api")
app.include_router(suppliers.router,     prefix="/api")
app.include_router(purchase_orders.router, prefix="/api")
app.include_router(gift_cards.router, prefix="/api")
app.include_router(platform_owner.router, prefix="/api")
app.include_router(bulk_import_logs.router, prefix="/api")

# ---------- REPORTS ----------
app.include_router(categorysales.router,         prefix="/api")
app.include_router(category_item_count.router,   prefix="/api")
app.include_router(category_item_details.router, prefix="/api")
app.include_router(branch_sales_router,           prefix="/api")

# ⭐ TABLE BILLING ----------
app.include_router(table_billing_router, prefix="/api")
app.include_router(table_management_router, prefix="/api")
app.include_router(table_category_router, prefix="/api")
app.include_router(table_qr_router, prefix="/api")
app.include_router(public_qr_router, prefix="/api")
app.include_router(public_reservation_router, prefix="/api")
app.include_router(qr_orders_router, prefix="/api")

# ⭐ HOTEL FEATURES ----------
app.include_router(kot_router,         prefix="/api")   # /api/kot
app.include_router(modifiers_router,   prefix="/api")   # /api/modifiers
app.include_router(reservation_router, prefix="/api")   # /api/reservations
app.include_router(recipe_router,      prefix="/api")   # /api/recipes
app.include_router(delivery_router,    prefix="/api")   # /api/delivery
app.include_router(kds_router,         prefix="/api")   # /api/kds


# ======================================================
# FRONTEND (serve built React app from backend)
# ======================================================
FRONTEND_DIST_DIR = PROJECT_ROOT / "frontend" / "dist"
FRONTEND_INDEX = FRONTEND_DIST_DIR / "index.html"


def _frontend_ready() -> bool:
    return FRONTEND_INDEX.exists()


@app.get("/api/health")
def api_health():
    return {"status": "ok"}


@app.get("/api/status")
def api_status():
    return {"status": "ok"}


@app.get("/api/v1/info")
def api_v1_info():
    return {
        "status": "ok",
        "service": "Billing API",
        "message": "Production backend is running",
    }


@app.get("/api", include_in_schema=False)
def api_root():
    return {"status": "ok", "message": "Billing API is running"}


@app.get("/api/items", include_in_schema=False)
def legacy_items_redirect():
    return RedirectResponse(url="/api/items/", status_code=307)


@app.get("/api/category", include_in_schema=False)
def legacy_category_redirect():
    return RedirectResponse(url="/api/category/", status_code=307)


@app.get("/api/categories", include_in_schema=False)
def legacy_categories_redirect():
    return RedirectResponse(url="/api/category/", status_code=307)


@app.get("/")
def frontend_root():
    if _frontend_ready():
        return FileResponse(str(FRONTEND_INDEX))
    return {"status": "ok", "message": "Billing API is running (frontend not built)"}


@app.get("/{full_path:path}")
def frontend_spa(full_path: str):
    if not _frontend_ready():
        raise HTTPException(404, "Frontend not built")

    p = (full_path or "").lstrip("/")
    if p.startswith("api/"):
        raise HTTPException(404, "Not found")

    candidate = (FRONTEND_DIST_DIR / p) if p else FRONTEND_INDEX
    if p and candidate.exists() and candidate.is_file():
        return FileResponse(str(candidate))

    return FileResponse(str(FRONTEND_INDEX))
