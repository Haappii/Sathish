from sqlalchemy import Column, Integer, String, TIMESTAMP, ForeignKey
from sqlalchemy.sql import func
from app.db import Base


class Supplier(Base):
    __tablename__ = "suppliers"

    supplier_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    branch_id = Column(Integer, ForeignKey("branch.branch_id"), nullable=False)

    supplier_name = Column(String(150), nullable=False)
    phone = Column(String(20), nullable=True)
    email = Column(String(120), nullable=True)
    gstin = Column(String(30), nullable=True)

    address_line1 = Column(String(200), nullable=True)
    address_line2 = Column(String(200), nullable=True)
    address_line3 = Column(String(200), nullable=True)
    city = Column(String(60), nullable=True)
    state = Column(String(60), nullable=True)
    pincode = Column(String(20), nullable=True)

    contact_person = Column(String(120), nullable=True)
    credit_terms_days = Column(Integer, nullable=True, default=0)

    status = Column(String(20), nullable=False, default="ACTIVE")

    created_by = Column(Integer, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
