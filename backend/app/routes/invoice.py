from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from decimal import Decimal
from datetime import datetime

from app.db import get_db
from app.models.invoice import Invoice
from app.models.invoice_details import InvoiceDetail
from app.models.items import Item
from app.models.invoice_archive import InvoiceArchive
from app.models.shop_details import ShopDetails

from app.schemas.invoice import (
    InvoiceCreate,
    InvoiceUpdate,
    InvoiceResponse,
    InvoiceFullResponse,
    InvoiceItemDetail
)

from app.services.invoice_service import generate_invoice_number
from app.services.invoice_archive_service import archive_invoice
from app.services.inventory_service import (
    is_inventory_enabled,
    adjust_stock
)
from app.services.gst_service import calculate_gst
from app.services.day_close_service import is_branch_day_closed
from app.utils.auth_user import get_current_user

router = APIRouter(prefix="/invoice", tags=["Invoice"])


def resolve_branch(user, override_branch=None):
    if str(user.role_name).lower() == "admin":
        return int(override_branch or user.branch_id)
    return int(user.branch_id)

def get_business_datetime(db: Session, shop_id: int) -> datetime:
    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == shop_id).first()
    business_date = (
        shop.app_date if shop and shop.app_date else datetime.utcnow().date()
    )
    return datetime.combine(business_date, datetime.now().time())


# =====================================================
# CREATE INVOICE
# =====================================================
@router.post("/", response_model=InvoiceResponse)
def create_invoice(
    payload: InvoiceCreate,
    request: Request,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    branch_id = resolve_branch(user, request.headers.get("x-branch-id"))
    business_dt = get_business_datetime(db, user.shop_id)
    if is_branch_day_closed(db, user.shop_id, branch_id, business_dt):
        raise HTTPException(403, "Day closed for this branch")

    invoice = Invoice(
        invoice_number=generate_invoice_number(db),
        shop_id=user.shop_id,
        branch_id=branch_id,
        created_user=user.user_id,
        created_time=business_dt,
        customer_name=payload.customer_name,
        mobile=payload.mobile,
        gst_number=payload.customer_gst,
        payment_mode=payload.payment_mode or "cash",
        payment_split=payload.payment_split
    )

    db.add(invoice)
    db.commit()
    db.refresh(invoice)

    subtotal = Decimal("0.00")

    item_ids = [it.item_id for it in payload.items]
    item_map = {
        i.item_id: i
        for i in db.query(Item).filter(
            Item.item_id.in_(item_ids),
            Item.shop_id == user.shop_id
        ).all()
    }

    for it in payload.items:
        subtotal += Decimal(it.amount)
        item = item_map.get(it.item_id)

        db.add(InvoiceDetail(
            invoice_id=invoice.invoice_id,
            shop_id=user.shop_id,
            item_id=it.item_id,
            branch_id=branch_id,
            quantity=it.quantity,
            amount=it.amount,
            buy_price=(item.buy_price if item else 0),
            mrp_price=(item.mrp_price if item else 0)
        ))

        if is_inventory_enabled(db, user.shop_id):
            adjust_stock(
                db, user.shop_id, it.item_id, branch_id,
                it.quantity, "REMOVE",
                ref_no=invoice.invoice_number
            )

    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == user.shop_id).first()
    tax, total = calculate_gst(subtotal, shop)

    invoice.tax_amt = tax
    invoice.total_amount = total
    invoice.discounted_amt = payload.discounted_amt
    if payload.payment_mode is not None:
        invoice.payment_mode = payload.payment_mode
    if payload.payment_split is not None:
        invoice.payment_split = payload.payment_split

    db.commit()
    return invoice


