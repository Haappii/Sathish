from sqlalchemy import Column, Integer, String, Numeric, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db import Base


class ModifierGroup(Base):
    __tablename__ = "modifier_groups"

    group_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)       # e.g. "Spice Level", "Add-ons"
    required = Column(Boolean, default=False)         # customer must pick at least one
    multi_select = Column(Boolean, default=True)      # can pick multiple options
    min_selections = Column(Integer, default=0)
    max_selections = Column(Integer, default=0)       # 0 = unlimited
    created_at = Column(DateTime, default=datetime.utcnow)

    modifiers = relationship("Modifier", back_populates="group", cascade="all, delete-orphan")
    item_links = relationship("ItemModifierGroup", back_populates="group", cascade="all, delete-orphan")


class Modifier(Base):
    __tablename__ = "modifiers"

    modifier_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False, index=True)
    group_id = Column(Integer, ForeignKey("modifier_groups.group_id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)        # e.g. "Extra Cheese", "No Onion", "Mild"
    extra_price = Column(Numeric(10, 2), default=0)   # additional charge on top of item price
    is_active = Column(Boolean, default=True)

    group = relationship("ModifierGroup", back_populates="modifiers")


class ItemModifierGroup(Base):
    """Links a menu item to one or more modifier groups."""
    __tablename__ = "item_modifier_groups"
    __table_args__ = (
        UniqueConstraint("shop_id", "item_id", "group_id", name="uq_item_modifier_group"),
    )

    id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False, index=True)
    item_id = Column(Integer, ForeignKey("items.item_id"), nullable=False, index=True)
    group_id = Column(Integer, ForeignKey("modifier_groups.group_id"), nullable=False, index=True)

    group = relationship("ModifierGroup", back_populates="item_links")


class OrderItemModifier(Base):
    """Selected modifiers recorded against an order item."""
    __tablename__ = "order_item_modifiers"

    id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False, index=True)
    order_item_id = Column(Integer, ForeignKey("order_items.order_item_id"), nullable=False, index=True)
    modifier_id = Column(Integer, ForeignKey("modifiers.modifier_id"), nullable=False)
    modifier_name = Column(String(100), nullable=True)
    extra_price = Column(Numeric(10, 2), default=0)

    modifier = relationship("Modifier")
