from sqlalchemy import Column, Integer, String, Boolean, TIMESTAMP, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db import Base


class User(Base):
    __tablename__ = "users"

    user_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    user_name = Column(String(100), nullable=False)
    password = Column(String(200), nullable=False)
    name = Column(String(120))
    role = Column(Integer, ForeignKey("roles.role_id"))
    status = Column(Boolean, default=True)
    login_status = Column(Boolean, default=False)
    active_session_id = Column(String(120), nullable=True)
    last_login_at = Column(TIMESTAMP(timezone=True), nullable=True)
    last_activity_at = Column(TIMESTAMP(timezone=True), nullable=True)
    created_on = Column(TIMESTAMP(timezone=True), server_default=func.now())
    created_by = Column(Integer)

    branch_id = Column(Integer, ForeignKey("branch.branch_id"), nullable=True)

    role_ref = relationship("Role")
    branch = relationship("Branch")
