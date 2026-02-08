from __future__ import annotations

import re
from pathlib import Path

from fastapi import HTTPException, UploadFile

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

    SHOP_LOGOS_DIR.mkdir(parents=True, exist_ok=True)

    # Remove any previous logos for this shop (old shop_name variants)
    for p in SHOP_LOGOS_DIR.glob(f"logo_*_{shop_id}.png"):
        try:
            p.unlink()
        except Exception:
            pass

    try:
        from PIL import Image, ImageOps
    except ImportError:
        raise HTTPException(500, "Logo upload requires Pillow. Install it in backend.")

    dest = SHOP_LOGOS_DIR / build_logo_filename(shop_name, shop_id)

    try:
        with Image.open(file.file) as img_in:
            img = ImageOps.exif_transpose(img_in)
            resample = getattr(Image, "Resampling", Image).LANCZOS
            img.thumbnail((MAX_LOGO_DIM, MAX_LOGO_DIM), resample)

            # Convert everything to PNG to keep filename stable (.png)
            if img.mode not in ("RGBA", "LA"):
                if img.mode == "P":
                    img = img.convert("RGBA")
                else:
                    img = img.convert("RGB")

            img.save(dest, format="PNG", optimize=True, compress_level=9)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(400, "Invalid image file. Use PNG/JPG/JPEG")
    finally:
        try:
            file.file.close()
        except Exception:
            pass

    return dest.name

