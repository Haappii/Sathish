from __future__ import annotations

import base64

from passlib.context import CryptContext

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def encode_password(raw_password: str) -> str:
    """
    Hash a password for storage.

    NOTE: Legacy versions stored passwords as Base64 (and sometimes plain-text).
    Login flow upgrades legacy passwords to bcrypt on successful verification.
    """
    if raw_password is None:
        return ""
    return _pwd_context.hash(raw_password)


def _looks_like_bcrypt_hash(value: str) -> bool:
    v = (value or "").strip()
    return v.startswith("$2a$") or v.startswith("$2b$") or v.startswith("$2y$")


def password_needs_upgrade(stored_password: str) -> bool:
    """
    Returns True if the stored password is legacy (base64/plain) or the bcrypt
    hash should be re-hashed per current policy.
    """
    if not stored_password:
        return False
    if _looks_like_bcrypt_hash(stored_password):
        return _pwd_context.needs_update(stored_password)
    return True


def verify_password(raw_password: str, stored_password: str) -> bool:
    if not raw_password or not stored_password:
        return False

    stored = stored_password.strip()

    # Current scheme: bcrypt hash
    if _looks_like_bcrypt_hash(stored):
        try:
            return _pwd_context.verify(raw_password, stored)
        except Exception:
            return False

    # Legacy fallback 1: plain-text
    if stored == raw_password:
        return True

    # Legacy fallback 2: Base64-encoded password
    try:
        legacy = base64.b64encode(raw_password.encode("utf-8")).decode("utf-8")
        return stored == legacy
    except Exception:
        return False
