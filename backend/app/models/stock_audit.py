from sqlalchemy import Column, Integer, String, TIMESTAMP, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.db import Base


class StockAudit(Base):
    __tablename__ = "stock_audits"

    audit_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    branch_id = Column(Integer, ForeignKey("branch.branch_id"), nullable=False)

    audit_number = Column(String(60), nullable=False, unique=True)
    status = Column(String(20), nullable=False, default="DRAFT")  # DRAFT/COMPLETED/CANCELLED
    notes = Column(String(255), nullable=True)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    created_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    completed_at = Column(TIMESTAMP(timezone=True), nullable=True)
    completed_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)

    branch = relationship("Branch")
    created_by_user = relationship("User", foreign_keys=[created_by])
    completed_by_user = relationship("User", foreign_keys=[completed_by])

    lines = relationship(
        "StockAuditLine",
        back_populates="audit",
        cascade="all, delete-orphan",
    )


class StockAuditLine(Base):
    __tablename__ = "stock_audit_lines"

    line_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    audit_id = Column(Integer, ForeignKey("stock_audits.audit_id"), nullable=False)

    item_id = Column(Integer, ForeignKey("items.item_id"), nullable=False)
    system_qty = Column(Integer, nullable=False, default=0)
    counted_qty = Column(Integer, nullable=True)
    difference_qty = Column(Integer, nullable=True)
    reason = Column(String(255), nullable=True)

    audit = relationship("StockAudit", back_populates="lines")
    item = relationship("Item")

