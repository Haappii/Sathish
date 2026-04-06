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
    fssai_number = Column(String(50))
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
    head_office_branch_id = Column(Integer, nullable=True)

    # Demo / expiry (optional)
    is_demo = Column(Boolean, default=False)
    expires_on = Column(Date, nullable=True)

    # Subscription / payment (optional)
    plan = Column(String(30), default="TRIAL")
    paid_until = Column(Date, nullable=True)
    last_payment_on = Column(Date, nullable=True)
    total_paid = Column(Numeric(12, 2), default=0)

    # UPI / Reservation payment
    upi_id = Column(String(80), nullable=True)
    reservation_advance = Column(Numeric(10, 2), default=0)
