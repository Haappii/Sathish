from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import case
from sqlalchemy.orm import Session

from app.models.item_lot import ItemLot


def _q2(v: Decimal) -> Decimal:
    return v.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _as_decimal(value) -> Decimal:
    if value is None:
        return Decimal("0.00")
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except Exception:
        return Decimal("0.00")


def consume_lots_fifo(
    db: Session,
    *,
    shop_id: int,
    branch_id: int,
    item_id: int,
    quantity: int,
    fallback_unit_cost,
    source_ref: str | None,
) -> Decimal:
    """
    Reduce ItemLot.quantity for the given item/branch using FEFO (expiry first),
    then FIFO (created_at/lot_id). Returns weighted average unit cost for the consumed qty.

    Best effort:
    - If no lots exist, returns fallback_unit_cost.
    - If lots exist but insufficient qty, consumes what is available and uses fallback for remainder.
    """

    qty = int(quantity or 0)
    if qty <= 0:
        return _q2(_as_decimal(fallback_unit_cost))

    fallback = _q2(_as_decimal(fallback_unit_cost))

    lots = (
        db.query(ItemLot)
        .filter(
            ItemLot.shop_id == shop_id,
            ItemLot.branch_id == branch_id,
            ItemLot.item_id == item_id,
            ItemLot.quantity > 0,
        )
        .order_by(
            case((ItemLot.expiry_date.is_(None), 1), else_=0).asc(),
            ItemLot.expiry_date.asc(),
            ItemLot.created_at.asc(),
            ItemLot.lot_id.asc(),
        )
        .all()
    )

    if not lots:
        return fallback

    remaining = qty
    total_cost = Decimal("0.00")
    total_qty = 0

    for lot in lots:
        if remaining <= 0:
            break
        available = int(lot.quantity or 0)
        if available <= 0:
            continue
        take = available if available <= remaining else remaining
        unit_cost = _q2(_as_decimal(lot.unit_cost)) if lot.unit_cost is not None else fallback
        total_cost += unit_cost * Decimal(take)
        total_qty += take
        remaining -= take
        lot.quantity = int(available - take)

    if remaining > 0:
        total_cost += fallback * Decimal(remaining)
        total_qty += remaining

    if total_qty <= 0:
        return fallback

    return _q2(total_cost / Decimal(total_qty))


def add_lot(
    db: Session,
    *,
    shop_id: int,
    branch_id: int,
    item_id: int,
    quantity: int,
    unit_cost,
    source_type: str | None,
    source_ref: str | None,
    batch_no: str | None = None,
    expiry_date=None,
    serial_no: str | None = None,
    created_by: int | None = None,
) -> ItemLot:
    lot = ItemLot(
        shop_id=shop_id,
        branch_id=branch_id,
        item_id=item_id,
        source_type=source_type,
        source_ref=source_ref,
        batch_no=batch_no,
        expiry_date=expiry_date,
        serial_no=serial_no,
        quantity=int(quantity or 0),
        unit_cost=_q2(_as_decimal(unit_cost)) if unit_cost is not None else None,
        created_by=created_by,
    )
    db.add(lot)
    return lot


def remove_return_lots(
    db: Session,
    *,
    shop_id: int,
    branch_id: int,
    item_id: int,
    quantity: int,
    return_number: str,
) -> None:
    """
    Reverse lots created by a return (source_type=RETURN, source_ref=return_number).
    Raises ValueError if insufficient lot qty to remove.
    """
    qty = int(quantity or 0)
    if qty <= 0:
        return

    lots = (
        db.query(ItemLot)
        .filter(
            ItemLot.shop_id == shop_id,
            ItemLot.branch_id == branch_id,
            ItemLot.item_id == item_id,
            ItemLot.source_type == "RETURN",
            ItemLot.source_ref == return_number,
            ItemLot.quantity > 0,
        )
        .order_by(ItemLot.lot_id.desc())
        .all()
    )

    remaining = qty
    for lot in lots:
        if remaining <= 0:
            break
        available = int(lot.quantity or 0)
        take = available if available <= remaining else remaining
        lot.quantity = int(available - take)
        remaining -= take

    if remaining > 0:
        raise ValueError("Insufficient return lot quantity to reverse")

