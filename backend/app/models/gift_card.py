from sqlalchemy import Column, Integer, String, Numeric, TIMESTAMP, ForeignKey, Date
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.db import Base


class GiftCard(Base):
    __tablename__ = "gift_card"

    gift_card_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)

    code = Column(String(30), unique=True, index=True, nullable=False)
    status = Column(String(20), default="ACTIVE")  # ACTIVE | REDEEMED | VOID

    initial_amount = Column(Numeric(10, 2), nullable=False, default=0)
    balance_amount = Column(Numeric(10, 2), nullable=False, default=0)

    issued_on = Column(TIMESTAMP(timezone=True), server_default=func.now())
    expires_on = Column(Date, nullable=True)
    redeemed_on = Column(TIMESTAMP(timezone=True), nullable=True)

    customer_name = Column(String(120), nullable=True)
    mobile = Column(String(20), nullable=True)
    note = Column(String(255), nullable=True)

    created_by = Column(Integer, nullable=True)

    txns = relationship(
        "GiftCardTxn",
        back_populates="gift_card",
        cascade="all, delete-orphan",
    )

