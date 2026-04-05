from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import cast, Date
from typing import Optional
from datetime import date as date_type

from app.db import get_db
from app.models.bulk_import_log import BulkImportLog
from app.utils.auth_user import get_current_user

router = APIRouter(prefix="/bulk-import-logs", tags=["Bulk Import Logs"])


@router.get("/")
def list_bulk_import_logs(
    upload_type: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    limit: int = Query(500, ge=1, le=2000),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    q = db.query(BulkImportLog).filter(BulkImportLog.shop_id == user.shop_id)
    if upload_type:
        q = q.filter(BulkImportLog.upload_type == upload_type)
    if from_date:
        try:
            q = q.filter(cast(BulkImportLog.created_at, Date) >= date_type.fromisoformat(from_date))
        except ValueError:
            pass
    if to_date:
        try:
            q = q.filter(cast(BulkImportLog.created_at, Date) <= date_type.fromisoformat(to_date))
        except ValueError:
            pass
    logs = q.order_by(BulkImportLog.created_at.desc()).limit(limit).all()
    return [
        {
            "log_id":           l.log_id,
            "upload_type":      l.upload_type,
            "filename":         l.filename,
            "uploaded_by_name": l.uploaded_by_name,
            "total_rows":       l.total_rows,
            "inserted":         l.inserted,
            "updated":          l.updated,
            "error_count":      l.error_count,
            "errors_json":      l.errors_json,
            "rows_json":        l.rows_json,
            "created_at":       l.created_at.isoformat() if l.created_at else None,
        }
        for l in logs
    ]
