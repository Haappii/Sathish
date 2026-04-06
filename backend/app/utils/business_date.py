from __future__ import annotations

from datetime import date, datetime

from sqlalchemy.orm import Session

from app.models.shop_details import ShopDetails


def get_business_date(db: Session, shop_id: int) -> date:
    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == shop_id).first()
    return shop.app_date if shop and shop.app_date else datetime.utcnow().date()


def get_business_datetime(
    db: Session,
    shop_id: int,
    *,
    now: datetime | None = None,
) -> datetime:
    current = now or datetime.now()
    return datetime.combine(get_business_date(db, shop_id), current.time())

