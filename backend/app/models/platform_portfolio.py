from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text

from app.db import Base


class PlatformPortfolio(Base):
    __tablename__ = "platform_portfolios"

    portfolio_id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(150), nullable=False, unique=True, index=True)
    profile_id = Column(
        Integer,
        ForeignKey("platform_team_profiles.profile_id", ondelete="SET NULL"),
        nullable=True,
    )
    config_json = Column(Text, nullable=False, default="{}")
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
