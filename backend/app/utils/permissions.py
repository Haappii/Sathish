from __future__ import annotations

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.role_permission import RolePermission
from app.utils.auth_user import get_current_user


PERMISSION_MODULES: list[dict[str, str]] = [
    {"key": "billing", "label": "Billing / Invoices"},
    {"key": "online_orders", "label": "Online Orders"},
    {"key": "categories", "label": "Categories"},
    {"key": "items", "label": "Items"},
    {"key": "pricing", "label": "Item Pricing / Price Levels"},
    {"key": "drafts", "label": "Draft Bills"},
    {"key": "returns", "label": "Sales Returns"},
    {"key": "dues", "label": "Customer Dues / Collections"},
    {"key": "customers", "label": "Customers"},
    {"key": "employees", "label": "Employee Management"},
    {"key": "loyalty", "label": "Loyalty Points"},
    {"key": "coupons", "label": "Coupons / Offers"},
    {"key": "cash_drawer", "label": "Cash Drawer / Shifts"},
    {"key": "stock_transfers", "label": "Stock Transfers"},
    {"key": "inventory", "label": "Inventory"},
    {"key": "stock_audit", "label": "Stock Audit / Cycle Count"},
    {"key": "item_lots", "label": "Batch / Expiry / Serial Lots"},
    {"key": "suppliers", "label": "Suppliers"},
    {"key": "supplier_ledger", "label": "Supplier Ledger"},
    {"key": "purchase_orders", "label": "Purchase Orders"},
    {"key": "expenses", "label": "Expenses"},
    {"key": "reports", "label": "Reports"},
    {"key": "analytics", "label": "Analytics"},
    {"key": "alerts", "label": "Alerts / Notifications"},
    {"key": "day_close", "label": "Day Close"},
    {"key": "users", "label": "User Management"},
    {"key": "roles", "label": "Role Management"},
    {"key": "setup", "label": "Setup / Admin"},
    {"key": "support_tickets", "label": "Support Tickets"},
]


DEFAULT_ROLE_PERMISSIONS: dict[str, dict[str, set[str]]] = {
    "billing": {"read": {"admin", "manager", "cashier", "waiter"}, "write": {"admin", "manager", "cashier", "waiter"}},
    "online_orders": {"read": {"admin", "manager", "cashier"}, "write": {"admin", "manager", "cashier"}},
    "categories": {"read": {"admin", "manager", "cashier"}, "write": {"admin"}},
    "items": {"read": {"admin", "manager", "cashier"}, "write": {"admin"}},
    "pricing": {"read": {"admin", "manager", "cashier"}, "write": {"admin", "manager"}},
    "drafts": {"read": {"admin", "manager", "cashier"}, "write": {"admin", "manager", "cashier"}},
    "customers": {"read": {"admin", "manager", "cashier"}, "write": {"admin", "manager", "cashier"}},
    "employees": {"read": {"admin", "manager"}, "write": {"admin", "manager"}},
    "dues": {"read": {"admin", "manager", "cashier"}, "write": {"admin", "manager", "cashier"}},
    "returns": {"read": {"admin", "manager"}, "write": {"admin", "manager"}},
    "loyalty": {"read": {"admin", "manager", "cashier"}, "write": {"admin", "manager", "cashier"}},
    "coupons": {"read": {"admin", "manager", "cashier"}, "write": {"admin", "manager"}},
    "cash_drawer": {"read": {"admin", "manager", "cashier"}, "write": {"admin", "manager", "cashier"}},
    "stock_transfers": {"read": {"admin", "manager"}, "write": {"admin", "manager"}},
    "inventory": {"read": {"admin", "manager", "cashier"}, "write": {"admin", "manager"}},
    "stock_audit": {"read": {"admin", "manager"}, "write": {"admin", "manager"}},
    "item_lots": {"read": {"admin", "manager"}, "write": {"admin", "manager"}},
    "suppliers": {"read": {"admin", "manager"}, "write": {"admin", "manager"}},
    "supplier_ledger": {"read": {"admin", "manager"}, "write": {"admin", "manager"}},
    "purchase_orders": {"read": {"admin", "manager"}, "write": {"admin", "manager"}},
    "expenses": {"read": {"admin", "manager"}, "write": {"admin", "manager"}},
    "reports": {"read": {"admin", "manager"}, "write": {"admin"}},
    "analytics": {"read": {"admin", "manager"}, "write": {"admin"}},
    "alerts": {"read": {"admin", "manager"}, "write": {"admin", "manager"}},
    "day_close": {"read": {"admin", "manager"}, "write": {"admin", "manager"}},
    "users": {"read": {"admin", "manager"}, "write": {"admin"}},
    "roles": {"read": {"admin"}, "write": {"admin"}},
    "setup": {"read": {"admin"}, "write": {"admin"}},
    "support_tickets": {"read": {"admin"}, "write": {"admin"}},
}


def _role_lower(user) -> str:
    return str(getattr(user, "role_name", "") or "").strip().lower()


def permissions_enabled(db: Session, *, shop_id: int) -> bool:
    return (
        db.query(RolePermission.id)
        .filter(RolePermission.shop_id == shop_id)
        .first()
        is not None
    )


def _action_to_field(action: str) -> str:
    a = (action or "").strip().lower()
    if a in {"read", "view", "list", "get"}:
        return "can_read"
    if a in {"write", "create", "update", "pay", "close", "dispatch", "receive", "upsert"}:
        return "can_write"
    if a in {"delete", "remove", "cancel"}:
        return "can_write"
    return "can_read"


def _allowed_by_default(*, module: str, action: str, user) -> bool:
    role = _role_lower(user)
    if role == "admin":
        return True
    mod = (module or "").strip().lower()
    act = (action or "").strip().lower()
    rules = DEFAULT_ROLE_PERMISSIONS.get(mod)
    if not rules:
        return False

    normalized = "read" if _action_to_field(act) == "can_read" else "write"
    allowed_roles = rules.get(normalized) or set()
    return role in allowed_roles


def require_permission(module: str, action: str):
    """
    FastAPI dependency: returns the current user if permitted, else raises 403.

    Behavior:
    - Admin always allowed.
    - If shop has any RolePermission rows, use DB-based permissions.
    - Otherwise, fallback to DEFAULT_ROLE_PERMISSIONS.
    """

    mod = (module or "").strip().lower()
    act = (action or "").strip().lower()

    def _dep(
        db: Session = Depends(get_db),
        user=Depends(get_current_user),
    ):
        role = _role_lower(user)
        if role == "admin":
            return user

        enabled = permissions_enabled(db, shop_id=int(user.shop_id))
        if not enabled:
            if _allowed_by_default(module=mod, action=act, user=user):
                return user
            raise HTTPException(403, "Permission denied")

        perm = (
            db.query(RolePermission)
            .filter(
                RolePermission.shop_id == user.shop_id,
                RolePermission.role_id == user.role,
                RolePermission.module == mod,
            )
            .first()
        )
        if not perm:
            raise HTTPException(403, "Permission denied")

        field = _action_to_field(act)
        if not bool(getattr(perm, field, False)):
            raise HTTPException(403, "Permission denied")
        return user

    return _dep
