from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db import Base


class KOT(Base):
    __tablename__ = "kot"

    kot_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False, index=True)
    branch_id = Column(Integer, nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("orders.order_id"), nullable=False, index=True)
    table_id = Column(Integer, ForeignKey("tables_master.table_id"), nullable=True, index=True)

    kot_number = Column(String(30), nullable=False)
    status = Column(String(20), default="PENDING", nullable=False)  # PENDING / PREPARING / READY / SERVED
    notes = Column(Text, nullable=True)

    printed_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    printed_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    completed_at = Column(DateTime, nullable=True)

    items = relationship("KOTItem", back_populates="kot", cascade="all, delete-orphan")


class KOTItem(Base):
    __tablename__ = "kot_items"

    id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False, index=True)
    kot_id = Column(Integer, ForeignKey("kot.kot_id"), nullable=False, index=True)
    order_item_id = Column(Integer, ForeignKey("order_items.order_item_id"), nullable=False)
    item_id = Column(Integer, ForeignKey("items.item_id"), nullable=False)
    item_name = Column(String(150), nullable=True)
    quantity = Column(Integer, nullable=False)
    notes = Column(String(300), nullable=True)
    status = Column(String(20), default="PENDING", nullable=False)  # PENDING / PREPARING / READY / SERVED

    kot = relationship("KOT", back_populates="items")
