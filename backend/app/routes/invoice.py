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
    adjust_stock,
    get_stock,
)
from app.services.gst_service import calculate_gst
from app.services.day_close_service import is_branch_day_closed
from app.services.audit_service import log_action
from app.services.credit_service import upsert_customer, ensure_invoice_due
from app.models.invoice_due import InvoiceDue
from app.utils.permissions import require_permission
from app.services.gift_card_service import get_card_by_code, redeem_card, as_money, is_expired
from app.services.item_lot_service import consume_lots_fifo
from app.models.system_parameters import SystemParameter
from app.services.wallet_service import (
    is_placeholder_mobile,
    get_customer_by_mobile,
    debit_wallet,
    get_wallet_balance,
    as_money as wallet_money,
)

router = APIRouter(prefix="/invoice", tags=["Invoice"])


def resolve_branch(user, override_branch=None):
    role = str(getattr(user, "role_name", "") or "").strip().lower()

    if role == "admin":
        branch_raw = override_branch if override_branch not in (None, "") else getattr(user, "branch_id", None)
    else:
        branch_raw = getattr(user, "branch_id", None)

    try:
        return int(branch_raw)
    except (TypeError, ValueError):
        raise HTTPException(400, "Branch required")

def get_business_datetime(db: Session, shop_id: int) -> datetime:
    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == shop_id).first()
    business_date = (
        shop.app_date if shop and shop.app_date else datetime.utcnow().date()
    )
    return datetime.combine(business_date, datetime.now().time())


def _extract_gift_card_payment(payload: InvoiceCreate) -> tuple[str | None, float]:
    mode = (payload.payment_mode or "").strip().lower()
    split = payload.payment_split or {}

    code = split.get("gift_card_code") or split.get("giftcard_code") or split.get("gift_code")
    amount = (
        split.get("gift_card_amount")
        if split.get("gift_card_amount") is not None
        else split.get("giftcard_amount")
        if split.get("giftcard_amount") is not None
        else split.get("gift_card")
        if split.get("gift_card") is not None
        else split.get("giftcard")
        if split.get("giftcard") is not None
        else 0
    )
    try:
        amt = as_money(amount)
    except Exception:
        amt = 0.0

    # Only honor gift card fields when payment_mode is gift_card or split
    if mode not in {"gift_card", "split"}:
        return None, 0.0

    return (str(code or "").strip().upper().replace(" ", "") or None), float(amt)


def _extract_wallet_payment(payload: InvoiceCreate) -> tuple[str | None, float]:
    mode = (payload.payment_mode or "").strip().lower()
    split = payload.payment_split or {}

    mobile = split.get("wallet_mobile") or split.get("walletMobile") or payload.mobile
    amount = (
        split.get("wallet_amount")
        if split.get("wallet_amount") is not None
        else split.get("wallet")
        if split.get("wallet") is not None
        else 0
    )
    try:
        amt = wallet_money(amount)
    except Exception:
        amt = 0.0

    if mode not in {"wallet", "split"}:
        return None, 0.0

    return (str(mobile or "").strip() or None), float(amt)


