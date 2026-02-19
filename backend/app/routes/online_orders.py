from __future__ import annotations

import base64
import hashlib
import hmac
import json
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any
from urllib import error as urlerror
from urllib import request as urlrequest

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.models.branch import Branch
from app.models.invoice import Invoice
from app.models.invoice_details import InvoiceDetail
from app.models.items import Item
from app.models.online_order import OnlineOrder, OnlineOrderEvent, OnlineOrderItem
from app.models.shop_details import ShopDetails
from app.models.system_parameters import SystemParameters
from app.schemas.online_order import (
    OnlineOrderCreateIn,
    OnlineOrderDetailOut,
    OnlineOrderListOut,
    OnlineOrderOut,
    OnlineOrderStatusUpdate,
    OnlineOrderSummaryOut,
    OnlineOrderWebhookIn,
)
from app.services.audit_service import log_action
from app.services.credit_service import ensure_invoice_due, upsert_customer
from app.services.gst_service import calculate_gst
from app.services.inventory_service import adjust_stock, is_inventory_enabled
from app.services.invoice_service import generate_invoice_number
from app.utils.permissions import require_permission

router = APIRouter(prefix="/online-orders", tags=["Online Orders"])

PROVIDERS = {"SWIGGY", "ZOMATO"}
STATUSES = {
    "NEW",
    "ACCEPTED",
    "PREPARING",
    "READY",
    "DISPATCHED",
    "DELIVERED",
    "CANCELLED",
    "REJECTED",
}
FINAL_STATUSES = {"DELIVERED", "CANCELLED", "REJECTED"}
STATUS_RANK = {
    "NEW": 1,
    "ACCEPTED": 2,
    "PREPARING": 3,
    "READY": 4,
    "DISPATCHED": 5,
    "DELIVERED": 6,
    "REJECTED": 7,
    "CANCELLED": 7,
}
PROVIDER_STATUS_MAP = {
    "ORDER_PLACED": "NEW",
    "PLACED": "NEW",
    "RECEIVED": "NEW",
    "PENDING": "NEW",
    "CONFIRMED": "ACCEPTED",
    "ACCEPTED": "ACCEPTED",
    "PREPARING": "PREPARING",
    "COOKING": "PREPARING",
    "READY": "READY",
    "READY_FOR_PICKUP": "READY",
    "PICKED_UP": "DISPATCHED",
    "OUT_FOR_DELIVERY": "DISPATCHED",
    "DISPATCHED": "DISPATCHED",
    "COMPLETED": "DELIVERED",
    "DELIVERED": "DELIVERED",
    "DECLINED": "REJECTED",
    "REJECTED": "REJECTED",
    "CANCELLED": "CANCELLED",
}
ALLOWED_NEXT_STATUSES = {
    "NEW": {"ACCEPTED", "CANCELLED", "REJECTED"},
    "ACCEPTED": {"PREPARING", "READY", "CANCELLED"},
    "PREPARING": {"READY", "CANCELLED"},
    "READY": {"DISPATCHED", "CANCELLED"},
    "DISPATCHED": {"DELIVERED", "CANCELLED"},
    "DELIVERED": set(),
    "CANCELLED": set(),
    "REJECTED": set(),
}
WEBHOOK_SIGNATURE_HEADERS = {
    "SWIGGY": ["x-swiggy-signature", "x-webhook-signature", "x-signature", "x-hub-signature-256"],
    "ZOMATO": ["x-zomato-signature", "x-webhook-signature", "x-signature", "x-hub-signature-256"],
}


def _to_float(v: Any) -> float:
    try:
        if v is None or v == "":
            return 0.0
        return float(v)
    except Exception:
        return 0.0


def _as_int(v: Any) -> int | None:
    try:
        if v in (None, ""):
            return None
        return int(v)
    except Exception:
        return None


def _pick(data: dict[str, Any] | None, *keys: str):
    if not isinstance(data, dict):
        return None
    for k in keys:
        if k in data and data.get(k) not in (None, ""):
            return data.get(k)
    return None


def _normalize_provider(provider: str) -> str:
    p = str(provider or "").strip().upper()
    if p not in PROVIDERS:
        raise HTTPException(400, "provider must be SWIGGY or ZOMATO")
    return p


def _normalize_status(status: str | None) -> str:
    s = str(status or "").strip().upper().replace(" ", "_")
    s = PROVIDER_STATUS_MAP.get(s, s)
    return s if s in STATUSES else "NEW"


def _status_can_advance(current: str, target: str) -> bool:
    if current == target:
        return False
    if target in FINAL_STATUSES:
        return True
    return STATUS_RANK.get(target, 0) >= STATUS_RANK.get(current, 0)


def _set_status_timestamps(order: OnlineOrder, target_status: str):
    now = datetime.utcnow()
    if target_status == "ACCEPTED" and not order.accepted_at:
        order.accepted_at = now
    if target_status == "DISPATCHED" and not order.dispatched_at:
        order.dispatched_at = now
    if target_status == "DELIVERED" and not order.delivered_at:
        order.delivered_at = now
    if target_status in {"CANCELLED", "REJECTED"} and not order.cancelled_at:
        order.cancelled_at = now


