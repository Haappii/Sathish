from __future__ import annotations

import json
import logging
import os
import threading
from urllib import request, error

from sqlalchemy.orm import Session

from app.models.system_parameters import SystemParameter

logger = logging.getLogger(__name__)

_META_TOKEN = (os.getenv("WHATSAPP_META_ACCESS_TOKEN") or "").strip()
_META_PHONE_NUMBER_ID = (os.getenv("WHATSAPP_META_PHONE_NUMBER_ID") or "").strip()
_DEFAULT_COUNTRY_CODE = (os.getenv("WHATSAPP_DEFAULT_COUNTRY_CODE") or "91").strip()
_GRAPH_VERSION = (os.getenv("WHATSAPP_META_GRAPH_VERSION") or "v22.0").strip()


def _branch_whatsapp_param_keys(branch_id: int) -> dict[str, str]:
    return {
        "enabled": f"branch:{branch_id}:invoice_whatsapp_enabled",
        "country_code": f"branch:{branch_id}:invoice_whatsapp_country_code",
    }


def get_branch_invoice_whatsapp_settings(
    db: Session,
    *,
    shop_id: int,
    branch_id: int | None,
) -> dict[str, str | bool]:
    if branch_id is None:
        return {
            "enabled": False,
            "country_code": _DEFAULT_COUNTRY_CODE,
        }

    keys = _branch_whatsapp_param_keys(int(branch_id))
    rows = (
        db.query(SystemParameter.param_key, SystemParameter.param_value)
        .filter(SystemParameter.shop_id == shop_id)
        .filter(SystemParameter.param_key.in_(list(keys.values())))
        .all()
    )
    pmap = {str(k): (str(v) if v is not None else "") for k, v in rows}
    enabled = str(pmap.get(keys["enabled"], "NO") or "NO").strip().upper() == "YES"
    country_code = "".join(ch for ch in str(pmap.get(keys["country_code"], _DEFAULT_COUNTRY_CODE) or _DEFAULT_COUNTRY_CODE) if ch.isdigit()) or _DEFAULT_COUNTRY_CODE
    return {
        "enabled": bool(enabled),
        "country_code": country_code,
    }


def normalize_whatsapp_mobile(mobile: str | None, country_code: str | None = None) -> str | None:
    digits = "".join(ch for ch in str(mobile or "") if ch.isdigit())
    cc = "".join(ch for ch in str(country_code or _DEFAULT_COUNTRY_CODE) if ch.isdigit()) or _DEFAULT_COUNTRY_CODE
    if len(digits) == 10:
        return f"{cc}{digits}"
    if len(digits) >= 11:
        return digits
    return None


def _send_meta_text(to_number: str, body: str) -> None:
    if not (_META_TOKEN and _META_PHONE_NUMBER_ID):
        logger.warning("WhatsApp send skipped: Meta Cloud API not configured")
        return

    url = f"https://graph.facebook.com/{_GRAPH_VERSION}/{_META_PHONE_NUMBER_ID}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to_number,
        "type": "text",
        "text": {
            "preview_url": True,
            "body": body,
        },
    }
    data = json.dumps(payload).encode("utf-8")
    req = request.Request(
        url,
        data=data,
        headers={
            "Authorization": f"Bearer {_META_TOKEN}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=20) as resp:
            resp.read()
        logger.info("WhatsApp invoice link sent to %s", to_number)
    except error.HTTPError as exc:
        body_bytes = exc.read()
        body_text = body_bytes.decode("utf-8", errors="ignore") if body_bytes else ""
        logger.exception("WhatsApp send failed [%s]: %s", exc.code, body_text)
    except Exception:
        logger.exception("WhatsApp send failed for %s", to_number)


def send_invoice_link_whatsapp_async(
    *,
    mobile: str | None,
    customer_name: str | None,
    invoice_number: str,
    invoice_url: str,
    shop_name: str | None,
    country_code: str | None = None,
) -> bool:
    to_number = normalize_whatsapp_mobile(mobile, country_code)
    if not to_number:
        return False

    greeting = f"Hi {customer_name}," if str(customer_name or "").strip() else "Hi,"
    shop_label = str(shop_name or "our store").strip()
    body = (
        f"{greeting}\n\n"
        f"Your invoice {invoice_number} from {shop_label} is ready.\n"
        f"View invoice: {invoice_url}\n\n"
        f"Thank you for shopping with us."
    )

    threading.Thread(target=_send_meta_text, args=(to_number, body), daemon=True).start()
    return True
