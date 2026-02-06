from sqlalchemy.orm import Session
from app.models.branch import Branch
from app.schemas.branch_schema import BranchCreate, BranchUpdate


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
        **data.dict(),
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