def _business_datetime(db: Session, shop_id: int) -> datetime:
    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == shop_id).first()
    business_date = shop.app_date if shop and shop.app_date else datetime.utcnow().date()
    return datetime.combine(business_date, datetime.now().time())


def _get_param(db: Session, shop_id: int, key: str) -> str | None:
    row = (
        db.query(SystemParameters)
        .filter(SystemParameters.shop_id == shop_id, SystemParameters.param_key == key)
        .first()
    )
    return (row.param_value or "").strip() if row and row.param_value is not None else None


def _provider_enabled(db: Session, shop_id: int, provider: str) -> bool:
    key = f"{provider.lower()}_enabled"
    val = _get_param(db, shop_id, key)
    if val is None:
        return True
    return val.strip().upper() == "YES"


def _provider_partner_id(db: Session, shop_id: int, provider: str) -> str | None:
    return _get_param(db, shop_id, f"{provider.lower()}_partner_id")


def _param_yes(db: Session, shop_id: int, key: str, *, default: bool = False) -> bool:
    v = _get_param(db, shop_id, key)
    if v is None:
        return default
    return str(v).strip().upper() == "YES"


def _extract_signature(headers, provider: str) -> str | None:
    for key in WEBHOOK_SIGNATURE_HEADERS.get(provider, []):
        value = headers.get(key)
        if value and str(value).strip():
            return str(value).strip()
    return None


def _strip_sig_prefix(signature_value: str) -> str:
    s = str(signature_value or "").strip()
    if not s:
        return s
    # Supports formats like: sha256=<hex>, v1=<hex>, or plain hex/base64
    if "=" in s:
        left, right = s.split("=", 1)
        if left.strip().lower() in {"sha256", "v1", "sig"} and right.strip():
            return right.strip()
    return s


def _verify_hmac_signature(secret: str, body: bytes, signature_value: str) -> bool:
    if not secret:
        return False
    sig = _strip_sig_prefix(signature_value)
    if not sig:
        return False

    digest = hmac.new(str(secret).encode("utf-8"), body, hashlib.sha256).digest()
    expected_hex = digest.hex()
    expected_b64 = base64.b64encode(digest).decode("utf-8")

    candidate = sig.strip()
    return hmac.compare_digest(candidate.lower(), expected_hex.lower()) or hmac.compare_digest(
        candidate, expected_b64
    )


def _webhook_auth_ok(
    db: Session,
    *,
    shop_id: int,
    provider: str,
    body: bytes,
    headers,
    x_webhook_token: str | None,
) -> tuple[bool, str]:
    provider_l = provider.lower()
    secret = _get_param(db, shop_id, f"{provider_l}_webhook_secret")
    signature_required = _param_yes(db, shop_id, "online_orders_signature_required", default=False)
    signature = _extract_signature(headers, provider)

    if secret:
        if not signature:
            return False, "Missing webhook signature"
        if not _verify_hmac_signature(secret, body, signature):
            return False, "Invalid webhook signature"
        return True, "hmac"

    if signature_required:
        return False, "Signature verification is enabled but provider secret is not configured"

    configured_token = _get_param(db, shop_id, "online_orders_webhook_token")
    if configured_token:
        if str(x_webhook_token or "").strip() != str(configured_token).strip():
            return False, "Invalid webhook token"
        return True, "token"

    # Dev mode fallback: no webhook secret/token configured
    return True, "open"


def _provider_sync_config(db: Session, shop_id: int, provider: str) -> dict[str, Any]:
    provider_l = provider.lower()
    timeout_raw = _get_param(db, shop_id, "online_orders_status_sync_timeout_sec")
    timeout_sec = 8
    if timeout_raw:
        try:
            timeout_sec = int(timeout_raw)
        except Exception:
            timeout_sec = 8
    timeout_sec = max(3, min(timeout_sec, 30))

    return {
        "enabled": _param_yes(db, shop_id, "online_orders_status_sync_enabled", default=True),
        "strict": _param_yes(db, shop_id, "online_orders_status_sync_strict", default=False),
        "url": _get_param(db, shop_id, f"{provider_l}_status_sync_url"),
        "token": _get_param(db, shop_id, f"{provider_l}_status_sync_token"),
        "secret": _get_param(db, shop_id, f"{provider_l}_status_sync_secret"),
        "timeout_sec": timeout_sec,
    }


def _safe_json_loads(raw_text: str | None):
    if not raw_text:
        return None
    try:
        return json.loads(raw_text)
    except Exception:
        return raw_text[:800]


def _post_json(url: str, payload: dict[str, Any], *, token: str | None, secret: str | None, timeout: int) -> dict[str, Any]:
    body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    req = urlrequest.Request(url=url, data=body, method="POST")
    req.add_header("Content-Type", "application/json")

    if token:
        req.add_header("Authorization", f"Bearer {token}")
    if secret:
        digest = hmac.new(str(secret).encode("utf-8"), body, hashlib.sha256).hexdigest()
        req.add_header("x-signature", f"sha256={digest}")

    try:
        with urlrequest.urlopen(req, timeout=timeout) as resp:
            text = (resp.read() or b"").decode("utf-8", errors="ignore")
            return {
                "ok": 200 <= int(resp.status) < 300,
                "status_code": int(resp.status),
                "response": _safe_json_loads(text),
            }
    except urlerror.HTTPError as e:
        text = (e.read() or b"").decode("utf-8", errors="ignore")
        return {
            "ok": False,
            "status_code": int(getattr(e, "code", 0) or 0),
            "response": _safe_json_loads(text),
            "error": f"HTTP {getattr(e, 'code', 'ERR')}",
        }
    except Exception as exc:
        return {"ok": False, "status_code": 0, "response": None, "error": str(exc)}


