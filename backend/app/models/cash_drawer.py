from sqlalchemy import Column, Integer, String, TIMESTAMP, ForeignKey, Numeric, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.db import Base


class CashShift(Base):
    __tablename__ = "cash_shifts"

    shift_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    branch_id = Column(Integer, ForeignKey("branch.branch_id"), nullable=False)

    status = Column(String(20), nullable=False, default="OPEN")  # OPEN/CLOSED

    opened_by = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    opened_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    opening_cash = Column(Numeric(12, 2), nullable=False, default=0)
    opening_notes = Column(String(255), nullable=True)

    closed_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    closed_at = Column(TIMESTAMP(timezone=True), nullable=True)
    closing_notes = Column(String(255), nullable=True)

    expected_cash = Column(Numeric(12, 2), nullable=True)
    actual_cash = Column(Numeric(12, 2), nullable=True)
    diff_cash = Column(Numeric(12, 2), nullable=True)
    denomination_counts = Column(JSON, nullable=True)

    branch = relationship("Branch")
    opened_by_user = relationship("User", foreign_keys=[opened_by])
    closed_by_user = relationship("User", foreign_keys=[closed_by])

    movements = relationship(
        "CashMovement",
        back_populates="shift",
        cascade="all, delete-orphan",
    )


class CashMovement(Base):
    __tablename__ = "cash_movements"

    movement_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    branch_id = Column(Integer, ForeignKey("branch.branch_id"), nullable=False)
    shift_id = Column(Integer, ForeignKey("cash_shifts.shift_id"), nullable=False)

    movement_type = Column(String(10), nullable=False)  # IN/OUT
    amount = Column(Numeric(12, 2), nullable=False, default=0)
    reason = Column(String(255), nullable=True)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    created_by = Column(Integer, ForeignKey("users.user_id"), nullable=False)

    shift = relationship("CashShift", back_populates="movements")
    branch = relationship("Branch")
    created_by_user = relationship("User")

