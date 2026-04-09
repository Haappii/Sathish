from sqlalchemy import Column, Integer, String, Text, TIMESTAMP, ForeignKey
from sqlalchemy.sql import func
from app.db import Base


class Feedback(Base):
    __tablename__ = "feedback"

    feedback_id  = Column(Integer, primary_key=True, index=True)
    shop_id      = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False, index=True)
    invoice_no   = Column(String(60), nullable=True)
    customer_name = Column(String(120), nullable=True)
    mobile       = Column(String(20), nullable=True)
    rating       = Column(Integer, nullable=False)          # 1-5
    comment      = Column(Text, nullable=True)
    created_at   = Column(TIMESTAMP(timezone=True), server_default=func.now())