def _sync_status_to_provider(db: Session, *, order: OnlineOrder, status: str) -> dict[str, Any]:
    config = _provider_sync_config(db, order.shop_id, order.provider)
    if not config.get("enabled", True):
        return {"ok": True, "skipped": True, "reason": "sync_disabled", "strict": bool(config.get("strict"))}
    url = str(config.get("url") or "").strip()
    if not url:
        return {"ok": True, "skipped": True, "reason": "sync_url_missing", "strict": bool(config.get("strict"))}

    payload = {
        "provider": order.provider,
        "partner_id": order.partner_id,
        "provider_order_id": order.provider_order_id,
        "provider_order_number": order.provider_order_number,
        "status": str(status or "").upper(),
        "shop_id": order.shop_id,
        "branch_id": order.branch_id,
        "event_time": datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
    }
    result = _post_json(
        url,
        payload,
        token=config.get("token"),
        secret=config.get("secret"),
        timeout=int(config.get("timeout_sec") or 8),
    )
    result["strict"] = bool(config.get("strict"))
    result["url"] = url
    return result


def _resolve_user_branch(branch_id_param: int | None, user) -> int:
    role = str(getattr(user, "role_name", "") or "").strip().lower()
    branch_raw = branch_id_param if role == "admin" and branch_id_param else getattr(user, "branch_id", None)
    try:
        return int(branch_raw)
    except Exception:
        raise HTTPException(400, "Branch required")


def _resolve_webhook_branch(db: Session, shop_id: int, branch_id: int | None) -> int | None:
    if branch_id:
        branch = (
            db.query(Branch)
            .filter(Branch.shop_id == shop_id, Branch.branch_id == branch_id, Branch.status == "ACTIVE")
            .first()
        )
        if branch:
            return int(branch.branch_id)

    fallback = (
        db.query(Branch)
        .filter(Branch.shop_id == shop_id, Branch.status == "ACTIVE")
        .order_by(Branch.branch_id.asc())
        .first()
    )
    return int(fallback.branch_id) if fallback else None


def _assert_branch_access(order: OnlineOrder, user):
    role = str(getattr(user, "role_name", "") or "").strip().lower()
    if role == "admin":
        return
    if order.branch_id is None:
        raise HTTPException(403, "Not allowed")
    if int(order.branch_id) != int(getattr(user, "branch_id", 0) or 0):
        raise HTTPException(403, "Not allowed")


def _add_event(
    db: Session,
    *,
    order: OnlineOrder,
    event_type: str,
    provider_status: str | None = None,
    message: str | None = None,
    payload: dict[str, Any] | None = None,
    actor_user_id: int | None = None,
):
    db.add(
        OnlineOrderEvent(
            shop_id=order.shop_id,
            online_order_id=order.online_order_id,
            event_type=event_type,
            provider_status=provider_status,
            message=message,
            payload=payload,
            actor_user_id=actor_user_id,
        )
    )


