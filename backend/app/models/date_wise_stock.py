from sqlalchemy import Column, Integer, ForeignKey, Date, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db import Base


class DateWiseStock(Base):
    __tablename__ = "date_wise_stock"

    id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    stock_date = Column(Date, nullable=False)

    item_id = Column(Integer, ForeignKey("items.item_id"), nullable=False)
    branch_id = Column(Integer, ForeignKey("branch.branch_id"), nullable=False)

    quantity = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    item = relationship("Item")
    branch = relationship("Branch")
