from sqlalchemy import Column, Integer, String, Boolean, TIMESTAMP, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db import Base

class Category(Base):
    __tablename__ = "category"

    category_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    branch_id = Column(Integer, ForeignKey("branch.branch_id"), nullable=True)
    category_name = Column(String(120), nullable=False)
    category_status = Column(Boolean, default=True)
    created_on = Column(TIMESTAMP(timezone=True), server_default=func.now())
    created_by = Column(Integer)

    items = relationship("Item", back_populates="category")
