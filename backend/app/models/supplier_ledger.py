from sqlalchemy import Column, Integer, String, TIMESTAMP, ForeignKey, Numeric
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.db import Base


class SupplierLedgerEntry(Base):
    __tablename__ = "supplier_ledger_entries"

    entry_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    branch_id = Column(Integer, ForeignKey("branch.branch_id"), nullable=False)
    supplier_id = Column(Integer, ForeignKey("suppliers.supplier_id"), nullable=False)

    entry_type = Column(String(30), nullable=False)  # PO / PAYMENT / ADJUSTMENT
    reference_no = Column(String(80), nullable=True)
    po_id = Column(Integer, ForeignKey("purchase_orders.po_id"), nullable=True)

    debit = Column(Numeric(12, 2), nullable=False, default=0)
    credit = Column(Numeric(12, 2), nullable=False, default=0)
    notes = Column(String(255), nullable=True)

    entry_time = Column(TIMESTAMP(timezone=True), server_default=func.now())
    created_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)

    supplier = relationship("Supplier")
    branch = relationship("Branch")
    purchase_order = relationship("PurchaseOrder")
    created_by_user = relationship("User")

