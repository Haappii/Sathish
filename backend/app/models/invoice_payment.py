from sqlalchemy import Column, Integer, String, Numeric, TIMESTAMP, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.db import Base


class InvoicePayment(Base):
    __tablename__ = "invoice_payments"

    payment_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)

    invoice_id = Column(Integer, ForeignKey("invoice.invoice_id"), nullable=False)
    invoice_number = Column(String(30), nullable=False)

    customer_id = Column(Integer, ForeignKey("customers.customer_id"), nullable=True)
    branch_id = Column(Integer, ForeignKey("branch.branch_id"), nullable=True)

    amount = Column(Numeric(10, 2), nullable=False, default=0)
    payment_mode = Column(String(20), nullable=False, default="cash")
    reference_no = Column(String(120), nullable=True)
    notes = Column(String(255), nullable=True)

    paid_on = Column(TIMESTAMP(timezone=True), server_default=func.now())
    created_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)

    invoice = relationship("Invoice")
    customer = relationship("Customer")
    branch = relationship("Branch")
