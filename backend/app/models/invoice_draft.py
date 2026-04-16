from sqlalchemy import Column, Integer, String, Numeric, TIMESTAMP, ForeignKey, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.db import Base


class InvoiceDraft(Base):
    __tablename__ = "invoice_drafts"

    draft_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    branch_id = Column(Integer, ForeignKey("branch.branch_id"), nullable=False)

    draft_number = Column(String(40), unique=True, nullable=False)
    status = Column(String(20), nullable=False, default="DRAFT")

    customer_name = Column(String(120), nullable=True)
    mobile = Column(String(20), nullable=True)
    gst_number = Column(String(100), nullable=True)

    discounted_amt = Column(Numeric(10, 2), nullable=False, default=0)
    payment_mode = Column(String(20), nullable=False, default="cash")
    payment_split = Column(JSON, nullable=True)

    notes = Column(String(255), nullable=True)

    created_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    created_on = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_on = Column(TIMESTAMP(timezone=True), onupdate=func.now())

    branch = relationship("Branch")
    items = relationship(
        "InvoiceDraftItem",
        back_populates="draft",
        cascade="all, delete-orphan",
    )


class InvoiceDraftItem(Base):
    __tablename__ = "invoice_draft_items"

    id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    draft_id = Column(Integer, ForeignKey("invoice_drafts.draft_id"), nullable=False)

    item_id = Column(Integer, ForeignKey("items.item_id"), nullable=False)
    quantity = Column(Integer, nullable=False, default=0)
    amount = Column(Numeric(10, 2), nullable=False, default=0)

    draft = relationship("InvoiceDraft", back_populates="items")
    item = relationship("Item")

    @property
    def item_name(self):
        return self.item.item_name if self.item else None
