from sqlalchemy import Column, Integer, String, TIMESTAMP, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.db import Base


class PurchaseOrderAttachment(Base):
    __tablename__ = "purchase_order_attachments"

    attachment_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    po_id = Column(Integer, ForeignKey("purchase_orders.po_id"), nullable=False)

    original_filename = Column(String(255), nullable=False)
    stored_path = Column(String(500), nullable=False)  # relative to /uploads
    mime_type = Column(String(120), nullable=True)
    size_bytes = Column(Integer, nullable=True)

    uploaded_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    uploaded_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)

    po = relationship("PurchaseOrder")
    uploaded_by_user = relationship("User")

