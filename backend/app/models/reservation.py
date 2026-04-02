from sqlalchemy import Column, Integer, String, DateTime, Date, Text, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db import Base


class TableReservation(Base):
    __tablename__ = "table_reservations"

    reservation_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False, index=True)
    branch_id = Column(Integer, nullable=False, index=True)
    table_id = Column(Integer, ForeignKey("tables_master.table_id"), nullable=True, index=True)

    customer_name = Column(String(120), nullable=False)
    mobile = Column(String(20), nullable=False, index=True)
    email = Column(String(120), nullable=True)

    reservation_date = Column(Date, nullable=False, index=True)
    reservation_time = Column(String(10), nullable=False)  # HH:MM 24-hr format
    guests = Column(Integer, default=1)
    notes = Column(Text, nullable=True)

    # PENDING / CONFIRMED / SEATED / CANCELLED / NO_SHOW
    status = Column(String(20), default="PENDING", nullable=False, index=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    confirmed_at = Column(DateTime, nullable=True)
    seated_at = Column(DateTime, nullable=True)
    cancelled_at = Column(DateTime, nullable=True)
    cancel_reason = Column(String(200), nullable=True)

    table = relationship("TableMaster")
