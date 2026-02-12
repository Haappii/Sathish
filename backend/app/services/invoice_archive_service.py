from sqlalchemy.orm import Session
from datetime import datetime

from app.models.invoice_archive import (
    InvoiceArchive,
    InvoiceArchiveDetail
)
from app.models.invoice import Invoice


def archive_invoice(
    db: Session,
    invoice: Invoice,
    deleted_by: str,
    reason: str
):
    archive = InvoiceArchive(
        shop_id=invoice.shop_id,
        invoice_id=invoice.invoice_id,
        invoice_number=invoice.invoice_number,
        branch_id=invoice.branch_id,
        total_amount=invoice.total_amount,
        tax_amt=invoice.tax_amt,
        discounted_amt=invoice.discounted_amt,
        customer_name=invoice.customer_name,
        mobile=invoice.mobile,
        created_time=invoice.created_time,
        deleted_time=datetime.utcnow(),
        deleted_by=deleted_by,
        delete_reason=reason
    )

    db.add(archive)
    db.flush()  # get archive_id

    for d in invoice.details:
        db.add(InvoiceArchiveDetail(
            shop_id=invoice.shop_id,
            archive_id=archive.archive_id,
            item_id=d.item_id,
            branch_id=d.branch_id,
            quantity=d.quantity,
            amount=d.amount,
            buy_price=d.buy_price,
            mrp_price=d.mrp_price
        ))