# =====================================================
# LIST INVOICES
# =====================================================
@router.get("/list")
def list_invoices(
    request: Request,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    branch_id = resolve_branch(user, request.headers.get("x-branch-id"))
    return (
        db.query(Invoice)
        .filter(Invoice.branch_id == branch_id, Invoice.shop_id == user.shop_id)
        .order_by(Invoice.invoice_id.desc())
        .all()
    )


# =====================================================
# GET INVOICE BY NUMBER
# =====================================================
@router.get("/by-number/{invoice_number}", response_model=InvoiceFullResponse)
def get_invoice(
    invoice_number: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    invoice = db.query(Invoice).filter(
        Invoice.invoice_number == invoice_number,
        Invoice.shop_id == user.shop_id
    ).first()

    if not invoice:
        raise HTTPException(404, "Invoice not found")

    details = (
        db.query(
            InvoiceDetail.item_id,
            InvoiceDetail.quantity,
            InvoiceDetail.amount,
            InvoiceDetail.buy_price,
            InvoiceDetail.mrp_price,
            Item.item_name,
            Item.price
        )
        .join(Item, Item.item_id == InvoiceDetail.item_id)
        .filter(
            InvoiceDetail.invoice_id == invoice.invoice_id,
            InvoiceDetail.shop_id == user.shop_id
        )
        .all()
    )

    items = [
        InvoiceItemDetail(
            item_id=r.item_id,
            item_name=r.item_name,
            quantity=r.quantity,
            price=float(r.price),
            amount=float(r.amount)
        )
        for r in details
    ]

    return {
        "invoice_id": invoice.invoice_id,
        "invoice_number": invoice.invoice_number,
        "customer_name": invoice.customer_name,
        "mobile": invoice.mobile,
        "total_amount": float(invoice.total_amount or 0),
        "discounted_amt": float(invoice.discounted_amt or 0),
        "tax_amt": float(invoice.tax_amt or 0),
        "created_time": invoice.created_time.strftime("%Y-%m-%d %H:%M:%S"),
        "payment_mode": invoice.payment_mode,
        "payment_split": invoice.payment_split,
        "items": items
    }


# =====================================================
# MODIFY INVOICE
# =====================================================
@router.put("/{invoice_id}")
def modify_invoice(
    invoice_id: int,
    payload: InvoiceUpdate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    invoice = db.query(Invoice).filter(
        Invoice.invoice_id == invoice_id,
        Invoice.shop_id == user.shop_id
    ).first()

    if not invoice:
        raise HTTPException(404, "Invoice not found")
    if is_branch_day_closed(db, user.shop_id, invoice.branch_id, invoice.created_time):
        raise HTTPException(403, "Day closed for this branch")

    # 🔹 Archive old invoice
    archive_invoice(
        db,
        invoice,
        str(user.user_id),
        "Modified"
    )

    # 🔹 Restore old stock
    for d in invoice.details:
        if is_inventory_enabled(db, user.shop_id):
            adjust_stock(
                db, user.shop_id, d.item_id, invoice.branch_id,
                d.quantity, "ADD"
            )

    # 🔹 Remove old details
    db.query(InvoiceDetail).filter(
        InvoiceDetail.invoice_id == invoice_id,
        InvoiceDetail.shop_id == user.shop_id
    ).delete()

    subtotal = Decimal("0.00")

    item_ids = [it.item_id for it in payload.items]
    item_map = {
        i.item_id: i
        for i in db.query(Item).filter(
            Item.item_id.in_(item_ids),
            Item.shop_id == user.shop_id
        ).all()
    }

    for it in payload.items:
        subtotal += Decimal(it.amount)
        item = item_map.get(it.item_id)

        db.add(InvoiceDetail(
            invoice_id=invoice_id,
            shop_id=user.shop_id,
            item_id=it.item_id,
            branch_id=invoice.branch_id,
            quantity=it.quantity,
            amount=it.amount,
            buy_price=(item.buy_price if item else 0),
            mrp_price=(item.mrp_price if item else 0)
        ))

        if is_inventory_enabled(db, user.shop_id):
            adjust_stock(
                db, user.shop_id, it.item_id, invoice.branch_id,
                it.quantity, "REMOVE"
            )

    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == user.shop_id).first()
    tax, total = calculate_gst(subtotal, shop)

    invoice.customer_name = payload.customer_name
    invoice.mobile = payload.mobile
    invoice.tax_amt = tax
    invoice.total_amount = total
    invoice.discounted_amt = payload.discounted_amt
    if payload.payment_mode is not None:
        invoice.payment_mode = payload.payment_mode
    if payload.payment_split is not None:
        invoice.payment_split = payload.payment_split

    db.commit()
    return {"message": "Invoice modified successfully"}


# =====================================================
# DELETE INVOICE
# =====================================================
@router.delete("/{invoice_id}")
def delete_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    invoice = db.query(Invoice).filter(
        Invoice.invoice_id == invoice_id,
        Invoice.shop_id == user.shop_id
    ).first()

    if not invoice:
        raise HTTPException(404, "Invoice not found")
    if is_branch_day_closed(db, user.shop_id, invoice.branch_id, invoice.created_time):
        raise HTTPException(403, "Day closed for this branch")

    # 🔹 Archive invoice
    archive_invoice(
        db,
        invoice,
        str(user.user_id),
        "Deleted"
    )

    # 🔹 Restore stock
    for d in invoice.details:
        if is_inventory_enabled(db, user.shop_id):
            adjust_stock(
                db,
                user.shop_id,
                d.item_id,
                d.branch_id,
                d.quantity,
                "ADD",
                ref_no=f"DEL-{invoice.invoice_id}"
            )

    db.delete(invoice)
    db.commit()

    return {"message": "Invoice deleted"}

# =====================================================
# LIST ONLY DELETED INVOICES (❌ NO MODIFIED)
# =====================================================
@router.get("/archive/list")
def list_archived_invoices(
    request: Request,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    branch_id = resolve_branch(user, request.headers.get("x-branch-id"))

    return (
        db.query(InvoiceArchive)
        .filter(
            InvoiceArchive.branch_id == branch_id,
            InvoiceArchive.delete_reason == "Deleted",
            InvoiceArchive.shop_id == user.shop_id   # 🔴 THIS LINE IS THE FIX
        )
        .order_by(InvoiceArchive.deleted_time.desc())
        .all()
    )

# =====================================================
# LATEST CUSTOMER BY MOBILE  ✅ (AUTO-FILL SUPPORT)
# =====================================================
@router.get("/customer/by-mobile/{mobile}")
def get_latest_customer_by_mobile(
    mobile: str,
    request: Request,
    db: Session = Depends(get_db),
    user = Depends(get_current_user)
):
    branch_id = resolve_branch(user, request.headers.get("x-branch-id"))

    mobile_clean = "".join(ch for ch in str(mobile) if ch.isdigit())
    if len(mobile_clean) > 10:
        mobile_clean = mobile_clean[-10:]
    if len(mobile_clean) != 10:
        raise HTTPException(400, "Invalid mobile number")

    base_query = (
        db.query(Invoice)
        .filter(
            Invoice.mobile == mobile_clean,
            Invoice.shop_id == user.shop_id,
            or_(Invoice.branch_id == branch_id, Invoice.branch_id.is_(None))
        )
    )

    latest_invoice = (
        base_query
        .order_by(Invoice.created_time.desc())
        .first()
    )

    if not latest_invoice:
        raise HTTPException(404, "Customer not found")

    latest_with_name = (
        base_query
        .filter(and_(Invoice.customer_name.isnot(None), Invoice.customer_name != ""))
        .order_by(Invoice.created_time.desc())
        .first()
    )

    latest_with_gst = (
        base_query
        .filter(and_(Invoice.gst_number.isnot(None), Invoice.gst_number != ""))
        .order_by(Invoice.created_time.desc())
        .first()
    )

    return {
        "customer_name": (latest_with_name or latest_invoice).customer_name,
        "mobile": latest_invoice.mobile,
        "gst_number": (latest_with_gst or latest_invoice).gst_number
    }
# =====================================================
# RESTORE ARCHIVED INVOICE (ONLY DELETED)
# =====================================================
@router.post("/archive/restore/{archive_id}")
def restore_archived_invoice(
    archive_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    archive = db.query(InvoiceArchive).filter(
        InvoiceArchive.archive_id == archive_id,
        InvoiceArchive.delete_reason == "Deleted",
        InvoiceArchive.shop_id == user.shop_id
    ).first()

    if not archive:
        raise HTTPException(
            404,
            "Deleted invoice not found or cannot be restored"
        )

    if str(user.role_name).lower() not in ["admin", "manager"]:
        raise HTTPException(403, "Not allowed")

    # 🔹 Recreate invoice
    invoice = Invoice(
        invoice_number=archive.invoice_number,
        shop_id=archive.shop_id,
        branch_id=archive.branch_id,
        customer_name=archive.customer_name,
        mobile=archive.mobile,
        created_user=user.user_id,
        created_time=archive.created_time,
        total_amount=archive.total_amount,
        tax_amt=archive.tax_amt,
        discounted_amt=archive.discounted_amt
    )

    db.add(invoice)
    db.flush()

    # 🔹 Restore details & adjust stock
    for d in archive.details:
        db.add(InvoiceDetail(
            invoice_id=invoice.invoice_id,
            shop_id=archive.shop_id,
            item_id=d.item_id,
            branch_id=d.branch_id,
            quantity=d.quantity,
            amount=d.amount,
            buy_price=d.buy_price,
            mrp_price=d.mrp_price
        ))

        if is_inventory_enabled(db, user.shop_id):
            adjust_stock(
                db,
                user.shop_id,
                d.item_id,
                d.branch_id,
                d.quantity,
                "REMOVE",
                ref_no=f"RESTORE-{archive.invoice_number}"
            )

    db.delete(archive)
    db.commit()

    return {"message": "Deleted invoice restored successfully"}
