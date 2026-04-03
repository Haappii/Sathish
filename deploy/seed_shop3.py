#!/usr/bin/env python3
"""
Test-data seeder for shop_id = 3.

Assumes shop_details (shop_id=3) and branch already exist.
Safe to re-run: all inserts use get-or-create / ON CONFLICT DO NOTHING patterns.

Usage (from server):
    cd /home/ubuntu/Sathish
    source backend/venv/bin/activate
    python deploy/seed_shop3.py

Credentials created:
    admin   / admin123   (Admin role)
    manager / manager123 (Manager role)
    cashier / cashier123 (Cashier role)
"""

import sys
import os
from datetime import date, timedelta

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(SCRIPT_DIR, "..", "backend")
sys.path.insert(0, os.path.abspath(BACKEND_DIR))

# Import all models so Base knows every table
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
import app.models.branch
import app.models.day_close
import app.models.month_close
import app.models.branch_expense
import app.models.supplier
import app.models.purchase_order
import app.models.audit_log
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
import app.models.branch_item_price
import app.models.item_price
import app.models.stock_audit
import app.models.employee
import app.models.onboard_codes
import app.models.system_parameters

from app.db import SessionLocal
from app.models.roles import Role
from app.models.users import User
from app.models.category import Category
from app.models.items import Item
from app.models.stock import Inventory
from app.models.branch_item_price import BranchItemPrice
from app.models.branch_expense import BranchExpense
from app.models.customer import Customer
from app.models.supplier import Supplier
from app.models.invoice import Invoice
from app.models.invoice_details import InvoiceDetail
from app.models.role_permission import RolePermission
from app.models.shop_details import ShopDetails
from app.models.branch import Branch
from app.utils.passwords import encode_password

SHOP_ID = 3

# ── Modules for role permissions ────────────────────────────────────────────────
ALL_MODULES = [
    "billing", "items", "categories", "inventory", "reports",
    "customers", "suppliers", "expenses", "day_close", "users",
    "purchase_orders", "sales_return",
]


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_role(db, role_name: str) -> Role:
    role = db.query(Role).filter(Role.role_name == role_name).first()
    if not role:
        role = Role(role_name=role_name, status=True)
        db.add(role)
        db.commit()
        db.refresh(role)
        print(f"    Created role: {role_name}")
    else:
        print(f"    Role already exists: {role_name}")
    return role


def seed_roles(db):
    print("\n==> Seeding roles...")
    admin_role   = ensure_role(db, "Admin")
    manager_role = ensure_role(db, "Manager")
    cashier_role = ensure_role(db, "Cashier")
    return admin_role, manager_role, cashier_role


def seed_role_permissions(db, admin_role, manager_role, cashier_role):
    print("\n==> Seeding role permissions for shop 3...")

    # Admin: full read + write on everything
    for module in ALL_MODULES:
        exists = db.query(RolePermission).filter_by(
            shop_id=SHOP_ID, role_id=admin_role.role_id, module=module
        ).first()
        if not exists:
            db.add(RolePermission(
                shop_id=SHOP_ID, role_id=admin_role.role_id,
                module=module, can_read=True, can_write=True
            ))

    # Manager: read + write except users
    manager_write_deny = {"users"}
    for module in ALL_MODULES:
        exists = db.query(RolePermission).filter_by(
            shop_id=SHOP_ID, role_id=manager_role.role_id, module=module
        ).first()
        if not exists:
            db.add(RolePermission(
                shop_id=SHOP_ID, role_id=manager_role.role_id,
                module=module,
                can_read=True,
                can_write=(module not in manager_write_deny),
            ))

    # Cashier: read + write only billing and customers
    cashier_write_allow = {"billing", "customers"}
    cashier_read_allow  = {"billing", "customers", "items", "categories"}
    for module in ALL_MODULES:
        exists = db.query(RolePermission).filter_by(
            shop_id=SHOP_ID, role_id=cashier_role.role_id, module=module
        ).first()
        if not exists:
            db.add(RolePermission(
                shop_id=SHOP_ID, role_id=cashier_role.role_id,
                module=module,
                can_read=(module in cashier_read_allow),
                can_write=(module in cashier_write_allow),
            ))

    db.commit()
    print("    Done.")