def _normalize_webhook_payload(provider: str, body: dict[str, Any]) -> OnlineOrderWebhookIn:
    root = body or {}
    data = root.get("data") if isinstance(root.get("data"), dict) else root
    order_block = data.get("order") if isinstance(data.get("order"), dict) else data

    event = _pick(root, "event", "event_type", "type") or _pick(data, "event", "event_type", "type")
    provider_order_id = _pick(
        order_block,
        "provider_order_id",
        "order_id",
        "id",
        "orderId",
        "reference_id",
    ) or _pick(root, "provider_order_id", "order_id", "id")
    if provider_order_id in (None, ""):
        raise HTTPException(400, "provider_order_id/order_id is required")

    provider_order_number = _pick(order_block, "provider_order_number", "order_number", "display_id")
    provider_status = _pick(order_block, "provider_status", "status") or _pick(
        root, "provider_status", "status"
    )
    branch_id = _as_int(_pick(order_block, "branch_id", "store_id", "outlet_id"))
    partner_id = _pick(order_block, "partner_id", "restaurant_id", "merchant_id")
    order_type = _pick(order_block, "order_type", "type") or "DELIVERY"

    customer = order_block.get("customer") if isinstance(order_block.get("customer"), dict) else {}
    customer_name = _pick(order_block, "customer_name", "name") or _pick(customer, "name")
    customer_mobile = _pick(order_block, "customer_mobile", "mobile", "phone") or _pick(
        customer, "mobile", "phone"
    )
    customer_address = _pick(order_block, "customer_address", "address") or _pick(customer, "address")

    source_created_at = _pick(order_block, "source_created_at", "created_at")
    source_created_dt = None
    if source_created_at:
        try:
            source_created_dt = datetime.fromisoformat(str(source_created_at).replace("Z", "+00:00"))
        except Exception:
            source_created_dt = None

    items_src = _pick(order_block, "items", "order_items", "cart_items")
    parsed_items = []
    if isinstance(items_src, list):
        for idx, row in enumerate(items_src):
            if not isinstance(row, dict):
                continue
            qty = _to_float(_pick(row, "quantity", "qty", "count", "units")) or 1.0
            unit_price = _to_float(_pick(row, "unit_price", "price", "rate"))
            line_total = _to_float(_pick(row, "line_total", "amount", "total"))
            if line_total <= 0:
                line_total = float(Decimal(str(unit_price * qty)).quantize(Decimal("0.01")))
            item_name = str(
                _pick(row, "item_name", "name", "title", "product_name") or f"Item {idx + 1}"
            ).strip()
            parsed_items.append(
                {
                    "provider_item_id": str(_pick(row, "provider_item_id", "sku", "id", "item_id") or "")
                    or None,
                    "item_id": _as_int(_pick(row, "item_id")),
                    "item_name": item_name,
                    "quantity": qty,
                    "unit_price": unit_price,
                    "line_total": line_total,
                    "notes": _pick(row, "notes", "instruction", "special_instruction"),
                }
            )

    subtotal = _to_float(_pick(order_block, "subtotal_amount", "subtotal"))
    tax_amount = _to_float(_pick(order_block, "tax_amount", "tax"))
    discount_amount = _to_float(_pick(order_block, "discount_amount", "discount"))
    delivery_charge = _to_float(_pick(order_block, "delivery_charge", "delivery_fee"))
    packaging_charge = _to_float(_pick(order_block, "packaging_charge", "packing_charge"))
    total_amount = _to_float(_pick(order_block, "total_amount", "grand_total", "amount"))
    if total_amount <= 0:
        total_amount = max(0.0, subtotal + tax_amount + delivery_charge + packaging_charge - discount_amount)

    return OnlineOrderWebhookIn(
        event=str(event).strip() if event else "WEBHOOK_RECEIVED",
        provider_order_id=str(provider_order_id).strip(),
        provider_order_number=str(provider_order_number).strip() if provider_order_number else None,
        provider_status=str(provider_status).strip() if provider_status else None,
        branch_id=branch_id,
        partner_id=str(partner_id).strip() if partner_id else None,
        order_type=str(order_type).strip() if order_type else "DELIVERY",
        customer_name=str(customer_name).strip() if customer_name else None,
        customer_mobile=str(customer_mobile).strip() if customer_mobile else None,
        customer_address=str(customer_address).strip() if customer_address else None,
        subtotal_amount=subtotal,
        tax_amount=tax_amount,
        discount_amount=discount_amount,
        delivery_charge=delivery_charge,
        packaging_charge=packaging_charge,
        total_amount=total_amount,
        payment_mode=_pick(order_block, "payment_mode", "payment_type", "payment_method"),
        payment_status=_pick(order_block, "payment_status"),
        notes=_pick(order_block, "notes", "note", "instructions"),
        source_created_at=source_created_dt,
        items=parsed_items,
        raw_payload=root,
    )


def _upsert_order(
    db: Session,
    *,
    shop_id: int,
    provider: str,
    payload: OnlineOrderCreateIn | OnlineOrderWebhookIn,
    webhook_event: str | None = None,
    user_id: int | None = None,
    replace_items: bool = True,
) -> tuple[OnlineOrder, bool]:
    provider_u = _normalize_provider(provider)
    provider_order_id = str(payload.provider_order_id or "").strip()
    if not provider_order_id:
        raise HTTPException(400, "provider_order_id is required")

    order = (
        db.query(OnlineOrder)
        .filter(
            OnlineOrder.shop_id == shop_id,
            OnlineOrder.provider == provider_u,
            OnlineOrder.provider_order_id == provider_order_id,
        )
        .first()
    )
    created = False
    if not order:
        order = OnlineOrder(
            shop_id=shop_id,
            provider=provider_u,
            provider_order_id=provider_order_id,
            status="NEW",
        )
        db.add(order)
        db.flush()
        created = True

    order.provider_order_number = payload.provider_order_number or order.provider_order_number
    if getattr(payload, "branch_id", None):
        order.branch_id = int(payload.branch_id)
    order.partner_id = payload.partner_id or order.partner_id
    order.order_type = str(payload.order_type or "DELIVERY").strip().upper()
    order.customer_name = payload.customer_name
    order.customer_mobile = payload.customer_mobile
    order.customer_address = payload.customer_address
    order.subtotal_amount = _to_float(payload.subtotal_amount)
    order.tax_amount = _to_float(payload.tax_amount)
    order.discount_amount = _to_float(payload.discount_amount)
    order.delivery_charge = _to_float(payload.delivery_charge)
    order.packaging_charge = _to_float(payload.packaging_charge)
    order.total_amount = _to_float(payload.total_amount)
    order.payment_mode = payload.payment_mode
    order.payment_status = payload.payment_status
    order.notes = payload.notes
    order.source_created_at = payload.source_created_at or order.source_created_at
    order.webhook_event = webhook_event or order.webhook_event
    if hasattr(payload, "raw_payload"):
        order.raw_payload = payload.raw_payload

    status_raw = getattr(payload, "provider_status", None) or getattr(payload, "status", None)
    target_status = _normalize_status(status_raw)
    if _status_can_advance(str(order.status or "NEW").upper(), target_status):
        order.status = target_status
        _set_status_timestamps(order, target_status)

    if user_id:
        if created:
            order.created_by = user_id
        order.updated_by = user_id

    if replace_items and payload.items is not None:
        db.query(OnlineOrderItem).filter(OnlineOrderItem.online_order_id == order.online_order_id).delete()
        for row in payload.items:
            qty = max(0.001, _to_float(row.quantity))
            unit_price = _to_float(row.unit_price)
            line_total = _to_float(row.line_total)
            if line_total <= 0:
                line_total = float(Decimal(str(qty * unit_price)).quantize(Decimal("0.01")))
            db.add(
                OnlineOrderItem(
                    shop_id=shop_id,
                    online_order_id=order.online_order_id,
                    item_id=row.item_id,
                    provider_item_id=row.provider_item_id,
                    item_name=row.item_name,
                    quantity=qty,
                    unit_price=unit_price,
                    line_total=line_total,
                    notes=row.notes,
                )
            )

    db.flush()
    return order, created


