#!/usr/bin/env python3
"""
Production database initializer.

Run once after first deployment (or any time you need to reset/recreate tables).
This script:
  1. Creates ALL database tables (safe to re-run — skips existing tables)
  2. Seeds the platform admin user  → login at /platform/login
  3. Seeds the default shop, branch, and shop admin user

Usage (from the shop-billing-app root):
    cd /home/ubuntu/Sathish
    source backend/venv/bin/activate
    python deploy/init_db.py

Credentials created:
    Platform login  → username: Admin     password: admin123
    Shop login      → username: admin     password: admin123
"""

import sys
import os

# Put backend/ on the path so all app.* imports work
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(SCRIPT_DIR, "..", "backend")
sys.path.insert(0, os.path.abspath(BACKEND_DIR))

# ── Import ALL models so SQLAlchemy knows every table before create_all ────────
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
import app.models.table_billing
import app.models.table_qr
import app.models.platform_onboard_request
import app.models.platform_user
import app.models.kot
import app.models.modifier
import app.models.reservation
import app.models.recipe
import app.models.delivery

from app.db import Base, engine, SessionLocal
from app.models.platform_user import PlatformUser
from app.models.users import User
from app.models.roles import Role
from app.models.branch import Branch
from app.models.shop_details import ShopDetails
from app.utils.passwords import encode_password


def create_tables():
    print("==> Creating tables (skips any that already exist)...")
    Base.metadata.create_all(bind=engine)
    print("    Done.")


def seed_platform_admin():
    print("==> Seeding platform admin...")
    db = SessionLocal()
    try:
        exists = db.query(PlatformUser.platform_user_id).first()
        if exists:
            print("    Platform admin already exists — skipping.")
            return
        db.add(PlatformUser(
            username="Admin",
            password=encode_password("admin123"),
            status=True,
        ))
        db.commit()
        print("    Created  →  username: Admin   password: admin123")
        print("    Login at /platform/login")
    finally:
        db.close()


def seed_shop_defaults():
    print("==> Seeding default shop / branch / admin user...")
    db = SessionLocal()
    try:
        from app.services.role_service import ensure_core_roles
        roles = ensure_core_roles(db)
        admin_role = roles.get("admin")

        # Default shop
        shop = db.query(ShopDetails).filter(ShopDetails.shop_id == 1).first()
        if not shop:
            db.add(ShopDetails(
                shop_id=1,
                shop_name="Default Shop",
                billing_type="store",
                gst_enabled=False,
                gst_mode="inclusive",
            ))
            db.commit()
            print("    Created default shop.")
        else:
            print("    Default shop already exists — skipping.")

        # Head office branch
        branch = db.query(Branch).filter(
            Branch.branch_id == 1,
            Branch.shop_id == 1,
        ).first()
        if not branch:
            db.add(Branch(
                branch_id=1,
                shop_id=1,
                branch_name="Head Office",
                type="Head Office",
                status="ACTIVE",
            ))
            db.commit()
            print("    Created Head Office branch.")
        else:
            print("    Head Office branch already exists — skipping.")

        # Admin user
        admin = db.query(User).filter(
            User.user_name == "admin",
            User.shop_id == 1,
        ).first()
        if not admin:
            db.add(User(
                shop_id=1,
                user_name="admin",
                password=encode_password("admin123"),
                name="System Admin",
                role=admin_role.role_id,
                branch_id=1,
                status=True,
            ))
            db.commit()
            print("    Created  →  username: admin   password: admin123")
        else:
            print("    Shop admin already exists — skipping.")
    finally:
        db.close()


def reset_sequences():
    """
    After seeding rows with explicit primary key values (branch_id=1, shop_id=1, etc.)
    PostgreSQL sequences are not advanced automatically.
    This resets them so the next INSERT gets the correct next ID.
    """
    from sqlalchemy import text
    tables = [
        ("branch",       "branch_id"),
        ("shop_details", "shop_id"),
        ("users",        "user_id"),
        ("roles",        "role_id"),
        ("platform_users", "platform_user_id"),
    ]
    print("==> Resetting PostgreSQL sequences...")
    with engine.connect() as conn:
        for table, col in tables:
            try:
                conn.execute(text(
                    f"SELECT setval(pg_get_serial_sequence('{table}', '{col}'), "
                    f"COALESCE((SELECT MAX({col}) FROM {table}), 1))"
                ))
                print(f"    Reset {table}.{col}")
            except Exception as e:
                print(f"    Skipped {table}.{col}: {e}")
        conn.commit()


if __name__ == "__main__":
    print()
    create_tables()
    print()
    seed_platform_admin()
    print()
    seed_shop_defaults()
    print()
    reset_sequences()
    print()
    print("==> All done.")
    print()
    print("  Platform login : /platform/login   →  Admin / admin123")
    print("  Shop login     : /login             →  admin / admin123")
    print()