def get_branch(db):
    branch = db.query(Branch).filter_by(shop_id=SHOP_ID).first()
    if not branch:
        print(f"  ERROR: No branch found for shop_id={SHOP_ID}. Please create branch first.")
        sys.exit(1)
    return branch


def seed_users(db, admin_role, manager_role, cashier_role, branch_id):
    print("\n==> Seeding users for shop 3...")
    users_data = [
        ("admin",   "admin123",   "Shop Admin",   admin_role.role_id),
        ("manager", "manager123", "Store Manager", manager_role.role_id),
        ("cashier", "cashier123", "Cashier Staff", cashier_role.role_id),
    ]
    created = {}
    for username, password, name, role_id in users_data:
        existing = db.query(User).filter_by(shop_id=SHOP_ID, user_name=username).first()
        if not existing:
            u = User(
                shop_id=SHOP_ID,
                user_name=username,
                password=encode_password(password),
                name=name,
                role=role_id,
                branch_id=branch_id,
                status=True,
            )
            db.add(u)
            db.commit()
            db.refresh(u)
            created[username] = u
            print(f"    Created user: {username} / {password}")
        else:
            created[username] = existing
            print(f"    User already exists: {username}")
    return created


def seed_categories(db, branch_id):
    print("\n==> Seeding categories...")
    categories_data = [
        "Electronics",
        "Clothing",
        "Grocery",
        "Beverages",
        "Snacks",
    ]
    cats = {}
    for name in categories_data:
        existing = db.query(Category).filter_by(shop_id=SHOP_ID, category_name=name).first()
        if not existing:
            c = Category(
                shop_id=SHOP_ID,
                branch_id=None,  # shared across branches
                category_name=name,
                category_status=True,
            )
            db.add(c)
            db.commit()
            db.refresh(c)
            cats[name] = c
            print(f"    Created category: {name}")
        else:
            cats[name] = existing
            print(f"    Category already exists: {name}")
    return cats


def seed_items(db, cats, branch_id):
    print("\n==> Seeding items...")
    items_data = [
        # (name,                  category,      price,  buy,   mrp)
        ("USB Charging Cable",    "Electronics",  149.0,  80.0,  199.0),
        ("Wireless Earbuds",      "Electronics",  999.0, 600.0, 1299.0),
        ("Phone Stand",           "Electronics",  249.0, 120.0,  349.0),
        ("Cotton T-Shirt",        "Clothing",     399.0, 200.0,  499.0),
        ("Denim Jeans",           "Clothing",     799.0, 450.0,  999.0),
        ("Sports Socks (Pack 3)", "Clothing",     149.0,  70.0,  199.0),
        ("Basmati Rice 1kg",      "Grocery",       89.0,  60.0,  110.0),
        ("Refined Oil 1L",        "Grocery",      135.0,  95.0,  150.0),
        ("Wheat Flour 1kg",       "Grocery",       55.0,  38.0,   65.0),
        ("Mango Juice 200ml",     "Beverages",     30.0,  15.0,   35.0),
        ("Mineral Water 1L",      "Beverages",     20.0,   8.0,   25.0),
        ("Cold Coffee 250ml",     "Beverages",     60.0,  30.0,   75.0),
        ("Potato Chips 50g",      "Snacks",        30.0,  15.0,   40.0),
        ("Chocolate Bar",         "Snacks",        40.0,  22.0,   50.0),
        ("Mixed Nuts 100g",       "Snacks",       120.0,  75.0,  150.0),
    ]

    created_items = []
    for name, cat_name, price, buy, mrp in items_data:
        category = cats.get(cat_name)
        if not category:
            print(f"    SKIP {name}: category {cat_name} not found")
            continue
        existing = db.query(Item).filter_by(shop_id=SHOP_ID, item_name=name).first()
        if not existing:
            item = Item(
                shop_id=SHOP_ID,
                branch_id=None,
                category_id=category.category_id,
                item_name=name,
                price=price,
                buy_price=buy,
                mrp_price=mrp,
                item_status=True,
                is_raw_material=False,
                min_stock=5,
                gst_rate=0,
            )
            db.add(item)
            db.flush()

            # Stock row
            db.add(Inventory(
                shop_id=SHOP_ID,
                item_id=item.item_id,
                branch_id=branch_id,
                quantity=50,
                min_stock=5,
            ))

            # Branch item price row
            db.add(BranchItemPrice(
                shop_id=SHOP_ID,
                branch_id=branch_id,
                item_id=item.item_id,
                price=price,
                buy_price=buy,
                mrp_price=mrp,
                item_status=True,
            ))

            db.commit()
            db.refresh(item)
            created_items.append(item)
            print(f"    Created item: {name}")
        else:
            created_items.append(existing)
            print(f"    Item already exists: {name}")

    return created_items


