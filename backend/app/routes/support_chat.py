from datetime import datetime
from email.message import EmailMessage
from mimetypes import guess_type
from pathlib import Path
import os
import smtplib
import uuid

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.support_ticket import SupportTicket

router = APIRouter(prefix="/support", tags=["Support Chat"])

# ========================================================
#  SETTINGS (via env)
# ========================================================

SUPPORT_EMAIL_ENABLED = (os.getenv("SUPPORT_EMAIL_ENABLED") or "").strip().lower() in {
    "1",
    "true",
    "yes",
    "y",
}

SUPPORT_EMAIL = (os.getenv("SUPPORT_EMAIL") or "").strip()
SENDER_EMAIL = (os.getenv("SUPPORT_SENDER_EMAIL") or "").strip()
SENDER_PASSWORD = (os.getenv("SUPPORT_SENDER_PASSWORD") or "").strip()

SMTP_HOST = (os.getenv("SUPPORT_SMTP_HOST") or "smtp.gmail.com").strip()
SMTP_PORT = int((os.getenv("SUPPORT_SMTP_PORT") or "465").strip())

SUPPORT_UPLOADS_DIR = Path("uploads") / "support"
SUPPORT_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


def _can_send_mail() -> bool:
    return bool(
        SUPPORT_EMAIL_ENABLED
        and SUPPORT_EMAIL
        and SENDER_EMAIL
        and SENDER_PASSWORD
        and SMTP_HOST
        and SMTP_PORT
    )


def _safe_name(filename: str | None) -> str:
    return Path(filename or "attachment").name


async def _save_attachment(file: UploadFile | None) -> tuple[str | None, str | None, bytes | None]:
    if not file:
        return None, None, None

    safe = _safe_name(file.filename)
    stamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    out_name = f"{stamp}_{uuid.uuid4().hex}_{safe}"
    out_path = SUPPORT_UPLOADS_DIR / out_name

    data = await file.read()
    with open(out_path, "wb") as f:
        f.write(data)

    return safe, str(out_path), data


def _send_mail(subject: str, content: str, file: UploadFile | None = None, file_data: bytes | None = None) -> None:
    email = EmailMessage()
    email["Subject"] = subject
    email["From"] = SENDER_EMAIL
    email["To"] = SUPPORT_EMAIL
    email.set_content(content)

    if file and file_data is not None:
        mime_type, _ = guess_type(file.filename or "")
        maintype, subtype = (mime_type or "application/octet-stream").split("/")
        email.add_attachment(
            file_data,
            maintype=maintype,
            subtype=subtype,
            filename=_safe_name(file.filename),
        )

    with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT) as smtp:
        smtp.login(SENDER_EMAIL, SENDER_PASSWORD)
        smtp.send_message(email)


# ========================================================
#  API - RECEIVE SUPPORT MESSAGE (PUBLIC)
# ========================================================
@router.post("/message")
async def support_message(
    user_name: str = Form(...),
    shop_name: str = Form(...),
    branch_name: str = Form(...),
    branch_contact: str = Form(...),
    message: str = Form(...),
    file: UploadFile | None = File(None),
    db: Session = Depends(get_db),
):
    try:
        attachment_name, attachment_path, file_data = await _save_attachment(file)

        ticket = SupportTicket(
            ticket_type="SUPPORT",
            user_name=user_name,
            shop_name=shop_name,
            branch_name=branch_name,
            branch_contact=branch_contact,
            message=message,
            attachment_filename=attachment_name,
            attachment_path=attachment_path,
            status="OPEN",
        )
        db.add(ticket)
        db.commit()
        db.refresh(ticket)

        content = f"""
Support Ticket Details

Ticket : {ticket.ticket_id}
Shop   : {shop_name}
Branch : {branch_name}
User   : {user_name}
Branch Contact : {branch_contact}
Time   : {datetime.now().strftime("%d-%m-%Y %H:%M:%S")}

Message:
{message}
""".strip()

        email_sent = False
        if _can_send_mail():
            _send_mail(
                subject=f"Support Request - {user_name} ({branch_name})",
                content=content,
                file=file,
                file_data=file_data,
            )
            email_sent = True

        return JSONResponse(
            {
                "status": "success",
                "message": "Support request received",
                "ticket_id": ticket.ticket_id,
                "email_sent": email_sent,
            }
        )

    except Exception as e:
        raise HTTPException(500, f"Support request failed: {str(e)}")


# ========================================================
#  API - DEMO REQUEST (PUBLIC)
# ========================================================
@router.post("/demo")
async def demo_request(
    name: str = Form(...),
    email: str = Form(...),
    phone: str = Form(""),
    business: str = Form(""),
    message: str = Form(""),
    db: Session = Depends(get_db),
):
    try:
        ticket = SupportTicket(
            ticket_type="DEMO",
            user_name=name,
            email=email,
            phone=phone,
            business=business,
            message=message,
            status="OPEN",
        )
        db.add(ticket)
        db.commit()
        db.refresh(ticket)

        content = f"""
Demo Request

Ticket   : {ticket.ticket_id}
Name     : {name}
Email    : {email}
Phone    : {phone}
Business : {business}
Time     : {datetime.now().strftime("%d-%m-%Y %H:%M:%S")}

Message:
{message}
""".strip()

        email_sent = False
        if _can_send_mail():
            _send_mail(
                subject=f"Demo Request - {name}",
                content=content,
            )
            email_sent = True

        return JSONResponse(
            {
                "status": "success",
                "message": "Demo request received",
                "ticket_id": ticket.ticket_id,
                "email_sent": email_sent,
            }
        )
    except Exception as e:
        raise HTTPException(500, f"Demo request failed: {str(e)}")
