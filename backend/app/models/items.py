from sqlalchemy import Column, Integer, String, Boolean, TIMESTAMP, ForeignKey, Float
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db import Base


class Item(Base):
    __tablename__ = "items"

    item_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    category_id = Column(Integer, ForeignKey("category.category_id"), nullable=False)

    item_name = Column(String(150), nullable=False)
    price = Column(Float, nullable=False, default=0)  # selling price
    buy_price = Column(Float, nullable=False, default=0)
    mrp_price = Column(Float, nullable=False, default=0)
    # Stored on disk as `frontend/src/assets/items/{item_id}.{ext}`
    image_filename = Column(String(255), nullable=True)

    min_stock = Column(Integer, nullable=False, default=0)   # 👈 Moved here

    item_status = Column(Boolean, default=True)
    created_on = Column(TIMESTAMP(timezone=True), server_default=func.now())
    created_by = Column(Integer)

    category = relationship("Category", back_populates="items")
