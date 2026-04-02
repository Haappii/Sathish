from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Query
from pathlib import Path
import shutil
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from app.db import get_db
from app.models.items import Item
from app.models.branch_item_price import BranchItemPrice
from app.models.category import Category
from app.models.stock import Inventory
from app.schemas.items import ItemCreate, ItemUpdate, ItemResponse
from app.utils.auth_user import get_current_user
from app.services.audit_service import log_action
from app.utils.permissions import require_permission
from app.utils.shop_type import get_shop_billing_type
from app.services.branch_item_price_service import upsert_branch_item_price
from app.routes.invoice import resolve_branch_optional

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
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    branch_id = resolve_branch_optional(user, request.headers.get("x-branch-id"))

    q = db.query(Item).filter(Item.shop_id == user.shop_id)
    if branch_id is not None:
        # Branch view: show branch-specific + shared items
        q = q.filter(or_(Item.branch_id == branch_id, Item.branch_id.is_(None)))
    else:
        # Admin "all branches" view: show shared items only (no branch override applied)
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
        # Admin all-branch: keep shared items only; branch-specific items excluded without a branch filter.
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
    branch_id = resolve_branch_optional(user, request.headers.get("x-branch-id"))

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
    branch_id = resolve_branch_for_user(user=user, request=request)

    shop_type = get_shop_billing_type(db, int(user.shop_id))
    is_raw = bool(getattr(request_data, "is_raw_material", False))

    if shop_type == "hotel":
        # Hotels: selling price is required only for sellable items.
        if not is_raw and float(request_data.price or 0) <= 0:
            raise HTTPException(400, "Selling price is required for items")
        # Hotels: buy/MRP not needed.
        request_data.buy_price = 0
        request_data.mrp_price = 0
    else:
        # Shops: require buy + sell + MRP for sellable items.
        if not is_raw:
            if float(request_data.price or 0) <= 0:
                raise HTTPException(400, "Selling price is required for items")
            if float(request_data.buy_price or 0) <= 0:
                raise HTTPException(400, "Buy price is required for items")
            if float(request_data.mrp_price or 0) <= 0:
                raise HTTPException(400, "MRP is required for items")

    category = db.query(Category).filter(
        Category.category_id == request_data.category_id,
        Category.shop_id == user.shop_id
    ).first()
    if not category:
        raise HTTPException(400, "Category not found")

    item = Item(
        shop_id=user.shop_id,
        branch_id=branch_id if branch_id is not None else getattr(user, "branch_id", None),
        item_name=request_data.item_name,
        category_id=request_data.category_id,
        item_status=request_data.item_status,
        price=request_data.price,
        buy_price=request_data.buy_price or 0,
        mrp_price=request_data.mrp_price or 0,
        min_stock=request_data.min_stock,
        is_raw_material=bool(getattr(request_data, "is_raw_material", False)),
        created_by=None
    )

    db.add(item)
    db.flush()  # assigns item.item_id before it's used below
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

    # dummy inventory row (min_stock ignored now)
    stock = Inventory(
        shop_id=user.shop_id,
        item_id=item.item_id,
        branch_id=branch_id,
        quantity=0,
        min_stock=0   # 👈 kept as dummy
    )
    db.add(stock)
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


# ---------- UPDATE ----------
@router.put("/{item_id}", response_model=ItemResponse)
def update_item(
    item_id: int,
    request_data: ItemUpdate,
    request: Request,
    db: Session = Depends(get_db),
    user=Depends(require_permission("items", "write")),
):
    branch_id = resolve_branch_optional(user, request.headers.get("x-branch-id"))

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

    if request_data.category_id is not None:
        item.category_id = request_data.category_id

    if request_data.item_status is not None:
        item.item_status = request_data.item_status

    if request_data.price is not None:
        item.price = request_data.price

    if shop_type == "hotel":
        # Hotels: buy/MRP are not used.
        item.buy_price = 0
        item.mrp_price = 0
    else:
        if request_data.buy_price is not None:
            item.buy_price = request_data.buy_price
        if request_data.mrp_price is not None:
            item.mrp_price = request_data.mrp_price

    if request_data.min_stock is not None:
        item.min_stock = request_data.min_stock   # 👈 now updates here

    if getattr(request_data, "is_raw_material", None) is not None:
        item.is_raw_material = bool(request_data.is_raw_material)

    # Post-validate (after applying toggles).
    is_raw = bool(getattr(item, "is_raw_material", False))
    if shop_type == "hotel":
        if not is_raw and float(getattr(item, "price", 0) or 0) <= 0:
            raise HTTPException(400, "Selling price is required for items")
    else:
        if not is_raw:
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
