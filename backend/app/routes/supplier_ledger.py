from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.purchase_order import PurchaseOrder
from app.models.shop_details import ShopDetails
from app.models.supplier import Supplier
from app.models.supplier_ledger import SupplierLedgerEntry
from app.schemas.supplier_ledger import (
    SupplierLedgerPaymentCreate,
    SupplierLedgerEntryOut,
    SupplierAgingRow,
    SupplierOpenPoRow,
)
from app.services.audit_service import log_action
from app.services.day_close_service import is_branch_day_closed
from app.utils.permissions import require_permission

router = APIRouter(prefix="/supplier-ledger", tags=["Supplier Ledger"])


def resolve_branch(branch_id_param, user) -> int:
    role = str(getattr(user, "role_name", "") or "").strip().lower()
    if role == "admin":
        branch_raw = (
            branch_id_param
            if branch_id_param not in (None, "")
            else getattr(user, "branch_id", None)
        )
    else:
        branch_raw = getattr(user, "branch_id", None)

    try:
        return int(branch_raw)
    except (TypeError, ValueError):
        raise HTTPException(400, "Branch required")


def _business_date(db: Session, shop_id: int) -> date:
    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == shop_id).first()
    if shop and shop.app_date:
        return shop.app_date
    return datetime.utcnow().date()


@router.get("/aging", response_model=list[SupplierAgingRow])
def aging_dashboard(
    branch_id: int | None = Query(None),
    as_of: str | None = Query(None),  # YYYY-MM-DD
    db: Session = Depends(get_db),
    user=Depends(require_permission("supplier_ledger", "read")),
):
    bid = resolve_branch(branch_id, user)

    if as_of:
        try:
            as_of_date = datetime.strptime(as_of, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(400, "Invalid as_of format YYYY-MM-DD")
    else:
        as_of_date = _business_date(db, user.shop_id)

    suppliers = (
        db.query(Supplier)
        .filter(
            Supplier.shop_id == user.shop_id,
            Supplier.branch_id == bid,
            Supplier.status == "ACTIVE",
        )
        .order_by(Supplier.supplier_name)
        .all()
    )

    # Open POs (use PO totals for due; ledger is for statement/history)
    pos = (
        db.query(PurchaseOrder)
        .filter(
            PurchaseOrder.shop_id == user.shop_id,
            PurchaseOrder.branch_id == bid,
            PurchaseOrder.total_amount > 0,
        )
        .filter(or_(PurchaseOrder.payment_status != "PAID", PurchaseOrder.paid_amount < PurchaseOrder.total_amount))
        .all()
    )

    by_supplier: dict[int, dict[str, float]] = {}

    def bump(supplier_id: int, key: str, amt: float):
        if supplier_id not in by_supplier:
            by_supplier[supplier_id] = {
                "total_due": 0.0,
                "not_due": 0.0,
                "overdue": 0.0,
                "due_0_30": 0.0,
                "due_31_60": 0.0,
                "due_61_90": 0.0,
                "due_90_plus": 0.0,
            }
        by_supplier[supplier_id][key] += float(amt or 0)

    for po in pos:
        due = float(po.total_amount or 0) - float(po.paid_amount or 0)
        if due <= 0:
            continue

        sup = next((s for s in suppliers if s.supplier_id == po.supplier_id), None)
        terms = int(getattr(sup, "credit_terms_days", 0) or 0) if sup else 0
        due_date = (po.order_date or as_of_date) + timedelta(days=max(0, terms))
        days_over = (as_of_date - due_date).days

        bump(po.supplier_id, "total_due", due)

        if days_over <= 0:
            bump(po.supplier_id, "not_due", due)
            continue

        bump(po.supplier_id, "overdue", due)
        if days_over <= 30:
            bump(po.supplier_id, "due_0_30", due)
        elif days_over <= 60:
            bump(po.supplier_id, "due_31_60", due)
        elif days_over <= 90:
            bump(po.supplier_id, "due_61_90", due)
        else:
            bump(po.supplier_id, "due_90_plus", due)

    result: list[SupplierAgingRow] = []
    for s in suppliers:
        agg = by_supplier.get(s.supplier_id)
        if not agg:
            continue
        result.append(
            {
                "supplier_id": s.supplier_id,
                "supplier_name": s.supplier_name,
                **{k: float(v or 0) for k, v in agg.items()},
            }
        )

    return sorted(result, key=lambda x: (-float(x.get("total_due") or 0), x.get("supplier_name") or ""))


@router.get("/supplier/{supplier_id}/open-pos", response_model=list[SupplierOpenPoRow])
def supplier_open_pos(
    supplier_id: int,
    branch_id: int | None = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_permission("supplier_ledger", "read")),
):
    bid = resolve_branch(branch_id, user)
    supplier = (
        db.query(Supplier)
        .filter(
            Supplier.supplier_id == supplier_id,
            Supplier.shop_id == user.shop_id,
            Supplier.branch_id == bid,
        )
        .first()
    )
    if not supplier:
        raise HTTPException(404, "Supplier not found")

    pos = (
        db.query(PurchaseOrder)
        .filter(
            PurchaseOrder.shop_id == user.shop_id,
            PurchaseOrder.branch_id == bid,
            PurchaseOrder.supplier_id == supplier_id,
            PurchaseOrder.total_amount > 0,
        )
        .order_by(PurchaseOrder.po_id.desc())
        .all()
    )

    terms = int(getattr(supplier, "credit_terms_days", 0) or 0)
    rows = []
    for po in pos:
        due = float(po.total_amount or 0) - float(po.paid_amount or 0)
        if due <= 0:
            continue
        due_date = (po.order_date or _business_date(db, user.shop_id)) + timedelta(days=max(0, terms))
        rows.append(
            {
                "po_id": po.po_id,
                "po_number": po.po_number,
                "order_date": po.order_date,
                "total_amount": float(po.total_amount or 0),
                "paid_amount": float(po.paid_amount or 0),
                "due_amount": float(due),
                "due_date": due_date,
            }
        )
    return rows


