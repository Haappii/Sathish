from sqlalchemy import Column, Integer, String, TIMESTAMP, ForeignKey, Numeric, UniqueConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.db import Base


class ItemPrice(Base):
    __tablename__ = "item_prices"
    __table_args__ = (
        UniqueConstraint("shop_id", "item_id", "level", name="uq_item_prices_shop_item_level"),
    )

    price_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    item_id = Column(Integer, ForeignKey("items.item_id"), nullable=False)

    level = Column(String(40), nullable=False)  # RETAIL/WHOLESALE/...
    price = Column(Numeric(12, 2), nullable=False, default=0)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    created_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)

    item = relationship("Item")
    created_by_user = relationship("User")

