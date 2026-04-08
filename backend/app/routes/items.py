from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Query
from pathlib import Path
import shutil
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from pydantic import BaseModel
from typing import Optional

from app.db import get_db
from app.models.items import Item
from app.models.branch_item_price import BranchItemPrice
from app.models.category import Category
from app.models.stock import Inventory
from app.models.bulk_import_log import BulkImportLog
from app.models.system_parameters import SystemParameter
from app.schemas.items import ItemCreate, ItemUpdate, ItemResponse
from app.utils.auth_user import get_current_user
from app.services.audit_service import log_action
from app.utils.permissions import require_permission
from app.utils.shop_type import get_shop_billing_type
from app.services.branch_item_price_service import upsert_branch_item_price
from app.routes.invoice import resolve_branch_optional


class ItemBulkRow(BaseModel):
    item_name: str
    category_name: str
    price: float = 0
    buy_price: Optional[float] = 0
    mrp_price: Optional[float] = 0
    min_stock: Optional[int] = 0


class ItemBulkImport(BaseModel):
    filename: Optional[str] = ""
    rows: list[ItemBulkRow]

router = APIRouter(prefix="/items", tags=["Items"])

PROJECT_ROOT = Path(__file__).resolve().parents[3]
ITEM_IMAGES_DIR = PROJECT_ROOT / "frontend" / "src" / "assets" / "items"
ALLOWED_IMAGE_EXTS = {".jpg", ".jpeg", ".jpe", ".jfif", ".png", ".webp"}
MAX_IMAGE_DIM = 512           # max width/height (px)
JPEG_QUALITY = 82             # 1..95 (higher = larger file)


def resolve_branch_for_user(*, user, request: Request) -> int:
    role = str(getattr(user, "role_name", "") or "").strip().lower()

    if role == "admin":
        header_branch = request.headers.get("x-branch-id")
        branch_raw = header_branch if header_branch not in (None, "") else getattr(user, "branch_id", None)
        if branch_raw in (None, ""):
            branch_raw = 1
    else:
        branch_raw = getattr(user, "branch_id", None)

    try:
        return int(branch_raw)
    except (TypeError, ValueError):
        raise HTTPException(400, "Branch required")


def _items_branch_wise(db: Session, shop_id: int) -> bool:
    row = db.query(SystemParameter).filter(
        SystemParameter.shop_id == shop_id,
        SystemParameter.param_key == "items_branch_wise",
    ).first()
    return bool(row and (row.param_value or "").strip().upper() == "YES")


def _resolve_image_ext(upload: UploadFile) -> str:
    filename = upload.filename or ""
    ext = Path(filename).suffix.lower()

    # normalize common JPEG extensions
    if ext in (".jpeg", ".jpe", ".jfif"):
        ext = ".jpg"

    if ext in ALLOWED_IMAGE_EXTS:
        return ext

    # Fallback to content-type (some files come with unexpected extensions)
    ct = (upload.content_type or "").lower()
    if ct in ("image/jpeg", "image/jpg", "image/pjpeg"):
        return ".jpg"
    if ct == "image/png":
        return ".png"
    if ct == "image/webp":
        return ".webp"

    raise HTTPException(400, "Unsupported image type. Use JPG/JPEG/PNG/WEBP")


# ---------- LIST ----------
@router.get("/", response_model=list[ItemResponse])
def list_items(
    request: Request,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=500, ge=1, le=2000),
    is_raw_material: Optional[bool] = Query(default=None),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    is_bw = _items_branch_wise(db, user.shop_id)

    if is_bw:
        # Branch-wise mode: respect the branch header / user's branch
        branch_id = resolve_branch_optional(user, request.headers.get("x-branch-id"))
    else:
        # Head-office mode: always show shared (branch_id IS NULL) items
        branch_id = None

    q = db.query(Item).filter(Item.shop_id == user.shop_id)

    if is_raw_material is not None:
        q = q.filter(Item.is_raw_material == is_raw_material)
    if branch_id is not None:
        q = q.filter(or_(Item.branch_id == branch_id, Item.branch_id.is_(None)))
    else:
        q = q.filter(Item.branch_id.is_(None))

    items = q.order_by(Item.item_name).offset(skip).limit(limit).all()

    if branch_id:
        overrides = {
            int(r.item_id): r
            for r in db.query(BranchItemPrice)
            .filter(
                BranchItemPrice.shop_id == user.shop_id,
                BranchItemPrice.branch_id == branch_id,
                BranchItemPrice.item_id.in_([i.item_id for i in items]),
            )
            .all()
        }
        for it in items:
            o = overrides.get(int(it.item_id))
            if o:
                it.price = o.price
                it.buy_price = o.buy_price
                it.mrp_price = o.mrp_price
                it.item_status = o.item_status
    else:
        items = [it for it in items if it.branch_id is None]

    return items


