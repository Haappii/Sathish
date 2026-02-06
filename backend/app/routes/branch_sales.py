from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, date

from app.db import get_db
from app.models.invoice import Invoice
from app.models.branch import Branch
from app.utils.auth_user import get_current_user

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.get("/branch-sales")
def branch_sales(
    mode: str = Query("today"),
    from_date: str | None = None,
    to_date: str | None = None,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):

    today = date.today()
    conditions = []

    if mode == "today":
        conditions.append(func.date(Invoice.created_time) == today)

    elif mode == "month":
        conditions.append(func.extract("year", Invoice.created_time) == today.year)
        conditions.append(func.extract("month", Invoice.created_time) == today.month)

    elif mode == "custom":
        if not from_date or not to_date:
            raise HTTPException(400, "from_date and to_date required")

        start = datetime.strptime(from_date, "%Y-%m-%d")
        end   = datetime.strptime(to_date, "%Y-%m-%d")
        conditions.append(Invoice.created_time.between(start, end))

    rows = (
        db.query(
            Branch.branch_id,
            Branch.branch_name,
            func.coalesce(func.sum(Invoice.total_amount), 0).label("total_sales")
        )
        .join(Branch, Branch.branch_id == Invoice.branch_id)
        .filter(Invoice.shop_id == user.shop_id, *conditions)
        .group_by(Branch.branch_id, Branch.branch_name)
        .all()
    )

    return [
        {
            "branch_id": r.branch_id,
            "branch_name": r.branch_name,
            "total_sales": float(r.total_sales)
        }
        for r in rows
    ]
