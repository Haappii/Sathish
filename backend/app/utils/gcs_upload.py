"""
Google Cloud Storage upload utility.

When GCS_BUCKET is configured, files are uploaded to GCS and served via
public URLs. When GCS_BUCKET is empty, falls back to local filesystem
storage (dev mode).
"""

from __future__ import annotations

import logging
import os
import secrets
import shutil
from io import BytesIO
from pathlib import Path
from typing import BinaryIO

from app.config import settings

_logger = logging.getLogger(__name__)

_gcs_client = None
_gcs_bucket = None


def _is_gcs_enabled() -> bool:
    if not settings.GCS_BUCKET:
        return False
    try:
        from google.cloud import storage  # noqa: F401
        return True
    except ImportError:
        return False


def _get_bucket():
    global _gcs_client, _gcs_bucket
    if _gcs_bucket is not None:
        return _gcs_bucket

    from google.cloud import storage

    if settings.GCS_CREDENTIALS_PATH:
        _gcs_client = storage.Client.from_service_account_json(
            settings.GCS_CREDENTIALS_PATH
        )
    else:
        _gcs_client = storage.Client()

    bucket_name = settings.GCS_BUCKET
    _gcs_bucket = _gcs_client.bucket(bucket_name)

    if not _gcs_bucket.exists():
        _gcs_bucket = _gcs_client.create_bucket(
            bucket_name, location="asia-south1"
        )
        _gcs_bucket.iam_configuration.uniform_bucket_level_access_enabled = True
        _gcs_bucket.patch()

        from google.cloud.storage import constants
        policy = _gcs_bucket.get_iam_policy(requested_policy_version=3)
        policy.bindings.append(
            {"role": "roles/storage.objectViewer", "members": {"allUsers"}}
        )
        _gcs_bucket.set_iam_policy(policy)
        _logger.info("Created GCS bucket %s with public read access", bucket_name)
    else:
        _logger.info("Using existing GCS bucket %s", bucket_name)

    return _gcs_bucket


def _public_url(blob_name: str) -> str:
    return f"https://storage.googleapis.com/{settings.GCS_BUCKET}/{blob_name}"


# ── Local filesystem fallback ────────────────────────────────────────────────

UPLOAD_ROOT = Path("uploads")


def _ensure_local_dir(category: str) -> Path:
    d = UPLOAD_ROOT / category
    d.mkdir(parents=True, exist_ok=True)
    return d


# ── Public API ───────────────────────────────────────────────────────────────

def upload_file(
    file_obj: BinaryIO,
    destination: str,
    content_type: str = "application/octet-stream",
) -> str:
    """Upload a file-like object. Returns the public URL."""
    if _is_gcs_enabled():
        bucket = _get_bucket()
        blob = bucket.blob(destination)
        file_obj.seek(0)
        blob.upload_from_file(file_obj, content_type=content_type)
        return _public_url(destination)

    parts = destination.split("/", 1)
    category = parts[0] if len(parts) > 1 else ""
    filename = parts[-1]
    local_dir = _ensure_local_dir(category)
    filepath = local_dir / filename
    file_obj.seek(0)
    with filepath.open("wb") as out:
        shutil.copyfileobj(file_obj, out)
    return f"/api/uploads/{destination}"


def upload_bytes(
    data: bytes,
    destination: str,
    content_type: str = "application/octet-stream",
) -> str:
    """Upload raw bytes. Returns the public URL."""
    return upload_file(BytesIO(data), destination, content_type)


def delete_file(destination: str) -> None:
    """Delete a file by its GCS path. Silently ignores missing files."""
    if _is_gcs_enabled():
        try:
            bucket = _get_bucket()
            blob = bucket.blob(destination)
            blob.delete()
        except Exception:
            _logger.debug("GCS delete failed for %s (may not exist)", destination)
        return

    filepath = UPLOAD_ROOT / destination
    if filepath.exists():
        try:
            filepath.unlink()
        except Exception:
            pass


def url_to_gcs_path(url: str) -> str | None:
    """
    Extract the GCS blob path from a URL.
    Handles both GCS public URLs and legacy local URLs.
    Returns None if the URL doesn't match a known pattern.
    """
    if not url:
        return None

    gcs_prefix = f"https://storage.googleapis.com/{settings.GCS_BUCKET}/"
    if url.startswith(gcs_prefix):
        return url[len(gcs_prefix):]

    if url.startswith("/api/uploads/"):
        return url[len("/api/uploads/"):]

    return None


def stored_path_to_url(stored_path: str) -> str:
    """Convert a stored GCS path to its public URL (or local fallback URL)."""
    if not stored_path:
        return ""
    if stored_path.startswith("http://") or stored_path.startswith("https://"):
        return stored_path
    if _is_gcs_enabled():
        return _public_url(stored_path)
    return f"/api/uploads/{stored_path}"


def generate_filename(prefix: str, ext: str) -> str:
    """Generate a unique filename with the given prefix and extension."""
    return f"{prefix}_{secrets.token_hex(8)}{ext}"
