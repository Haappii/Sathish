"""
One-time script: delete all data for shop IDs 2, 3, 4.
Run from backend/: python cleanup_shops.py
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))

from app.env import load_project_env
load_project_env()

from sqlalchemy import create_engine, text

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/shop_billing")
engine = create_engine(DATABASE_URL)

SHOP_IDS = [2, 3, 4]

TABLES_WITH_SHOP_ID = [
    "invoice_details", "invoice_archive", "invoice_due", "invoice_payment",
    "invoice_discount", "invoice_draft", "invoice",
    "sales_return_items", "sales_return", "sales_return_meta",
    "kot_items", "kot", "order_items", "orders", "table_master",
    "qr_order_items", "qr_orders", "table_qr_sessions", "table_qr_tokens",
    "stock_ledger", "stock_audit", "date_wise_stock", "inventory", "item_lot",
    "stock_transfer_items", "stock_transfers",
    "branch_item_price", "item_prices", "recipe", "modifier", "items", "category",
    "purchase_order_items", "purchase_order_attachments", "purchase_orders",
    "supplier_ledger", "suppliers",
    "advance_order_items", "advance_orders",
    "gift_card_transactions", "gift_cards",
    "coupon_usage", "coupons",
    "loyalty_transactions", "loyalty_accounts",
    "customer_wallet_transactions", "customers",
    "cash_drawer", "branch_expenses", "day_close", "month_close",
    "employee_attendance", "employee_settlements", "employees",
    "online_orders", "delivery",
    "reservations", "feedback",
    "bulk_import_log", "mail_scheduler",
    "audit_log", "system_parameters", "role_permissions",
    "support_tickets",
    "platform_payments",
    "users", "branch", "shop_details",
]

with engine.connect() as conn:
    for shop_id in SHOP_IDS:
        print(f"\n--- Deleting shop_id={shop_id} ---")
        for table in TABLES_WITH_SHOP_ID:
            try:
                result = conn.execute(text(f"DELETE FROM {table} WHERE shop_id = :sid"), {"sid": shop_id})
                if result.rowcount > 0:
                    print(f"  {table}: {result.rowcount} rows deleted")
            except Exception as e:
                if "does not exist" in str(e) or "undefined table" in str(e):
                    pass
                else:
                    print(f"  {table}: SKIP ({e})")
                conn.rollback()
                continue

    # Also clean onboard requests that created these shops
    try:
        result = conn.execute(text("DELETE FROM platform_onboard_requests WHERE created_shop_id IN :ids"), {"ids": tuple(SHOP_IDS)})
        if result.rowcount > 0:
            print(f"\n  platform_onboard_requests: {result.rowcount} rows deleted")
    except Exception as e:
        print(f"  platform_onboard_requests: {e}")
        conn.rollback()

    conn.commit()
    print("\n✓ Cleanup complete for shop IDs:", SHOP_IDS)
