from sqlalchemy import Column, Integer, String, JSON, TIMESTAMP, ForeignKey, func
from app.db import Base


class BulkImportLog(Base):
    __tablename__ = "bulk_import_logs"

    log_id        = Column(Integer, primary_key=True, index=True)
    shop_id       = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    upload_type   = Column(String(30), nullable=False)          # categories / items / users / employees
    filename      = Column(String(255), nullable=True)
    uploaded_by   = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    uploaded_by_name = Column(String(120), nullable=True)
    total_rows    = Column(Integer, default=0)
    inserted      = Column(Integer, default=0)
    updated       = Column(Integer, default=0)
    error_count   = Column(Integer, default=0)
    errors_json   = Column(JSON, nullable=True)
    rows_json     = Column(JSON, nullable=True)
    created_at    = Column(TIMESTAMP(timezone=True), server_default=func.now())
