from sqlalchemy import (
    Column,
    Integer,
    String,
    Numeric,
    ForeignKey,
    DateTime
)
from sqlalchemy.orm import relationship
from datetime import datetime

from app.db import Base


# ================================
# TABLE MASTER
# ================================
class TableMaster(Base):
    __tablename__ = "tables_master"

    table_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    table_name = Column(String(50), nullable=False)
    capacity = Column(Integer, default=0)

    branch_id = Column(Integer, nullable=False)
    status = Column(String(20), default="FREE")  # FREE / OCCUPIED

    created_at = Column(DateTime, default=datetime.utcnow)

    # 🔥 NEW COLUMN (USED FOR RUNNING TIME)
    table_start_time = Column(DateTime, nullable=True)

    orders = relationship(
        "Order",
        back_populates="table",
        cascade="all, delete-orphan"
    )


# ================================
# RUNNING ORDERS
# ================================
class Order(Base):
    __tablename__ = "orders"

    order_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)

    table_id = Column(
        Integer,
        ForeignKey("tables_master.table_id"),
        nullable=False
    )
    branch_id = Column(Integer, nullable=False)

    status = Column(String(20), default="OPEN")  # OPEN / CLOSED
    opened_by = Column(Integer)
    opened_at = Column(DateTime, default=datetime.utcnow)
    closed_at = Column(DateTime)

    table = relationship(
        "TableMaster",
        back_populates="orders"
    )

    items = relationship(
        "OrderItem",
        back_populates="order",
        cascade="all, delete-orphan"
    )


# ================================
# ORDER ITEMS
# ================================
class OrderItem(Base):
    __tablename__ = "order_items"

    order_item_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)

    order_id = Column(
        Integer,
        ForeignKey("orders.order_id"),
        nullable=False
    )

    item_id = Column(
        Integer,
        ForeignKey("items.item_id"),
        nullable=False
    )

    quantity = Column(Integer, nullable=False)
    price = Column(Numeric(10, 2), nullable=False)

    added_at = Column(DateTime, default=datetime.utcnow)

    order = relationship(
        "Order",
        back_populates="items"
    )

    item = relationship("Item")
