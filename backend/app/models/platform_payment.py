from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, Numeric, String

from app.db import Base


class PlatformPayment(Base):
    __tablename__ = "platform_payments"

    payment_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, nullable=False, index=True)
    amount = Column(Numeric(12, 2), nullable=False)
    plan_name = Column(String(60), nullable=True)
    note = Column(String(300), nullable=True)
    paid_on = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
