from sqlalchemy import Column, Integer, String, Numeric, TIMESTAMP, ForeignKey, Text, Float
from sqlalchemy.orm import relationship
from app.db import Base


class InvoiceArchive(Base):
    __tablename__ = "invoice_archive"

    archive_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)

    invoice_id = Column(Integer)
    invoice_number = Column(String(30))

    branch_id = Column(Integer, ForeignKey("branch.branch_id"))

    total_amount = Column(Numeric(10,2))
    tax_amt = Column(Numeric(10,2))
    discounted_amt = Column(Numeric(10,2))

    customer_name = Column(String(120))
    mobile = Column(String(20))
    created_time = Column(TIMESTAMP(timezone=True))
    deleted_time = Column(TIMESTAMP(timezone=True))
    deleted_by = Column(String(120))
    delete_reason = Column(Text)

    branch = relationship("Branch")

    details = relationship(
        "InvoiceArchiveDetail",
        back_populates="archive",
        cascade="all, delete-orphan"
    )


class InvoiceArchiveDetail(Base):
    __tablename__ = "invoice_archive_details"

    id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    archive_id = Column(Integer, ForeignKey("invoice_archive.archive_id"))
    item_id = Column(Integer)
    branch_id = Column(Integer, ForeignKey("branch.branch_id"))

    quantity = Column(Integer)
    amount = Column(Numeric(10,2))
    buy_price = Column(Float, nullable=False, default=0)
    mrp_price = Column(Float, nullable=False, default=0)

    archive = relationship("InvoiceArchive", back_populates="details")
    branch = relationship("Branch")
