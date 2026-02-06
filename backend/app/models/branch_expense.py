from sqlalchemy import Column, Integer, String, Numeric, Date, TIMESTAMP, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db import Base


class BranchExpense(Base):
    __tablename__ = "branch_expenses"

    expense_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    branch_id = Column(Integer, ForeignKey("branch.branch_id"), nullable=False)
    expense_date = Column(Date, nullable=False)

    amount = Column(Numeric(10, 2), nullable=False)
    category = Column(String(120), nullable=False)
    payment_mode = Column(String(30), nullable=False, default="cash")
    note = Column(String(300))

    created_by = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    branch = relationship("Branch")