# =====================================================
# CREATE INVOICE
# =====================================================
@router.post("/", response_model=InvoiceResponse)
def create_invoice(
    payload: InvoiceCreate,
    request: Request,
    db: Session = Depends(get_db),
    user=Depends(require_permission("billing", "write")),
):
    branch_id = resolve_branch(user, request.headers.get("x-branch-id"))
    business_dt = get_business_datetime(db, user.shop_id)
    if is_branch_day_closed(db, user.shop_id, branch_id, business_dt):
        raise HTTPException(403, "Day closed for this branch")

    if not payload.items:
        raise HTTPException(400, "No items")

    # Pre-calc totals early to validate gift card usage before creating rows.
    subtotal = Decimal("0.00")
    for it in payload.items:
        subtotal += Decimal(it.amount)

    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == user.shop_id).first()
    tax, total = calculate_gst(subtotal, shop)
    payable = total - Decimal(str(payload.discounted_amt or 0))
    if payable < 0:
        payable = Decimal("0.00")

    gift_code, gift_amt = _extract_gift_card_payment(payload)
    wallet_mobile, wallet_amt = _extract_wallet_payment(payload)
    pay_mode = (payload.payment_mode or "cash").strip().lower()

    if pay_mode == "gift_card" and gift_amt <= 0:
        raise HTTPException(400, "Gift card amount required")
    if gift_amt > 0 and not gift_code:
        raise HTTPException(400, "Gift card code required")

    if pay_mode == "gift_card" and Decimal(str(gift_amt)) != payable:
        raise HTTPException(400, "Gift card amount must equal payable total")
    if gift_amt > 0 and Decimal(str(gift_amt)) > payable:
        raise HTTPException(400, "Gift card amount cannot exceed payable total")

    if pay_mode == "wallet" and wallet_amt <= 0:
        raise HTTPException(400, "Wallet amount required")
    if wallet_amt > 0 and not wallet_mobile:
        raise HTTPException(400, "Wallet mobile required")
    if pay_mode == "wallet" and Decimal(str(wallet_amt)) != payable:
        raise HTTPException(400, "Wallet amount must equal payable total")
    if wallet_amt > 0 and Decimal(str(wallet_amt)) > payable:
        raise HTTPException(400, "Wallet amount cannot exceed payable total")

    gift_card_row = None
    if gift_amt > 0:
        gift_card_row = get_card_by_code(db, shop_id=user.shop_id, code=gift_code)
        if not gift_card_row:
            raise HTTPException(404, "Gift card not found")
        if str(gift_card_row.status or "").upper() != "ACTIVE":
            raise HTTPException(400, f"Gift card is not active ({gift_card_row.status})")
        if is_expired(gift_card_row.expires_on):
            raise HTTPException(400, "Gift card expired")
        if as_money(gift_card_row.balance_amount) < as_money(gift_amt):
            raise HTTPException(400, "Insufficient gift card balance")

    wallet_customer = None
    if wallet_amt > 0:
        if is_placeholder_mobile(wallet_mobile):
            raise HTTPException(400, "Valid customer mobile required for wallet payment")
        wallet_customer = get_customer_by_mobile(db, shop_id=user.shop_id, mobile=wallet_mobile)
        if not wallet_customer:
            raise HTTPException(400, "Customer not found for wallet payment")
        bal = get_wallet_balance(db, shop_id=user.shop_id, customer_id=wallet_customer.customer_id)
        if wallet_money(bal) < wallet_money(wallet_amt):
            raise HTTPException(400, "Insufficient wallet balance")

    invoice = Invoice(
        invoice_number=generate_invoice_number(db, shop_id=user.shop_id, branch_id=branch_id),
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

    invoice.tax_amt = tax
    invoice.total_amount = total
    invoice.discounted_amt = payload.discounted_amt

    db.add(invoice)
    db.commit()
    db.refresh(invoice)

    item_ids = [it.item_id for it in payload.items]
    item_map = {
        i.item_id: i
        for i in db.query(Item).filter(
            Item.item_id.in_(item_ids),
            Item.shop_id == user.shop_id
        ).all()
    }

    inv_enabled = is_inventory_enabled(db, user.shop_id)
    cost_method_row = (
        db.query(SystemParameter)
        .filter(
            SystemParameter.shop_id == user.shop_id,
            SystemParameter.param_key == "inventory_cost_method",
        )
        .first()
    )
    cost_method = str(getattr(cost_method_row, "param_value", "") or "LAST").strip().upper()
    if cost_method not in {"LAST", "WAVG", "FIFO"}:
        cost_method = "LAST"

    if inv_enabled:
        for it in payload.items:
            available = get_stock(db, user.shop_id, it.item_id, branch_id)
            if available < int(it.quantity or 0):
                raise HTTPException(400, f"Insufficient stock for item {it.item_id} (available {available})")

    for it in payload.items:
        item = item_map.get(it.item_id)
        buy_price = (item.buy_price if item else 0)

        if inv_enabled and cost_method == "FIFO":
            try:
                buy_price = float(
                    consume_lots_fifo(
                        db,
                        shop_id=user.shop_id,
                        branch_id=branch_id,
                        item_id=int(it.item_id),
                        quantity=int(it.quantity or 0),
                        fallback_unit_cost=(item.buy_price if item else 0),
                        source_ref=invoice.invoice_number,
                    )
                )
            except Exception:
                # don't block sales if lot consumption fails
                buy_price = (item.buy_price if item else 0)

        db.add(InvoiceDetail(
            invoice_id=invoice.invoice_id,
            shop_id=user.shop_id,
            item_id=it.item_id,
            branch_id=branch_id,
            quantity=it.quantity,
            amount=it.amount,
            buy_price=buy_price,
            mrp_price=(item.mrp_price if item else 0)
        ))

        if inv_enabled:
            ok = adjust_stock(
                db, user.shop_id, it.item_id, branch_id,
                it.quantity, "REMOVE",
                ref_no=invoice.invoice_number
            )
            if ok is False:
                raise HTTPException(400, f"Insufficient stock for item {it.item_id}")
    if payload.payment_mode is not None:
        invoice.payment_mode = payload.payment_mode
    if payload.payment_split is not None:
        invoice.payment_split = payload.payment_split

    db.commit()

    if gift_amt > 0 and gift_card_row is not None:
        redeem_card(
            db,
            shop_id=user.shop_id,
            code=gift_code,
            amount=gift_amt,
            ref_type="INVOICE",
            ref_no=invoice.invoice_number,
            user_id=user.user_id,
        )
        db.commit()

    if wallet_amt > 0 and wallet_customer is not None:
        try:
            debit_wallet(
                db,
                shop_id=user.shop_id,
                customer=wallet_customer,
                amount=wallet_amt,
                ref_type="INVOICE",
                ref_no=invoice.invoice_number,
                note="Wallet payment",
                created_by=user.user_id,
            )
            db.commit()
        except ValueError as e:
            db.rollback()
            raise HTTPException(400, str(e))

    log_action(
        db,
        shop_id=user.shop_id,
        module="Invoice",
        action="CREATE",
        record_id=invoice.invoice_number,
        new={
            "invoice_id": invoice.invoice_id,
            "branch_id": branch_id,
            "customer_name": invoice.customer_name,
            "mobile": invoice.mobile,
            "total_amount": invoice.total_amount,
            "tax_amt": invoice.tax_amt,
            "discounted_amt": invoice.discounted_amt,
            "payment_mode": invoice.payment_mode,
            "payment_split": invoice.payment_split,
        },
        user_id=user.user_id,
    )

    customer = upsert_customer(
        db,
        shop_id=user.shop_id,
        customer_name=invoice.customer_name,
        mobile=invoice.mobile,
        gst_number=invoice.gst_number,
        created_by=user.user_id,
    )
    ensure_invoice_due(
        db,
        shop_id=user.shop_id,
        invoice=invoice,
        customer=customer,
        created_by=user.user_id,
    )
    return invoice


# =====================================================
# LIST INVOICES
# =====================================================
@router.get("/list")
def list_invoices(
    request: Request,
    db: Session = Depends(get_db),
    user=Depends(require_permission("billing", "read")),
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
    user=Depends(require_permission("billing", "read")),
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
            price=(float(r.amount or 0) / int(r.quantity or 1)) if int(r.quantity or 0) else float(r.price or 0),
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
    user=Depends(require_permission("billing", "write")),
):
    if str(getattr(user, "role_name", "") or "").lower() == "cashier":
        raise HTTPException(403, "Manager/Admin access required")

    invoice = db.query(Invoice).filter(
        Invoice.invoice_id == invoice_id,
        Invoice.shop_id == user.shop_id
    ).first()

    if not invoice:
        raise HTTPException(404, "Invoice not found")
    if is_branch_day_closed(db, user.shop_id, invoice.branch_id, invoice.created_time):
        raise HTTPException(403, "Day closed for this branch")

    old = {
        "customer_name": invoice.customer_name,
        "mobile": invoice.mobile,
        "total_amount": invoice.total_amount,
        "tax_amt": invoice.tax_amt,
        "discounted_amt": invoice.discounted_amt,
        "payment_mode": invoice.payment_mode,
        "payment_split": invoice.payment_split,
    }

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

    log_action(
        db,
        shop_id=user.shop_id,
        module="Invoice",
        action="MODIFY",
        record_id=invoice.invoice_number,
        old=old,
        new={
            "customer_name": invoice.customer_name,
            "mobile": invoice.mobile,
            "total_amount": invoice.total_amount,
            "tax_amt": invoice.tax_amt,
            "discounted_amt": invoice.discounted_amt,
            "payment_mode": invoice.payment_mode,
            "payment_split": invoice.payment_split,
        },
        user_id=user.user_id,
    )

    customer = upsert_customer(
        db,
        shop_id=user.shop_id,
        customer_name=invoice.customer_name,
        mobile=invoice.mobile,
        gst_number=invoice.gst_number,
        created_by=user.user_id,
    )
    ensure_invoice_due(
        db,
        shop_id=user.shop_id,
        invoice=invoice,
        customer=customer,
        created_by=user.user_id,
    )
    return {"message": "Invoice modified successfully"}


# =====================================================
# DELETE INVOICE
# =====================================================
@router.delete("/{invoice_id}")
def delete_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("billing", "delete")),
):
    if str(getattr(user, "role_name", "") or "").lower() == "cashier":
        raise HTTPException(403, "Manager/Admin access required")

    invoice = db.query(Invoice).filter(
        Invoice.invoice_id == invoice_id,
        Invoice.shop_id == user.shop_id
    ).first()

    if not invoice:
        raise HTTPException(404, "Invoice not found")
    if is_branch_day_closed(db, user.shop_id, invoice.branch_id, invoice.created_time):
        raise HTTPException(403, "Day closed for this branch")

    old = {
        "invoice_id": invoice.invoice_id,
        "invoice_number": invoice.invoice_number,
        "branch_id": invoice.branch_id,
        "customer_name": invoice.customer_name,
        "mobile": invoice.mobile,
        "total_amount": invoice.total_amount,
        "tax_amt": invoice.tax_amt,
        "discounted_amt": invoice.discounted_amt,
        "payment_mode": invoice.payment_mode,
        "payment_split": invoice.payment_split,
    }

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

    log_action(
        db,
        shop_id=user.shop_id,
        module="Invoice",
        action="DELETE",
        record_id=old.get("invoice_number"),
        old=old,
        new={"deleted": True},
        user_id=user.user_id,
    )

    # cancel any open due
    due = db.query(InvoiceDue).filter(
        InvoiceDue.shop_id == user.shop_id,
        InvoiceDue.invoice_id == old.get("invoice_id"),
        InvoiceDue.status == "OPEN",
    ).first()
    if due:
        due.status = "CANCELLED"
        due.closed_on = datetime.utcnow()
        db.commit()

    return {"message": "Invoice deleted"}

# =====================================================
# LIST ONLY DELETED INVOICES (❌ NO MODIFIED)
# =====================================================
@router.get("/archive/list")
def list_archived_invoices(
    request: Request,
    db: Session = Depends(get_db),
    user=Depends(require_permission("billing", "read")),
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
    user=Depends(require_permission("billing", "read")),
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
    user=Depends(require_permission("billing", "write")),
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

    old = {
        "invoice_number": archive.invoice_number,
        "branch_id": archive.branch_id,
        "customer_name": archive.customer_name,
        "mobile": archive.mobile,
        "total_amount": archive.total_amount,
        "tax_amt": archive.tax_amt,
        "discounted_amt": archive.discounted_amt,
    }

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

    log_action(
        db,
        shop_id=user.shop_id,
        module="Invoice",
        action="RESTORE",
        record_id=old.get("invoice_number"),
        old=old,
        new={
            "invoice_id": invoice.invoice_id,
            "invoice_number": invoice.invoice_number,
            "branch_id": invoice.branch_id,
        },
        user_id=user.user_id,
    )

    return {"message": "Deleted invoice restored successfully"}
