from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.shop_details import ShopDetails


def get_shop_billing_type(db: Session, shop_id: int) -> str:
    row = (
        db.query(ShopDetails.billing_type)
        .filter(ShopDetails.shop_id == shop_id)
        .first()
    )
    return str(getattr(row, "billing_type", "") or "").strip().lower()


def ensure_hotel_billing_type(db: Session, shop_id: int) -> None:
    if get_shop_billing_type(db, shop_id) == "hotel":
        return
    raise HTTPException(403, "Table features are available only for hotel billing type")

