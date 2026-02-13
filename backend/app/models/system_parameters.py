from sqlalchemy import Column, Integer, String, ForeignKey
from app.db import Base


class SystemParameters(Base):
    __tablename__ = "system_parameters"

    id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    param_key = Column(String(100), nullable=False)
    param_value = Column(String(500), nullable=False)


# ---- Backward Compatibility ----
# Some modules still import SystemParameter (singular)
# Map it to the same class so the app doesn't crash
SystemParameter = SystemParameters
