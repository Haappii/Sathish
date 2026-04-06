from sqlalchemy.orm import Session

from app.models.branch import Branch
from app.models.shop_details import ShopDetails


def _legacy_head_office_branch(branches: list[Branch]) -> Branch | None:
    for branch in branches:
        branch_type = str(getattr(branch, "type", "") or "").strip().lower()
        branch_name = str(getattr(branch, "branch_name", "") or "").strip().lower()
        if "head" in branch_type or "head" in branch_name:
            return branch

    active = [
        branch for branch in branches
        if str(getattr(branch, "status", "ACTIVE") or "ACTIVE").strip().upper() == "ACTIVE"
    ]
    if active:
        active.sort(key=lambda row: int(getattr(row, "branch_id", 0) or 0))
        return active[0]

    return branches[0] if branches else None


def get_head_office_branch(
    db: Session,
    *,
    shop_id: int,
    shop: ShopDetails | None = None,
) -> Branch | None:
    shop_row = shop or (
        db.query(ShopDetails)
        .filter(ShopDetails.shop_id == shop_id)
        .first()
    )

    configured_branch_id = getattr(shop_row, "head_office_branch_id", None) if shop_row else None
    if configured_branch_id:
        branch = (
            db.query(Branch)
            .filter(Branch.shop_id == shop_id, Branch.branch_id == int(configured_branch_id))
            .first()
        )
        if branch and str(getattr(branch, "status", "ACTIVE") or "ACTIVE").strip().upper() == "ACTIVE":
            return branch

    branches = (
        db.query(Branch)
        .filter(Branch.shop_id == shop_id)
        .order_by(Branch.branch_id.asc())
        .all()
    )
    return _legacy_head_office_branch(branches)


def get_head_office_branch_id(
    db: Session,
    *,
    shop_id: int,
    shop: ShopDetails | None = None,
) -> int | None:
    branch = get_head_office_branch(db, shop_id=shop_id, shop=shop)
    return int(branch.branch_id) if branch else None


def is_head_office_branch(
    db: Session,
    *,
    shop_id: int,
    branch_id: int | None,
    shop: ShopDetails | None = None,
) -> bool:
    if branch_id is None:
        return False

    head_branch_id = get_head_office_branch_id(db, shop_id=shop_id, shop=shop)
    if head_branch_id is None:
        return False

    return int(head_branch_id) == int(branch_id)
