from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.category import Category
from app.models.items import Item
from app.schemas.category import (
    CategoryCreate, CategoryUpdate, CategoryResponse
)
from app.utils.auth_user import get_current_user

router = APIRouter(prefix="/category", tags=["Category"])


# ---------- LIST ----------
@router.get("/", response_model=list[CategoryResponse])
def list_categories(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return (
        db.query(Category)
        .filter(Category.shop_id == user.shop_id)
        .order_by(Category.category_name)
        .all()
    )


# ---------- CREATE ----------
@router.post("/", response_model=CategoryResponse)
def create_category(request: CategoryCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):

    exists = db.query(Category).filter(
        Category.category_name == request.category_name,
        Category.shop_id == user.shop_id
    ).first()

    if exists:
        raise HTTPException(status_code=400, detail="Category already exists")

    category = Category(
        shop_id=user.shop_id,
        category_name=request.category_name,
        category_status=request.category_status,
        created_by=user.user_id
    )

    db.add(category)
    db.commit()
    db.refresh(category)
    return category


# ---------- UPDATE ----------
@router.put("/{category_id}", response_model=CategoryResponse)
def update_category(category_id: int, request: CategoryUpdate,
                    db: Session = Depends(get_db),
                    user=Depends(get_current_user)):

    category = db.query(Category).filter(
        Category.category_id == category_id,
        Category.shop_id == user.shop_id
    ).first()

    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    if request.category_name is not None:
        category.category_name = request.category_name

    if request.category_status is not None:
        category.category_status = request.category_status

    db.commit()
    db.refresh(category)
    return category


# ---------- SOFT DELETE / INACTIVATE ----------
@router.delete("/{category_id}")
def delete_category(category_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):

    category = db.query(Category).filter(
        Category.category_id == category_id,
        Category.shop_id == user.shop_id
    ).first()

    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    # 🚫 BLOCK DELETE IF ITEMS EXIST
    active_items = db.query(Item).filter(
        Item.category_id == category_id,
        Item.item_status == True,
        Item.shop_id == user.shop_id
    ).count()

    if active_items > 0:
        raise HTTPException(
            status_code=400,
            detail="Category cannot be deleted — active items exist"
        )

    # Soft delete
    category.category_status = False
    db.commit()

    return {"message": "Category marked inactive"}
