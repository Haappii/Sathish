from __future__ import annotations

import os
import logging

from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.scripts.db_reset import reset_all_app_data, should_reset_on_startup
from app.scripts.seed_sample_hotel import seed_sample_hotel
from app.scripts.seed_sample_shop import seed_sample_shop
from app.services.role_service import ensure_core_roles


logger = logging.getLogger("uvicorn.error")


def _profile() -> str:
    return str(os.getenv("HB_SEED_PROFILE") or "shop").strip().lower()


def reset_and_seed() -> dict | None:
    if not should_reset_on_startup():
        return None

    profile = _profile()
    logger.warning("HB_RESET_DB_ON_STARTUP enabled. DELETING ALL DATA and seeding profile=%s", profile)

    reset_all_app_data(destructive_ok=True)

    db: Session = SessionLocal()
    try:
        ensure_core_roles(db)
        if profile == "hotel":
            return {"profile": "hotel", "seed": seed_sample_hotel(db)}
        if profile == "both":
            shop_info = seed_sample_shop(db)
            hotel_info = seed_sample_hotel(db)
            return {"profile": "both", "seed": {"shop": shop_info, "hotel": hotel_info}}
        return {"profile": "shop", "seed": seed_sample_shop(db)}
    finally:
        db.close()