# ---------- BY CATEGORY ----------
@router.get("/by-category/{category_id}", response_model=list[ItemResponse])
def list_items_by_category(
    category_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    if _items_branch_wise(db, user.shop_id):
        branch_id = resolve_branch_optional(user, request.headers.get("x-branch-id"))
    else:
        branch_id = None

    q = db.query(Item).filter(
        Item.shop_id == user.shop_id,
        Item.category_id == category_id,
        Item.item_status == True
    )
    if branch_id is not None:
        q = q.filter(or_(Item.branch_id == branch_id, Item.branch_id.is_(None)))
    else:
        q = q.filter(Item.branch_id.is_(None))

    items = q.order_by(Item.item_name).all()

    if branch_id:
        overrides = {
            int(r.item_id): r
            for r in db.query(BranchItemPrice)
            .filter(
                BranchItemPrice.shop_id == user.shop_id,
                BranchItemPrice.branch_id == branch_id,
                BranchItemPrice.item_id.in_([i.item_id for i in items]),
            )
            .all()
        }
        items = [it for it in items if overrides.get(int(it.item_id), None) is None or overrides[int(it.item_id)].item_status]
        for it in items:
            o = overrides.get(int(it.item_id))
            if o:
                it.price = o.price
                it.buy_price = o.buy_price
                it.mrp_price = o.mrp_price
                it.item_status = o.item_status
    else:
        items = [it for it in items if it.branch_id is None]

    return items


# ---------- CREATE ----------
@router.post("/", response_model=ItemResponse)
def create_item(
    request_data: ItemCreate,
    request: Request,
    db: Session = Depends(get_db),
    user=Depends(require_permission("items", "write")),
):
    if _items_branch_wise(db, user.shop_id):
        branch_id = resolve_branch_for_user(user=user, request=request)
    else:
        branch_id = None  # head-office mode: items are shared across all branches

    shop_type = get_shop_billing_type(db, int(user.shop_id))
    is_raw = bool(getattr(request_data, "is_raw_material", False))

    if is_raw:
        if not request_data.supplier_id:
            raise HTTPException(400, "Supplier is required for raw material items")
        # Raw materials have no pricing or category
        request_data.category_id = None
        request_data.price = 0
        request_data.buy_price = 0
        request_data.mrp_price = 0
    else:
        if not request_data.category_id:
            raise HTTPException(400, "Category is required for items")
        category = db.query(Category).filter(
            Category.category_id == request_data.category_id,
            Category.shop_id == user.shop_id
        ).first()
        if not category:
            raise HTTPException(400, "Category not found")

        if shop_type == "hotel":
            if float(request_data.price or 0) <= 0:
                raise HTTPException(400, "Selling price is required for items")
            request_data.buy_price = 0
            request_data.mrp_price = 0
        else:
            if float(request_data.price or 0) <= 0:
                raise HTTPException(400, "Selling price is required for items")
            if float(request_data.buy_price or 0) <= 0:
                raise HTTPException(400, "Buy price is required for items")
            if float(request_data.mrp_price or 0) <= 0:
                raise HTTPException(400, "MRP is required for items")

    item = Item(
        shop_id=user.shop_id,
        branch_id=branch_id,  # NULL in head-office mode = shared across branches
        item_name=request_data.item_name,
        category_id=request_data.category_id,
        supplier_id=request_data.supplier_id if is_raw else None,
        item_status=request_data.item_status,
        price=request_data.price,
        buy_price=request_data.buy_price or 0,
        mrp_price=request_data.mrp_price or 0,
        min_stock=request_data.min_stock or 0,
        is_raw_material=is_raw,
        created_by=None
    )

    db.add(item)
    db.flush()  # assigns item.item_id before it's used below

    if not is_raw and branch_id is not None:
        upsert_branch_item_price(
            db,
            shop_id=user.shop_id,
            branch_id=branch_id,
            item_id=item.item_id,
            price=float(item.price or 0),
            buy_price=float(item.buy_price or 0),
            mrp_price=float(item.mrp_price or 0),
            item_status=bool(item.item_status),
        )
    db.commit()
    db.refresh(item)

    # dummy inventory row — use user's actual branch so stock queries can find it
    stock_branch_id = branch_id if branch_id is not None else getattr(user, "branch_id", None)
    stock = Inventory(
        shop_id=user.shop_id,
        item_id=item.item_id,
        branch_id=stock_branch_id,
        quantity=0,
        min_stock=0
    )
    db.add(stock)
    if not is_raw and branch_id is not None:
        upsert_branch_item_price(
            db,
            shop_id=user.shop_id,
            branch_id=branch_id,
            item_id=item.item_id,
            price=request_data.price,
            buy_price=request_data.buy_price or 0,
            mrp_price=request_data.mrp_price or 0,
            item_status=request_data.item_status,
        )
    db.commit()

    log_action(
        db,
        shop_id=user.shop_id,
        module="Items",
        action="CREATE",
        record_id=item.item_id,
        new={
            "item_name": item.item_name,
            "category_id": item.category_id,
            "item_status": item.item_status,
            "price": item.price,
            "buy_price": item.buy_price,
            "mrp_price": item.mrp_price,
            "min_stock": item.min_stock,
            "is_raw_material": getattr(item, "is_raw_material", False),
        },
        user_id=user.user_id,
    )

    return item


# ---------- BULK IMPORT (upsert by name) ----------
@router.post("/bulk-import")
def bulk_import_items(
    body: ItemBulkImport,
    request: Request,
    db: Session = Depends(get_db),
    user=Depends(require_permission("items", "write")),
):
    branch_id = resolve_branch_for_user(user=user, request=request)
    shop_type = get_shop_billing_type(db, int(user.shop_id))

    # Build category name → id map
    cat_map = {
        c.category_name.upper(): c.category_id
        for c in db.query(Category).filter(Category.shop_id == user.shop_id).all()
    }

    inserted = 0
    updated = 0
    errors = []

    for i, row in enumerate(body.rows):
        name = (row.item_name or "").strip()
        cat_name = (row.category_name or "").strip().upper()
        if not name:
            errors.append({"row": i + 1, "error": "item_name is required"})
            continue
        category_id = cat_map.get(cat_name)
        if not category_id:
            errors.append({"row": i + 1, "error": f"Category '{row.category_name}' not found"})
            continue

        price = float(row.price or 0)
        buy_price = float(row.buy_price or 0)
        mrp_price = float(row.mrp_price or 0)
        min_stock = int(row.min_stock or 0)

        if shop_type == "hotel":
            buy_price = 0
            mrp_price = 0
        else:
            if price <= 0:
                errors.append({"row": i + 1, "error": f"Item '{name}': price is required"})
                continue
            if buy_price <= 0:
                errors.append({"row": i + 1, "error": f"Item '{name}': buy_price is required"})
                continue
            if mrp_price <= 0:
                errors.append({"row": i + 1, "error": f"Item '{name}': mrp_price is required"})
                continue

        try:
            existing = db.query(Item).filter(
                Item.item_name == name,
                Item.shop_id == user.shop_id,
            ).first()
            if existing:
                existing.category_id = category_id
                existing.price = price
                existing.buy_price = buy_price
                existing.mrp_price = mrp_price
                existing.min_stock = min_stock
                existing.item_status = True
                db.flush()
                upsert_branch_item_price(
                    db, shop_id=user.shop_id, branch_id=branch_id,
                    item_id=existing.item_id, price=price,
                    buy_price=buy_price, mrp_price=mrp_price, item_status=True,
                )
                updated += 1
            else:
                item = Item(
                    shop_id=user.shop_id,
                    branch_id=branch_id,
                    item_name=name,
                    category_id=category_id,
                    price=price,
                    buy_price=buy_price,
                    mrp_price=mrp_price,
                    min_stock=min_stock,
                    item_status=True,
                    is_raw_material=False,
                )
                db.add(item)
                db.flush()
                upsert_branch_item_price(
                    db, shop_id=user.shop_id, branch_id=branch_id,
                    item_id=item.item_id, price=price,
                    buy_price=buy_price, mrp_price=mrp_price, item_status=True,
                )
                stock = Inventory(
                    shop_id=user.shop_id, item_id=item.item_id,
                    branch_id=branch_id, quantity=0, min_stock=0,
                )
                db.add(stock)
                inserted += 1
        except Exception as e:
            errors.append({"row": i + 1, "error": str(e)})

    db.add(BulkImportLog(
        shop_id=user.shop_id,
        upload_type="items",
        filename=body.filename or "",
        uploaded_by=user.user_id,
        uploaded_by_name=getattr(user, "name", None) or getattr(user, "user_name", ""),
        total_rows=len(body.rows),
        inserted=inserted,
        updated=updated,
        error_count=len(errors),
        errors_json=errors if errors else None,
        rows_json=[r.model_dump() for r in body.rows],
    ))
    db.commit()
    return {"inserted": inserted, "updated": updated, "errors": errors}


# ---------- UPDATE ----------
@router.put("/{item_id}", response_model=ItemResponse)
def update_item(
    item_id: int,
    request_data: ItemUpdate,
    request: Request,
    db: Session = Depends(get_db),
    user=Depends(require_permission("items", "write")),
):
    if _items_branch_wise(db, user.shop_id):
        branch_id = resolve_branch_optional(user, request.headers.get("x-branch-id"))
    else:
        branch_id = None  # head-office mode: items are shared

    q = db.query(Item).filter(Item.item_id == item_id, Item.shop_id == user.shop_id)
    if branch_id is not None:
        q = q.filter((Item.branch_id == branch_id) | (Item.branch_id.is_(None)))
    item = q.first()
    if not item:
        raise HTTPException(404, "Item not found")

    shop_type = get_shop_billing_type(db, int(user.shop_id))

    old = {
        "item_name": item.item_name,
        "category_id": item.category_id,
        "item_status": item.item_status,
        "price": item.price,
        "buy_price": item.buy_price,
        "mrp_price": item.mrp_price,
        "min_stock": item.min_stock,
        "is_raw_material": getattr(item, "is_raw_material", False),
    }

    if request_data.item_name is not None:
        item.item_name = request_data.item_name

    if getattr(request_data, "is_raw_material", None) is not None:
        item.is_raw_material = bool(request_data.is_raw_material)

    is_raw = bool(getattr(item, "is_raw_material", False))

    if is_raw:
        # Raw material: clear category/pricing, set supplier
        if getattr(request_data, "supplier_id", None) is not None:
            item.supplier_id = request_data.supplier_id
        item.category_id = None
        item.price = 0
        item.buy_price = 0
        item.mrp_price = 0
        if request_data.min_stock is not None:
            item.min_stock = request_data.min_stock
        if request_data.item_status is not None:
            item.item_status = request_data.item_status
    else:
        # Normal item: update category + pricing
        if request_data.category_id is not None:
            item.category_id = request_data.category_id
        item.supplier_id = None

        if request_data.item_status is not None:
            item.item_status = request_data.item_status

        if request_data.price is not None:
            item.price = request_data.price

        if shop_type == "hotel":
            item.buy_price = 0
            item.mrp_price = 0
        else:
            if request_data.buy_price is not None:
                item.buy_price = request_data.buy_price
            if request_data.mrp_price is not None:
                item.mrp_price = request_data.mrp_price

        if request_data.min_stock is not None:
            item.min_stock = request_data.min_stock

        # Post-validate prices only for normal items
        if shop_type == "hotel":
            if float(getattr(item, "price", 0) or 0) <= 0:
                raise HTTPException(400, "Selling price is required for items")
        else:
            if float(getattr(item, "price", 0) or 0) <= 0:
                raise HTTPException(400, "Selling price is required for items")
            if float(getattr(item, "buy_price", 0) or 0) <= 0:
                raise HTTPException(400, "Buy price is required for items")
            if float(getattr(item, "mrp_price", 0) or 0) <= 0:
                raise HTTPException(400, "MRP is required for items")

    db.commit()
    db.refresh(item)

    # ensure dummy stock row exists (safe)
    stock = db.query(Inventory).filter(
        Inventory.item_id == item.item_id,
        Inventory.branch_id == branch_id,
        Inventory.shop_id == user.shop_id
    ).first()

    if not stock:
        stock = Inventory(
            shop_id=user.shop_id,
            item_id=item.item_id,
            branch_id=branch_id,
            quantity=0,
            min_stock=0
        )
        db.add(stock)
        db.commit()

    log_action(
        db,
        shop_id=user.shop_id,
        module="Items",
        action="UPDATE",
        record_id=item.item_id,
        old=old,
        new={
            "item_name": item.item_name,
            "category_id": item.category_id,
            "item_status": item.item_status,
            "price": item.price,
            "buy_price": item.buy_price,
            "mrp_price": item.mrp_price,
            "min_stock": item.min_stock,
            "is_raw_material": getattr(item, "is_raw_material", False),
        },
        user_id=user.user_id,
    )

    return item


# ---------- UPLOAD ITEM IMAGE ----------
@router.post("/{item_id}/image")
def upload_item_image(
    item_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user=Depends(require_permission("items", "write"))
):
    item = (
        db.query(Item)
        .filter(Item.item_id == item_id, Item.shop_id == user.shop_id)
        .first()
    )
    if not item:
        raise HTTPException(404, "Item not found")

    if not file:
        raise HTTPException(400, "No file uploaded")

    old_filename = item.image_filename
    input_ext = _resolve_image_ext(file)

    ITEM_IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    # Always delete any existing image for this item (including old extensions)
    for p in ITEM_IMAGES_DIR.glob(f"{item_id}.*"):
        try:
            p.unlink()
        except:
            pass

    try:
        # Pillow is required for compression/resizing.
        from PIL import Image, ImageOps
    except ImportError:
        raise HTTPException(
            500,
            "Image compression requires Pillow. Install it in backend: pip install Pillow"
        )

    dest = None

    try:
        with Image.open(file.file) as img_in:
            img = ImageOps.exif_transpose(img_in)

            resample = getattr(Image, "Resampling", Image).LANCZOS
            img.thumbnail((MAX_IMAGE_DIM, MAX_IMAGE_DIM), resample)

            # Keep PNG only if it actually needs alpha; otherwise convert to JPEG for smaller size.
            has_alpha = (
                img.mode in ("RGBA", "LA")
                or (img.mode == "P" and "transparency" in img.info)
            )

            if input_ext == ".png" and has_alpha:
                dest = ITEM_IMAGES_DIR / f"{item_id}.png"
                # Ensure correct mode for PNG output
                if img.mode == "P":
                    img = img.convert("RGBA")
                img.save(dest, format="PNG", optimize=True, compress_level=9)
            else:
                dest = ITEM_IMAGES_DIR / f"{item_id}.jpg"
                # JPEG doesn't support alpha
                if img.mode in ("RGBA", "LA", "P"):
                    if img.mode != "RGBA":
                        img = img.convert("RGBA")
                    bg = Image.new("RGB", img.size, (255, 255, 255))
                    bg.paste(img, mask=img.split()[-1])
                    img = bg
                else:
                    img = img.convert("RGB")

                img.save(
                    dest,
                    format="JPEG",
                    quality=JPEG_QUALITY,
                    optimize=True,
                    progressive=True
                )
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(400, "Invalid image file. Use JPG/JPEG/PNG/WEBP")
    finally:
        try:
            file.file.close()
        except:
            pass

    item.image_filename = dest.name
    db.commit()
    db.refresh(item)

    log_action(
        db,
        shop_id=user.shop_id,
        module="Items",
        action="IMAGE_UPLOAD",
        record_id=item.item_id,
        old={"image_filename": old_filename},
        new={"image_filename": item.image_filename},
        user_id=user.user_id,
    )

    return {
        "message": "Image uploaded",
        "item_id": item.item_id,
        "image_filename": item.image_filename
    }


# ---------- SOFT DELETE ----------
@router.delete("/{item_id}")
def delete_item(
    item_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user=Depends(require_permission("items", "write")),
):

    branch_id = resolve_branch_optional(user, request.headers.get("x-branch-id"))

    q = db.query(Item).filter(Item.item_id == item_id, Item.shop_id == user.shop_id)
    if branch_id is not None:
        q = q.filter(or_(Item.branch_id == branch_id, Item.branch_id.is_(None)))
    item = q.first()
    if not item:
        raise HTTPException(404, "Item not found")

    old = {"item_status": item.item_status}
    item.item_status = False
    db.commit()

    log_action(
        db,
        shop_id=user.shop_id,
        module="Items",
        action="DELETE",
        record_id=item.item_id,
        old=old,
        new={"item_status": item.item_status},
        user_id=user.user_id,
    )

    return {"message": "Item marked inactive"}
