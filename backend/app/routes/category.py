from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.db import get_db
from app.models.category import Category
from app.models.items import Item
from app.models.bulk_import_log import BulkImportLog
from app.schemas.category import (
    CategoryCreate, CategoryUpdate, CategoryResponse
)
from app.utils.auth_user import get_current_user
from app.services.audit_service import log_action
from app.utils.permissions import require_permission
from app.routes.invoice import resolve_branch_optional

router = APIRouter(prefix="/category", tags=["Category"])


class CategoryBulkRow(BaseModel):
    category_name: str
    status: Optional[bool] = True


class CategoryBulkImport(BaseModel):
    filename: Optional[str] = ""
    rows: list[CategoryBulkRow]


# ---------- LIST ----------
@router.get("/", response_model=list[CategoryResponse])
def list_categories(
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    bid = resolve_branch_optional(user, branch_id)
    q = db.query(Category).filter(Category.shop_id == user.shop_id)
    if bid is not None:
        q = q.filter((Category.branch_id == bid) | (Category.branch_id.is_(None)))
    return q.order_by(Category.category_name).all()


# ---------- CREATE ----------
@router.post("/", response_model=CategoryResponse)
def create_category(
    request: CategoryCreate,
    db: Session = Depends(get_db),
    user=Depends(require_permission("categories", "write")),
):
    bid = resolve_branch_optional(user, request.__dict__.get("branch_id"))

    exists = db.query(Category).filter(
        Category.category_name == request.category_name,
        Category.shop_id == user.shop_id
    ).first()

    if exists:
        raise HTTPException(status_code=400, detail="Category already exists")

    category = Category(
        shop_id=user.shop_id,
        branch_id=bid,
        category_name=request.category_name,
        category_status=request.category_status,
        created_by=user.user_id
    )

    db.add(category)
    db.commit()
    db.refresh(category)

    log_action(
        db,
        shop_id=user.shop_id,
        module="Category",
        action="CREATE",
        record_id=category.category_id,
        new={
            "category_name": category.category_name,
            "category_status": category.category_status,
        },
        user_id=user.user_id,
    )
    return category


# ---------- BULK IMPORT (upsert by name) ----------
@router.post("/bulk-import")
def bulk_import_categories(
    body: CategoryBulkImport,
    db: Session = Depends(get_db),
    user=Depends(require_permission("categories", "write")),
):
    inserted = 0
    updated = 0
    errors = []

    for i, row in enumerate(body.rows):
        name = (row.category_name or "").strip().upper()
        if not name:
            errors.append({"row": i + 1, "error": "category_name is required"})
            continue
        try:
            existing = db.query(Category).filter(
                Category.category_name == name,
                Category.shop_id == user.shop_id,
            ).first()
            if existing:
                existing.category_status = row.status if row.status is not None else True
                updated += 1
            else:
                db.add(Category(
                    shop_id=user.shop_id,
                    category_name=name,
                    category_status=row.status if row.status is not None else True,
                    created_by=user.user_id,
                ))
                inserted += 1
        except Exception as e:
            errors.append({"row": i + 1, "error": str(e)})

    db.add(BulkImportLog(
        shop_id=user.shop_id,
        upload_type="categories",
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
@router.put("/{category_id}", response_model=CategoryResponse)
def update_category(category_id: int, request: CategoryUpdate,
                    db: Session = Depends(get_db),
                    user=Depends(require_permission("categories", "write"))):

    bid = resolve_branch_optional(user, None)

    q = db.query(Category).filter(
        Category.category_id == category_id,
        Category.shop_id == user.shop_id
    )
    if bid is not None:
        q = q.filter((Category.branch_id == bid) | (Category.branch_id.is_(None)))
    category = q.first()

    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    old = {
        "category_name": category.category_name,
        "category_status": category.category_status,
    }

    if request.category_name is not None:
        category.category_name = request.category_name

    if request.category_status is not None:
        category.category_status = request.category_status

    db.commit()
    db.refresh(category)

    log_action(
        db,
        shop_id=user.shop_id,
        module="Category",
        action="UPDATE",
        record_id=category.category_id,
        old=old,
        new={
            "category_name": category.category_name,
            "category_status": category.category_status,
        },
        user_id=user.user_id,
    )
    return category


# ---------- SOFT DELETE / INACTIVATE ----------
@router.delete("/{category_id}")
def delete_category(
    category_id: int,
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("categories", "write")),
):

    bid = resolve_branch_optional(user, branch_id)

    q = db.query(Category).filter(
        Category.category_id == category_id,
        Category.shop_id == user.shop_id
    )
    if bid is not None:
        q = q.filter((Category.branch_id == bid) | (Category.branch_id.is_(None)))

    category = q.first()

    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    # 🚫 BLOCK DELETE IF ITEMS EXIST
    item_q = db.query(Item).filter(
        Item.category_id == category_id,
        Item.item_status == True,
        Item.shop_id == user.shop_id
    )
    if bid is not None:
        item_q = item_q.filter((Item.branch_id == bid) | (Item.branch_id.is_(None)))

    active_items = item_q.count()

    if active_items > 0:
        raise HTTPException(
            status_code=400,
            detail="Category cannot be deleted — active items exist"
        )

    # Soft delete
    old = {
        "category_name": category.category_name,
        "category_status": category.category_status,
    }
    category.category_status = False
    db.commit()

    log_action(
        db,
        shop_id=user.shop_id,
        module="Category",
        action="DELETE",
        record_id=category.category_id,
        old=old,
        new={
            "category_name": category.category_name,
            "category_status": category.category_status,
        },
        user_id=user.user_id,
    )

    return {"message": "Category marked inactive"}
