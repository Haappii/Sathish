from sqlalchemy.orm import Session
from app.models.invoice import Invoice

def generate_invoice_number(db: Session):
    last = db.query(Invoice).order_by(Invoice.invoice_id.desc()).first()

    if not last or not last.invoice_number:
        return "INV-000001"

    try:
        last_no = int(last.invoice_number.split("-")[1])
    except Exception:
        last_no = 0

    new_no = last_no + 1
    return f"INV-{new_no:06d}"
