from fastapi import APIRouter, Depends, HTTPException, Header, UploadFile, File
from sqlalchemy.orm import Session
from app.db import get_db
from app.utils.auth_user import get_current_user
from app.models.shop_details import ShopDetails
from app.models.system_parameters import SystemParameter
from app.schemas.shop import ShopDetailsBase, ShopDetailsResponse
from app.utils.shop_logo import SHOP_LOGOS_DIR, build_logo_filename, save_shop_logo_file

router = APIRouter(prefix="/shop", tags=["Shop"])

BOOL_PARAM_KEYS = {
    "inventory_enabled",
    "swiggy_enabled",
    "zomato_enabled",
    "online_orders_auto_accept",
}
TEXT_PARAM_KEYS = {
    "swiggy_partner_id",
    "zomato_partner_id",
    "online_orders_webhook_token",
}
SHOP_PARAM_KEYS = BOOL_PARAM_KEYS | TEXT_PARAM_KEYS


def require_super_admin(role: str | None):
    role_l = (role or "").strip().lower()
    if role_l not in {"admin", "super admin"}:
        raise HTTPException(403, "Only Admin can modify protected shop settings")


def _get_param(db: Session, shop_id: int, key: str):
    return (
        db.query(SystemParameter)
        .filter(SystemParameter.shop_id == shop_id, SystemParameter.param_key == key)
        .first()
    )


def _set_param(db: Session, shop_id: int, key: str, value: str):
    row = _get_param(db, shop_id, key)
    if not row:
        row = SystemParameter(shop_id=shop_id, param_key=key)
    row.param_value = value
    db.add(row)


@router.get("/details")
def get_shop_details(
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):

    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == user.shop_id).first()

    params = (
        db.query(SystemParameter)
        .filter(
            SystemParameter.shop_id == user.shop_id,
            SystemParameter.param_key.in_(list(SHOP_PARAM_KEYS)),
        )
        .all()
    )
    pmap = {str(r.param_key): (r.param_value or "") for r in params}

    return {
        **(shop.__dict__ if shop else {}),
        "inventory_enabled": str(pmap.get("inventory_enabled", "NO")).upper() == "YES",
        "swiggy_partner_id": pmap.get("swiggy_partner_id") or None,
        "zomato_partner_id": pmap.get("zomato_partner_id") or None,
        "swiggy_enabled": str(pmap.get("swiggy_enabled", "NO")).upper() == "YES",
        "zomato_enabled": str(pmap.get("zomato_enabled", "NO")).upper() == "YES",
        "online_orders_auto_accept": str(pmap.get("online_orders_auto_accept", "NO")).upper() == "YES",
        "online_orders_webhook_token": pmap.get("online_orders_webhook_token") or None,
    }


@router.post("/", response_model=ShopDetailsResponse)
def save_shop_details(
    data: ShopDetailsBase,
    db: Session = Depends(get_db),
    x_user_role: str | None = Header(None),
    user=Depends(get_current_user)
):

    payload = data.dict(exclude_unset=True)
    shop_payload = {k: v for k, v in payload.items() if k not in SHOP_PARAM_KEYS}

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
    if any(k in payload for k in SHOP_PARAM_KEYS):
        require_super_admin(x_user_role)
        for key in SHOP_PARAM_KEYS:
            if key not in payload:
                continue
            value = payload.get(key)
            if key in BOOL_PARAM_KEYS:
                _set_param(db, user.shop_id, key, "YES" if bool(value) else "NO")
            else:
                _set_param(db, user.shop_id, key, str(value or "").strip())

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
