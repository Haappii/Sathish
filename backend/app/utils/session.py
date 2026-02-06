from sqlalchemy.orm import Session
from app.db import SessionLocal
from app.models.users import User


def update_user_session_branch(
    user_id: int,
    branch_id: int,
    branch_name: str
):
    """
    Persist selected branch to the user so that
    all future APIs use the same branch context.
    """

    db: Session = SessionLocal()

    try:
        user = db.query(User).filter(User.user_id == user_id).first()
        if not user:
            return False

        user.branch_id = branch_id
        # optional — if you want to store name also
        # user.branch_name = branch_name

        db.commit()
        return True

    finally:
        db.close()
