from __future__ import annotations

from datetime import datetime
from decimal import Decimal
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.invoice import Invoice
from app.models.invoice_details import InvoiceDetail
from app.models.invoice_draft import InvoiceDraft, InvoiceDraftItem
from app.models.items import Item
from app.models.shop_details import ShopDetails
from app.schemas.invoice_draft import DraftCreate, DraftOut
from app.services.audit_service import log_action
from app.services.credit_service import upsert_customer, ensure_invoice_due, as_decimal
from app.services.day_close_service import is_branch_day_closed
from app.services.gst_service import calculate_gst
from app.services.invoice_service import generate_invoice_number
from app.services.inventory_service import is_inventory_enabled, adjust_stock
from app.utils.permissions import require_permission

router = APIRouter(prefix="/invoice/draft", tags=["Invoice Drafts"])


def _role(user) -> str:
    return str(getattr(user, "role_name", "") or "").lower()


def resolve_branch(user, override_branch=None):
    role = _role(user)
    if role == "admin":
        branch_raw = override_branch if override_branch not in (None, "") else getattr(user, "branch_id", None)
    else:
        branch_raw = getattr(user, "branch_id", None)

    try:
        return int(branch_raw)
    except (TypeError, ValueError):
        raise HTTPException(400, "Branch required")


def _new_draft_number() -> str:
    return f"DRAFT-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6].upper()}"


def _get_business_datetime(db: Session, shop_id: int) -> datetime:
    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == shop_id).first()
    business_date = shop.app_date if shop and shop.app_date else datetime.utcnow().date()
    return datetime.combine(business_date, datetime.now().time())


@router.post("/", response_model=DraftOut)
def create_draft(
    payload: DraftCreate,
    request: Request,
    db: Session = Depends(get_db),
    user=Depends(require_permission("drafts", "write")),
):
    branch_id = resolve_branch(user, request.headers.get("x-branch-id"))

    if not payload.items:
        raise HTTPException(400, "Items required")

    # Validate items exist
    item_ids = [int(x.item_id) for x in payload.items]
    existing = {
        int(r.item_id)
        for r in db.query(Item.item_id)
        .filter(Item.shop_id == user.shop_id, Item.item_id.in_(item_ids))
        .all()
    }
    for it in payload.items:
        if int(it.quantity or 0) <= 0:
            raise HTTPException(400, "Quantity must be > 0")
        if int(it.item_id) not in existing:
            raise HTTPException(400, f"Invalid item: {it.item_id}")

    row = InvoiceDraft(
        shop_id=user.shop_id,
        branch_id=branch_id,
        draft_number=_new_draft_number(),
        status="DRAFT",
        customer_name=payload.customer_name,
        mobile=payload.mobile,
        gst_number=payload.customer_gst,
        discounted_amt=Decimal(str(payload.discounted_amt or 0)),
        payment_mode=payload.payment_mode or "cash",
        payment_split=payload.payment_split,
        notes=payload.notes,
        created_by=user.user_id,
    )
    db.add(row)
    db.flush()

    for it in payload.items:
        db.add(
            InvoiceDraftItem(
                shop_id=user.shop_id,
                draft_id=row.draft_id,
                item_id=int(it.item_id),
                quantity=int(it.quantity),
                amount=Decimal(str(it.amount or 0)),
            )
        )

    db.commit()
    db.refresh(row)

    log_action(
        db,
        shop_id=user.shop_id,
        module="InvoiceDraft",
        action="CREATE",
        record_id=row.draft_number,
        new={"branch_id": row.branch_id, "items_count": len(row.items)},
        user_id=user.user_id,
    )

    return row


@router.get("/list", response_model=list[DraftOut])
def list_drafts(
    branch_id: int | None = Query(None),
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
    user=Depends(require_permission("drafts", "read")),
):
    query = db.query(InvoiceDraft).filter(
        InvoiceDraft.shop_id == user.shop_id,
        InvoiceDraft.status == "DRAFT",
    )

    if _role(user) != "admin":
        query = query.filter(InvoiceDraft.branch_id == user.branch_id)
    elif branch_id is not None:
        query = query.filter(InvoiceDraft.branch_id == int(branch_id))

    return query.order_by(InvoiceDraft.draft_id.desc()).limit(limit).all()


