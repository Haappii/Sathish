from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from app.db import get_db
from app.utils.auth_user import get_current_user
from app.models.shop_details import ShopDetails
from app.models.system_parameters import SystemParameter
from app.schemas.shop import ShopDetailsBase, ShopDetailsResponse

router = APIRouter(prefix="/shop", tags=["Shop"])


def require_super_admin(role: str | None):
    if role != "Super Admin":
        raise HTTPException(403, "Only Super Admin can modify inventory mode")


@router.get("/details")
def get_shop_details(
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):

    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == user.shop_id).first()

    param = db.query(SystemParameter).filter(
        SystemParameter.shop_id == user.shop_id,
        SystemParameter.param_key == "inventory_enabled"
    ).first()

    inventory_enabled = param and param.param_value.upper() == "YES"

    return {
        **(shop.__dict__ if shop else {}),
        "inventory_enabled": inventory_enabled
    }


@router.post("/", response_model=ShopDetailsResponse)
def save_shop_details(
    data: ShopDetailsBase,
    db: Session = Depends(get_db),
    x_user_role: str | None = Header(None),
    user=Depends(get_current_user)
):

    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == user.shop_id).first() or ShopDetails(shop_id=user.shop_id)

    for k, v in data.dict(exclude_unset=True).items():
        setattr(shop, k, v)

    db.add(shop)

    # 🔹 handle inventory flag separately
    if "inventory_enabled" in data.dict():
        require_super_admin(x_user_role)

        param = db.query(SystemParameter).filter(
            SystemParameter.shop_id == user.shop_id,
            SystemParameter.param_key == "inventory_enabled"
        ).first()

        if not param:
            param = SystemParameter(shop_id=user.shop_id, param_key="inventory_enabled")

        param.param_value = "YES" if data.inventory_enabled else "NO"
        db.add(param)

    db.commit()
    db.refresh(shop)
    return shop
