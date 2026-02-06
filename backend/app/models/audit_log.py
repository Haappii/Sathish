from sqlalchemy import Column, Integer, String, JSON, TIMESTAMP, ForeignKey, func
from app.db import Base

class AuditLog(Base):
    __tablename__ = "audit_logs"

    log_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    module_name = Column(String(50), nullable=False)
    action_type = Column(String(20), nullable=False)
    record_id = Column(String(50), nullable=False)
    old_values = Column(JSON, nullable=True)
    new_values = Column(JSON, nullable=True)
    created_on = Column(TIMESTAMP(timezone=True), server_default=func.now())
    created_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)