@router.get("/{draft_number}", response_model=DraftOut)
def get_draft(
    draft_number: str,
    db: Session = Depends(get_db),
    user=Depends(require_permission("drafts", "read")),
):
    row = (
        db.query(InvoiceDraft)
        .filter(
            InvoiceDraft.shop_id == user.shop_id,
            InvoiceDraft.draft_number == draft_number,
            InvoiceDraft.status == "DRAFT",
        )
        .first()
    )
    if not row:
        raise HTTPException(404, "Draft not found")

    if _role(user) != "admin" and row.branch_id != user.branch_id:
        raise HTTPException(403, "Not allowed")

    return row


@router.delete("/{draft_id}")
def delete_draft(
    draft_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("drafts", "delete")),
):
    row = (
        db.query(InvoiceDraft)
        .filter(InvoiceDraft.shop_id == user.shop_id, InvoiceDraft.draft_id == draft_id)
        .first()
    )
    if not row or row.status != "DRAFT":
        raise HTTPException(404, "Draft not found")

    if _role(user) != "admin" and row.branch_id != user.branch_id:
        raise HTTPException(403, "Not allowed")

    row.status = "DELETED"
    db.commit()

    log_action(
        db,
        shop_id=user.shop_id,
        module="InvoiceDraft",
        action="DELETE",
        record_id=row.draft_number,
        old={"status": "DRAFT"},
        new={"status": "DELETED"},
        user_id=user.user_id,
    )

    return {"success": True}


@router.post("/convert/{draft_id}")
def convert_draft_to_invoice(
    draft_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user=Depends(require_permission("drafts", "write")),
):
    draft = (
        db.query(InvoiceDraft)
        .filter(InvoiceDraft.shop_id == user.shop_id, InvoiceDraft.draft_id == draft_id)
        .first()
    )
    if not draft or draft.status != "DRAFT":
        raise HTTPException(404, "Draft not found")

    if _role(user) != "admin" and draft.branch_id != user.branch_id:
        raise HTTPException(403, "Not allowed")

    business_dt = _get_business_datetime(db, user.shop_id)
    if is_branch_day_closed(db, user.shop_id, draft.branch_id, business_dt):
        raise HTTPException(403, "Day closed for this branch")

    invoice = Invoice(
        invoice_number=generate_invoice_number(db),
        shop_id=user.shop_id,
        branch_id=draft.branch_id,
        created_user=user.user_id,
        created_time=business_dt,
        customer_name=draft.customer_name,
        mobile=draft.mobile,
        gst_number=draft.gst_number,
        payment_mode=draft.payment_mode,
        payment_split=draft.payment_split,
        discounted_amt=draft.discounted_amt,
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)

    subtotal = Decimal("0.00")

    item_ids = [int(x.item_id) for x in draft.items]
    item_map = {
        i.item_id: i
        for i in db.query(Item)
        .filter(Item.shop_id == user.shop_id, Item.item_id.in_(item_ids))
        .all()
    }

    for it in draft.items:
        subtotal += as_decimal(it.amount)
        item = item_map.get(int(it.item_id))
        db.add(
            InvoiceDetail(
                invoice_id=invoice.invoice_id,
                shop_id=user.shop_id,
                item_id=int(it.item_id),
                branch_id=draft.branch_id,
                quantity=int(it.quantity),
                amount=as_decimal(it.amount),
                buy_price=(item.buy_price if item else 0),
                mrp_price=(item.mrp_price if item else 0),
            )
        )

        if is_inventory_enabled(db, user.shop_id):
            adjust_stock(
                db,
                user.shop_id,
                int(it.item_id),
                draft.branch_id,
                int(it.quantity),
                "REMOVE",
                ref_no=invoice.invoice_number,
            )

    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == user.shop_id).first()
    tax, total = calculate_gst(subtotal, shop)
    invoice.tax_amt = tax
    invoice.total_amount = total
    db.commit()

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

    draft.status = "CONVERTED"
    db.commit()

    log_action(
        db,
        shop_id=user.shop_id,
        module="InvoiceDraft",
        action="CONVERT",
        record_id=draft.draft_number,
        new={"invoice_number": invoice.invoice_number},
        user_id=user.user_id,
    )

    return {
        "success": True,
        "invoice_id": invoice.invoice_id,
        "invoice_number": invoice.invoice_number,
    }
