# PATH: app/routes/auth.py

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.users import User
from app.models.roles import Role
from app.models.branch import Branch
from app.utils.jwt_token import create_access_token
from app.utils.passwords import encode_password, verify_password
from app.models.shop_details import ShopDetails

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/login")
def login(request: dict, db: Session = Depends(get_db)):

    shop_id = request.get("shop_id")
    username = request.get("username")
    password = request.get("password")

    if not shop_id:
        raise HTTPException(400, "Shop ID is required")

    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == shop_id).first()
    if not shop:
        raise HTTPException(400, "Invalid Shop ID")

    user = (
        db.query(User)
        .join(Role, Role.role_id == User.role)
        .filter(User.user_name == username, User.status == True, User.shop_id == shop_id)
        .first()
    )

    if not user:
        raise HTTPException(400, "User not found")

    # Validate password (base64-encoded)
    if verify_password(password, user.password):
        pass
    elif user.password == password:
        # Legacy plain-text password -> migrate to encoded
        user.password = encode_password(password)
        db.commit()
    else:
        raise HTTPException(400, "Invalid password")

    # Fetch branch safely
    branch_name = None
    if user.branch_id:
        branch = db.query(Branch).filter(
            Branch.branch_id == user.branch_id,
            Branch.shop_id == user.shop_id
        ).first()
        branch_name = branch.branch_name if branch else None
        if branch and branch.branch_close == "Y" and (branch.type or "").lower() != "head office":
            shop = db.query(ShopDetails).filter(ShopDetails.shop_id == user.shop_id).first()
            app_date = shop.app_date if shop else None
            raise HTTPException(
                403,
                "Day hasn't closed at head office."
                + (f" (Business Date: {app_date})" if app_date else "")
            )

    # Payload stored in token
    token = create_access_token({
        "user_id": user.user_id,
        "role": user.role,
        "branch_id": user.branch_id,
        "shop_id": user.shop_id
    })

    return {
        "access_token": token,
        "token_type": "bearer",

        "user_id": user.user_id,
        "user_name": user.user_name,
        "name": user.name,

        "role_id": user.role,
        "role_name": user.role_ref.role_name if user.role_ref else "User",

        "shop_id": user.shop_id,
        "branch_id": user.branch_id,
        "branch_name": branch_name,
        "branch_close": branch.branch_close if branch else "N",
        "branch_type": branch.type if branch else ""
    }
