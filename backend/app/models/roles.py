from sqlalchemy import Column, Integer, String, Boolean
from app.db import Base

class Role(Base):
    __tablename__ = "roles"

    role_id = Column(Integer, primary_key=True, index=True)
    role_name = Column(String(80), nullable=False, unique=True)

    # NEW — soft delete / disable role instead of delete
    status = Column(Boolean, default=True)
