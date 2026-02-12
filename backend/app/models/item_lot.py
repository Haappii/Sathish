from sqlalchemy import Column, Integer, String, TIMESTAMP, ForeignKey, Date, Numeric
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.db import Base


class ItemLot(Base):
    __tablename__ = "item_lots"

    lot_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    branch_id = Column(Integer, ForeignKey("branch.branch_id"), nullable=False)
    item_id = Column(Integer, ForeignKey("items.item_id"), nullable=False)

    source_type = Column(String(30), nullable=True)  # PO/ADJUSTMENT/...
    source_ref = Column(String(80), nullable=True)   # PO number, etc.

    batch_no = Column(String(80), nullable=True)
    expiry_date = Column(Date, nullable=True)
    serial_no = Column(String(120), nullable=True)

    quantity = Column(Integer, nullable=False, default=0)
    unit_cost = Column(Numeric(12, 2), nullable=True)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    created_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)

    item = relationship("Item")
    branch = relationship("Branch")
    created_by_user = relationship("User")

