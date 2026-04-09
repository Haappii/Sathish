from sqlalchemy import Boolean, Column, Integer, String, TIMESTAMP, ForeignKey
from sqlalchemy.sql import func
from app.db import Base


class MailScheduler(Base):
    __tablename__ = "mail_schedulers"

    id              = Column(Integer, primary_key=True, index=True)
    shop_id         = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    name            = Column(String(120), nullable=False)
    report_type     = Column(String(40), nullable=False)   # daily_sales | item_sales | gst_summary
    send_time       = Column(String(5), nullable=False)    # "HH:MM"
    recipient_email = Column(String(200), nullable=False)
    is_active       = Column(Boolean, nullable=False, default=True)
    created_by      = Column(Integer, nullable=True)
    created_at      = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