@router.get("/", response_model=OnlineOrderListOut)
def list_online_orders(
    provider: str | None = Query(None),
    status: str | None = Query(None),
    branch_id: int | None = Query(None),
    search: str | None = Query(None),
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    user=Depends(require_permission("online_orders", "read")),
):
    q = db.query(OnlineOrder).filter(OnlineOrder.shop_id == user.shop_id)

    role = str(getattr(user, "role_name", "") or "").strip().lower()
    if role != "admin":
        q = q.filter(OnlineOrder.branch_id == user.branch_id)
    else:
        if branch_id:
            q = q.filter(OnlineOrder.branch_id == branch_id)

    if provider:
        q = q.filter(OnlineOrder.provider == _normalize_provider(provider))
    if status:
        q = q.filter(OnlineOrder.status == _normalize_status(status))
    if search:
        s = f"%{search.strip()}%"
        q = q.filter(
            or_(
                OnlineOrder.provider_order_id.ilike(s),
                OnlineOrder.provider_order_number.ilike(s),
                OnlineOrder.customer_name.ilike(s),
                OnlineOrder.customer_mobile.ilike(s),
            )
        )
    if from_date:
        q = q.filter(OnlineOrder.created_at >= datetime.combine(from_date, time.min))
    if to_date:
        q = q.filter(OnlineOrder.created_at <= datetime.combine(to_date, time.max))

    total = q.count()
    rows = (
        q.order_by(OnlineOrder.online_order_id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return {"rows": rows, "total": total}


@router.get("/summary", response_model=OnlineOrderSummaryOut)
def online_orders_summary(
    branch_id: int | None = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_permission("online_orders", "read")),
):
    q = db.query(OnlineOrder.status, func.count(OnlineOrder.online_order_id)).filter(
        OnlineOrder.shop_id == user.shop_id
    )
    role = str(getattr(user, "role_name", "") or "").strip().lower()
    if role != "admin":
        q = q.filter(OnlineOrder.branch_id == user.branch_id)
    elif branch_id:
        q = q.filter(OnlineOrder.branch_id == branch_id)

    rows = q.group_by(OnlineOrder.status).all()
    counts = {str(k or "").upper(): int(v or 0) for k, v in rows}

    total = sum(counts.values())
    new_count = counts.get("NEW", 0)
    active_count = sum(v for k, v in counts.items() if k not in FINAL_STATUSES)
    delivered_count = counts.get("DELIVERED", 0)
    cancelled_count = counts.get("CANCELLED", 0) + counts.get("REJECTED", 0)
    pending_for_action = sum(
        counts.get(k, 0) for k in ["NEW", "ACCEPTED", "PREPARING", "READY", "DISPATCHED"]
    )
    return {
        "total": total,
        "new_count": new_count,
        "active_count": active_count,
        "delivered_count": delivered_count,
        "cancelled_count": cancelled_count,
        "pending_for_action": pending_for_action,
    }


@router.get("/{online_order_id}", response_model=OnlineOrderDetailOut)
def get_online_order(
    online_order_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("online_orders", "read")),
):
    order = (
        db.query(OnlineOrder)
        .options(joinedload(OnlineOrder.items), joinedload(OnlineOrder.events))
        .filter(OnlineOrder.shop_id == user.shop_id, OnlineOrder.online_order_id == online_order_id)
        .first()
    )
    if not order:
        raise HTTPException(404, "Online order not found")
    _assert_branch_access(order, user)
    order.events = sorted(order.events or [], key=lambda e: e.event_id, reverse=True)
    return order


