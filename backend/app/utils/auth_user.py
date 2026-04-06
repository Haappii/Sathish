# app/utils/auth_user.py
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from jose import jwt, JWTError

from app.db import get_db
from app.models.users import User
from app.models.roles import Role
from app.config import settings
from app.utils.user_session import (
    release_stale_user_session,
    utcnow,
)


# Token source
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


# ---------- DB SESSION ----------
# ---------- LOAD LOGGED-IN USER ----------
def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM]
        )

        user_id: int = payload.get("user_id")
        shop_id = payload.get("shop_id")
        session_id = payload.get("sid")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token"
            )

        user_query = db.query(User).filter(User.user_id == user_id)
        if shop_id:
            user_query = user_query.filter(User.shop_id == shop_id)
        user = user_query.first()
        if not user or not user.status:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User disabled or not found"
            )

        now = utcnow()
        changed = release_stale_user_session(user, now=now)
        active_session_id = str(getattr(user, "active_session_id", "") or "").strip()

        if active_session_id:
            if not session_id or session_id != active_session_id:
                if changed:
                    db.commit()
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Session ended. Please login again."
                )
        elif session_id:
            if changed:
                db.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session ended. Please login again."
            )

        if changed:
            db.commit()

        # ---------- attach role name ----------
        role = db.query(Role).filter(Role.role_id == user.role).first()
        user.role_name = role.role_name if role else "User"

        # ---------- attach branch info ----------
        if user.branch:
            user.branch_name = user.branch.branch_name
            user.branch_id = user.branch.branch_id

        return user

    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired or invalid"
        )


# ---------- ADMIN-ONLY GUARD ----------
def AdminOnly(user: User = Depends(get_current_user)):
    if str(user.role_name).lower() != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return user
