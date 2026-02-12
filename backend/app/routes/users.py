from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.users import User
from app.schemas.users import UserCreate, UserUpdate, UserResponse
from app.utils.passwords import encode_password
from app.services.audit_service import log_action
from app.utils.permissions import require_permission

router = APIRouter(prefix="/users", tags=["Users"])


# ------------------------------------------------
# LIST USERS (USED BY REPORTS PAGE)
# ------------------------------------------------
@router.get("/", response_model=list[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("users", "read")),
):
    return (
        db.query(User)
        .filter(User.status == True, User.shop_id == current_user.shop_id)           # ✅ correct column
        .order_by(User.user_name)
        .all()
    )


# ------------------------------------------------
# CREATE USER (WITH BRANCH)
# ------------------------------------------------
@router.post("/", response_model=UserResponse)
def create_user(
    request: UserCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("users", "write")),
):
    exists = db.query(User).filter(
        User.user_name == request.user_name,
        User.shop_id == current_user.shop_id
    ).first()

    if exists:
        raise HTTPException(400, "Username already exists")

    user = User(
        shop_id=current_user.shop_id,
        user_name=request.user_name,
        password=encode_password(request.password),
        name=request.name,
        role=request.role,
        status=request.status,
        login_status=False,
        created_by=current_user.user_id,
        branch_id=request.branch_id
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    log_action(
        db,
        shop_id=current_user.shop_id,
        module="Users",
        action="CREATE",
        record_id=user.user_id,
        new={
            "user_name": user.user_name,
            "name": user.name,
            "role": user.role,
            "status": user.status,
            "branch_id": user.branch_id,
        },
        user_id=current_user.user_id,
    )

    return user


# ------------------------------------------------
# UPDATE USER
# ------------------------------------------------
@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    request: UserUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("users", "write")),
):
    user = db.query(User).filter(
        User.user_id == user_id,
        User.shop_id == current_user.shop_id
    ).first()

    if not user:
        raise HTTPException(404, "User not found")

    old = {
        "user_name": user.user_name,
        "name": user.name,
        "role": user.role,
        "status": user.status,
        "branch_id": user.branch_id,
    }

    for field, value in request.dict(exclude_unset=True).items():
        if field == "password" and value:
            setattr(user, field, encode_password(value))
        else:
            setattr(user, field, value)

    db.commit()
    db.refresh(user)

    log_action(
        db,
        shop_id=current_user.shop_id,
        module="Users",
        action="UPDATE",
        record_id=user.user_id,
        old=old,
        new={
            "user_name": user.user_name,
            "name": user.name,
            "role": user.role,
            "status": user.status,
            "branch_id": user.branch_id,
        },
        user_id=current_user.user_id,
    )

    return user


# ------------------------------------------------
# SOFT DEACTIVATE USER
# ------------------------------------------------
@router.delete("/{user_id}")
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("users", "write")),
):
    user = db.query(User).filter(
        User.user_id == user_id,
        User.shop_id == current_user.shop_id
    ).first()

    if not user:
        raise HTTPException(404, "User not found")

    if user.login_status:
        raise HTTPException(
            400,
            "Cannot deactivate a user who is currently logged in"
        )

    old_status = user.status
    user.status = False
    db.commit()

    log_action(
        db,
        shop_id=current_user.shop_id,
        module="Users",
        action="DEACTIVATE",
        record_id=user.user_id,
        old={"status": old_status},
        new={"status": False},
        user_id=current_user.user_id,
    )

    return {"message": "User marked inactive"}