@router.post("/", response_model=OnlineOrderOut)
def create_or_upsert_online_order(
    payload: OnlineOrderCreateIn,
    db: Session = Depends(get_db),
    user=Depends(require_permission("online_orders", "write")),
):
    provider = _normalize_provider(payload.provider)
    branch_id = _resolve_user_branch(payload.branch_id, user)
    payload.branch_id = branch_id

    order, created = _upsert_order(
        db,
        shop_id=user.shop_id,
        provider=provider,
        payload=payload,
        webhook_event="MANUAL_CREATE",
        user_id=user.user_id,
        replace_items=True,
    )

    _add_event(
        db,
        order=order,
        event_type="MANUAL_CREATE" if created else "MANUAL_UPDATE",
        provider_status=order.status,
        message="Order created manually" if created else "Order updated manually",
        payload=payload.model_dump(),
        actor_user_id=user.user_id,
    )
    db.commit()
    db.refresh(order)

    log_action(
        db,
        shop_id=user.shop_id,
        module="OnlineOrders",
        action="CREATE" if created else "UPDATE",
        record_id=f"{order.provider}:{order.provider_order_id}",
        new={
            "online_order_id": order.online_order_id,
            "branch_id": order.branch_id,
            "status": order.status,
            "total_amount": float(order.total_amount or 0),
        },
        user_id=user.user_id,
    )
    return order


@router.post("/{online_order_id}/status", response_model=OnlineOrderOut)
def update_online_order_status(
    online_order_id: int,
    payload: OnlineOrderStatusUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_permission("online_orders", "write")),
):
    order = (
        db.query(OnlineOrder)
        .filter(OnlineOrder.shop_id == user.shop_id, OnlineOrder.online_order_id == online_order_id)
        .first()
    )
    if not order:
        raise HTTPException(404, "Online order not found")
    _assert_branch_access(order, user)

    current = str(order.status or "NEW").upper()
    target = _normalize_status(payload.status)
    if current == target:
        return order

    if target not in (ALLOWED_NEXT_STATUSES.get(current) or set()):
        raise HTTPException(400, f"Cannot change status from {current} to {target}")

    order.status = target
    order.updated_by = user.user_id
    _set_status_timestamps(order, target)
    _add_event(
        db,
        order=order,
        event_type="STATUS_CHANGED",
        provider_status=target,
        message=payload.note or f"Status changed to {target}",
        payload={"from_status": current, "to_status": target},
        actor_user_id=user.user_id,
    )

    sync_result = _sync_status_to_provider(db, order=order, status=target)
    if sync_result.get("skipped"):
        _add_event(
            db,
            order=order,
            event_type="STATUS_SYNC_SKIPPED",
            provider_status=target,
            message=f"Status sync skipped ({sync_result.get('reason')})",
            payload={"reason": sync_result.get("reason")},
            actor_user_id=user.user_id,
        )
    elif sync_result.get("ok"):
        _add_event(
            db,
            order=order,
            event_type="STATUS_SYNC_OK",
            provider_status=target,
            message="Status synced to provider",
            payload={
                "status_code": sync_result.get("status_code"),
                "url": sync_result.get("url"),
                "response": sync_result.get("response"),
            },
            actor_user_id=user.user_id,
        )
    else:
        _add_event(
            db,
            order=order,
            event_type="STATUS_SYNC_FAILED",
            provider_status=target,
            message=f"Status sync failed: {sync_result.get('error') or 'unknown error'}",
            payload={
                "status_code": sync_result.get("status_code"),
                "url": sync_result.get("url"),
                "response": sync_result.get("response"),
                "error": sync_result.get("error"),
            },
            actor_user_id=user.user_id,
        )
        if sync_result.get("strict"):
            db.rollback()
            raise HTTPException(502, f"Status sync failed: {sync_result.get('error') or 'provider error'}")

    db.commit()
    db.refresh(order)

    log_action(
        db,
        shop_id=user.shop_id,
        module="OnlineOrders",
        action="STATUS_UPDATE",
        record_id=f"{order.provider}:{order.provider_order_id}",
        old={"status": current},
        new={"status": target},
        user_id=user.user_id,
    )
    return order


@router.post("/{online_order_id}/accept", response_model=OnlineOrderOut)
def accept_online_order(
    online_order_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("online_orders", "write")),
):
    return update_online_order_status(
        online_order_id=online_order_id,
        payload=OnlineOrderStatusUpdate(status="ACCEPTED", note="Accepted"),
        db=db,
        user=user,
    )


@router.post("/{online_order_id}/reject", response_model=OnlineOrderOut)
def reject_online_order(
    online_order_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("online_orders", "write")),
):
    return update_online_order_status(
        online_order_id=online_order_id,
        payload=OnlineOrderStatusUpdate(status="REJECTED", note="Rejected"),
        db=db,
        user=user,
    )


@router.post("/{online_order_id}/prepare", response_model=OnlineOrderOut)
def prepare_online_order(
    online_order_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("online_orders", "write")),
):
    return update_online_order_status(
        online_order_id=online_order_id,
        payload=OnlineOrderStatusUpdate(status="PREPARING", note="Preparing"),
        db=db,
        user=user,
    )


@router.post("/{online_order_id}/ready", response_model=OnlineOrderOut)
def ready_online_order(
    online_order_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("online_orders", "write")),
):
    return update_online_order_status(
        online_order_id=online_order_id,
        payload=OnlineOrderStatusUpdate(status="READY", note="Ready"),
        db=db,
        user=user,
    )


@router.post("/{online_order_id}/dispatch", response_model=OnlineOrderOut)
def dispatch_online_order(
    online_order_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("online_orders", "write")),
):
    return update_online_order_status(
        online_order_id=online_order_id,
        payload=OnlineOrderStatusUpdate(status="DISPATCHED", note="Dispatched"),
        db=db,
        user=user,
    )


