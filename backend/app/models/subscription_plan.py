from datetime import datetime
from sqlalchemy import Column, Integer, String, Numeric, Boolean, DateTime

from app.db import Base


class SubscriptionPlan(Base):
    __tablename__ = "subscription_plans"

    plan_id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), unique=True, nullable=False)
    duration_months = Column(Integer, nullable=False, default=1)
    price = Column(Numeric(12, 2), nullable=False, default=0)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
