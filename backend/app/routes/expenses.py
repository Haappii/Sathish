from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime

from app.db import get_db
from app.models.branch_expense import BranchExpense
from app.models.shop_details import ShopDetails
from app.schemas.expense import ExpenseCreate, ExpenseResponse
from app.services.day_close_service import is_branch_day_closed
from app.services.audit_service import log_action
from app.utils.permissions import require_permission

router = APIRouter(prefix="/expenses", tags=["Expenses"])


def resolve_branch(branch_id_param, user) -> int:
    role = str(getattr(user, "role_name", "") or "").strip().lower()
    if role == "admin":
        branch_raw = branch_id_param if branch_id_param not in (None, "") else getattr(user, "branch_id", None)
    else:
        branch_raw = getattr(user, "branch_id", None)

    try:
        return int(branch_raw)
    except (TypeError, ValueError):
        raise HTTPException(400, "Branch required")

def get_business_date(db: Session, shop_id: int):
    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == shop_id).first()
    return shop.app_date if shop and shop.app_date else datetime.utcnow().date()


@router.post("/", response_model=ExpenseResponse)
def create_expense(
    payload: ExpenseCreate,
    db: Session = Depends(get_db),
    user=Depends(require_permission("expenses", "write")),
):
    branch_id = resolve_branch(payload.branch_id, user)
    if branch_id is None:
        raise HTTPException(400, "Branch required")
    business_date = get_business_date(db, user.shop_id)
    if is_branch_day_closed(db, user.shop_id, branch_id, business_date):
        raise HTTPException(403, "Day closed for this branch")

    expense = BranchExpense(
        shop_id=user.shop_id,
        branch_id=branch_id,
        expense_date=business_date,
        amount=payload.amount,
        category=payload.category,
        payment_mode=payload.payment_mode,
        note=payload.note,
        created_by=user.user_id
    )

    db.add(expense)
    db.commit()
    db.refresh(expense)

    log_action(
        db,
        shop_id=user.shop_id,
        module="Expenses",
        action="CREATE",
        record_id=expense.expense_id if hasattr(expense, "expense_id") else f"{expense.branch_id}:{expense.expense_date}",
        new={
            "branch_id": expense.branch_id,
            "expense_date": str(expense.expense_date),
            "amount": expense.amount,
            "category": expense.category,
            "payment_mode": expense.payment_mode,
        },
        user_id=user.user_id,
    )
    return expense


@router.get("/list", response_model=list[ExpenseResponse])
def list_expenses(
    from_date: str,
    to_date: str,
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("expenses", "read")),
):
    try:
        f = datetime.strptime(from_date, "%Y-%m-%d").date()
        t = datetime.strptime(to_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "Invalid date format YYYY-MM-DD")

    role = str(getattr(user, "role_name", "") or "").strip().lower()
    bid = resolve_branch(branch_id, user) if role != "admin" or branch_id is not None else None

    q = (
        db.query(BranchExpense)
        .filter(
            BranchExpense.shop_id == user.shop_id,
            BranchExpense.expense_date.between(f, t),
        )
        .order_by(BranchExpense.expense_date.desc())
    )
    if bid is not None:
        q = q.filter(BranchExpense.branch_id == bid)

    return q.all()
