from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session
from sqlalchemy import case

from app.db import get_db
from app.models.cash_drawer import CashShift, CashMovement
from app.models.invoice import Invoice
from app.models.invoice_payment import InvoicePayment
from app.models.sales_return import SalesReturn
from app.models.shop_details import ShopDetails
from app.schemas.cash_drawer import (
    CashShiftOpen,
    CashShiftClose,
    CashMovementCreate,
    CashShiftOut,
    CashMovementOut,
)
from app.services.audit_service import log_action
from app.services.day_close_service import is_branch_day_closed
from app.utils.permissions import require_permission

router = APIRouter(prefix="/cash-drawer", tags=["Cash Drawer"])


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


def get_business_datetime(db: Session, shop_id: int) -> datetime:
    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == shop_id).first()
    business_date = shop.app_date if shop and shop.app_date else datetime.utcnow().date()
    return datetime.combine(business_date, datetime.now().time())


def _is_placeholder_mobile(mobile: str | None) -> bool:
    if not mobile:
        return True
    s = str(mobile).strip()
    if len(s) < 10:
        return True
    if s == "9999999999":
        return True
    if len(set(s)) == 1 and s[0] == "9":
        return True
    return False


def _cash_from_invoice(inv: Invoice) -> float:
    payable = float((inv.total_amount or 0) - (inv.discounted_amt or 0))
    mode = str(inv.payment_mode or "").strip().lower()
    if mode == "cash":
        return payable
    if mode == "split":
        split = inv.payment_split or {}
        try:
            return float(split.get("cash") or 0)
        except Exception:
            return 0.0
    return 0.0


def _denoms_total(denoms: dict | None) -> float | None:
    if not denoms:
        return None
    total = Decimal("0.00")
    for k, v in denoms.items():
        try:
            denom = Decimal(str(k).strip())
            count = Decimal(str(v).strip())
        except Exception:
            continue
        total += denom * count
    return float(total)


def _compute_expected_cash(
    db: Session,
    *,
    shop_id: int,
    branch_id: int,
    shift: CashShift,
    closed_at: datetime | None = None,
) -> dict[str, float]:
    opened_at = shift.opened_at
    end = closed_at or datetime.utcnow()

    # Movements
    mov_row = (
        db.query(
            func.coalesce(
                func.sum(
                    case((CashMovement.movement_type == "IN", CashMovement.amount), else_=0)
                ),
                0,
            ).label("cash_in"),
            func.coalesce(
                func.sum(
                    case((CashMovement.movement_type == "OUT", CashMovement.amount), else_=0)
                ),
                0,
            ).label("cash_out"),
        )
        .filter(
            CashMovement.shop_id == shop_id,
            CashMovement.branch_id == branch_id,
            CashMovement.shift_id == shift.shift_id,
        )
        .first()
    )
    cash_in = float(getattr(mov_row, "cash_in", 0) or 0)
    cash_out = float(getattr(mov_row, "cash_out", 0) or 0)

    # Cash sales from invoices
    invs = (
        db.query(Invoice)
        .filter(
            Invoice.shop_id == shop_id,
            Invoice.branch_id == branch_id,
            Invoice.created_time >= opened_at,
            Invoice.created_time <= end,
        )
        .all()
    )
    cash_sales = float(sum(_cash_from_invoice(i) for i in invs))

    # Cash collections from dues (invoice payments)
    cash_collections = float(
        (
            db.query(func.coalesce(func.sum(InvoicePayment.amount), 0))
            .filter(
                InvoicePayment.shop_id == shop_id,
                InvoicePayment.branch_id == branch_id,
                InvoicePayment.payment_mode == "cash",
                InvoicePayment.paid_on >= opened_at,
                InvoicePayment.paid_on <= end,
            )
            .scalar()
            or 0
        )
    )

    # Cash refunds (assumed) from returns
    cash_refunds = float(
        (
            db.query(func.coalesce(func.sum(SalesReturn.refund_amount), 0))
            .filter(
                SalesReturn.shop_id == shop_id,
                SalesReturn.branch_id == branch_id,
                SalesReturn.status != "CANCELLED",
                SalesReturn.created_on >= opened_at,
                SalesReturn.created_on <= end,
            )
            .scalar()
            or 0
        )
    )

    opening = float(shift.opening_cash or 0)
    expected = opening + cash_in - cash_out + cash_sales + cash_collections - cash_refunds

    return {
        "opening_cash": opening,
        "cash_in": cash_in,
        "cash_out": cash_out,
        "cash_sales": cash_sales,
        "cash_collections": cash_collections,
        "cash_refunds": cash_refunds,
        "expected_cash": float(Decimal(str(expected)).quantize(Decimal("0.01"))),
    }


