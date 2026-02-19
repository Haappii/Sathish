from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from pydantic import BaseModel
from typing import Optional

from app.db import SessionLocal
from app.services.branch_service import get_branch
from app.utils.auth_user import get_current_user
from app.utils.session import update_user_session_branch   # 👈 must exist

router = APIRouter(prefix="/auth", tags=["Auth-Branch"])


class BranchSwitchRequest(BaseModel):
    branch_id: int


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/set-branch")
def set_branch(
    payload: Optional[BranchSwitchRequest] = Body(None),
    branch_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user = Depends(get_current_user)
):
    resolved_branch_id = (
        branch_id
        if branch_id is not None
        else (payload.branch_id if payload else None)
    )

    if resolved_branch_id is None:
        raise HTTPException(422, "branch_id is required")

    role_lower = str(getattr(user, "role_name", "") or "").strip().lower()
    if role_lower != "admin":
        # Non-admin users are locked to their assigned branch.
        try:
            user_branch_id = int(getattr(user, "branch_id", None))
        except (TypeError, ValueError):
            raise HTTPException(400, "Branch required")
        if int(resolved_branch_id) != user_branch_id:
            raise HTTPException(403, "Only Admin can switch branches")

    branch = get_branch(db, user.shop_id, resolved_branch_id)

    if not branch or branch.status != "ACTIVE":
        raise HTTPException(400, "Invalid or inactive branch")

    update_user_session_branch(
        user.user_id,
        branch.branch_id,
        branch.branch_name
    )

    return {
        "message": "Branch switched",
        "branch_id": branch.branch_id,
        "branch_name": branch.branch_name
    }
