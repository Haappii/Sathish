from sqlalchemy import Column, Integer, String, TIMESTAMP, ForeignKey, Boolean, Numeric
from sqlalchemy.sql import func
from app.db import Base


class Branch(Base):
    __tablename__ = "branch"

    branch_id = Column(
        Integer,
        primary_key=True,
        index=True,
        autoincrement=True  # 👈 add this
    )

    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)

    branch_name = Column(String(150), nullable=False)
    address_line1 = Column(String(255))
    address_line2 = Column(String(255))
    city = Column(String(120))
    state = Column(String(120))
    country = Column(String(120))
    pincode = Column(String(20))
    type = Column(String(20))   # Branch / Head Office
    status = Column(String(20), default="ACTIVE")
    branch_close = Column(String(1), default="N")  # Y/N
    service_charge_required = Column(Boolean, default=False)
    service_charge_amount = Column(Numeric(10, 2), default=0)
    service_charge_gst_required = Column(Boolean, default=False)
    service_charge_gst_percent = Column(Numeric(5, 2), default=0)
    feedback_qr_enabled = Column(Boolean, default=True)
    print_logo_enabled = Column(Boolean, default=True)
    created_date = Column(TIMESTAMP(timezone=True), server_default=func.now())
    created_by = Column(Integer)
