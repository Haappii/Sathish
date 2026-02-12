from fastapi import APIRouter, Depends, HTTPException, Header, UploadFile, File
from sqlalchemy.orm import Session
from app.db import get_db
from app.utils.auth_user import get_current_user
from app.models.shop_details import ShopDetails
from app.models.system_parameters import SystemParameter
from app.schemas.shop import ShopDetailsBase, ShopDetailsResponse
from app.utils.shop_logo import SHOP_LOGOS_DIR, build_logo_filename, save_shop_logo_file

router = APIRouter(prefix="/shop", tags=["Shop"])


def require_super_admin(role: str | None):
    role_l = (role or "").strip().lower()
    if role_l not in {"admin", "super admin"}:
        raise HTTPException(403, "Only Admin can modify inventory mode")


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

    payload = data.dict(exclude_unset=True)
    shop_payload = {k: v for k, v in payload.items() if k != "inventory_enabled"}

    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == user.shop_id).first() or ShopDetails(shop_id=user.shop_id)

    prev_shop_name = shop.shop_name

    for k, v in shop_payload.items():
        setattr(shop, k, v)

    db.add(shop)

    # Keep logo filename aligned with shop_name changes
    if prev_shop_name and shop.shop_name and prev_shop_name.strip() != shop.shop_name.strip():
        try:
            SHOP_LOGOS_DIR.mkdir(parents=True, exist_ok=True)
            new_filename = build_logo_filename(shop.shop_name, shop.shop_id)
            new_path = SHOP_LOGOS_DIR / new_filename

            if not new_path.exists():
                existing = next(SHOP_LOGOS_DIR.glob(f"logo_*_{shop.shop_id}.png"), None)
                if existing and existing.exists():
                    existing.rename(new_path)

            if new_path.exists():
                shop.logo_url = new_filename
        except Exception:
            pass

    # 🔹 handle inventory flag separately
    if "inventory_enabled" in payload:
        require_super_admin(x_user_role)

        param = db.query(SystemParameter).filter(
            SystemParameter.shop_id == user.shop_id,
            SystemParameter.param_key == "inventory_enabled"
        ).first()

        if not param:
            param = SystemParameter(shop_id=user.shop_id, param_key="inventory_enabled")

        param.param_value = "YES" if bool(data.inventory_enabled) else "NO"
        db.add(param)

    db.commit()
    db.refresh(shop)
    return shop


@router.post("/logo")
def upload_shop_logo(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    shop = (
        db.query(ShopDetails)
        .filter(ShopDetails.shop_id == user.shop_id)
        .first()
        or ShopDetails(shop_id=user.shop_id)
    )

    filename = save_shop_logo_file(
        shop_id=user.shop_id,
        shop_name=shop.shop_name,
        file=file
    )

    shop.logo_url = filename
    db.add(shop)
    db.commit()
    db.refresh(shop)

    return {
        "message": "Logo uploaded",
        "shop_id": shop.shop_id,
        "logo_url": shop.logo_url
    }