def seed_customers(db):
    print("\n==> Seeding customers...")
    customers_data = [
        ("Rajesh Kumar",  "9876543210", "rajesh@email.com",  "Chennai",     "Tamil Nadu"),
        ("Priya Sharma",  "9123456789", "priya@email.com",   "Bangalore",   "Karnataka"),
        ("Amit Verma",    "9988776655", "",                  "Hyderabad",   "Telangana"),
        ("Sunita Rao",    "9870001234", "sunita@email.com",  "Tirupati",    "Andhra Pradesh"),
    ]
    for name, mobile, email, city, state in customers_data:
        existing = db.query(Customer).filter_by(shop_id=SHOP_ID, mobile=mobile).first()
        if not existing:
            db.add(Customer(
                shop_id=SHOP_ID,
                customer_name=name,
                mobile=mobile,
                email=email or None,
                city=city,
                state=state,
                status="ACTIVE",
            ))
            print(f"    Created customer: {name}")
        else:
            print(f"    Customer already exists: {name}")
    db.commit()


def seed_suppliers(db, branch_id):
    print("\n==> Seeding suppliers...")
    suppliers_data = [
        ("Star Distributors",   "9000000001", "Tirupati",  "Andhra Pradesh"),
        ("Krishna Traders",     "9000000002", "Chennai",   "Tamil Nadu"),
        ("Laxmi Wholesalers",   "9000000003", "Bangalore", "Karnataka"),
    ]
    for name, phone, city, state in suppliers_data:
        existing = db.query(Supplier).filter_by(shop_id=SHOP_ID, supplier_name=name).first()
        if not existing:
            db.add(Supplier(
                shop_id=SHOP_ID,
                branch_id=branch_id,
                supplier_name=name,
                phone=phone,
                city=city,
                state=state,
                status="ACTIVE",
            ))
            print(f"    Created supplier: {name}")
        else:
            print(f"    Supplier already exists: {name}")
    db.commit()