@router.get("/supplier/{supplier_id}/statement", response_model=list[SupplierLedgerEntryOut])
def supplier_statement(
    supplier_id: int,
    branch_id: int | None = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_permission("supplier_ledger", "read")),
):
    bid = resolve_branch(branch_id, user)

    supplier = (
        db.query(Supplier)
        .filter(
            Supplier.supplier_id == supplier_id,
            Supplier.shop_id == user.shop_id,
            Supplier.branch_id == bid,
        )
        .first()
    )
    if not supplier:
        raise HTTPException(404, "Supplier not found")

    return (
        db.query(SupplierLedgerEntry)
        .filter(
            SupplierLedgerEntry.shop_id == user.shop_id,
            SupplierLedgerEntry.branch_id == bid,
            SupplierLedgerEntry.supplier_id == supplier_id,
        )
        .order_by(SupplierLedgerEntry.entry_time.asc(), SupplierLedgerEntry.entry_id.asc())
        .all()
    )


@router.post("/payment", response_model=SupplierLedgerEntryOut)
def record_payment(
    payload: SupplierLedgerPaymentCreate,
    db: Session = Depends(get_db),
    user=Depends(require_permission("supplier_ledger", "write")),
):
    bid = resolve_branch(payload.branch_id, user)

    business_dt = datetime.combine(_business_date(db, user.shop_id), datetime.now().time())
    if is_branch_day_closed(db, user.shop_id, bid, business_dt):
        raise HTTPException(403, "Day closed for this branch")

    supplier = (
        db.query(Supplier)
        .filter(
            Supplier.supplier_id == payload.supplier_id,
            Supplier.shop_id == user.shop_id,
            Supplier.branch_id == bid,
            Supplier.status == "ACTIVE",
        )
        .first()
    )
    if not supplier:
        raise HTTPException(404, "Supplier not found")

    amt = float(payload.amount or 0)
    if amt <= 0:
        raise HTTPException(400, "amount must be > 0")

    po = None
    if payload.po_id:
        po = (
            db.query(PurchaseOrder)
            .filter(
                PurchaseOrder.po_id == payload.po_id,
                PurchaseOrder.shop_id == user.shop_id,
                PurchaseOrder.branch_id == bid,
                PurchaseOrder.supplier_id == supplier.supplier_id,
            )
            .first()
        )
        if not po:
            raise HTTPException(404, "PO not found")

    entry = SupplierLedgerEntry(
        shop_id=user.shop_id,
        branch_id=bid,
        supplier_id=supplier.supplier_id,
        entry_type="PAYMENT",
        reference_no=payload.reference_no or (po.po_number + "-PAY" if po else None),
        po_id=po.po_id if po else None,
        debit=0,
        credit=amt,
        notes=payload.notes or f"Mode: {payload.payment_mode or 'cash'}",
        entry_time=business_dt,
        created_by=user.user_id,
    )
    db.add(entry)

    if po:
        po.paid_amount = float(po.paid_amount or 0) + amt
        if po.paid_amount >= float(po.total_amount or 0) - 0.01:
            po.paid_amount = float(po.total_amount or 0)
            po.payment_status = "PAID"
        elif po.paid_amount > 0:
            po.payment_status = "PARTIAL"
        else:
            po.payment_status = "UNPAID"

    db.commit()
    db.refresh(entry)

    log_action(
        db,
        shop_id=user.shop_id,
        module="SupplierLedger",
        action="PAYMENT",
        record_id=str(entry.entry_id),
        new={
            "supplier_id": supplier.supplier_id,
            "po_id": po.po_id if po else None,
            "amount": amt,
            "payment_mode": payload.payment_mode,
        },
        user_id=user.user_id,
    )

    return entry
