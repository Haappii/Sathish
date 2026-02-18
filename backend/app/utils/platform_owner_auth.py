# app/utils/platform_owner_auth.py
from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt

from app.config import settings


platform_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/platform/auth/login")


def get_platform_owner(token: str = Depends(platform_oauth2_scheme)) -> dict:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("platform_owner") is not True:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
        return payload
    except JWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token expired or invalid")


def PlatformOwnerOnly(payload: dict = Depends(get_platform_owner)) -> dict:
    return payload
