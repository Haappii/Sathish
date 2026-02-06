from sqlalchemy import Column, Integer, String, Numeric, TIMESTAMP, ForeignKey, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db import Base

class Invoice(Base):
    __tablename__ = "invoice"

    invoice_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    invoice_number = Column(String(30), unique=True, nullable=False)
    total_amount = Column(Numeric(10,2))
    tax_amt = Column(Numeric(10,2))
    discounted_amt = Column(Numeric(10,2))
    payment_mode = Column(String(20), default="cash")
    payment_split = Column(JSON, nullable=True)

    branch_id = Column(Integer, ForeignKey("branch.branch_id"))
    created_user = Column(Integer, ForeignKey("users.user_id"))
    created_time = Column(TIMESTAMP(timezone=True), server_default=func.now())

    customer_name = Column(String(120))
    mobile = Column(String(20))
    gst_number = Column(String(100))

    branch = relationship("Branch")
    user = relationship("User")

    details = relationship(
        "InvoiceDetail",
        back_populates="invoice",
        cascade="all, delete-orphan"
    )