@router.get("/current")
def get_current_shift(
    branch_id: int | None = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_permission("cash_drawer", "read")),
):
    bid = resolve_branch(branch_id, user)
    shift = (
        db.query(CashShift)
        .filter(
            CashShift.shop_id == user.shop_id,
            CashShift.branch_id == bid,
            CashShift.status == "OPEN",
        )
        .order_by(CashShift.shift_id.desc())
        .first()
    )
    if not shift:
        return {"shift": None, "movements": []}

    movements = (
        db.query(CashMovement)
        .filter(
            CashMovement.shop_id == user.shop_id,
            CashMovement.branch_id == bid,
            CashMovement.shift_id == shift.shift_id,
        )
        .order_by(CashMovement.movement_id.desc())
        .all()
    )
    summary = _compute_expected_cash(db, shop_id=user.shop_id, branch_id=bid, shift=shift)

    return {
        "shift": CashShiftOut.model_validate(shift, from_attributes=True),
        "movements": [CashMovementOut.model_validate(m, from_attributes=True) for m in movements],
        "summary": summary,
    }


@router.post("/open", response_model=CashShiftOut)
def open_shift(
    payload: CashShiftOpen,
    branch_id: int | None = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_permission("cash_drawer", "write")),
):
    bid = resolve_branch(branch_id, user)
    business_dt = get_business_datetime(db, user.shop_id)
    if is_branch_day_closed(db, user.shop_id, bid, business_dt):
        raise HTTPException(403, "Day closed for this branch")

    existing = (
        db.query(CashShift)
        .filter(
            CashShift.shop_id == user.shop_id,
            CashShift.branch_id == bid,
            CashShift.status == "OPEN",
        )
        .first()
    )
    if existing:
        raise HTTPException(400, "A shift is already open for this branch")

    shift = CashShift(
        shop_id=user.shop_id,
        branch_id=bid,
        status="OPEN",
        opened_by=user.user_id,
        opened_at=business_dt,
        opening_cash=float(payload.opening_cash or 0),
        opening_notes=payload.opening_notes,
    )
    db.add(shift)
    db.commit()
    db.refresh(shift)

    log_action(
        db,
        shop_id=user.shop_id,
        module="CashDrawer",
        action="SHIFT_OPEN",
        record_id=str(shift.shift_id),
        new={"branch_id": bid, "opening_cash": float(shift.opening_cash or 0)},
        user_id=user.user_id,
    )

    return shift


@router.post("/movement", response_model=CashMovementOut)
def add_movement(
    payload: CashMovementCreate,
    branch_id: int | None = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_permission("cash_drawer", "write")),
):
    bid = resolve_branch(branch_id, user)
    business_dt = get_business_datetime(db, user.shop_id)
    if is_branch_day_closed(db, user.shop_id, bid, business_dt):
        raise HTTPException(403, "Day closed for this branch")

    shift = (
        db.query(CashShift)
        .filter(
            CashShift.shop_id == user.shop_id,
            CashShift.branch_id == bid,
            CashShift.status == "OPEN",
        )
        .order_by(CashShift.shift_id.desc())
        .first()
    )
    if not shift:
        raise HTTPException(400, "No open shift. Open a shift first.")

    mtype = str(payload.movement_type or "").strip().upper()
    if mtype not in {"IN", "OUT"}:
        raise HTTPException(400, "movement_type must be IN or OUT")
    amt = float(payload.amount or 0)
    if amt <= 0:
        raise HTTPException(400, "amount must be > 0")

    mov = CashMovement(
        shop_id=user.shop_id,
        branch_id=bid,
        shift_id=shift.shift_id,
        movement_type=mtype,
        amount=amt,
        reason=payload.reason,
        created_by=user.user_id,
        created_at=business_dt,
    )
    db.add(mov)
    db.commit()
    db.refresh(mov)

    log_action(
        db,
        shop_id=user.shop_id,
        module="CashDrawer",
        action=f"CASH_{mtype}",
        record_id=str(mov.movement_id),
        new={
            "branch_id": bid,
            "shift_id": shift.shift_id,
            "amount": float(mov.amount or 0),
            "reason": mov.reason,
        },
        user_id=user.user_id,
    )

    return mov


