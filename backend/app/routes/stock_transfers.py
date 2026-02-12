from __future__ import annotations

from datetime import datetime
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.branch import Branch
from app.models.items import Item
from app.models.stock_transfer import StockTransfer, StockTransferItem
from app.schemas.stock_transfer import StockTransferCreate, StockTransferOut, StockTransferAction
from app.services.audit_service import log_action
from app.services.inventory_service import is_inventory_enabled, get_stock, adjust_stock
from app.utils.auth_user import get_current_user
from app.utils.permissions import require_permission

router = APIRouter(prefix="/stock-transfers", tags=["Stock Transfers"])


def _role(user) -> str:
    return str(getattr(user, "role_name", "") or "").lower()

def _require_admin(user):
    if _role(user) != "admin":
        raise HTTPException(403, "Admin access required")


def _new_transfer_number() -> str:
    return f"TX-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6].upper()}"


def _resolve_from_branch(payload_from: int | None, user) -> int:
    if _role(user) == "admin":
        return int(payload_from or user.branch_id)
    return int(user.branch_id)


def _ensure_branch(db: Session, shop_id: int, branch_id: int) -> Branch:
    row = (
        db.query(Branch)
        .filter(Branch.shop_id == shop_id, Branch.branch_id == branch_id)
        .first()
    )
    if not row or row.status != "ACTIVE":
        raise HTTPException(400, "Invalid or inactive branch")
    return row


@router.get("/list", response_model=list[StockTransferOut])
def list_transfers(
    status: str | None = Query(None),
    branch_id: int | None = Query(None),
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
    user=Depends(require_permission("stock_transfers", "read")),
):
    query = db.query(StockTransfer).filter(StockTransfer.shop_id == user.shop_id)

    role = _role(user)
    if role != "admin":
        query = query.filter(
            (StockTransfer.from_branch_id == user.branch_id)
            | (StockTransfer.to_branch_id == user.branch_id)
        )
    elif branch_id is not None:
        bid = int(branch_id)
        query = query.filter(
            (StockTransfer.from_branch_id == bid) | (StockTransfer.to_branch_id == bid)
        )

    if status:
        query = query.filter(StockTransfer.status == status.strip().upper())

    return query.order_by(StockTransfer.transfer_id.desc()).limit(limit).all()


@router.get("/{transfer_id}", response_model=StockTransferOut)
def get_transfer(
    transfer_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("stock_transfers", "read")),
):
    row = (
        db.query(StockTransfer)
        .filter(StockTransfer.shop_id == user.shop_id, StockTransfer.transfer_id == transfer_id)
        .first()
    )
    if not row:
        raise HTTPException(404, "Transfer not found")

    role = _role(user)
    if role != "admin" and user.branch_id not in {row.from_branch_id, row.to_branch_id}:
        raise HTTPException(403, "Not allowed")

    return row


