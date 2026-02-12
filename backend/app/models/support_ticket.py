from sqlalchemy import Column, Integer, String, Text, TIMESTAMP, func

from app.db import Base


class SupportTicket(Base):
    __tablename__ = "support_tickets"

    ticket_id = Column(Integer, primary_key=True, index=True)
    ticket_type = Column(String(20), nullable=False, default="SUPPORT")  # SUPPORT / DEMO

    user_name = Column(String(120), nullable=True)
    shop_name = Column(String(200), nullable=True)
    branch_name = Column(String(200), nullable=True)
    branch_contact = Column(String(100), nullable=True)

    email = Column(String(200), nullable=True)
    phone = Column(String(50), nullable=True)
    business = Column(String(200), nullable=True)

    message = Column(Text, nullable=False)

    attachment_filename = Column(String(255), nullable=True)
    attachment_path = Column(String(500), nullable=True)

    status = Column(String(30), nullable=False, default="OPEN")
    created_on = Column(TIMESTAMP(timezone=True), server_default=func.now())