@router.post("/close", response_model=CashShiftOut)
def close_shift(
    payload: CashShiftClose,
    branch_id: int | None = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_permission("cash_drawer", "write")),
):
    bid = resolve_branch(branch_id, user)
    business_dt = get_business_datetime(db, user.shop_id)
    if is_branch_day_closed(db, user.shop_id, bid, business_dt):
        raise HTTPException(403, "Day closed for this branch")

    shift = (
        db.query(CashShift)
        .filter(
            CashShift.shop_id == user.shop_id,
            CashShift.branch_id == bid,
            CashShift.status == "OPEN",
        )
        .order_by(CashShift.shift_id.desc())
        .first()
    )
    if not shift:
        raise HTTPException(400, "No open shift")

    expected_info = _compute_expected_cash(
        db, shop_id=user.shop_id, branch_id=bid, shift=shift, closed_at=business_dt
    )
    expected_cash = float(expected_info.get("expected_cash") or 0)

    actual = payload.actual_cash
    if actual is None:
        actual = _denoms_total(payload.denomination_counts)
    if actual is None:
        raise HTTPException(400, "Provide actual_cash or denomination_counts")

    diff = float(Decimal(str(actual - expected_cash)).quantize(Decimal("0.01")))

    shift.status = "CLOSED"
    shift.closed_by = user.user_id
    shift.closed_at = business_dt
    shift.expected_cash = expected_cash
    shift.actual_cash = float(actual)
    shift.diff_cash = diff
    shift.denomination_counts = payload.denomination_counts
    shift.closing_notes = payload.closing_notes

    db.commit()
    db.refresh(shift)

    log_action(
        db,
        shop_id=user.shop_id,
        module="CashDrawer",
        action="SHIFT_CLOSE",
        record_id=str(shift.shift_id),
        new={
            "branch_id": bid,
            "expected_cash": expected_cash,
            "actual_cash": float(actual),
            "diff_cash": diff,
        },
        user_id=user.user_id,
    )

    return shift


@router.get("/shifts", response_model=list[CashShiftOut])
def list_shifts(
    branch_id: int | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    user=Depends(require_permission("cash_drawer", "read")),
):
    bid = resolve_branch(branch_id, user)
    return (
        db.query(CashShift)
        .filter(CashShift.shop_id == user.shop_id, CashShift.branch_id == bid)
        .order_by(CashShift.shift_id.desc())
        .limit(limit)
        .all()
    )


@router.get("/shifts/{shift_id}")
def get_shift(
    shift_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("cash_drawer", "read")),
):
    shift = (
        db.query(CashShift)
        .filter(CashShift.shift_id == shift_id, CashShift.shop_id == user.shop_id)
        .first()
    )
    if not shift:
        raise HTTPException(404, "Shift not found")
    if str(user.role_name).lower() != "admin" and shift.branch_id != user.branch_id:
        raise HTTPException(403, "Not allowed")

    movements = (
        db.query(CashMovement)
        .filter(
            CashMovement.shop_id == user.shop_id,
            CashMovement.branch_id == shift.branch_id,
            CashMovement.shift_id == shift.shift_id,
        )
        .order_by(CashMovement.movement_id.desc())
        .all()
    )
    summary = _compute_expected_cash(
        db,
        shop_id=user.shop_id,
        branch_id=shift.branch_id,
        shift=shift,
        closed_at=shift.closed_at or datetime.utcnow(),
    )

    return {
        "shift": CashShiftOut.model_validate(shift, from_attributes=True),
        "movements": [CashMovementOut.model_validate(m, from_attributes=True) for m in movements],
        "summary": summary,
    }
