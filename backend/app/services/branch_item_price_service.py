from app.models.branch_item_price import BranchItemPrice
from sqlalchemy.orm import Session


def upsert_branch_item_price(
    db: Session,
    *,
    shop_id: int,
    branch_id: int,
    item_id: int,
    price: float,
    buy_price: float,
    mrp_price: float,
    item_status: bool = True,
):
    row = (
        db.query(BranchItemPrice)
        .filter(
            BranchItemPrice.shop_id == shop_id,
            BranchItemPrice.branch_id == branch_id,
            BranchItemPrice.item_id == item_id,
        )
        .first()
    )
    if row:
        row.price = price
        row.buy_price = buy_price
        row.mrp_price = mrp_price
        row.item_status = item_status
    else:
        row = BranchItemPrice(
            shop_id=shop_id,
            branch_id=branch_id,
            item_id=item_id,
            price=price,
            buy_price=buy_price,
            mrp_price=mrp_price,
            item_status=item_status,
        )
        db.add(row)
    db.flush()
    return row


def branch_price_map(db: Session, *, shop_id: int, branch_id: int, item_ids: list[int]) -> dict[int, BranchItemPrice]:
    if not item_ids:
        return {}
    rows = (
        db.query(BranchItemPrice)
        .filter(
            BranchItemPrice.shop_id == shop_id,
            BranchItemPrice.branch_id == branch_id,
            BranchItemPrice.item_id.in_(item_ids),
        )
        .all()
    )
    return {int(r.item_id): r for r in rows}