def seed_invoices(db, items, branch_id, admin_user_id):
    print("\n==> Seeding sample invoices (last 7 days)...")
    today = date.today()

    # 10 invoices spread over the last 7 days
    invoice_seeds = [
        # (days_ago, inv_suffix, [(item_idx, qty)])
        (6, "001", [(0, 2), (3, 1)]),
        (5, "002", [(10, 3), (12, 2)]),
        (5, "003", [(1, 1), (13, 4)]),
        (4, "004", [(7, 2), (8, 1)]),
        (4, "005", [(4, 1), (9, 5)]),
        (3, "006", [(2, 3), (14, 2)]),
        (3, "007", [(5, 2), (11, 4)]),
        (2, "008", [(6, 3), (0, 1)]),
        (1, "009", [(3, 2), (10, 3)]),
        (0, "010", [(1, 1), (13, 2), (9, 3)]),
    ]

    for days_ago, suffix, line_items in invoice_seeds:
        inv_date = today - timedelta(days=days_ago)
        inv_number = f"S3-{inv_date.strftime('%Y%m%d')}-{suffix}"

        existing = db.query(Invoice).filter_by(invoice_number=inv_number).first()
        if existing:
            print(f"    Invoice already exists: {inv_number}")
            continue

        total = 0.0
        lines = []
        for item_idx, qty in line_items:
            if item_idx >= len(items):
                continue
            item = items[item_idx]
            amount = round(float(item.price) * qty, 2)
            total += amount
            lines.append((item, qty, amount))

        if not lines:
            continue

        inv = Invoice(
            shop_id=SHOP_ID,
            branch_id=branch_id,
            invoice_number=inv_number,
            total_amount=round(total, 2),
            tax_amt=0,
            discounted_amt=0,
            payment_mode="cash",
            created_user=admin_user_id,
            created_time=f"{inv_date} 10:00:00+05:30",
        )
        db.add(inv)
        db.flush()

        for item, qty, amount in lines:
            db.add(InvoiceDetail(
                shop_id=SHOP_ID,
                invoice_id=inv.invoice_id,
                item_id=item.item_id,
                branch_id=branch_id,
                quantity=qty,
                amount=amount,
                buy_price=float(item.buy_price),
                mrp_price=float(item.mrp_price),
                tax_rate=0,
                taxable_value=amount,
                cgst_amt=0,
                sgst_amt=0,
                igst_amt=0,
                cess_amt=0,
            ))

        db.commit()
        print(f"    Created invoice: {inv_number}  ₹{total:.2f}")


def seed_expenses(db, branch_id, admin_user_id):
    print("\n==> Seeding branch expenses...")
    today = date.today()
    expenses_data = [
        (today - timedelta(days=3), 500.0,  "Electricity",  "cash",   "Monthly partial payment"),
        (today - timedelta(days=2), 1200.0, "Rent",         "online", "Weekly rent"),
        (today - timedelta(days=1), 350.0,  "Cleaning",     "cash",   "Daily cleaning supplies"),
        (today,                     200.0,  "Stationary",   "cash",   "Bill books and pens"),
    ]
    for exp_date, amount, category, mode, note in expenses_data:
        existing = db.query(BranchExpense).filter_by(
            shop_id=SHOP_ID, branch_id=branch_id,
            expense_date=exp_date, category=category
        ).first()
        if not existing:
            db.add(BranchExpense(
                shop_id=SHOP_ID,
                branch_id=branch_id,
                expense_date=exp_date,
                amount=amount,
                category=category,
                payment_mode=mode,
                note=note,
                created_by=admin_user_id,
            ))
            print(f"    Created expense: {category} ₹{amount}")
        else:
            print(f"    Expense already exists: {category} on {exp_date}")
    db.commit()


def main():
    db = SessionLocal()
    try:
        # Verify shop 3 exists
        shop = db.query(ShopDetails).filter_by(shop_id=SHOP_ID).first()
        if not shop:
            print(f"ERROR: shop_id={SHOP_ID} not found in shop_details. Create it first.")
            sys.exit(1)
        print(f"Found shop: {shop.shop_name} (id={SHOP_ID})")

        branch = get_branch(db)
        print(f"Using branch: {branch.branch_name} (id={branch.branch_id})")

        admin_role, manager_role, cashier_role = seed_roles(db)
        seed_role_permissions(db, admin_role, manager_role, cashier_role)

        users = seed_users(db, admin_role, manager_role, cashier_role, branch.branch_id)
        admin_user_id = users["admin"].user_id

        cats    = seed_categories(db, branch.branch_id)
        items   = seed_items(db, cats, branch.branch_id)
        seed_customers(db)
        seed_suppliers(db, branch.branch_id)
        seed_invoices(db, items, branch.branch_id, admin_user_id)
        seed_expenses(db, branch.branch_id, admin_user_id)

        print("\n==> All done!")
        print(f"\n  Shop login (shop_id={SHOP_ID})")
        print("  ─────────────────────────────────────────")
        print(f"  admin   / admin123   (full access)")
        print(f"  manager / manager123 (no user management)")
        print(f"  cashier / cashier123 (billing + customers only)")
        print()

    finally:
        db.close()


if __name__ == "__main__":
    main()