@router.post("/{online_order_id}/deliver", response_model=OnlineOrderOut)
def deliver_online_order(
    online_order_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("online_orders", "write")),
):
    return update_online_order_status(
        online_order_id=online_order_id,
        payload=OnlineOrderStatusUpdate(status="DELIVERED", note="Delivered"),
        db=db,
        user=user,
    )


@router.post("/{online_order_id}/cancel", response_model=OnlineOrderOut)
def cancel_online_order(
    online_order_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("online_orders", "write")),
):
    return update_online_order_status(
        online_order_id=online_order_id,
        payload=OnlineOrderStatusUpdate(status="CANCELLED", note="Cancelled"),
        db=db,
        user=user,
    )


@router.post("/{online_order_id}/sync-status")
def sync_online_order_status(
    online_order_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("online_orders", "write")),
):
    order = (
        db.query(OnlineOrder)
        .filter(OnlineOrder.shop_id == user.shop_id, OnlineOrder.online_order_id == online_order_id)
        .first()
    )
    if not order:
        raise HTTPException(404, "Online order not found")
    _assert_branch_access(order, user)

    target = str(order.status or "NEW").upper()
    sync_result = _sync_status_to_provider(db, order=order, status=target)

    if sync_result.get("skipped"):
        _add_event(
            db,
            order=order,
            event_type="STATUS_SYNC_SKIPPED",
            provider_status=target,
            message=f"Manual sync skipped ({sync_result.get('reason')})",
            payload={"reason": sync_result.get("reason")},
            actor_user_id=user.user_id,
        )
    elif sync_result.get("ok"):
        _add_event(
            db,
            order=order,
            event_type="STATUS_SYNC_OK",
            provider_status=target,
            message="Manual status sync successful",
            payload={
                "status_code": sync_result.get("status_code"),
                "url": sync_result.get("url"),
                "response": sync_result.get("response"),
            },
            actor_user_id=user.user_id,
        )
    else:
        _add_event(
            db,
            order=order,
            event_type="STATUS_SYNC_FAILED",
            provider_status=target,
            message=f"Manual status sync failed: {sync_result.get('error') or 'unknown error'}",
            payload={
                "status_code": sync_result.get("status_code"),
                "url": sync_result.get("url"),
                "response": sync_result.get("response"),
                "error": sync_result.get("error"),
            },
            actor_user_id=user.user_id,
        )

    db.commit()

    if not sync_result.get("ok") and not sync_result.get("skipped"):
        raise HTTPException(502, f"Status sync failed: {sync_result.get('error') or 'provider error'}")

    return {
        "success": True,
        "skipped": bool(sync_result.get("skipped")),
        "reason": sync_result.get("reason"),
        "status_code": sync_result.get("status_code"),
    }


