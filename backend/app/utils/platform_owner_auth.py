# app/utils/platform_owner_auth.py
from __future__ import annotations

import os

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt

from app.config import settings


platform_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/platform/auth/login")


def platform_owner_enabled() -> bool:
    u = (os.getenv("PLATFORM_OWNER_USERNAME") or "").strip()
    p = (os.getenv("PLATFORM_OWNER_PASSWORD") or "").strip()
    return bool(u and p)


def validate_platform_owner_credentials(*, username: str, password: str) -> None:
    u = (os.getenv("PLATFORM_OWNER_USERNAME") or "").strip()
    p = (os.getenv("PLATFORM_OWNER_PASSWORD") or "").strip()
    if not (u and p):
        raise HTTPException(500, "Platform owner not configured")
    if username != u or password != p:
        raise HTTPException(403, "Invalid platform owner credentials")


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

