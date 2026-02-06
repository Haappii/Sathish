from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models.branch import Branch
from app.schemas.branch_schema import BranchCreate, BranchUpdate, BranchOut
from app.services.branch_service import (
    get_all_branches,
    get_active_branches,
    create_branch,
    update_branch,
    set_branch_status
)
from app.utils.auth_user import get_current_user, AdminOnly


router = APIRouter(prefix="/branch", tags=["Branch"])


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# =========================================================
# 🔹 ADMIN — List all branches
# =========================================================
@router.get("/list", response_model=list[BranchOut], dependencies=[Depends(AdminOnly)])
def list_branches(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return get_all_branches(db, user.shop_id)


# =========================================================
# 🔹 Public — Only ACTIVE branches (for dropdowns)
# =========================================================
@router.get("/active", response_model=list[BranchOut])
def active_branches(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return get_active_branches(db, user.shop_id)


# =========================================================
# 🔹 NEW — Get single branch (Footer address & details)
# =========================================================
@router.get("/{branch_id}", response_model=BranchOut)
def get_branch(branch_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):

    branch = (
        db.query(Branch)
        .filter(Branch.branch_id == branch_id, Branch.shop_id == user.shop_id)
        .first()
    )

    if not branch:
        raise HTTPException(404, "Branch not found")

    return branch


# =========================================================
# 🔹 Create Branch (Admin Only)
# =========================================================
@router.post("/create", response_model=BranchOut, dependencies=[Depends(AdminOnly)])
def create(
    data: BranchCreate,
    db: Session = Depends(get_db),
    user = Depends(get_current_user)
):
    return create_branch(db, data, user.user_id, user.shop_id)


# =========================================================
# 🔹 Update Branch (Admin Only)
# =========================================================
@router.put("/{branch_id}", response_model=BranchOut, dependencies=[Depends(AdminOnly)])
def update(branch_id: int, data: BranchUpdate,
           db: Session = Depends(get_db),
           user=Depends(get_current_user)):

    branch = update_branch(db, user.shop_id, branch_id, data)
    if not branch:
        raise HTTPException(404, "Branch not found")

    return branch


# =========================================================
# 🔹 Change Branch Status (Activate / Deactivate)
# =========================================================
@router.post("/{branch_id}/status", dependencies=[Depends(AdminOnly)])
def change_status(branch_id: int, status: str,
                  db: Session = Depends(get_db),
                  user=Depends(get_current_user)):

    branch = set_branch_status(db, user.shop_id, branch_id, status)
    if not branch:
        raise HTTPException(404, "Branch not found")

    return {"message": "Updated", "status": status}
