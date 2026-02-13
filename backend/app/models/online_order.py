from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Numeric,
    TIMESTAMP,
    ForeignKey,
    UniqueConstraint,
    Index,
    JSON,
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.db import Base


class OnlineOrder(Base):
    __tablename__ = "online_orders"
    __table_args__ = (
        UniqueConstraint(
            "shop_id",
            "provider",
            "provider_order_id",
            name="uq_online_orders_provider_ref",
        ),
        Index("ix_online_orders_shop_status", "shop_id", "status"),
        Index("ix_online_orders_shop_created", "shop_id", "created_at"),
    )

    online_order_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False, index=True)
    branch_id = Column(Integer, ForeignKey("branch.branch_id"), nullable=True, index=True)

    provider = Column(String(20), nullable=False)  # SWIGGY / ZOMATO
    partner_id = Column(String(80), nullable=True)
    provider_order_id = Column(String(120), nullable=False)
    provider_order_number = Column(String(120), nullable=True)
    source_created_at = Column(TIMESTAMP(timezone=True), nullable=True)

    order_type = Column(String(20), nullable=False, default="DELIVERY")
    status = Column(String(30), nullable=False, default="NEW")

    customer_name = Column(String(150), nullable=True)
    customer_mobile = Column(String(30), nullable=True)
    customer_address = Column(Text, nullable=True)

    subtotal_amount = Column(Numeric(12, 2), nullable=False, default=0)
    tax_amount = Column(Numeric(12, 2), nullable=False, default=0)
    discount_amount = Column(Numeric(12, 2), nullable=False, default=0)
    delivery_charge = Column(Numeric(12, 2), nullable=False, default=0)
    packaging_charge = Column(Numeric(12, 2), nullable=False, default=0)
    total_amount = Column(Numeric(12, 2), nullable=False, default=0)

    payment_mode = Column(String(30), nullable=True)
    payment_status = Column(String(30), nullable=True)

    notes = Column(Text, nullable=True)
    webhook_event = Column(String(60), nullable=True)
    raw_payload = Column(JSON, nullable=True)

    accepted_at = Column(TIMESTAMP(timezone=True), nullable=True)
    dispatched_at = Column(TIMESTAMP(timezone=True), nullable=True)
    delivered_at = Column(TIMESTAMP(timezone=True), nullable=True)
    cancelled_at = Column(TIMESTAMP(timezone=True), nullable=True)

    invoice_id = Column(Integer, ForeignKey("invoice.invoice_id"), nullable=True, index=True)

    created_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    updated_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    items = relationship("OnlineOrderItem", back_populates="order", cascade="all, delete-orphan")
    events = relationship("OnlineOrderEvent", back_populates="order", cascade="all, delete-orphan")
    invoice = relationship("Invoice")


class OnlineOrderItem(Base):
    __tablename__ = "online_order_items"
    __table_args__ = (
        Index("ix_online_order_items_shop_order", "shop_id", "online_order_id"),
    )

    order_item_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False, index=True)
    online_order_id = Column(
        Integer, ForeignKey("online_orders.online_order_id"), nullable=False, index=True
    )

    item_id = Column(Integer, ForeignKey("items.item_id"), nullable=True)
    provider_item_id = Column(String(120), nullable=True)
    item_name = Column(String(200), nullable=False)
    quantity = Column(Numeric(10, 3), nullable=False, default=1)
    unit_price = Column(Numeric(12, 2), nullable=False, default=0)
    line_total = Column(Numeric(12, 2), nullable=False, default=0)
    notes = Column(String(300), nullable=True)

    order = relationship("OnlineOrder", back_populates="items")
    item = relationship("Item")


class OnlineOrderEvent(Base):
    __tablename__ = "online_order_events"
    __table_args__ = (
        Index("ix_online_order_events_shop_order", "shop_id", "online_order_id"),
    )

    event_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False, index=True)
    online_order_id = Column(
        Integer, ForeignKey("online_orders.online_order_id"), nullable=False, index=True
    )
    event_type = Column(String(60), nullable=False)
    provider_status = Column(String(40), nullable=True)
    message = Column(String(300), nullable=True)
    payload = Column(JSON, nullable=True)
    actor_user_id = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    order = relationship("OnlineOrder", back_populates="events")
