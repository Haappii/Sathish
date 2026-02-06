from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.system_parameters import SystemParameters
from app.utils.auth_user import get_current_user

router = APIRouter(prefix="/parameters", tags=["System Parameters"])




# GET INVENTORY MODE STATUS
# ---------------------------
@router.get("/inventory")
def get_inventory_flag(
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):

    row = (
        db.query(SystemParameters)
        .filter(
            SystemParameters.shop_id == user.shop_id,
            SystemParameters.param_key == "inventory_enabled"
        )
        .first()
    )

    if not row:
        # default OFF if not configured
        return {"enabled": False, "value": "NO"}

    value = (row.param_value or "").strip().upper()

    return {
        "enabled": value == "YES",
        "value": value
    }
