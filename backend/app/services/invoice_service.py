from sqlalchemy.orm import Session
from app.models.invoice import Invoice

_BASE36_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def _to_base36(n: int) -> str:
    try:
        n = int(n)
    except Exception:
        n = 0

    if n <= 0:
        return "0"

    out = []
    while n > 0:
        n, r = divmod(n, 36)
        out.append(_BASE36_ALPHABET[r])
    return "".join(reversed(out))


def _branch_code(branch_id: int) -> str:
    # 4 chars, base36, padded with zeros.
    code = _to_base36(branch_id).upper()
    return code.zfill(4)[-4:]


def generate_invoice_number(db: Session, *, shop_id: int, branch_id: int) -> str:
    """
    Branch-based invoice number:
      INV-{BRCD}{SEQ}
    - BRCD: 4 chars derived from branch_id (base36)
    - SEQ : per-branch sequence, 5 digits (00001...)
    """
    brcd = _branch_code(branch_id)
    prefix = f"INV-{brcd}"

    last = (
        db.query(Invoice.invoice_number)
        .filter(
            Invoice.shop_id == shop_id,
            Invoice.branch_id == branch_id,
            Invoice.invoice_number.like(f"{prefix}%"),
        )
        .order_by(Invoice.invoice_id.desc())
        .first()
    )

    next_no = 1
    if last and last[0]:
        try:
            suffix = str(last[0])[len(prefix):]
            if suffix.isdigit():
                next_no = int(suffix) + 1
        except Exception:
            next_no = 1

    return f"{prefix}{next_no:05d}"
