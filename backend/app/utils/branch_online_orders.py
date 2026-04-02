from __future__ import annotations

from typing import Any, Iterable, Mapping

from sqlalchemy.orm import Session

from app.models.system_parameters import SystemParameters


BRANCH_ONLINE_ORDER_BOOL_FIELDS = {
    "swiggy_enabled",
    "zomato_enabled",
    "online_orders_auto_accept",
    "online_orders_signature_required",
    "online_orders_status_sync_enabled",
    "online_orders_status_sync_strict",
}
BRANCH_ONLINE_ORDER_INT_FIELDS = {
    "online_orders_status_sync_timeout_sec",
}
BRANCH_ONLINE_ORDER_TEXT_FIELDS = {
    "swiggy_partner_id",
    "zomato_partner_id",
    "online_orders_webhook_token",
    "swiggy_webhook_secret",
    "zomato_webhook_secret",
    "swiggy_status_sync_url",
    "zomato_status_sync_url",
    "swiggy_status_sync_token",
    "zomato_status_sync_token",
    "swiggy_status_sync_secret",
    "zomato_status_sync_secret",
}
BRANCH_ONLINE_ORDER_FIELDS = tuple(
    sorted(
        BRANCH_ONLINE_ORDER_BOOL_FIELDS
        | BRANCH_ONLINE_ORDER_INT_FIELDS
        | BRANCH_ONLINE_ORDER_TEXT_FIELDS
    )
)

BRANCH_ONLINE_ORDER_DEFAULTS = {
    "swiggy_enabled": False,
    "zomato_enabled": False,
    "online_orders_auto_accept": False,
    "online_orders_signature_required": False,
    "online_orders_status_sync_enabled": True,
    "online_orders_status_sync_strict": False,
    "online_orders_status_sync_timeout_sec": 8,
    "swiggy_partner_id": "",
    "zomato_partner_id": "",
    "online_orders_webhook_token": "",
    "swiggy_webhook_secret": "",
    "zomato_webhook_secret": "",
    "swiggy_status_sync_url": "",
    "zomato_status_sync_url": "",
    "swiggy_status_sync_token": "",
    "zomato_status_sync_token": "",
    "swiggy_status_sync_secret": "",
    "zomato_status_sync_secret": "",
}


def normalize_online_order_timeout(value: Any, default: int = 8) -> int:
    try:
        timeout = int(value)
    except Exception:
        timeout = default
    return max(3, min(timeout, 30))


def branch_online_order_param_key(branch_id: int, field: str) -> str:
    return f"branch:{int(branch_id)}:{field}"


def branch_online_order_param_keys(branch_id: int) -> dict[str, str]:
    return {
        field: branch_online_order_param_key(branch_id, field)
        for field in BRANCH_ONLINE_ORDER_FIELDS
    }


def serialize_branch_online_order_value(field: str, value: Any) -> str:
    if field in BRANCH_ONLINE_ORDER_BOOL_FIELDS:
        return "YES" if bool(value) else "NO"
    if field in BRANCH_ONLINE_ORDER_INT_FIELDS:
        return str(normalize_online_order_timeout(value))
    return str(value or "").strip()


def load_branch_online_order_param_map(
    db: Session,
    *,
    shop_id: int,
    branch_ids: Iterable[int] | None = None,
    include_legacy_shop: bool = True,
) -> dict[str, str]:
    param_keys = set()
    if include_legacy_shop:
        param_keys.update(BRANCH_ONLINE_ORDER_FIELDS)
    for branch_id in branch_ids or []:
        param_keys.update(branch_online_order_param_keys(int(branch_id)).values())

    if not param_keys:
        return {}

    rows = (
        db.query(SystemParameters.param_key, SystemParameters.param_value)
        .filter(
            SystemParameters.shop_id == shop_id,
            SystemParameters.param_key.in_(sorted(param_keys)),
        )
        .all()
    )
    return {str(k): ("" if v is None else str(v)) for k, v in rows}


def read_branch_online_order_settings_from_map(
    pmap: Mapping[str, str],
    branch_id: int,
    *,
    include_legacy_shop_fallback: bool = True,
) -> dict[str, Any]:
    branch_keys = branch_online_order_param_keys(branch_id)

    def raw(field: str):
        branch_key = branch_keys[field]
        if branch_key in pmap:
            return pmap.get(branch_key)
        if include_legacy_shop_fallback:
            return pmap.get(field)
        return None

    out: dict[str, Any] = {}
    for field in BRANCH_ONLINE_ORDER_BOOL_FIELDS:
        value = raw(field)
        default = bool(BRANCH_ONLINE_ORDER_DEFAULTS.get(field, False))
        out[field] = default if value is None else str(value).strip().upper() == "YES"
    for field in BRANCH_ONLINE_ORDER_INT_FIELDS:
        value = raw(field)
        out[field] = normalize_online_order_timeout(
            value,
            default=int(BRANCH_ONLINE_ORDER_DEFAULTS.get(field, 8)),
        )
    for field in BRANCH_ONLINE_ORDER_TEXT_FIELDS:
        value = raw(field)
        out[field] = "" if value is None else str(value)
    return out


def get_branch_online_order_settings(
    db: Session,
    *,
    shop_id: int,
    branch_id: int,
    include_legacy_shop_fallback: bool = True,
) -> dict[str, Any]:
    pmap = load_branch_online_order_param_map(
        db,
        shop_id=shop_id,
        branch_ids=[branch_id],
        include_legacy_shop=include_legacy_shop_fallback,
    )
    return read_branch_online_order_settings_from_map(
        pmap,
        branch_id,
        include_legacy_shop_fallback=include_legacy_shop_fallback,
    )
