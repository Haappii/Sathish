from datetime import datetime
from sqlalchemy.orm import Session

from app.models.day_close import BranchDayClose


def is_branch_day_closed(db: Session, shop_id: int, branch_id: int, dt):
    if not dt:
        return False
    if isinstance(dt, str):
        try:
            dt = datetime.strptime(dt, "%Y-%m-%d").date()
        except ValueError:
            return False
    date_value = dt.date() if hasattr(dt, "date") else dt
    return (
        db.query(BranchDayClose)
        .filter(
            BranchDayClose.shop_id == shop_id,
            BranchDayClose.branch_id == branch_id,
            BranchDayClose.close_date == date_value
        )
        .first()
        is not None
    )
