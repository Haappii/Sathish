import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.mail_scheduler import MailScheduler
from app.utils.auth_user import get_current_user

router = APIRouter(prefix="/mail-scheduler", tags=["Mail Scheduler"])

VALID_REPORT_TYPES = {"daily_sales", "item_sales", "gst_summary"}


# ── Schemas ──────────────────────────────────────────────────────────────────

class SchedulerCreate(BaseModel):
    name: str
    report_type: str
    send_time: str       # "HH:MM"
    recipient_email: str


class SchedulerUpdate(BaseModel):
    name: Optional[str] = None
    report_type: Optional[str] = None
    send_time: Optional[str] = None
    recipient_email: Optional[str] = None
    is_active: Optional[bool] = None


# ── Validators ───────────────────────────────────────────────────────────────

def _validate_time(t: str):
    if not re.match(r"^\d{2}:\d{2}$", t):
        raise HTTPException(400, "send_time must be HH:MM")
    h, m = int(t[:2]), int(t[3:])
    if not (0 <= h <= 23 and 0 <= m <= 59):
        raise HTTPException(400, "Invalid time value")


def _validate_report(rt: str):
    if rt not in VALID_REPORT_TYPES:
        raise HTTPException(400, f"report_type must be one of: {', '.join(sorted(VALID_REPORT_TYPES))}")


# ── CRUD ─────────────────────────────────────────────────────────────────────

@router.get("/")
def list_schedulers(db: Session = Depends(get_db), user=Depends(get_current_user)):
    rows = (
        db.query(MailScheduler)
        .filter(MailScheduler.shop_id == user.shop_id)
        .order_by(MailScheduler.created_at.desc())
        .all()
    )
    return [
        {
            "id": r.id,
            "name": r.name,
            "report_type": r.report_type,
            "send_time": r.send_time,
            "recipient_email": r.recipient_email,
            "is_active": r.is_active,
            "created_at": str(r.created_at),
        }
        for r in rows
    ]


@router.post("/", status_code=201)
def create_scheduler(
    body: SchedulerCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    _validate_report(body.report_type)
    _validate_time(body.send_time)
    row = MailScheduler(
        shop_id=user.shop_id,
        name=body.name.strip(),
        report_type=body.report_type,
        send_time=body.send_time,
        recipient_email=body.recipient_email.strip(),
        is_active=True,
        created_by=user.user_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "name": row.name, "report_type": row.report_type,
            "send_time": row.send_time, "recipient_email": row.recipient_email,
            "is_active": row.is_active, "created_at": str(row.created_at)}


@router.put("/{scheduler_id}")
def update_scheduler(
    scheduler_id: int,
    body: SchedulerUpdate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    row = db.query(MailScheduler).filter(
        MailScheduler.id == scheduler_id,
        MailScheduler.shop_id == user.shop_id,
    ).first()
    if not row:
        raise HTTPException(404, "Scheduler not found")
    if body.report_type is not None:
        _validate_report(body.report_type)
        row.report_type = body.report_type
    if body.send_time is not None:
        _validate_time(body.send_time)
        row.send_time = body.send_time
    if body.name is not None:
        row.name = body.name.strip()
    if body.recipient_email is not None:
        row.recipient_email = body.recipient_email.strip()
    if body.is_active is not None:
        row.is_active = body.is_active
    db.commit()
    db.refresh(row)
    return {"id": row.id, "name": row.name, "report_type": row.report_type,
            "send_time": row.send_time, "recipient_email": row.recipient_email,
            "is_active": row.is_active, "created_at": str(row.created_at)}


@router.delete("/{scheduler_id}", status_code=204)
def delete_scheduler(
    scheduler_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    row = db.query(MailScheduler).filter(
        MailScheduler.id == scheduler_id,
        MailScheduler.shop_id == user.shop_id,
    ).first()
    if not row:
        raise HTTPException(404, "Scheduler not found")
    db.delete(row)
    db.commit()
    return None
