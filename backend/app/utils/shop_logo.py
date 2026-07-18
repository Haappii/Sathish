from __future__ import annotations

import re
from io import BytesIO
from pathlib import Path

from fastapi import HTTPException, UploadFile

from app.utils.gcs_upload import upload_bytes, delete_file

PROJECT_ROOT = Path(__file__).resolve().parents[3]
SHOP_LOGOS_DIR = PROJECT_ROOT / "frontend" / "src" / "assets" / "logo"

ALLOWED_LOGO_EXTS = {".png", ".jpg", ".jpeg"}
MAX_LOGO_DIM = 512  # px


def _slugify(value: str) -> str:
    s = (value or "").strip().lower()
    s = re.sub(r"\s+", "_", s)
    s = re.sub(r"[^a-z0-9_]+", "", s)
    s = re.sub(r"_+", "_", s).strip("_")
    return s or "shop"


def build_logo_filename(shop_name: str | None, shop_id: int) -> str:
    return f"logo_{_slugify(shop_name or '')}_{shop_id}.png"


def _resolve_input_ext(upload: UploadFile) -> str:
    filename = upload.filename or ""
    ext = Path(filename).suffix.lower()

    if ext in ALLOWED_LOGO_EXTS:
        return ext

    ct = (upload.content_type or "").lower()
    if ct in ("image/jpeg", "image/jpg", "image/pjpeg"):
        return ".jpg"
    if ct == "image/png":
        return ".png"

    raise HTTPException(400, "Unsupported image type. Use PNG/JPG/JPEG")


def save_shop_logo_file(*, shop_id: int, shop_name: str | None, file: UploadFile) -> str:
    if not file:
        raise HTTPException(400, "No file uploaded")

    _resolve_input_ext(file)  # validates type

    # Delete old logos from GCS
    delete_file(f"logos/{build_logo_filename(shop_name, shop_id)}")

    try:
        from PIL import Image, ImageOps
    except ImportError:
        raise HTTPException(500, "Logo upload requires Pillow. Install it in backend.")

    logo_filename = build_logo_filename(shop_name, shop_id)

    try:
        with Image.open(file.file) as img_in:
            img = ImageOps.exif_transpose(img_in)
            resample = getattr(Image, "Resampling", Image).LANCZOS
            img.thumbnail((MAX_LOGO_DIM, MAX_LOGO_DIM), resample)

            if img.mode not in ("RGBA", "LA"):
                if img.mode == "P":
                    img = img.convert("RGBA")
                else:
                    img = img.convert("RGB")

            buf = BytesIO()
            img.save(buf, format="PNG", optimize=True, compress_level=9)
            logo_url = upload_bytes(buf.getvalue(), f"logos/{logo_filename}", "image/png")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(400, "Invalid image file. Use PNG/JPG/JPEG")
    finally:
        try:
            file.file.close()
        except Exception:
            pass

    return logo_url

