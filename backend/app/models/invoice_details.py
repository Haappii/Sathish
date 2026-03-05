from sqlalchemy import Column, Integer, Numeric, ForeignKey, Float
from sqlalchemy.orm import relationship
from app.db import Base

class InvoiceDetail(Base):
    __tablename__ = "invoice_details"

    id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    invoice_id = Column(Integer, ForeignKey("invoice.invoice_id"))
    item_id = Column(Integer, ForeignKey("items.item_id"))
    branch_id = Column(Integer, ForeignKey("branch.branch_id"))

    quantity = Column(Integer, nullable=False)
    amount = Column(Numeric(10,2), nullable=False)
    buy_price = Column(Float, nullable=False, default=0)
    mrp_price = Column(Float, nullable=False, default=0)
    tax_rate = Column(Numeric(5,2), nullable=False, default=0)
    taxable_value = Column(Numeric(12,2), nullable=False, default=0)
    cgst_amt = Column(Numeric(12,2), nullable=False, default=0)
    sgst_amt = Column(Numeric(12,2), nullable=False, default=0)
    igst_amt = Column(Numeric(12,2), nullable=False, default=0)
    cess_amt = Column(Numeric(12,2), nullable=False, default=0)

    invoice = relationship("Invoice", back_populates="details")
    item = relationship("Item")
    branch = relationship("Branch")
