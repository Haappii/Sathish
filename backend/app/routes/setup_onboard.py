from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.shop_details import ShopDetails
from app.models.branch import Branch
from app.models.roles import Role
from app.models.users import User
from app.models.onboard_codes import OnboardCode
from app.utils.passwords import encode_password

router = APIRouter(prefix="/setup", tags=["Setup Onboard"])


class SetupOnboardRequest(BaseModel):
    verification_code: str
    shop_name: str
    owner_name: str | None = None
    mobile: str | None = None
    mailid: str | None = None
    gst_number: str | None = None
    billing_type: str | None = "store"
    gst_enabled: bool | None = False
    gst_percent: float | None = 0
    gst_mode: str | None = "inclusive"
    logo_url: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    address_line3: str | None = None
    city: str | None = None
    state: str | None = None
    pincode: str | None = None

    branch_name: str
    branch_address_line1: str | None = None
    branch_address_line2: str | None = None
    branch_city: str | None = None
    branch_state: str | None = None
    branch_country: str | None = None
    branch_pincode: str | None = None

    admin_username: str
    admin_password: str
    admin_name: str | None = None


@router.post("/onboard")
def setup_onboard(payload: SetupOnboardRequest, db: Session = Depends(get_db)):
    code_row = db.query(OnboardCode).filter(
        OnboardCode.code == payload.verification_code.strip(),
        OnboardCode.is_used == False  # noqa: E712
    ).first()
    if not code_row:
        raise HTTPException(403, "Invalid or already used verification code")
    if not payload.shop_name.strip():
        raise HTTPException(400, "Shop name is required")
    if not payload.branch_name.strip():
        raise HTTPException(400, "Branch name is required")
    if not payload.admin_username.strip() or not payload.admin_password:
        raise HTTPException(400, "Admin username/password is required")

    try:
        # Ensure Admin role exists
        admin_role = db.query(Role).filter(Role.role_name == "Admin").first()
        if not admin_role:
            admin_role = Role(role_name="Admin", status=True)
            db.add(admin_role)
            db.commit()
            db.refresh(admin_role)

        # Create shop
        shop = ShopDetails(
            shop_name=payload.shop_name.strip(),
            owner_name=payload.owner_name,
            mobile=payload.mobile,
            mailid=payload.mailid,
            gst_number=payload.gst_number,
            billing_type=payload.billing_type or "store",
            gst_enabled=bool(payload.gst_enabled),
            gst_percent=payload.gst_percent or 0,
            gst_mode=payload.gst_mode or "inclusive",
            logo_url=payload.logo_url,
            address_line1=payload.address_line1,
            address_line2=payload.address_line2,
            address_line3=payload.address_line3,
            city=payload.city,
            state=payload.state,
            pincode=payload.pincode,
        )
        db.add(shop)
        db.commit()
        db.refresh(shop)

        # Create head office branch
        branch = Branch(
            shop_id=shop.shop_id,
            branch_name=payload.branch_name.strip(),
            address_line1=payload.branch_address_line1,
            address_line2=payload.branch_address_line2,
            city=payload.branch_city,
            state=payload.branch_state,
            country=payload.branch_country,
            pincode=payload.branch_pincode,
            type="Head Office",
            status="ACTIVE",
            branch_close="N"
        )
        db.add(branch)
        db.commit()
        db.refresh(branch)

        # Ensure username unique within shop
        exists = db.query(User).filter(
            User.shop_id == shop.shop_id,
            User.user_name == payload.admin_username.strip()
        ).first()
        if exists:
            raise HTTPException(400, "Admin username already exists")

        # Create admin user
        user = User(
            shop_id=shop.shop_id,
            user_name=payload.admin_username.strip(),
            password=encode_password(payload.admin_password),
            name=payload.admin_name or payload.admin_username.strip(),
            role=admin_role.role_id,
            status=True,
            branch_id=branch.branch_id
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        code_row.is_used = True
        code_row.used_at = datetime.utcnow()
        code_row.used_shop_id = shop.shop_id
        db.commit()

        return {
            "success": True,
            "shop_id": shop.shop_id,
            "branch_id": branch.branch_id,
            "admin_user_id": user.user_id
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Setup failed: {str(e)}")
