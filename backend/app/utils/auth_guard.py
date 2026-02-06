from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.users import User
from app.config import settings

SECRET_KEY = settings.SECRET_KEY
ALGORITHM = settings.ALGORITHM

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
        )

        # 🔑 SUPPORT ALL COMMON PAYLOAD STYLES
        username = (
            payload.get("sub")
            or payload.get("username")
            or payload.get("user_name")
        )
        user_id = payload.get("user_id")
        shop_id = payload.get("shop_id")

        if not username and not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload",
            )

    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired or invalid",
        )

    query = db.query(User).filter(User.status == True)
    if username:
        query = query.filter(User.user_name == username)
    else:
        query = query.filter(User.user_id == user_id)
    if shop_id:
        query = query.filter(User.shop_id == shop_id)

    user = query.first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    return user
