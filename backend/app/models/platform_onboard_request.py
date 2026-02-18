from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text, Boolean, Numeric

from app.db import Base


class PlatformOnboardRequest(Base):
    __tablename__ = "platform_onboard_requests"

    request_id = Column(Integer, primary_key=True, index=True)

    status = Column(String(20), nullable=False, default="PENDING", index=True)  # PENDING/ACCEPTED/REJECTED
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    decided_at = Column(DateTime, nullable=True)
    decided_by = Column(String(120), nullable=True)  # platform username
    decision_note = Column(Text, nullable=True)

    # Request contact
    requester_name = Column(String(120), nullable=True)
    requester_email = Column(String(200), nullable=True)
    requester_phone = Column(String(50), nullable=True)
    business = Column(String(200), nullable=True)
    message = Column(Text, nullable=True)

    # Shop setup fields
    shop_name = Column(String(150), nullable=False)
    owner_name = Column(String(120), nullable=True)
    mobile = Column(String(20), nullable=True)
    mailid = Column(String(120), nullable=True)
    gst_number = Column(String(50), nullable=True)
    billing_type = Column(String(20), nullable=True, default="store")
    gst_enabled = Column(Boolean, nullable=True, default=False)
    gst_percent = Column(Numeric(5, 2), nullable=True, default=0)
    gst_mode = Column(String(20), nullable=True, default="inclusive")
    logo_url = Column(Text, nullable=True)
    address_line1 = Column(Text, nullable=True)
    address_line2 = Column(Text, nullable=True)
    address_line3 = Column(Text, nullable=True)
    city = Column(String(80), nullable=True)
    state = Column(String(80), nullable=True)
    pincode = Column(String(20), nullable=True)

    # Branch setup fields
    branch_name = Column(String(150), nullable=False)
    branch_address_line1 = Column(String(255), nullable=True)
    branch_address_line2 = Column(String(255), nullable=True)
    branch_city = Column(String(120), nullable=True)
    branch_state = Column(String(120), nullable=True)
    branch_country = Column(String(120), nullable=True)
    branch_pincode = Column(String(20), nullable=True)

    # Admin user preferences
    admin_username = Column(String(80), nullable=True)
    admin_name = Column(String(120), nullable=True)

    # Provisioned IDs (after accept)
    created_shop_id = Column(Integer, nullable=True, index=True)
    created_branch_id = Column(Integer, nullable=True, index=True)
    created_admin_user_id = Column(Integer, nullable=True, index=True)

