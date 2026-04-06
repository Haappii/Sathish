# PATH: app/routes/auth.py

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.users import User
from app.models.roles import Role
from app.models.branch import Branch
from app.utils.jwt_token import create_access_token
from app.utils.passwords import encode_password, verify_password, password_needs_upgrade
from app.models.shop_details import ShopDetails
from app.utils.head_office import is_head_office_branch, get_head_office_branch_id
from app.utils.auth_user import get_current_user
from app.utils.business_date import get_business_date
from app.utils.user_session import (
    clear_user_session,
    has_active_user_session,
    release_stale_user_session,
    start_user_session,
    touch_user_session,
    utcnow,
)

router = APIRouter(prefix="/auth", tags=["Auth"])

limiter = Limiter(key_func=get_remote_address)


@router.post("/login")
@limiter.limit("10/minute")
def login(request: Request, body: dict, db: Session = Depends(get_db)):

    shop_id = body.get("shop_id")
    username = body.get("username")
    password = body.get("password")

    if not shop_id:
        raise HTTPException(400, "Shop ID is required")

    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == shop_id).first()
    if not shop:
        raise HTTPException(400, "Invalid Shop ID")
    if str(getattr(shop, "plan", "") or "").upper() == "DISABLED":
        raise HTTPException(403, "Shop disabled by platform")
    if getattr(shop, "expires_on", None):
        today = datetime.utcnow().date()
        if today > shop.expires_on:
            raise HTTPException(403, f"Shop access expired on {shop.expires_on}")
    if getattr(shop, "paid_until", None):
        today = datetime.utcnow().date()
        if today > shop.paid_until:
            raise HTTPException(403, f"Shop subscription expired on {shop.paid_until}")

    user = (
        db.query(User)
        .join(Role, Role.role_id == User.role)
        .filter(User.user_name == username, User.status == True, User.shop_id == shop_id)
        .first()
    )

    if not user:
        raise HTTPException(400, "User not found")

    # Validate password (bcrypt / legacy base64 / legacy plain-text)
    if not verify_password(password, user.password):
        raise HTTPException(400, "Invalid password")

    # Upgrade legacy password to bcrypt on successful login
    if password_needs_upgrade(user.password):
        user.password = encode_password(password)

    # Fetch branch safely
    head_office_branch_id = get_head_office_branch_id(db, shop_id=user.shop_id, shop=shop)
    branch_name = None
    branch = None
    if user.branch_id:
        branch = db.query(Branch).filter(
            Branch.branch_id == user.branch_id,
            Branch.shop_id == user.shop_id
        ).first()
        branch_name = branch.branch_name if branch else None
        if branch and branch.branch_close == "Y" and not is_head_office_branch(
            db,
            shop_id=user.shop_id,
            branch_id=branch.branch_id,
            shop=shop,
        ):
            app_date = shop.app_date if shop else None
            raise HTTPException(
                403,
                "Day hasn't closed at head office."
                + (f" (Business Date: {app_date})" if app_date else "")
            )

    release_stale_user_session(user)
    if has_active_user_session(user):
        raise HTTPException(
            409,
            "User is already logged in. Please logout from the active session and try again.",
        )

    session_id = start_user_session(user)
    db.commit()

    # Payload stored in token
    token = create_access_token({
        "user_id": user.user_id,
        "role": user.role,
        "branch_id": user.branch_id,
        "shop_id": user.shop_id,
        "sid": session_id,
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
        "branch_type": branch.type if branch else "",
        "head_office_branch_id": head_office_branch_id,
        "login_status": user.login_status,
        "app_date": get_business_date(db, user.shop_id),
    }


@router.post("/logout")
def logout(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    clear_user_session(current_user)
    db.commit()
    return {"message": "Logged out"}


@router.post("/ping")
def ping(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if touch_user_session(current_user, now=utcnow()):
        db.commit()
    return {
        "status": "ok",
        "user_id": current_user.user_id,
        "login_status": current_user.login_status,
    }
