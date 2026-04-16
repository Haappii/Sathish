from sqlalchemy import Column, Integer, ForeignKey, Numeric
from sqlalchemy.orm import relationship
from app.db import Base


class Inventory(Base):
    __tablename__ = "stock"

    stock_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    item_id = Column(Integer, ForeignKey("items.item_id"), nullable=False)

    branch_id = Column(Integer, ForeignKey("branch.branch_id"))

    quantity = Column(Numeric(12, 3), default=0)
    min_stock = Column(Integer, default=0)

    item = relationship("Item")
    branch = relationship("Branch")
