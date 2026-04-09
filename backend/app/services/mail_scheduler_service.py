"""
mail_scheduler_service.py

Background daemon thread that checks active mail schedulers every minute.
When the current HH:MM matches a scheduler's send_time, it generates a CSV
report and sends it to the configured recipient email.

Uses the same SMTP credentials as support_chat.py (SUPPORT_SENDER_EMAIL etc.)
"""
import csv
import io
import logging
import os
import smtplib
import threading
import time
from datetime import datetime, timedelta
from email.message import EmailMessage

from app.db import SessionLocal
from app.models.mail_scheduler import MailScheduler

logger = logging.getLogger(__name__)

# Reuse existing email env vars
SENDER_EMAIL    = (os.getenv("SUPPORT_SENDER_EMAIL") or "").strip()
SENDER_PASSWORD = (os.getenv("SUPPORT_SENDER_PASSWORD") or "").strip()
SMTP_HOST       = (os.getenv("SUPPORT_SMTP_HOST") or "smtp.gmail.com").strip()
SMTP_PORT       = int((os.getenv("SUPPORT_SMTP_PORT") or "465").strip())

# Per-process guard: scheduler_id -> "YYYY-MM-DD HH:MM" of last send
_last_sent: dict[int, str] = {}

REPORT_LABELS = {
    "daily_sales": "Daily Sales Summary",
    "item_sales":  "Item-Wise Sales",
    "gst_summary": "GST Summary",
}


# ─── Report generators ────────────────────────────────────────────────────────
# All generators accept (db, shop_id) and return bytes (UTF-8 CSV).
# They report on YESTERDAY so the data is complete.

def _yesterday():
    return (datetime.now() - timedelta(days=1)).date()


def _generate_daily_sales_csv(db, shop_id: int) -> bytes:
    from sqlalchemy import func
    from app.models.invoice import Invoice
    from app.models.branch import Branch

    d = _yesterday()
    d_start = datetime.combine(d, datetime.min.time())
    d_end   = datetime.combine(d, datetime.max.time())

    rows = (
        db.query(
            Branch.branch_name.label("branch"),
            func.count(func.distinct(Invoice.invoice_id)).label("bills"),
            func.coalesce(func.sum(Invoice.total_amount), 0).label("gross"),
            func.coalesce(func.sum(Invoice.discounted_amt), 0).label("discount"),
            func.coalesce(func.sum(Invoice.tax_amt), 0).label("tax"),
            func.coalesce(
                func.sum(Invoice.total_amount - func.coalesce(Invoice.discounted_amt, 0)), 0
            ).label("net"),
        )
        .outerjoin(Branch, Branch.branch_id == Invoice.branch_id)
        .filter(
            Invoice.shop_id == shop_id,
            Invoice.created_time >= d_start,
            Invoice.created_time <= d_end,
        )
        .group_by(Branch.branch_name)
        .all()
    )

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Date", "Branch", "Bills", "Gross Amount", "Discount", "Tax", "Net Amount"])
    for r in rows:
        w.writerow([str(d), r.branch or "—", r.bills,
                    round(float(r.gross), 2), round(float(r.discount), 2),
                    round(float(r.tax), 2), round(float(r.net), 2)])
    return buf.getvalue().encode("utf-8")


def _generate_item_sales_csv(db, shop_id: int) -> bytes:
    from sqlalchemy import func
    from app.models.invoice import Invoice
    from app.models.invoice_details import InvoiceDetail
    from app.models.items import Item
    from app.models.branch import Branch

    d = _yesterday()
    d_start = datetime.combine(d, datetime.min.time())
    d_end   = datetime.combine(d, datetime.max.time())

    rows = (
        db.query(
            Item.item_name.label("item"),
            Branch.branch_name.label("branch"),
            func.sum(InvoiceDetail.quantity).label("qty"),
            func.coalesce(func.sum(InvoiceDetail.amount), 0).label("amount"),
        )
        .join(InvoiceDetail, InvoiceDetail.item_id == Item.item_id)
        .join(Invoice, Invoice.invoice_id == InvoiceDetail.invoice_id)
        .outerjoin(Branch, Branch.branch_id == Invoice.branch_id)
        .filter(
            Invoice.shop_id == shop_id,
            Invoice.created_time >= d_start,
            Invoice.created_time <= d_end,
        )
        .group_by(Item.item_name, Branch.branch_name)
        .order_by(func.sum(InvoiceDetail.amount).desc())
        .all()
    )

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Date", "Item", "Branch", "Quantity", "Amount"])
    for r in rows:
        w.writerow([str(d), r.item, r.branch or "—",
                    int(r.qty or 0), round(float(r.amount or 0), 2)])
    return buf.getvalue().encode("utf-8")


