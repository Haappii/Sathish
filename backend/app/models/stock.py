from sqlalchemy import Column, Index, Integer, ForeignKey, Numeric
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

    __table_args__ = (
        # Every cart item during bill creation looks up its stock row by
        # exactly this triple (ensure_stock_row/get_stock/adjust_stock).
        Index("ix_stock_shop_item_branch", "shop_id", "item_id", "branch_id"),
    )
