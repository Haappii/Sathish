from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.branch import Branch
from app.models.category import Category
from app.models.employee import Employee, EmployeeAttendance
from app.models.invoice import Invoice
from app.models.invoice_details import InvoiceDetail
from app.models.items import Item
from app.models.roles import Role
from app.models.shop_details import ShopDetails
from app.models.stock import Inventory
from app.models.system_parameters import SystemParameters
from app.models.users import User
from app.services.role_service import ensure_core_roles
from app.utils.passwords import encode_password


def _get_role(db: Session, name: str) -> Role:
    role = (
        db.query(Role)
        .filter(Role.role_name.ilike(name))
        .first()
    )
    if not role:
        roles = ensure_core_roles(db)
        role = roles.get(name.strip().lower())
    if not role:
        raise RuntimeError(f"Role missing: {name}")
    return role


def _set_param(db: Session, *, shop_id: int, key: str, value: str) -> None:
    row = (
        db.query(SystemParameters)
        .filter(SystemParameters.shop_id == shop_id, SystemParameters.param_key == key)
        .first()
    )
    if not row:
        row = SystemParameters(shop_id=shop_id, param_key=key, param_value=value)
    else:
        row.param_value = value
    db.add(row)


def _ensure_inventory_enabled(db: Session, *, shop_id: int) -> None:
    _set_param(db, shop_id=shop_id, key="inventory_enabled", value="YES")


def _mk_shop(db: Session, *, billing_type: str, shop_name: str) -> ShopDetails:
    shop = ShopDetails(
        shop_name=shop_name,
        billing_type=billing_type,
        gst_enabled=True,
        gst_percent=Decimal("5.00"),
        gst_mode="inclusive",
        app_date=datetime.utcnow().date(),
    )
    db.add(shop)
    db.commit()
    db.refresh(shop)
    return shop


def _mk_branch(db: Session, *, shop_id: int, name: str, type_: str = "Head Office") -> Branch:
    b = Branch(
        shop_id=shop_id,
        branch_name=name,
        type=type_,
        status="ACTIVE",
        branch_close="N",
        city="Sample City",
        state="Sample State",
        country="Sample Country",
        pincode="000000",
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    return b


def _mk_user(
    db: Session,
    *,
    shop_id: int,
    branch_id: int,
    username: str,
    password: str,
    name: str,
    role_name: str,
) -> User:
    role = _get_role(db, role_name)
    user = User(
        shop_id=shop_id,
        user_name=username,
        password=encode_password(password),
        name=name,
        role=role.role_id,
        status=True,
        login_status=False,
        branch_id=branch_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _mk_category(db: Session, *, shop_id: int, name: str) -> Category:
    c = Category(shop_id=shop_id, category_name=name, category_status=True)
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def _mk_item(
    db: Session,
    *,
    shop_id: int,
    category_id: int,
    name: str,
    price: float,
    buy_price: float,
    mrp_price: float,
    is_raw_material: bool,
    min_stock: int = 0,
) -> Item:
    it = Item(
        shop_id=shop_id,
        category_id=category_id,
        item_name=name,
        price=float(price or 0),
        buy_price=float(buy_price or 0),
        mrp_price=float(mrp_price or 0),
        min_stock=int(min_stock or 0),
        is_raw_material=bool(is_raw_material),
        item_status=True,
    )
    db.add(it)
    db.commit()
    db.refresh(it)
    return it


def _mk_stock(db: Session, *, shop_id: int, branch_id: int, item_id: int, qty: int, min_stock: int) -> Inventory:
    row = Inventory(
        shop_id=shop_id,
        branch_id=branch_id,
        item_id=item_id,
        quantity=int(qty or 0),
        min_stock=int(min_stock or 0),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _mk_employee_and_attendance(db: Session, *, shop_id: int, branch_id: int, user_id: int, shop_date) -> None:
    emp = Employee(
        shop_id=shop_id,
        branch_id=branch_id,
        employee_code="E001",
        employee_name="Sample Employee",
        mobile="9999999999",
        designation="Staff",
        wage_type="DAILY",
        daily_wage=500,
        monthly_wage=0,
        active=True,
        created_by=user_id,
    )
    db.add(emp)
    db.commit()
    db.refresh(emp)

    att = EmployeeAttendance(
        shop_id=shop_id,
        employee_id=emp.employee_id,
        branch_id=branch_id,
        attendance_date=shop_date,
        status="PRESENT",
        worked_units=1,
        wage_amount=500,
        notes="Sample attendance wage",
        created_by=user_id,
    )
    db.add(att)
    db.commit()


def _mk_invoice(db: Session, *, shop_id: int, branch_id: int, user_id: int, item: Item, qty: int = 2) -> None:
    inv = Invoice(
        shop_id=shop_id,
        invoice_number=f"INV-{shop_id}-{branch_id}-0001",
        total_amount=Decimal("105.00"),
        tax_amt=Decimal("5.00"),
        discounted_amt=Decimal("0.00"),
        payment_mode="cash",
        branch_id=branch_id,
        created_user=user_id,
        created_time=datetime.utcnow(),
        customer_name="Walk-in",
        mobile="",
        gst_number="",
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)

    line = InvoiceDetail(
        shop_id=shop_id,
        invoice_id=inv.invoice_id,
        item_id=item.item_id,
        branch_id=branch_id,
        quantity=int(qty),
        amount=Decimal("100.00"),
        buy_price=float(item.buy_price or 0),
        mrp_price=float(item.mrp_price or 0),
    )
    db.add(line)
    db.commit()

