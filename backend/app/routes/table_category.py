from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel

from app.db import get_db
from app.models.table_billing import TableCategory
from app.utils.permissions import require_permission
from app.utils.shop_type import ensure_hotel_billing_type


class CreateCategoryRequest(BaseModel):
    category_name: str
    branch_id: int


class UpdateCategoryRequest(BaseModel):
    category_name: str


router = APIRouter(
    prefix="/table-categories",
    tags=["Table Categories"]
)

# ================================
# CREATE TABLE CATEGORY
# ================================
@router.post("/")
def create_table_category(
    payload: CreateCategoryRequest,
    db: Session = Depends(get_db),
    user=Depends(require_permission("setup", "write"))
):
    ensure_hotel_billing_type(db, user.shop_id)
    if str(user.role_name).lower() != "admin" and payload.branch_id != user.branch_id:
        raise HTTPException(403, "Not allowed")

    category = TableCategory(
        shop_id=user.shop_id,
        category_name=payload.category_name,
        branch_id=payload.branch_id
    )
    db.add(category)
    db.commit()
    db.refresh(category)

    return {"success": True, "category_id": category.category_id}

# ================================
# LIST TABLE CATEGORIES
# ================================
@router.get("/")
def list_table_categories(
    branch_id: int = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("setup", "read"))
):
    ensure_hotel_billing_type(db, user.shop_id)
    effective_branch_id = branch_id if branch_id is not None else user.branch_id
    categories = (
        db.query(TableCategory)
        .filter(
            TableCategory.shop_id == user.shop_id,
            TableCategory.branch_id == effective_branch_id
        )
        .order_by(TableCategory.category_name)
        .all()
    )

    return [
        {
            "category_id": c.category_id,
            "category_name": c.category_name,
            "branch_id": c.branch_id
        }
        for c in categories
    ]

# ================================
# UPDATE TABLE CATEGORY
# ================================
@router.put("/{category_id}")
def update_table_category(
    category_id: int,
    payload: UpdateCategoryRequest,
    db: Session = Depends(get_db),
    user=Depends(require_permission("setup", "write"))
):
    ensure_hotel_billing_type(db, user.shop_id)
    category = db.query(TableCategory).filter(
        TableCategory.category_id == category_id,
        TableCategory.shop_id == user.shop_id
    ).first()

    if not category:
        raise HTTPException(404, "Category not found")

    if str(user.role_name).lower() != "admin" and category.branch_id != user.branch_id:
        raise HTTPException(403, "Not allowed")

    category.category_name = payload.category_name
    db.commit()

    return {"success": True}

# ================================
# DELETE TABLE CATEGORY
# ================================
@router.delete("/{category_id}")
def delete_table_category(
    category_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("setup", "write"))
):
    ensure_hotel_billing_type(db, user.shop_id)
    category = db.query(TableCategory).filter(
        TableCategory.category_id == category_id,
        TableCategory.shop_id == user.shop_id
    ).first()

    if not category:
        raise HTTPException(404, "Category not found")

    if str(user.role_name).lower() != "admin" and category.branch_id != user.branch_id:
        raise HTTPException(403, "Not allowed")

    # Check if category has tables
    if category.tables:
        raise HTTPException(400, "Cannot delete category with tables")

    db.delete(category)
    db.commit()

    return {"success": True}