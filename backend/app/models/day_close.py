from sqlalchemy import Column, Integer, Numeric, Date, TIMESTAMP, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db import Base


class BranchDayClose(Base):
    __tablename__ = "branch_day_close"

    id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    branch_id = Column(Integer, ForeignKey("branch.branch_id"), nullable=False)
    close_date = Column(Date, nullable=False)

    total_sales = Column(Numeric(12, 2), nullable=False, default=0)
    total_gst = Column(Numeric(12, 2), nullable=False, default=0)
    total_discount = Column(Numeric(12, 2), nullable=False, default=0)
    total_expense = Column(Numeric(12, 2), nullable=False, default=0)
    total_profit = Column(Numeric(12, 2), nullable=False, default=0)

    closed_by = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    closed_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    branch = relationship("Branch")


class ShopDayClose(Base):
    __tablename__ = "shop_day_close"

    id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    close_date = Column(Date, nullable=False)

    total_sales = Column(Numeric(12, 2), nullable=False, default=0)
    total_gst = Column(Numeric(12, 2), nullable=False, default=0)
    total_discount = Column(Numeric(12, 2), nullable=False, default=0)
    total_expense = Column(Numeric(12, 2), nullable=False, default=0)
    total_profit = Column(Numeric(12, 2), nullable=False, default=0)

    closed_by = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    closed_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
