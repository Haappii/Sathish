from sqlalchemy import (
    Column,
    Integer,
    String,
    Numeric,
    ForeignKey,
    DateTime,
    Boolean,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from datetime import datetime

from app.db import Base


# ================================
# TABLE CATEGORY
# ================================
class TableCategory(Base):
    __tablename__ = "table_categories"

    category_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    category_name = Column(String(100), nullable=False)
    branch_id = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    tables = relationship(
        "TableMaster",
        back_populates="category",
        cascade="all, delete-orphan"
    )


# ================================
# TABLE MASTER
# ================================
class TableMaster(Base):
    __tablename__ = "tables_master"

    __table_args__ = (
        UniqueConstraint("shop_id", "branch_id", "category_id", "table_name",
                         name="uq_tables_master_shop_branch_category_name"),
    )

    table_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    table_name = Column(String(50), nullable=False)
    capacity = Column(Integer, default=0)

    branch_id = Column(Integer, nullable=False)
    category_id = Column(Integer, ForeignKey("table_categories.category_id"), nullable=True)
    status = Column(String(20), default="FREE")  # FREE / OCCUPIED / PAID

    created_at = Column(DateTime, default=datetime.utcnow)

    # 🔥 NEW COLUMN (USED FOR RUNNING TIME)
    table_start_time = Column(DateTime, nullable=True)

    category = relationship("TableCategory", back_populates="tables")
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

    # DINE_IN / TAKEAWAY / DELIVERY
    order_type = Column(String(20), default="DINE_IN", nullable=False)

    customer_name = Column(String(120), nullable=True)
    mobile = Column(String(20), nullable=True)
    notes = Column(String(300), nullable=True)
    token_number = Column(String(20), nullable=True)  # for takeaway token display

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
    notes = Column(String(300), nullable=True)        # e.g. "no onion", "extra spicy"
    kot_sent = Column(Boolean, default=False, nullable=False)
    kot_sent_at = Column(DateTime, nullable=True)

    added_at = Column(DateTime, default=datetime.utcnow)

    order = relationship(
        "Order",
        back_populates="items"
    )

    item = relationship("Item")
