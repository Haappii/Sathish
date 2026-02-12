from sqlalchemy import Column, Integer, String, TIMESTAMP, ForeignKey, Numeric
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.db import Base


class InvoiceDiscount(Base):
    __tablename__ = "invoice_discounts"

    id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    invoice_id = Column(Integer, ForeignKey("invoice.invoice_id"), nullable=False)

    source = Column(String(30), nullable=False)  # COUPON/LOYALTY/MANUAL/PROMOTION
    code = Column(String(60), nullable=True)
    amount = Column(Numeric(12, 2), nullable=False, default=0)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    created_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)

    invoice = relationship("Invoice")
    created_by_user = relationship("User")

