from sqlalchemy import Column, Integer, String, TIMESTAMP, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.db import Base


class StockTransfer(Base):
    __tablename__ = "stock_transfers"

    transfer_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)

    transfer_number = Column(String(40), unique=True, nullable=False)

    from_branch_id = Column(Integer, ForeignKey("branch.branch_id"), nullable=False)
    to_branch_id = Column(Integer, ForeignKey("branch.branch_id"), nullable=False)

    status = Column(String(20), nullable=False, default="REQUESTED")  # REQUESTED/APPROVED/REJECTED/DISPATCHED/RECEIVED/CANCELLED
    notes = Column(String(255), nullable=True)

    requested_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    requested_on = Column(TIMESTAMP(timezone=True), server_default=func.now())

    approved_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    approved_on = Column(TIMESTAMP(timezone=True), nullable=True)

    dispatched_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    dispatched_on = Column(TIMESTAMP(timezone=True), nullable=True)

    received_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    received_on = Column(TIMESTAMP(timezone=True), nullable=True)

    from_branch = relationship("Branch", foreign_keys=[from_branch_id])
    to_branch = relationship("Branch", foreign_keys=[to_branch_id])

    items = relationship(
        "StockTransferItem",
        back_populates="transfer",
        cascade="all, delete-orphan",
    )


class StockTransferItem(Base):
    __tablename__ = "stock_transfer_items"

    id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    transfer_id = Column(Integer, ForeignKey("stock_transfers.transfer_id"), nullable=False)

    item_id = Column(Integer, ForeignKey("items.item_id"), nullable=False)
    quantity = Column(Integer, nullable=False, default=0)

    transfer = relationship("StockTransfer", back_populates="items")
    item = relationship("Item")
