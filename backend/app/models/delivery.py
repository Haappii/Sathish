from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db import Base


class DeliveryBoy(Base):
    __tablename__ = "delivery_boys"

    delivery_boy_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False, index=True)
    branch_id = Column(Integer, nullable=False, index=True)
    name = Column(String(100), nullable=False)
    mobile = Column(String(20), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    assignments = relationship("DeliveryAssignment", back_populates="delivery_boy")


class DeliveryAssignment(Base):
    __tablename__ = "delivery_assignments"

    assignment_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False, index=True)
    branch_id = Column(Integer, nullable=False, index=True)
    delivery_boy_id = Column(Integer, ForeignKey("delivery_boys.delivery_boy_id"), nullable=False, index=True)

    # Link to either an internal takeaway order OR an online order
    order_id = Column(Integer, ForeignKey("orders.order_id"), nullable=True, index=True)
    online_order_id = Column(Integer, ForeignKey("online_orders.online_order_id"), nullable=True, index=True)

    customer_name = Column(String(120), nullable=True)
    mobile = Column(String(20), nullable=True)
    address = Column(Text, nullable=True)

    # ASSIGNED / PICKED_UP / DELIVERED / FAILED
    status = Column(String(20), default="ASSIGNED", nullable=False, index=True)

    assigned_at = Column(DateTime, default=datetime.utcnow)
    picked_up_at = Column(DateTime, nullable=True)
    delivered_at = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)

    delivery_boy = relationship("DeliveryBoy", back_populates="assignments")
