from sqlalchemy import Column, Integer, String, TIMESTAMP, ForeignKey, Numeric, Boolean, Date, UniqueConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.db import Base


class Coupon(Base):
    __tablename__ = "coupons"
    __table_args__ = (
        UniqueConstraint("shop_id", "code", name="uq_coupons_shop_code"),
    )

    coupon_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)

    code = Column(String(40), nullable=False)
    name = Column(String(120), nullable=True)

    discount_type = Column(String(20), nullable=False, default="FLAT")  # FLAT/PERCENT
    value = Column(Numeric(12, 2), nullable=False, default=0)

    min_bill_amount = Column(Numeric(12, 2), nullable=True)
    max_discount = Column(Numeric(12, 2), nullable=True)

    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)

    active = Column(Boolean, nullable=False, default=True)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    created_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)

    created_by_user = relationship("User")


class CouponRedemption(Base):
    __tablename__ = "coupon_redemptions"

    redemption_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    coupon_id = Column(Integer, ForeignKey("coupons.coupon_id"), nullable=False)

    invoice_id = Column(Integer, ForeignKey("invoice.invoice_id"), nullable=True)
    customer_id = Column(Integer, ForeignKey("customers.customer_id"), nullable=True)

    redeemed_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    redeemed_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)

    coupon = relationship("Coupon")
    invoice = relationship("Invoice")
    customer = relationship("Customer")
    redeemed_by_user = relationship("User")

