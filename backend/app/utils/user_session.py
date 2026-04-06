from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy.orm import Session

from app.config import settings
from app.models.users import User


SESSION_TOUCH_MIN_SECONDS = 60


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def session_idle_timeout() -> timedelta:
    minutes = max(int(getattr(settings, "LOGIN_SESSION_IDLE_MINUTES", 15) or 15), 1)
    return timedelta(minutes=minutes)


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None or dt.tzinfo.utcoffset(dt) is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _last_seen(user: User) -> datetime | None:
    last_seen = getattr(user, "last_activity_at", None) or getattr(user, "last_login_at", None)
    return _as_utc(last_seen)


def has_active_user_session(user: User, *, now: datetime | None = None) -> bool:
    if not bool(getattr(user, "login_status", False)):
        return False

    session_id = str(getattr(user, "active_session_id", "") or "").strip()
    if not session_id:
        return False

    last_seen = _last_seen(user)
    if not last_seen:
        return False

    current = _as_utc(now) or utcnow()
    return last_seen >= current - session_idle_timeout()


def clear_user_session(user: User) -> bool:
    changed = False

    if bool(getattr(user, "login_status", False)):
        user.login_status = False
        changed = True

    if getattr(user, "active_session_id", None):
        user.active_session_id = None
        changed = True

    return changed


def release_stale_user_session(user: User, *, now: datetime | None = None) -> bool:
    has_session_bits = bool(getattr(user, "login_status", False) or getattr(user, "active_session_id", None))
    if not has_session_bits:
        return False

    if has_active_user_session(user, now=now):
        return False

    return clear_user_session(user)


def release_stale_shop_sessions(db: Session, *, shop_id: int) -> int:
    current = utcnow()
    changed = 0

    users = (
        db.query(User)
        .filter(User.shop_id == shop_id)
        .filter((User.login_status == True) | (User.active_session_id.isnot(None)))  # noqa: E712
        .all()
    )

    for user in users:
        if release_stale_user_session(user, now=current):
            changed += 1

    if changed:
        db.commit()

    return changed


def start_user_session(user: User, *, now: datetime | None = None) -> str:
    current = _as_utc(now) or utcnow()
    session_id = uuid4().hex
    user.login_status = True
    user.active_session_id = session_id
    user.last_login_at = current
    user.last_activity_at = current
    return session_id


def touch_user_session(user: User, *, now: datetime | None = None) -> bool:
    session_id = str(getattr(user, "active_session_id", "") or "").strip()
    if not session_id:
        return False

    current = _as_utc(now) or utcnow()
    last_seen = _last_seen(user)
    if last_seen and (current - last_seen).total_seconds() < SESSION_TOUCH_MIN_SECONDS:
        return False

    user.last_activity_at = current
    user.login_status = True
    return True
