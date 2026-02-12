from sqlalchemy import Column, Integer, String, TIMESTAMP, ForeignKey, UniqueConstraint, Numeric
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.db import Base


class LoyaltyAccount(Base):
    __tablename__ = "loyalty_accounts"
    __table_args__ = (
        UniqueConstraint("shop_id", "customer_id", name="uq_loyalty_accounts_shop_customer"),
    )

    account_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    customer_id = Column(Integer, ForeignKey("customers.customer_id"), nullable=False)

    points_balance = Column(Integer, nullable=False, default=0)
    tier = Column(String(30), nullable=True)

    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())

    customer = relationship("Customer")

    txns = relationship(
        "LoyaltyTransaction",
        back_populates="account",
        cascade="all, delete-orphan",
    )


class LoyaltyTransaction(Base):
    __tablename__ = "loyalty_transactions"

    txn_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    account_id = Column(Integer, ForeignKey("loyalty_accounts.account_id"), nullable=False)
    customer_id = Column(Integer, ForeignKey("customers.customer_id"), nullable=False)

    txn_type = Column(String(20), nullable=False)  # EARN/REDEEM/ADJUST
    points = Column(Integer, nullable=False, default=0)
    amount_value = Column(Numeric(12, 2), nullable=True)  # optional rupee value

    invoice_id = Column(Integer, ForeignKey("invoice.invoice_id"), nullable=True)
    notes = Column(String(255), nullable=True)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    created_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)

    account = relationship("LoyaltyAccount", back_populates="txns")
    customer = relationship("Customer")
    invoice = relationship("Invoice")
    created_by_user = relationship("User")