def _generate_gst_csv(db, shop_id: int) -> bytes:
    from sqlalchemy import func
    from app.models.invoice import Invoice

    d = _yesterday()
    d_start = datetime.combine(d, datetime.min.time())
    d_end   = datetime.combine(d, datetime.max.time())

    row = (
        db.query(
            func.count(func.distinct(Invoice.invoice_id)).label("invoices"),
            func.coalesce(func.sum(Invoice.total_amount), 0).label("gross"),
            func.coalesce(func.sum(Invoice.tax_amt), 0).label("tax"),
            func.coalesce(func.sum(Invoice.discounted_amt), 0).label("discount"),
            func.coalesce(
                func.sum(Invoice.total_amount - func.coalesce(Invoice.discounted_amt, 0)), 0
            ).label("net"),
        )
        .filter(
            Invoice.shop_id == shop_id,
            Invoice.created_time >= d_start,
            Invoice.created_time <= d_end,
        )
        .first()
    )

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Date", "Total Invoices", "Gross Amount", "Total Tax (GST)", "Discount", "Net Payable"])
    if row:
        w.writerow([str(d), row.invoices,
                    round(float(row.gross), 2), round(float(row.tax), 2),
                    round(float(row.discount), 2), round(float(row.net), 2)])
    return buf.getvalue().encode("utf-8")


GENERATORS = {
    "daily_sales": _generate_daily_sales_csv,
    "item_sales":  _generate_item_sales_csv,
    "gst_summary": _generate_gst_csv,
}


# ─── Email sender ─────────────────────────────────────────────────────────────

def _send_report_email(recipient: str, subject: str, csv_bytes: bytes, filename: str):
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"]    = SENDER_EMAIL
    msg["To"]      = recipient
    msg.set_content(
        f"Hi,\n\nPlease find the attached report: {subject}\n\n"
        f"This is an automated report from Haappii Billing.\n"
    )
    msg.add_attachment(csv_bytes, maintype="text", subtype="csv", filename=filename)
    with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT) as smtp:
        smtp.login(SENDER_EMAIL, SENDER_PASSWORD)
        smtp.send_message(msg)


# ─── Tick ─────────────────────────────────────────────────────────────────────

def _run_due_schedulers():
    now_hhmm  = datetime.now().strftime("%H:%M")
    today_str = datetime.now().strftime("%Y-%m-%d")

    if not (SENDER_EMAIL and SENDER_PASSWORD):
        return  # email not configured, skip silently

    db = SessionLocal()
    try:
        due = db.query(MailScheduler).filter(
            MailScheduler.is_active == True,
            MailScheduler.send_time == now_hhmm,
        ).all()

        for sched in due:
            guard = f"{sched.id}:{today_str}:{now_hhmm}"
            if _last_sent.get(sched.id) == guard:
                continue  # already sent this minute

            gen = GENERATORS.get(sched.report_type)
            if not gen:
                logger.warning("Unknown report_type '%s' for scheduler %d", sched.report_type, sched.id)
                continue

            try:
                csv_bytes = gen(db, sched.shop_id)
                label     = REPORT_LABELS.get(sched.report_type, sched.report_type)
                date_str  = str(_yesterday())
                subject   = f"{sched.name} — {label} ({date_str})"
                filename  = f"{sched.report_type}_{date_str}.csv"
                _send_report_email(sched.recipient_email, subject, csv_bytes, filename)
                _last_sent[sched.id] = guard
                logger.info("Mail scheduler %d sent report to %s", sched.id, sched.recipient_email)
            except Exception:
                logger.exception("Mail scheduler %d failed to send", sched.id)
    finally:
        db.close()


# ─── Background thread ────────────────────────────────────────────────────────

def _scheduler_loop():
    while True:
        try:
            _run_due_schedulers()
        except Exception:
            logger.exception("Mail scheduler loop error")
        time.sleep(60)


def start_mail_scheduler():
    """Start the background daemon thread. Call once from app startup."""
    t = threading.Thread(target=_scheduler_loop, daemon=True, name="mail-report-scheduler")
    t.start()
    logger.info("Mail report scheduler thread started")
