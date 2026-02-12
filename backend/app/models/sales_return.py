from sqlalchemy import Column, Integer, String, Numeric, TIMESTAMP, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.db import Base


class SalesReturn(Base):
    __tablename__ = "sales_returns"

    return_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    branch_id = Column(Integer, ForeignKey("branch.branch_id"), nullable=False)

    return_number = Column(String(40), unique=True, nullable=False)

    invoice_id = Column(Integer, ForeignKey("invoice.invoice_id"), nullable=False)
    invoice_number = Column(String(30), nullable=False)

    customer_id = Column(Integer, ForeignKey("customers.customer_id"), nullable=True)
    customer_mobile = Column(String(20), nullable=True)

    subtotal_amount = Column(Numeric(10, 2), nullable=False, default=0)
    tax_amount = Column(Numeric(10, 2), nullable=False, default=0)
    discount_amount = Column(Numeric(10, 2), nullable=False, default=0)
    refund_amount = Column(Numeric(10, 2), nullable=False, default=0)

    reason = Column(String(255), nullable=True)
    status = Column(String(20), nullable=False, default="COMPLETED")  # COMPLETED/CANCELLED

    created_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    created_on = Column(TIMESTAMP(timezone=True), server_default=func.now())

    invoice = relationship("Invoice")
    customer = relationship("Customer")
    branch = relationship("Branch")

    items = relationship(
        "SalesReturnItem",
        back_populates="sales_return",
        cascade="all, delete-orphan",
    )


class SalesReturnItem(Base):
    __tablename__ = "sales_return_items"

    id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    return_id = Column(Integer, ForeignKey("sales_returns.return_id"), nullable=False)

    item_id = Column(Integer, ForeignKey("items.item_id"), nullable=False)
    quantity = Column(Integer, nullable=False)

    unit_price = Column(Numeric(10, 2), nullable=False, default=0)
    line_subtotal = Column(Numeric(10, 2), nullable=False, default=0)

    sales_return = relationship("SalesReturn", back_populates="items")
    item = relationship("Item")
