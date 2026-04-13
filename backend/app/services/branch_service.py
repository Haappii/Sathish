from sqlalchemy.orm import Session
from app.models.branch import Branch
from app.schemas.branch_schema import BranchCreate, BranchUpdate
from app.utils.branch_online_orders import BRANCH_ONLINE_ORDER_FIELDS

_DISCOUNT_FIELDS = {"discount_enabled", "discount_type", "discount_value"}
_PRINT_FIELDS = {
    "kot_required",
    "receipt_required",
    "paper_size",
    "fssai_number",
    "order_live_tracking_enabled",
    "invoice_whatsapp_enabled",
    "invoice_whatsapp_country_code",
}
_LOYALTY_FIELDS = {"loyalty_points_percentage"}
_PARAM_ONLY_FIELDS = _DISCOUNT_FIELDS | _PRINT_FIELDS | _LOYALTY_FIELDS | set(BRANCH_ONLINE_ORDER_FIELDS)


def get_all_branches(db: Session, shop_id: int):
    return (
        db.query(Branch)
        .filter(Branch.shop_id == shop_id)
        .order_by(Branch.branch_name)
        .all()
    )


def get_active_branches(db: Session, shop_id: int):
    return (
        db.query(Branch)
        .filter(Branch.shop_id == shop_id, Branch.status == "ACTIVE")
        .all()
    )


def get_branch(db: Session, shop_id: int, branch_id: int):
    return (
        db.query(Branch)
        .filter(Branch.shop_id == shop_id, Branch.branch_id == branch_id)
        .first()
    )


def create_branch(db: Session, data: BranchCreate, user_id: int, shop_id: int):
    branch = Branch(
        **data.dict(exclude=_PARAM_ONLY_FIELDS),
        shop_id=shop_id,
        created_by=user_id
    )
    db.add(branch)
    db.commit()
    db.refresh(branch)
    return branch


def update_branch(db: Session, shop_id: int, branch_id: int, data: BranchUpdate):
    branch = get_branch(db, shop_id, branch_id)
    if not branch:
        return None

    for k, v in data.dict(exclude_unset=True).items():
        if k in _PARAM_ONLY_FIELDS:
            continue
        if hasattr(branch, k):
            setattr(branch, k, v)

    db.commit()
    db.refresh(branch)
    return branch


def set_branch_status(db: Session, shop_id: int, branch_id: int, status: str):
    branch = get_branch(db, shop_id, branch_id)
    if not branch:
        return None

    branch.status = status
    db.commit()
    return branch
