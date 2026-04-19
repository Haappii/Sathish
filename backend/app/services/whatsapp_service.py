from __future__ import annotations

import json
import logging
import os
import threading
from urllib import request, error

import httpx
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


# ── PDF document sending ──────────────────────────────────────────────────────

def _upload_meta_media(pdf_bytes: bytes, filename: str) -> str | None:
    if not (_META_TOKEN and _META_PHONE_NUMBER_ID):
        logger.warning("WhatsApp media upload skipped: Meta Cloud API not configured")
        return None
    url = f"https://graph.facebook.com/{_GRAPH_VERSION}/{_META_PHONE_NUMBER_ID}/media"
    try:
        with httpx.Client(timeout=30) as client:
            resp = client.post(
                url,
                headers={"Authorization": f"Bearer {_META_TOKEN}"},
                data={"messaging_product": "whatsapp"},
                files={"file": (filename, pdf_bytes, "application/pdf")},
            )
            resp.raise_for_status()
            return resp.json().get("id")
    except Exception:
        logger.exception("WhatsApp media upload failed")
        return None


def _send_meta_document(to_number: str, media_id: str, filename: str, caption: str) -> None:
    if not (_META_TOKEN and _META_PHONE_NUMBER_ID):
        return
    url = f"https://graph.facebook.com/{_GRAPH_VERSION}/{_META_PHONE_NUMBER_ID}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to_number,
        "type": "document",
        "document": {
            "id": media_id,
            "filename": filename,
            "caption": caption,
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
        logger.info("WhatsApp PDF document sent to %s", to_number)
    except error.HTTPError as exc:
        body_bytes = exc.read()
        logger.exception("WhatsApp document send failed [%s]: %s", exc.code, body_bytes.decode("utf-8", errors="ignore"))
    except Exception:
        logger.exception("WhatsApp document send failed for %s", to_number)


def _send_invoice_pdf_thread(
    to_number: str,
    invoice_data: dict,
    invoice_number: str,
    shop_name: str,
    customer_name: str | None,
    invoice_url: str | None,
) -> None:
    from app.utils.invoice_pdf import generate_invoice_pdf
    try:
        pdf_bytes = generate_invoice_pdf(invoice_data)
        filename = f"Invoice-{invoice_number}.pdf"
        media_id = _upload_meta_media(pdf_bytes, filename)
        if media_id:
            shop_label = str(shop_name or "our store").strip()
            caption = f"Invoice {invoice_number} from {shop_label}"
            _send_meta_document(to_number, media_id, filename, caption)
            return
    except Exception:
        logger.exception("WhatsApp PDF generation/upload failed; falling back to link")

    # Fallback to text link if PDF fails
    if invoice_url:
        greeting = f"Hi {customer_name}," if str(customer_name or "").strip() else "Hi,"
        shop_label = str(shop_name or "our store").strip()
        body = (
            f"{greeting}\n\n"
            f"Your invoice {invoice_number} from {shop_label} is ready.\n"
            f"View invoice: {invoice_url}\n\n"
            f"Thank you for shopping with us."
        )
        _send_meta_text(to_number, body)


def send_invoice_pdf_whatsapp_async(
    *,
    mobile: str | None,
    customer_name: str | None,
    invoice_number: str,
    shop_name: str | None,
    country_code: str | None = None,
    invoice_data: dict,
    invoice_url: str | None = None,
) -> bool:
    to_number = normalize_whatsapp_mobile(mobile, country_code)
    if not to_number:
        return False
    threading.Thread(
        target=_send_invoice_pdf_thread,
        args=(to_number, invoice_data, invoice_number, shop_name or "", customer_name, invoice_url),
        daemon=True,
    ).start()
    return True


def _send_advance_receipt_pdf_thread(
    to_number: str,
    receipt_data: dict,
    order_id: int | str,
    shop_name: str,
    customer_name: str | None,
) -> None:
    from app.utils.invoice_pdf import generate_advance_receipt_pdf
    try:
        pdf_bytes = generate_advance_receipt_pdf(receipt_data)
        filename = f"AdvanceOrder-{order_id}.pdf"
        media_id = _upload_meta_media(pdf_bytes, filename)
        if media_id:
            shop_label = str(shop_name or "our store").strip()
            caption = f"Advance order receipt from {shop_label}"
            _send_meta_document(to_number, media_id, filename, caption)
            return
    except Exception:
        logger.exception("WhatsApp advance receipt PDF failed")

    # Fallback text
    greeting = f"Hi {customer_name}," if str(customer_name or "").strip() else "Hi,"
    shop_label = str(shop_name or "our store").strip()
    body = (
        f"{greeting}\n\n"
        f"Your advance order #{order_id} at {shop_label} has been confirmed.\n\n"
        f"Thank you!"
    )
    _send_meta_text(to_number, body)


def send_advance_receipt_whatsapp_async(
    *,
    mobile: str | None,
    customer_name: str | None,
    order_id: int | str,
    shop_name: str | None,
    country_code: str | None = None,
    receipt_data: dict,
) -> bool:
    to_number = normalize_whatsapp_mobile(mobile, country_code)
    if not to_number:
        return False
    threading.Thread(
        target=_send_advance_receipt_pdf_thread,
        args=(to_number, receipt_data, order_id, shop_name or "", customer_name),
        daemon=True,
    ).start()
    return True
