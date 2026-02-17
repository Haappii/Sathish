from sqlalchemy import Column, Integer, String, Numeric, TIMESTAMP, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.db import Base


class CustomerWalletTxn(Base):
    __tablename__ = "customer_wallet_txns"

    wallet_txn_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)

    customer_id = Column(Integer, ForeignKey("customers.customer_id"), nullable=False)
    mobile = Column(String(20), nullable=False)

    txn_type = Column(String(10), nullable=False)  # CREDIT / DEBIT
    amount = Column(Numeric(10, 2), nullable=False, default=0)

    ref_type = Column(String(30), nullable=True)  # RETURN / INVOICE / ADJUSTMENT
    ref_no = Column(String(40), nullable=True)
    note = Column(String(255), nullable=True)

    created_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    created_on = Column(TIMESTAMP(timezone=True), server_default=func.now())

    customer = relationship("Customer")
