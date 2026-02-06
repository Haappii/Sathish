from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from datetime import datetime

from app.db import Base


class OnboardCode(Base):
    __tablename__ = "onboard_codes"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(50), unique=True, nullable=False)
    is_used = Column(Boolean, default=False, nullable=False)
    used_at = Column(DateTime, nullable=True)
    used_shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
