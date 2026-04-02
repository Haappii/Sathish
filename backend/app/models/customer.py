from sqlalchemy import Column, Integer, String, TIMESTAMP, ForeignKey, UniqueConstraint, Index
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.db import Base


class Customer(Base):
    __tablename__ = "customers"
    __table_args__ = (
        UniqueConstraint("shop_id", "mobile", name="uq_customers_shop_mobile"),
        Index("ix_customers_shop_status", "shop_id", "status"),
        Index("ix_customers_shop_name", "shop_id", "customer_name"),
    )

    customer_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)

    customer_name = Column(String(200), nullable=False)
    mobile = Column(String(20), nullable=False)
    email = Column(String(200), nullable=True)
    gst_number = Column(String(100), nullable=True)

    address_line1 = Column(String(255), nullable=True)
    address_line2 = Column(String(255), nullable=True)
    city = Column(String(120), nullable=True)
    state = Column(String(120), nullable=True)
    pincode = Column(String(20), nullable=True)

    status = Column(String(20), nullable=False, default="ACTIVE")

    created_on = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_on = Column(TIMESTAMP(timezone=True), onupdate=func.now())

    created_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    created_by_user = relationship("User")
