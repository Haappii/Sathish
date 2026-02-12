from sqlalchemy import Column, Integer, String, Numeric, TIMESTAMP, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.db import Base


class InvoiceDue(Base):
    __tablename__ = "invoice_dues"
    __table_args__ = (
        UniqueConstraint("shop_id", "invoice_id", name="uq_invoice_dues_shop_invoice"),
    )

    due_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)

    invoice_id = Column(Integer, ForeignKey("invoice.invoice_id"), nullable=False)
    invoice_number = Column(String(30), nullable=False)

    customer_id = Column(Integer, ForeignKey("customers.customer_id"), nullable=True)
    branch_id = Column(Integer, ForeignKey("branch.branch_id"), nullable=True)

    original_amount = Column(Numeric(10, 2), nullable=False, default=0)
    status = Column(String(20), nullable=False, default="OPEN")  # OPEN/CLOSED/CANCELLED

    created_on = Column(TIMESTAMP(timezone=True), server_default=func.now())
    closed_on = Column(TIMESTAMP(timezone=True), nullable=True)

    created_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)

    invoice = relationship("Invoice")
    customer = relationship("Customer")
    branch = relationship("Branch")