@router.post("/{online_order_id}/convert-to-invoice")
def convert_online_order_to_invoice(
    online_order_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("online_orders", "write")),
):
    order = (
        db.query(OnlineOrder)
        .options(joinedload(OnlineOrder.items))
        .filter(OnlineOrder.shop_id == user.shop_id, OnlineOrder.online_order_id == online_order_id)
        .first()
    )
    if not order:
        raise HTTPException(404, "Online order not found")
    _assert_branch_access(order, user)

    if order.invoice_id:
        inv = db.query(Invoice).filter(Invoice.invoice_id == order.invoice_id).first()
        return {
            "online_order_id": order.online_order_id,
            "invoice_id": order.invoice_id,
            "invoice_number": inv.invoice_number if inv else None,
            "message": "Invoice already created",
        }

    if str(order.status or "").upper() in {"CANCELLED", "REJECTED"}:
        raise HTTPException(400, "Cannot create invoice for cancelled/rejected order")

    if not order.items:
        raise HTTPException(400, "No order items to convert")

    branch_id = int(order.branch_id or getattr(user, "branch_id", 0) or 0)
    if not branch_id:
        raise HTTPException(400, "Branch not resolved for this order")

    item_ids = [int(x.item_id) for x in order.items if x.item_id]
    item_map = {
        x.item_id: x
        for x in db.query(Item).filter(Item.shop_id == user.shop_id, Item.item_id.in_(item_ids)).all()
    }
    lower_name_map = {
        str(x.item_name or "").strip().lower(): x for x in db.query(Item).filter(Item.shop_id == user.shop_id).all()
    }

    missing = []
    resolved = []
    for row in order.items:
        item_obj = item_map.get(int(row.item_id)) if row.item_id else None
        if not item_obj:
            item_obj = lower_name_map.get(str(row.item_name or "").strip().lower())
        if not item_obj:
            missing.append(row.item_name)
            continue
        qty = max(1, int(round(_to_float(row.quantity))))
        amt = _to_float(row.line_total)
        if amt <= 0:
            amt = float(Decimal(str(_to_float(row.unit_price) * qty)).quantize(Decimal("0.01")))
        resolved.append((row, item_obj, qty, amt))

    if missing:
        raise HTTPException(400, f"Map these items first in master: {', '.join(missing)}")

    invoice = Invoice(
        invoice_number=generate_invoice_number(db, shop_id=user.shop_id, branch_id=branch_id),
        shop_id=user.shop_id,
        branch_id=branch_id,
        created_user=user.user_id,
        created_time=_business_datetime(db, user.shop_id),
        customer_name=order.customer_name,
        mobile=order.customer_mobile,
        payment_mode=(order.payment_mode or "online").lower(),
        payment_split=None,
    )
    db.add(invoice)
    db.flush()

    subtotal = Decimal("0.00")
    for _, item_obj, qty, amt in resolved:
        subtotal += Decimal(str(amt))
        db.add(
            InvoiceDetail(
                invoice_id=invoice.invoice_id,
                shop_id=user.shop_id,
                item_id=item_obj.item_id,
                branch_id=branch_id,
                quantity=qty,
                amount=amt,
                buy_price=float(item_obj.buy_price or 0),
                mrp_price=float(item_obj.mrp_price or 0),
            )
        )
        if is_inventory_enabled(db, user.shop_id):
            adjust_stock(
                db,
                user.shop_id,
                item_obj.item_id,
                branch_id,
                qty,
                "REMOVE",
                ref_no=invoice.invoice_number,
            )

    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == user.shop_id).first()
    tax_amt, total_amount = calculate_gst(subtotal, shop)
    invoice.tax_amt = tax_amt
    invoice.total_amount = total_amount
    invoice.discounted_amt = _to_float(order.discount_amount)

    order.invoice_id = invoice.invoice_id
    order.updated_by = user.user_id
    _add_event(
        db,
        order=order,
        event_type="INVOICE_CREATED",
        provider_status=order.status,
        message=f"Invoice created: {invoice.invoice_number}",
        payload={"invoice_id": invoice.invoice_id, "invoice_number": invoice.invoice_number},
        actor_user_id=user.user_id,
    )

    customer = upsert_customer(
        db,
        shop_id=user.shop_id,
        customer_name=invoice.customer_name,
        mobile=invoice.mobile,
        gst_number=invoice.gst_number,
        created_by=user.user_id,
    )
    ensure_invoice_due(
        db,
        shop_id=user.shop_id,
        invoice=invoice,
        customer=customer,
        created_by=user.user_id,
    )
    db.commit()
    db.refresh(invoice)

    log_action(
        db,
        shop_id=user.shop_id,
        module="OnlineOrders",
        action="CONVERT_TO_INVOICE",
        record_id=f"{order.provider}:{order.provider_order_id}",
        new={"invoice_id": invoice.invoice_id, "invoice_number": invoice.invoice_number},
        user_id=user.user_id,
    )

    return {
        "online_order_id": order.online_order_id,
        "invoice_id": invoice.invoice_id,
        "invoice_number": invoice.invoice_number,
        "message": "Invoice created",
    }


@router.post("/webhook/{provider}/{shop_id}")
async def online_order_webhook(
    provider: str,
    shop_id: int,
    request: Request,
    x_webhook_token: str | None = Header(None),
    db: Session = Depends(get_db),
):
    provider_u = _normalize_provider(provider)

    if not _provider_enabled(db, shop_id, provider_u):
        raise HTTPException(403, f"{provider_u} integration is disabled")

    raw_body = await request.body()
    if not raw_body:
        raise HTTPException(400, "Empty webhook payload")
    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except Exception:
        raise HTTPException(400, "Invalid JSON payload")

    auth_ok, auth_mode = _webhook_auth_ok(
        db,
        shop_id=shop_id,
        provider=provider_u,
        body=raw_body,
        headers=request.headers,
        x_webhook_token=x_webhook_token,
    )
    if not auth_ok:
        raise HTTPException(401, auth_mode)

    configured_partner = _provider_partner_id(db, shop_id, provider_u)
    normalized = _normalize_webhook_payload(provider_u, payload or {})
    if configured_partner and normalized.partner_id and configured_partner != normalized.partner_id:
        raise HTTPException(403, "partner_id mismatch")

    normalized.branch_id = _resolve_webhook_branch(db, shop_id, normalized.branch_id)
    if normalized.partner_id is None and configured_partner:
        normalized.partner_id = configured_partner

    order, created = _upsert_order(
        db,
        shop_id=shop_id,
        provider=provider_u,
        payload=normalized,
        webhook_event=str(normalized.event or "WEBHOOK_RECEIVED").upper(),
        user_id=None,
        replace_items=True,
    )

    _add_event(
        db,
        order=order,
        event_type=str(normalized.event or "WEBHOOK_RECEIVED").upper(),
        provider_status=normalized.provider_status,
        message=f"Webhook processed ({auth_mode})",
        payload=normalized.raw_payload,
        actor_user_id=None,
    )

    auto_accept = (_get_param(db, shop_id, "online_orders_auto_accept") or "").strip().upper() == "YES"
    if auto_accept and order.status == "NEW":
        order.status = "ACCEPTED"
        _set_status_timestamps(order, "ACCEPTED")
        _add_event(
            db,
            order=order,
            event_type="AUTO_ACCEPT",
            provider_status="ACCEPTED",
            message="Auto accepted by configuration",
            payload=None,
            actor_user_id=None,
        )

    db.commit()
    db.refresh(order)
    return {
        "success": True,
        "created": created,
        "online_order_id": order.online_order_id,
        "status": order.status,
    }
