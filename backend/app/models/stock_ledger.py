from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db import Base


class StockLedger(Base):
    __tablename__ = "stock_ledger"

    ledger_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    item_id = Column(Integer, ForeignKey("items.item_id"), nullable=False)

    branch_id = Column(Integer, ForeignKey("branch.branch_id"))

    change_type = Column(String(30))   # ADD / REMOVE / SALE / RETURN / EDIT / DELETE
    quantity = Column(Integer, default=0)
    reference_no = Column(String(50))
    created_time = Column(DateTime, default=datetime.utcnow)

    item = relationship("Item")
    branch = relationship("Branch")
