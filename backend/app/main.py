from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from app.db import engine, Base, SessionLocal
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

# ⭐ TABLE BILLING MODELS (IMPORTANT)
import app.models.table_billing


from app.models.users import User
from app.models.roles import Role
from app.models.branch import Branch


# ======================================================
# CREATE DATABASE TABLES
# ======================================================
Base.metadata.create_all(bind=engine)


# ======================================================
# FASTAPI APP
# ======================================================
app = FastAPI(
    title="Shop Billing Application API",
    version="1.0.0"
)


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
# STATIC FILES (ITEM IMAGES)
# Stored in: frontend/src/assets/items/{item_id}.{ext}
# ======================================================
PROJECT_ROOT = Path(__file__).resolve().parents[2]
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
# CORS
# ======================================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],      # adjust in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ======================================================
# SEED DEFAULT DATA
# ======================================================
def seed_defaults():
    db: Session = SessionLocal()

    # ---- ADMIN ROLE ----
    admin_role = db.query(Role).filter(
        Role.role_name == "Admin"
    ).first()

    if not admin_role:
        admin_role = Role(role_name="Admin")
        db.add(admin_role)
        db.commit()
        db.refresh(admin_role)

    # ---- HEAD OFFICE BRANCH ----
    ho_branch = db.query(Branch).filter(
        Branch.branch_id == 1
    ).first()

    if not ho_branch:
        ho_branch = Branch(
            branch_id=1,
            branch_name="Head Office",
            type="Head Office",
            status="ACTIVE"
        )
        db.add(ho_branch)
        db.commit()

    # ---- ADMIN USER ----
    admin = db.query(User).filter(
        User.user_name == "admin"
    ).first()

    if not admin:
        admin = User(
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


seed_defaults()


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
    inventory,
    parameter,
    customers,
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

# ---------- REPORT ROUTES ----------
from app.routes import categorysales
from app.routes import category_item_count
from app.routes import category_item_details
from app.routes.branch_sales import router as branch_sales_router

# ⭐ TABLE BILLING ROUTER
from app.routes.table_billing import router as table_billing_router
from app.routes.table_management import router as table_management_router


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
app.include_router(inventory.router,  prefix="/api")
app.include_router(parameter.router,  prefix="/api")
app.include_router(inventory_bulk.router, prefix="/api")
app.include_router(customers.router,  prefix="/api")
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

# ---------- REPORTS ----------
app.include_router(categorysales.router,         prefix="/api")
app.include_router(category_item_count.router,   prefix="/api")
app.include_router(category_item_details.router, prefix="/api")
app.include_router(branch_sales_router,           prefix="/api")

# ⭐ TABLE BILLING ----------
app.include_router(table_billing_router, prefix="/api")
app.include_router(table_management_router, prefix="/api")


# ======================================================
# ROOT
# ======================================================
@app.get("/")
def root():
    return {
        "status": "ok",
        "message": "Billing API is running"
    }
