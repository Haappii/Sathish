from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.items import Item
from app.models.shop_details import ShopDetails
from app.models.stock import Inventory
from app.models.stock_ledger import StockLedger
from app.models.stock_audit import StockAudit, StockAuditLine
from app.schemas.stock_audit import StockAuditCreate, StockAuditLineCount
from app.services.audit_service import log_action
from app.services.day_close_service import is_branch_day_closed
from app.services.inventory_service import is_inventory_enabled
from app.utils.permissions import require_permission

router = APIRouter(prefix="/stock-audits", tags=["Stock Audit"])


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


def generate_audit_number() -> str:
    return f"AUD-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"


@router.get("/")
def list_audits(
    branch_id: int | None = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_permission("stock_audit", "read")),
):
    bid = resolve_branch(branch_id, user)
    rows = (
        db.query(StockAudit)
        .filter(StockAudit.shop_id == user.shop_id, StockAudit.branch_id == bid)
        .order_by(StockAudit.audit_id.desc())
        .limit(100)
        .all()
    )
    return [
        {
            "audit_id": a.audit_id,
            "audit_number": a.audit_number,
            "branch_id": a.branch_id,
            "status": a.status,
            "notes": a.notes,
            "created_at": a.created_at.strftime("%Y-%m-%d %H:%M") if a.created_at else None,
            "completed_at": a.completed_at.strftime("%Y-%m-%d %H:%M") if a.completed_at else None,
        }
        for a in rows
    ]


@router.post("/")
def create_audit(
    payload: StockAuditCreate,
    db: Session = Depends(get_db),
    user=Depends(require_permission("stock_audit", "write")),
):
    bid = resolve_branch(payload.branch_id, user)

    if not is_inventory_enabled(db, user.shop_id):
        raise HTTPException(400, "Inventory mode disabled")

    business_dt = get_business_datetime(db, user.shop_id)
    if is_branch_day_closed(db, user.shop_id, bid, business_dt):
        raise HTTPException(403, "Day closed for this branch")

    audit = StockAudit(
        shop_id=user.shop_id,
        branch_id=bid,
        audit_number=generate_audit_number(),
        status="DRAFT",
        notes=payload.notes,
        created_by=user.user_id,
        created_at=business_dt,
    )
    db.add(audit)
    db.commit()
    db.refresh(audit)

    item_ids = payload.item_ids or None

    # Query current stock (left join inventory)
    q = db.query(Item.item_id, Item.item_name, Inventory.quantity).outerjoin(
        Inventory,
        (Inventory.item_id == Item.item_id)
        & (Inventory.branch_id == bid)
        & (Inventory.shop_id == user.shop_id),
    ).filter(Item.shop_id == user.shop_id)

    if item_ids:
        q = q.filter(Item.item_id.in_(item_ids))

    rows = q.order_by(Item.item_name).all()
    for r in rows:
        db.add(
            StockAuditLine(
                shop_id=user.shop_id,
                audit_id=audit.audit_id,
                item_id=int(r.item_id),
                system_qty=int(r.quantity or 0),
                counted_qty=None,
                difference_qty=None,
                reason=None,
            )
        )

    db.commit()

    log_action(
        db,
        shop_id=user.shop_id,
        module="StockAudit",
        action="CREATE",
        record_id=audit.audit_number,
        new={"audit_id": audit.audit_id, "branch_id": bid, "lines": len(rows)},
        user_id=user.user_id,
    )

    return {"audit_id": audit.audit_id, "audit_number": audit.audit_number}


@router.get("/{audit_id}")
def get_audit(
    audit_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("stock_audit", "read")),
):
    audit = (
        db.query(StockAudit)
        .filter(StockAudit.audit_id == audit_id, StockAudit.shop_id == user.shop_id)
        .first()
    )
    if not audit:
        raise HTTPException(404, "Audit not found")
    if str(user.role_name).lower() != "admin" and audit.branch_id != user.branch_id:
        raise HTTPException(403, "Not allowed")

    lines = (
        db.query(StockAuditLine, Item.item_name)
        .join(Item, Item.item_id == StockAuditLine.item_id)
        .filter(
            StockAuditLine.shop_id == user.shop_id,
            StockAuditLine.audit_id == audit.audit_id,
        )
        .order_by(Item.item_name)
        .all()
    )

    return {
        "audit_id": audit.audit_id,
        "audit_number": audit.audit_number,
        "branch_id": audit.branch_id,
        "status": audit.status,
        "notes": audit.notes,
        "created_at": audit.created_at.strftime("%Y-%m-%d %H:%M") if audit.created_at else None,
        "completed_at": audit.completed_at.strftime("%Y-%m-%d %H:%M") if audit.completed_at else None,
        "lines": [
            {
                "item_id": line.item_id,
                "item_name": item_name,
                "system_qty": int(line.system_qty or 0),
                "counted_qty": line.counted_qty,
                "difference_qty": line.difference_qty,
                "reason": line.reason,
            }
            for line, item_name in lines
        ],
    }


