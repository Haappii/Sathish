from datetime import datetime, timedelta, timezone

from app.models.users import User
from app.utils.user_session import (
    has_active_user_session,
    release_stale_user_session,
    start_user_session,
    touch_user_session,
)


def _build_user(**overrides) -> User:
    data = {
        "shop_id": 1,
        "user_name": "session-user",
        "password": "secret",
        "login_status": True,
        "active_session_id": "session-123",
    }
    data.update(overrides)
    return User(**data)


def test_has_active_user_session_accepts_aware_last_seen_with_naive_now():
    user = _build_user(last_activity_at=datetime.now(timezone.utc) - timedelta(minutes=5))

    assert has_active_user_session(user, now=datetime.utcnow()) is True


def test_has_active_user_session_accepts_naive_last_seen_with_aware_now():
    user = _build_user(last_activity_at=datetime.utcnow() - timedelta(minutes=5))

    assert has_active_user_session(user, now=datetime.now(timezone.utc)) is True


def test_release_stale_user_session_clears_mixed_timezone_session():
    user = _build_user(last_activity_at=datetime(2026, 4, 6, 10, 0, 0))

    changed = release_stale_user_session(
        user,
        now=datetime(2026, 4, 6, 10, 45, 0, tzinfo=timezone.utc),
    )

    assert changed is True
    assert user.login_status is False
    assert user.active_session_id is None


def test_touch_user_session_updates_last_activity_with_mixed_timezones():
    now = datetime(2026, 4, 6, 10, 30, 0, tzinfo=timezone.utc)
    user = _build_user(last_activity_at=datetime(2026, 4, 6, 10, 28, 0))

    changed = touch_user_session(user, now=now)

    assert changed is True
    assert user.last_activity_at == now


def test_start_user_session_stores_utc_aware_timestamp():
    user = _build_user(login_status=False, active_session_id=None)
    now = datetime(2026, 4, 6, 11, 0, 0)

    session_id = start_user_session(user, now=now)

    assert session_id
    assert user.login_status is True
    assert user.active_session_id == session_id
    assert user.last_login_at == now.replace(tzinfo=timezone.utc)
    assert user.last_activity_at == now.replace(tzinfo=timezone.utc)
