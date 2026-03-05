from sqlalchemy import Column, Integer, Numeric, Boolean, TIMESTAMP, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db import Base


class BranchItemPrice(Base):
    __tablename__ = "branch_item_price"
    __table_args__ = (
        UniqueConstraint("shop_id", "branch_id", "item_id", name="uq_branch_item_price"),
    )

    price_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    branch_id = Column(Integer, ForeignKey("branch.branch_id"), nullable=False)
    item_id = Column(Integer, ForeignKey("items.item_id"), nullable=False)

    price = Column(Numeric(12, 2), nullable=False, default=0)
    buy_price = Column(Numeric(12, 2), nullable=False, default=0)
    mrp_price = Column(Numeric(12, 2), nullable=False, default=0)
    item_status = Column(Boolean, nullable=False, default=True)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())

    item = relationship("Item")
