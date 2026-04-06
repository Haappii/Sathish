from datetime import date, datetime

from app.models.shop_details import ShopDetails
from app.utils.business_date import get_business_date, get_business_datetime


def test_business_date_uses_shop_app_date(db_session, seeded_db):
    shop = db_session.query(ShopDetails).filter(ShopDetails.shop_id == seeded_db["shop_id"]).first()
    shop.app_date = date(2026, 2, 10)
    db_session.add(shop)
    db_session.commit()

    assert get_business_date(db_session, seeded_db["shop_id"]) == date(2026, 2, 10)
    assert get_business_datetime(
        db_session,
        seeded_db["shop_id"],
        now=datetime(2026, 4, 6, 14, 25, 30),
    ) == datetime(2026, 2, 10, 14, 25, 30)


def test_public_reservation_shop_info_returns_business_date(client, db_session, seeded_db):
    shop = db_session.query(ShopDetails).filter(ShopDetails.shop_id == seeded_db["shop_id"]).first()
    shop.app_date = date(2026, 2, 10)
    db_session.add(shop)
    db_session.commit()

    resp = client.get(f"/api/public/reservations/shop-info?shop_id={seeded_db['shop_id']}")

    assert resp.status_code == 200
    assert resp.json()["app_date"] == "2026-02-10"
