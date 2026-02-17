from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    ForeignKey,
    Numeric,
)
from sqlalchemy.orm import relationship
from datetime import datetime

from app.db import Base


class TableQrToken(Base):
    __tablename__ = "table_qr_tokens"

    id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False, index=True)
    branch_id = Column(Integer, nullable=False, index=True)
    table_id = Column(Integer, ForeignKey("tables_master.table_id"), nullable=False, index=True)

    token = Column(String(120), nullable=False, unique=True, index=True)
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    rotated_at = Column(DateTime, nullable=True)

    table = relationship("TableMaster")
    orders = relationship("QrOrder", back_populates="qr_token")


class QrOrder(Base):
    __tablename__ = "qr_orders"

    qr_order_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False, index=True)
    branch_id = Column(Integer, nullable=False, index=True)
    table_id = Column(Integer, ForeignKey("tables_master.table_id"), nullable=False, index=True)
    qr_token_id = Column(Integer, ForeignKey("table_qr_tokens.id"), nullable=False, index=True)

    customer_name = Column(String(120), nullable=True)
    mobile = Column(String(20), nullable=True)
    email = Column(String(120), nullable=True)

    status = Column(String(20), default="PENDING", nullable=False, index=True)  # PENDING / ACCEPTED / REJECTED
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    accepted_at = Column(DateTime, nullable=True)
    accepted_by = Column(Integer, nullable=True)

    linked_table_order_id = Column(Integer, ForeignKey("orders.order_id"), nullable=True, index=True)

    qr_token = relationship("TableQrToken", back_populates="orders")
    table = relationship("TableMaster")
    items = relationship(
        "QrOrderItem",
        back_populates="qr_order",
        cascade="all, delete-orphan",
    )


class QrOrderItem(Base):
    __tablename__ = "qr_order_items"

    id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False, index=True)
    qr_order_id = Column(Integer, ForeignKey("qr_orders.qr_order_id"), nullable=False, index=True)
    item_id = Column(Integer, ForeignKey("items.item_id"), nullable=False, index=True)

    item_name = Column(String(150), nullable=True)
    unit_price = Column(Numeric(10, 2), nullable=False, default=0)
    quantity = Column(Integer, nullable=False, default=1)

    qr_order = relationship("QrOrder", back_populates="items")
    item = relationship("Item")

