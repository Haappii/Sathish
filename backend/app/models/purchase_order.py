from sqlalchemy import Column, Integer, String, TIMESTAMP, ForeignKey, Float, Date
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db import Base


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    po_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    po_number = Column(String(40), nullable=False, unique=True)

    supplier_id = Column(Integer, ForeignKey("suppliers.supplier_id"), nullable=False)
    branch_id = Column(Integer, ForeignKey("branch.branch_id"), nullable=False)

    order_date = Column(Date, nullable=False)
    expected_date = Column(Date, nullable=True)

    status = Column(String(30), nullable=False, default="DRAFT")
    payment_status = Column(String(20), nullable=False, default="UNPAID")
    paid_amount = Column(Float, nullable=False, default=0)

    total_amount = Column(Float, nullable=False, default=0)
    notes = Column(String(300), nullable=True)

    created_by = Column(Integer, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    items = relationship("PurchaseOrderItem", back_populates="po", cascade="all, delete-orphan")


class PurchaseOrderItem(Base):
    __tablename__ = "purchase_order_items"

    po_item_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    po_id = Column(Integer, ForeignKey("purchase_orders.po_id"), nullable=False)
    item_id = Column(Integer, ForeignKey("items.item_id"), nullable=False)

    item_name = Column(String(150), nullable=False)
    qty_ordered = Column(Integer, nullable=False, default=0)
    qty_received = Column(Integer, nullable=False, default=0)

    unit_cost = Column(Float, nullable=False, default=0)   # buy price
    sell_price = Column(Float, nullable=False, default=0)  # existing selling price
    mrp_price = Column(Float, nullable=False, default=0)

    line_total = Column(Float, nullable=False, default=0)

    po = relationship("PurchaseOrder", back_populates="items")
