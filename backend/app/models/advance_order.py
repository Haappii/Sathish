from datetime import datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.types import JSON

from app.db import Base


class AdvanceOrder(Base):
    __tablename__ = "advance_orders"

    order_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False, index=True)
    branch_id = Column(Integer, nullable=False, index=True)

    # Customer info
    customer_name = Column(String(120), nullable=False)
    customer_phone = Column(String(20), nullable=True, index=True)

    # Order items (stored as JSON list: [{item_id, item_name, qty, rate, amount}])
    order_items = Column(JSON().with_variant(JSONB(), "postgresql"), nullable=True)

    # Delivery / pickup details
    expected_date = Column(Date, nullable=False, index=True)
    expected_time = Column(String(10), nullable=True)   # HH:MM 24-hr
    notes = Column(Text, nullable=True)

    # Financials
    total_amount = Column(Numeric(12, 2), default=0)
    advance_amount = Column(Numeric(12, 2), default=0)
    advance_payment_mode = Column(String(30), nullable=True)   # CASH / UPI / CARD

    # Status: PENDING / CONFIRMED / READY / COMPLETED / CANCELLED
    status = Column(String(20), default="PENDING", nullable=False, index=True)
    cancel_reason = Column(String(200), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)