@router.post("/", response_model=StockTransferOut)
def create_transfer(
    payload: StockTransferCreate,
    db: Session = Depends(get_db),
    user=Depends(require_permission("stock_transfers", "write")),
):
    if not is_inventory_enabled(db, user.shop_id):
        raise HTTPException(400, "Inventory mode disabled")

    from_branch_id = _resolve_from_branch(payload.from_branch_id, user)
    to_branch_id = int(payload.to_branch_id)
    if from_branch_id == to_branch_id:
        raise HTTPException(400, "From/To branch cannot be the same")

    _ensure_branch(db, user.shop_id, from_branch_id)
    _ensure_branch(db, user.shop_id, to_branch_id)

    if not payload.items:
        raise HTTPException(400, "Items required")

    # Validate items exist
    item_ids = [int(x.item_id) for x in payload.items]
    existing_ids = {
        int(r.item_id)
        for r in db.query(Item.item_id)
        .filter(Item.shop_id == user.shop_id, Item.item_id.in_(item_ids))
        .all()
    }
    for it in payload.items:
        if int(it.quantity or 0) <= 0:
            raise HTTPException(400, "Quantity must be > 0")
        if int(it.item_id) not in existing_ids:
            raise HTTPException(400, f"Invalid item: {it.item_id}")

    row = StockTransfer(
        shop_id=user.shop_id,
        transfer_number=_new_transfer_number(),
        from_branch_id=from_branch_id,
        to_branch_id=to_branch_id,
        status="REQUESTED",
        notes=payload.notes,
        requested_by=user.user_id,
    )
    db.add(row)
    db.flush()

    for it in payload.items:
        db.add(
            StockTransferItem(
                shop_id=user.shop_id,
                transfer_id=row.transfer_id,
                item_id=int(it.item_id),
                quantity=int(it.quantity),
            )
        )

    db.commit()
    db.refresh(row)

    log_action(
        db,
        shop_id=user.shop_id,
        module="StockTransfers",
        action="REQUEST",
        record_id=row.transfer_number,
        new={
            "from_branch_id": row.from_branch_id,
            "to_branch_id": row.to_branch_id,
            "items_count": len(row.items),
        },
        user_id=user.user_id,
    )

    return row


@router.post("/{transfer_id}/approve", response_model=StockTransferOut)
def approve_transfer(
    transfer_id: int,
    payload: StockTransferAction | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("stock_transfers", "write")),
):
    _require_admin(user)

    row = (
        db.query(StockTransfer)
        .filter(StockTransfer.shop_id == user.shop_id, StockTransfer.transfer_id == transfer_id)
        .first()
    )
    if not row:
        raise HTTPException(404, "Transfer not found")
    if row.status != "REQUESTED":
        raise HTTPException(400, "Only REQUESTED transfers can be approved")

    row.status = "APPROVED"
    row.approved_by = user.user_id
    row.approved_on = datetime.utcnow()
    if payload and payload.notes:
        row.notes = payload.notes
    db.commit()
    db.refresh(row)

    log_action(
        db,
        shop_id=user.shop_id,
        module="StockTransfers",
        action="APPROVE",
        record_id=row.transfer_number,
        old={"status": "REQUESTED"},
        new={"status": row.status},
        user_id=user.user_id,
    )

    return row


@router.post("/{transfer_id}/reject", response_model=StockTransferOut)
def reject_transfer(
    transfer_id: int,
    payload: StockTransferAction | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("stock_transfers", "write")),
):
    _require_admin(user)

    row = (
        db.query(StockTransfer)
        .filter(StockTransfer.shop_id == user.shop_id, StockTransfer.transfer_id == transfer_id)
        .first()
    )
    if not row:
        raise HTTPException(404, "Transfer not found")
    if row.status != "REQUESTED":
        raise HTTPException(400, "Only REQUESTED transfers can be rejected")

    row.status = "REJECTED"
    row.approved_by = user.user_id
    row.approved_on = datetime.utcnow()
    if payload and payload.notes:
        row.notes = payload.notes
    db.commit()
    db.refresh(row)

    log_action(
        db,
        shop_id=user.shop_id,
        module="StockTransfers",
        action="REJECT",
        record_id=row.transfer_number,
        old={"status": "REQUESTED"},
        new={"status": row.status},
        user_id=user.user_id,
    )

    return row


