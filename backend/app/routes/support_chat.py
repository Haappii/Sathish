from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
import smtplib
from email.message import EmailMessage
from datetime import datetime
from mimetypes import guess_type

router = APIRouter(prefix="/support", tags=["Support Chat"])

# ========================================================
#  GMAIL SETTINGS
# ========================================================

# Receiver Gmail (Support Inbox)
SUPPORT_EMAIL = "sathishheternal@gmail.com"

# Sender Gmail (App Gmail account)
SENDER_EMAIL = "haappiigaming@gmail.com"
SENDER_PASSWORD = "rzgk fvap sopj fbsj"   # Gmail App Password


# ========================================================
#  API - RECEIVE CHAT MESSAGE + SEND MAIL
# ========================================================
@router.post("/message")
async def support_message(
    user_name: str = Form(...),
    shop_name: str = Form(...),
    branch_name: str = Form(...),
    branch_contact: str = Form(...),
    message: str = Form(...),
    file: UploadFile | None = File(None)
):

    try:
        email = EmailMessage()

        # ---------- SUBJECT ----------
        email["Subject"] = f"Support Request - {user_name} ({branch_name})"

        # ---------- SENDER & RECEIVER ----------
        email["From"] = SENDER_EMAIL
        email["To"] = SUPPORT_EMAIL

        # ---------- EMAIL BODY ----------
        content = f"""
Support Ticket Details

Shop   : {shop_name}
Branch : {branch_name}
User   : {user_name}
Branch Contact : {branch_contact}
Time   : {datetime.now().strftime("%d-%m-%Y %H:%M:%S")}

Message:
{message}
"""
        email.set_content(content)

        # ---------- ATTACH FILE (OPTIONAL) ----------
        if file:
            file_data = await file.read()

            mime_type, _ = guess_type(file.filename)
            maintype, subtype = (mime_type or "application/octet-stream").split("/")

            email.add_attachment(
                file_data,
                maintype=maintype,
                subtype=subtype,
                filename=file.filename,
            )

        # ---------- SEND USING GMAIL SMTP ----------
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
            smtp.login(SENDER_EMAIL, SENDER_PASSWORD)
            smtp.send_message(email)

        return JSONResponse({"status": "success", "message": "Support request sent"})

    except Exception as e:
        raise HTTPException(500, f"Mail send failed: {str(e)}")


# ========================================================
#  API - DEMO REQUEST (PUBLIC)
# ========================================================
@router.post("/demo")
async def demo_request(
    name: str = Form(...),
    email: str = Form(...),
    phone: str = Form(""),
    business: str = Form(""),
    message: str = Form("")
):
    try:
        email_msg = EmailMessage()

        email_msg["Subject"] = f"Demo Request - {name}"
        email_msg["From"] = SENDER_EMAIL
        email_msg["To"] = SUPPORT_EMAIL

        content = f"""
Demo Request

Name     : {name}
Email    : {email}
Phone    : {phone}
Business : {business}
Time     : {datetime.now().strftime("%d-%m-%Y %H:%M:%S")}

Message:
{message}
"""
        email_msg.set_content(content)

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
            smtp.login(SENDER_EMAIL, SENDER_PASSWORD)
            smtp.send_message(email_msg)

        return JSONResponse({"status": "success", "message": "Demo request sent"})
    except Exception as e:
        raise HTTPException(500, f"Mail send failed: {str(e)}")
