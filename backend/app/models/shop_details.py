from sqlalchemy import Column, Integer, String, Text, Boolean, Numeric, Date
from sqlalchemy.sql import func
from app.db import Base

class ShopDetails(Base):
    __tablename__ = "shop_details"

    shop_id = Column(Integer, primary_key=True, index=True)

    shop_name = Column(String(150))
    address_line1 = Column(Text)
    address_line2 = Column(Text)
    address_line3 = Column(Text)
    state = Column(String(80))
    city = Column(String(80))
    pincode = Column(String(20))

    gst_number = Column(String(50))
    owner_name = Column(String(120))
    mobile = Column(String(20))
    mailid = Column(String(120))

    logo_url = Column(Text)

    # 🔹 Billing / GST Settings
    billing_type = Column(String(20), default="store")     # store / hotel
    gst_enabled = Column(Boolean, default=False)
    gst_percent = Column(Numeric(5,2), default=0)
    gst_mode = Column(String(20), default="inclusive")     # inclusive / exclusive

    # Business day tracking
    app_date = Column(Date, server_default=func.current_date())

    # Demo / expiry (optional)
    is_demo = Column(Boolean, default=False)
    expires_on = Column(Date, nullable=True)