@router.post("/{transfer_id}/dispatch", response_model=StockTransferOut)
def dispatch_transfer(
    transfer_id: int,
    payload: StockTransferAction | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("stock_transfers", "write")),
):
    if not is_inventory_enabled(db, user.shop_id):
        raise HTTPException(400, "Inventory mode disabled")

    row = (
        db.query(StockTransfer)
        .filter(StockTransfer.shop_id == user.shop_id, StockTransfer.transfer_id == transfer_id)
        .first()
    )
    if not row:
        raise HTTPException(404, "Transfer not found")
    if row.status != "APPROVED":
        raise HTTPException(400, "Only APPROVED transfers can be dispatched")

    if _role(user) != "admin" and int(user.branch_id) != int(row.from_branch_id):
        raise HTTPException(403, "Only FROM branch can dispatch")

    # Pre-check stock
    for it in row.items:
        available = get_stock(db, user.shop_id, it.item_id, row.from_branch_id)
        if available < int(it.quantity):
            raise HTTPException(400, f"Insufficient stock for item {it.item_id}")

    for it in row.items:
        ok = adjust_stock(
            db,
            user.shop_id,
            it.item_id,
            row.from_branch_id,
            int(it.quantity),
            "REMOVE",
            ref_no=row.transfer_number,
        )
        if not ok:
            raise HTTPException(400, "Insufficient stock")

    row.status = "DISPATCHED"
    row.dispatched_by = user.user_id
    row.dispatched_on = datetime.utcnow()
    if payload and payload.notes:
        row.notes = payload.notes
    db.commit()
    db.refresh(row)

    log_action(
        db,
        shop_id=user.shop_id,
        module="StockTransfers",
        action="DISPATCH",
        record_id=row.transfer_number,
        old={"status": "APPROVED"},
        new={"status": row.status},
        user_id=user.user_id,
    )

    return row


@router.post("/{transfer_id}/receive", response_model=StockTransferOut)
def receive_transfer(
    transfer_id: int,
    payload: StockTransferAction | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("stock_transfers", "write")),
):
    if not is_inventory_enabled(db, user.shop_id):
        raise HTTPException(400, "Inventory mode disabled")

    row = (
        db.query(StockTransfer)
        .filter(StockTransfer.shop_id == user.shop_id, StockTransfer.transfer_id == transfer_id)
        .first()
    )
    if not row:
        raise HTTPException(404, "Transfer not found")
    if row.status != "DISPATCHED":
        raise HTTPException(400, "Only DISPATCHED transfers can be received")

    if _role(user) != "admin" and int(user.branch_id) != int(row.to_branch_id):
        raise HTTPException(403, "Only TO branch can receive")

    for it in row.items:
        adjust_stock(
            db,
            user.shop_id,
            it.item_id,
            row.to_branch_id,
            int(it.quantity),
            "ADD",
            ref_no=row.transfer_number,
        )

    row.status = "RECEIVED"
    row.received_by = user.user_id
    row.received_on = datetime.utcnow()
    if payload and payload.notes:
        row.notes = payload.notes
    db.commit()
    db.refresh(row)

    log_action(
        db,
        shop_id=user.shop_id,
        module="StockTransfers",
        action="RECEIVE",
        record_id=row.transfer_number,
        old={"status": "DISPATCHED"},
        new={"status": row.status},
        user_id=user.user_id,
    )

    return row


@router.post("/{transfer_id}/cancel", response_model=StockTransferOut)
def cancel_transfer(
    transfer_id: int,
    payload: StockTransferAction | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("stock_transfers", "delete")),
):
    row = (
        db.query(StockTransfer)
        .filter(StockTransfer.shop_id == user.shop_id, StockTransfer.transfer_id == transfer_id)
        .first()
    )
    if not row:
        raise HTTPException(404, "Transfer not found")

    if row.status not in {"REQUESTED", "APPROVED"}:
        raise HTTPException(400, "Only REQUESTED/APPROVED transfers can be cancelled")

    if _role(user) != "admin" and int(row.requested_by or 0) != int(user.user_id):
        raise HTTPException(403, "Not allowed")

    old_status = row.status
    row.status = "CANCELLED"
    if payload and payload.notes:
        row.notes = payload.notes
    db.commit()
    db.refresh(row)

    log_action(
        db,
        shop_id=user.shop_id,
        module="StockTransfers",
        action="CANCEL",
        record_id=row.transfer_number,
        old={"status": old_status},
        new={"status": row.status},
        user_id=user.user_id,
    )

    return row
