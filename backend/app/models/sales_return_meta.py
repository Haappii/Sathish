from sqlalchemy import Column, Integer, String, TIMESTAMP, ForeignKey, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.db import Base


class SalesReturnMeta(Base):
    __tablename__ = "sales_return_meta"

    id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)

    return_id = Column(Integer, ForeignKey("sales_returns.return_id"), nullable=False, unique=True)

    return_type = Column(String(20), nullable=False, default="REFUND")  # REFUND / EXCHANGE
    refund_mode = Column(String(30), nullable=False, default="CASH")  # CASH/CARD/UPI/STORE_CREDIT/WALLET

    # If refund is credited to wallet/store credit, link the wallet transaction.
    wallet_txn_id = Column(Integer, ForeignKey("customer_wallet_txns.wallet_txn_id"), nullable=True)
    wallet_applied = Column(Boolean, nullable=False, default=False)

    reason_code = Column(String(50), nullable=True)
    note = Column(String(255), nullable=True)

    created_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    created_on = Column(TIMESTAMP(timezone=True), server_default=func.now())

    sales_return = relationship("SalesReturn")
    wallet_txn = relationship("CustomerWalletTxn")


class SalesReturnItemMeta(Base):
    __tablename__ = "sales_return_item_meta"

    id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)

    return_item_id = Column(Integer, ForeignKey("sales_return_items.id"), nullable=False, unique=True)

    condition = Column(String(20), nullable=False, default="GOOD")  # GOOD/DAMAGED
    restock = Column(Boolean, nullable=False, default=True)

    created_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    created_on = Column(TIMESTAMP(timezone=True), server_default=func.now())

    return_item = relationship("SalesReturnItem")
