from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os

_DEFAULT_WEB_BASE = "https://haappiibilling.in"
_SECRET = (
    (os.getenv("INVOICE_SHARE_SECRET") or "").strip()
    or (os.getenv("APP_SECRET_KEY") or "").strip()
    or "haappii-invoice-share-secret"
)
_WEB_BASE = (
    (os.getenv("PUBLIC_WEB_BASE_URL") or "").strip()
    or (os.getenv("WEB_APP_BASE_URL") or "").strip()
    or _DEFAULT_WEB_BASE
).rstrip("/")


def _urlsafe_b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def _urlsafe_b64decode(raw: str) -> bytes:
    pad = "=" * (-len(raw) % 4)
    return base64.urlsafe_b64decode((raw + pad).encode("utf-8"))


def build_invoice_share_token(shop_id: int, invoice_number: str) -> str:
    payload = {
        "shop_id": int(shop_id),
        "invoice_number": str(invoice_number or "").strip(),
    }
    payload_raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    payload_b64 = _urlsafe_b64encode(payload_raw)
    sig = hmac.new(_SECRET.encode("utf-8"), payload_b64.encode("utf-8"), hashlib.sha256).digest()
    sig_b64 = _urlsafe_b64encode(sig)
    return f"{payload_b64}.{sig_b64}"


def parse_invoice_share_token(token: str) -> tuple[int, str] | None:
    try:
        payload_b64, sig_b64 = str(token or "").split(".", 1)
        expected_sig = hmac.new(_SECRET.encode("utf-8"), payload_b64.encode("utf-8"), hashlib.sha256).digest()
        actual_sig = _urlsafe_b64decode(sig_b64)
        if not hmac.compare_digest(expected_sig, actual_sig):
            return None
        payload = json.loads(_urlsafe_b64decode(payload_b64).decode("utf-8"))
        return int(payload["shop_id"]), str(payload["invoice_number"])
    except Exception:
        return None


def build_public_invoice_url(shop_id: int, invoice_number: str) -> str:
    token = build_invoice_share_token(shop_id, invoice_number)
    return f"{_WEB_BASE}/invoice-view/{token}"
