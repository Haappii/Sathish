from sqlalchemy import Column, Integer, String, Numeric, TIMESTAMP, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.db import Base


class GiftCardTxn(Base):
    __tablename__ = "gift_card_txn"

    txn_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    gift_card_id = Column(Integer, ForeignKey("gift_card.gift_card_id"), nullable=False, index=True)

    txn_type = Column(String(20), nullable=False)  # ISSUE | REDEEM | ADJUST | VOID
    amount = Column(Numeric(10, 2), nullable=False, default=0)

    ref_type = Column(String(20), nullable=True)  # INVOICE | MANUAL
    ref_no = Column(String(60), nullable=True)

    balance_after = Column(Numeric(10, 2), nullable=False, default=0)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    created_by = Column(Integer, nullable=True)

    gift_card = relationship("GiftCard", back_populates="txns")

