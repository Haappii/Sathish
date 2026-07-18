from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text

from app.db import Base


class PlatformTeamProfile(Base):
    __tablename__ = "platform_team_profiles"

    profile_id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    role_title = Column(String(150), nullable=False, default="")
    bio = Column(Text, nullable=True)
    photo_url = Column(String(400), nullable=True)
    display_order = Column(Integer, default=0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