@router.put("/{audit_id}/count")
def save_counts(
    audit_id: int,
    payload: list[StockAuditLineCount],
    db: Session = Depends(get_db),
    user=Depends(require_permission("stock_audit", "write")),
):
    audit = (
        db.query(StockAudit)
        .filter(StockAudit.audit_id == audit_id, StockAudit.shop_id == user.shop_id)
        .first()
    )
    if not audit:
        raise HTTPException(404, "Audit not found")
    if audit.status != "DRAFT":
        raise HTTPException(400, "Audit is not editable")
    if str(user.role_name).lower() != "admin" and audit.branch_id != user.branch_id:
        raise HTTPException(403, "Not allowed")

    line_map = {
        int(l.item_id): l
        for l in db.query(StockAuditLine)
        .filter(
            StockAuditLine.shop_id == user.shop_id,
            StockAuditLine.audit_id == audit.audit_id,
        )
        .all()
    }

    updated = 0
    for r in payload or []:
        line = line_map.get(int(r.item_id))
        if not line:
            continue
        cnt = int(r.counted_qty)
        line.counted_qty = cnt
        line.difference_qty = cnt - int(line.system_qty or 0)
        line.reason = r.reason
        updated += 1

    db.commit()

    log_action(
        db,
        shop_id=user.shop_id,
        module="StockAudit",
        action="COUNT",
        record_id=audit.audit_number,
        new={"updated": updated},
        user_id=user.user_id,
    )

    return {"success": True, "updated": updated}


@router.post("/{audit_id}/complete")
def complete_audit(
    audit_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("stock_audit", "write")),
):
    audit = (
        db.query(StockAudit)
        .filter(StockAudit.audit_id == audit_id, StockAudit.shop_id == user.shop_id)
        .first()
    )
    if not audit:
        raise HTTPException(404, "Audit not found")
    if audit.status != "DRAFT":
        raise HTTPException(400, "Audit already completed")
    if str(user.role_name).lower() != "admin" and audit.branch_id != user.branch_id:
        raise HTTPException(403, "Not allowed")

    business_dt = get_business_datetime(db, user.shop_id)
    if is_branch_day_closed(db, user.shop_id, audit.branch_id, business_dt):
        raise HTTPException(403, "Day closed for this branch")

    lines = (
        db.query(StockAuditLine)
        .filter(
            StockAuditLine.shop_id == user.shop_id,
            StockAuditLine.audit_id == audit.audit_id,
        )
        .all()
    )

    adjusted = 0
    # Apply adjustments in one transaction
    inv_map = {
        int(i.item_id): i
        for i in db.query(Inventory)
        .filter(Inventory.shop_id == user.shop_id, Inventory.branch_id == audit.branch_id)
        .all()
    }

    for l in lines:
        if l.counted_qty is None:
            continue
        diff = int(l.counted_qty) - int(l.system_qty or 0)
        l.difference_qty = diff
        if diff == 0:
            continue

        inv = inv_map.get(int(l.item_id))
        if not inv:
            inv = Inventory(
                shop_id=user.shop_id,
                branch_id=audit.branch_id,
                item_id=int(l.item_id),
                quantity=0,
                min_stock=0,
            )
            db.add(inv)
            inv_map[int(l.item_id)] = inv

        if diff > 0:
            inv.quantity = int(inv.quantity or 0) + diff
            db.add(
                StockLedger(
                    shop_id=user.shop_id,
                    branch_id=audit.branch_id,
                    item_id=int(l.item_id),
                    change_type="ADD",
                    quantity=diff,
                    reference_no=audit.audit_number,
                )
            )
            adjusted += 1
        else:
            remove_qty = abs(diff)
            if int(inv.quantity or 0) < remove_qty:
                raise HTTPException(
                    400, f"Insufficient stock to remove for item_id {l.item_id}"
                )
            inv.quantity = int(inv.quantity or 0) - remove_qty
            db.add(
                StockLedger(
                    shop_id=user.shop_id,
                    branch_id=audit.branch_id,
                    item_id=int(l.item_id),
                    change_type="REMOVE",
                    quantity=remove_qty,
                    reference_no=audit.audit_number,
                )
            )
            adjusted += 1

    audit.status = "COMPLETED"
    audit.completed_at = business_dt
    audit.completed_by = user.user_id
    db.commit()
    db.refresh(audit)

    log_action(
        db,
        shop_id=user.shop_id,
        module="StockAudit",
        action="COMPLETE",
        record_id=audit.audit_number,
        new={"adjusted_lines": adjusted},
        user_id=user.user_id,
    )

    return {"success": True, "adjusted_lines": adjusted}
