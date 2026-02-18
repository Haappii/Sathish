from __future__ import annotations

import secrets
from datetime import date, datetime
from mimetypes import guess_type
from pathlib import Path
from datetime import timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.branch import Branch
from app.models.platform_onboard_request import PlatformOnboardRequest
from app.models.platform_user import PlatformUser
from app.models.roles import Role
from app.models.shop_details import ShopDetails
from app.models.support_ticket import SupportTicket
from app.models.users import User
from app.utils.jwt_token import create_access_token
from app.utils.passwords import encode_password, password_needs_upgrade, verify_password
from app.utils.platform_owner_auth import PlatformOwnerOnly


router = APIRouter(prefix="/platform", tags=["Platform Owner"])

SUPPORT_UPLOADS_DIR = Path("uploads") / "support"
SUPPORT_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


class PlatformLoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=200)


@router.post("/auth/login")
def platform_login(payload: PlatformLoginIn, db: Session = Depends(get_db)):
    username = (payload.username or "").strip()
    password = payload.password or ""
    if not username or not password:
        raise HTTPException(400, "Username and password required")

    # Seed the initial platform owner user on first run.
    any_user = db.query(PlatformUser.platform_user_id).first()
    if any_user is None:
        db.add(
            PlatformUser(
                username="Admin",
                password=encode_password("admin123"),
                status=True,
            )
        )
        db.commit()

    user = (
        db.query(PlatformUser)
        .filter(PlatformUser.username == username, PlatformUser.status == True)
        .first()
    )
    if not user:
        raise HTTPException(403, "Invalid username or password")

    if not verify_password(password, user.password):
        raise HTTPException(403, "Invalid username or password")

    if password_needs_upgrade(user.password):
        user.password = encode_password(password)
        db.commit()

    token = create_access_token(
        {
            "platform_owner": True,
            "platform_username": user.username,
            "platform_user_id": user.platform_user_id,
        }
    )
    return {"access_token": token, "token_type": "bearer"}


class OnboardRequestIn(BaseModel):
    requester_name: str | None = None
    requester_email: str | None = None
    requester_phone: str | None = None
    business: str | None = None
    message: str | None = None

    shop_name: str = Field(min_length=1, max_length=150)
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

    branch_name: str = Field(min_length=1, max_length=150)
    branch_address_line1: str | None = None
    branch_address_line2: str | None = None
    branch_city: str | None = None
    branch_state: str | None = None
    branch_country: str | None = None
    branch_pincode: str | None = None

    admin_username: str | None = None
    admin_name: str | None = None


@router.post("/onboard/requests")
def create_onboard_request(payload: OnboardRequestIn, db: Session = Depends(get_db)):
    row = PlatformOnboardRequest(
        status="PENDING",
        created_at=datetime.utcnow(),
        requester_name=(payload.requester_name or "").strip() or None,
        requester_email=(payload.requester_email or "").strip() or None,
        requester_phone=(payload.requester_phone or "").strip() or None,
        business=(payload.business or "").strip() or None,
        message=(payload.message or "").strip() or None,
        shop_name=payload.shop_name.strip(),
        owner_name=(payload.owner_name or "").strip() or None,
        mobile=(payload.mobile or "").strip() or None,
        mailid=(payload.mailid or "").strip() or None,
        gst_number=(payload.gst_number or "").strip() or None,
        billing_type=(payload.billing_type or "store"),
        gst_enabled=bool(payload.gst_enabled),
        gst_percent=payload.gst_percent or 0,
        gst_mode=(payload.gst_mode or "inclusive"),
        logo_url=(payload.logo_url or "").strip() or None,
        address_line1=payload.address_line1,
        address_line2=payload.address_line2,
        address_line3=payload.address_line3,
        city=payload.city,
        state=payload.state,
        pincode=payload.pincode,
        branch_name=payload.branch_name.strip(),
        branch_address_line1=payload.branch_address_line1,
        branch_address_line2=payload.branch_address_line2,
        branch_city=payload.branch_city,
        branch_state=payload.branch_state,
        branch_country=payload.branch_country,
        branch_pincode=payload.branch_pincode,
        admin_username=(payload.admin_username or "").strip() or None,
        admin_name=(payload.admin_name or "").strip() or None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"success": True, "request_id": row.request_id, "status": row.status}


@router.get("/onboard/requests")
def list_onboard_requests(
    status: str | None = Query(None),
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
    owner=Depends(PlatformOwnerOnly),
):
    q = db.query(PlatformOnboardRequest).order_by(PlatformOnboardRequest.request_id.desc())
    if status:
        q = q.filter(PlatformOnboardRequest.status == status.strip().upper())
    rows = q.limit(int(limit)).all()
    return rows


def _ensure_admin_role(db: Session) -> Role:
    admin_role = db.query(Role).filter(Role.role_name == "Admin").first()
    if admin_role:
        return admin_role
    admin_role = Role(role_name="Admin", status=True)
    db.add(admin_role)
    db.commit()
    db.refresh(admin_role)
    return admin_role


def _generate_password() -> str:
    # Short enough to type; strong enough for first login.
    return secrets.token_urlsafe(9)


@router.post("/onboard/requests/{request_id}/accept")
def accept_onboard_request(
    request_id: int,
    note: str | None = None,
    db: Session = Depends(get_db),
    owner=Depends(PlatformOwnerOnly),
):
    row = db.query(PlatformOnboardRequest).filter(PlatformOnboardRequest.request_id == request_id).first()
    if not row:
        raise HTTPException(404, "Request not found")
    if row.status != "PENDING":
        raise HTTPException(400, f"Request already {row.status}")

    admin_role = _ensure_admin_role(db)
    admin_username = (row.admin_username or "admin").strip()
    admin_password = _generate_password()

    try:
        shop = ShopDetails(
            shop_name=(row.shop_name or "").strip(),
            owner_name=row.owner_name,
            mobile=row.mobile,
            mailid=row.mailid,
            gst_number=row.gst_number,
            billing_type=row.billing_type or "store",
            gst_enabled=bool(row.gst_enabled),
            gst_percent=row.gst_percent or 0,
            gst_mode=row.gst_mode or "inclusive",
            logo_url=row.logo_url,
            address_line1=row.address_line1,
            address_line2=row.address_line2,
            address_line3=row.address_line3,
            city=row.city,
            state=row.state,
            pincode=row.pincode,
        )
        db.add(shop)
        db.commit()
        db.refresh(shop)

        branch = Branch(
            shop_id=shop.shop_id,
            branch_name=(row.branch_name or "").strip(),
            address_line1=row.branch_address_line1,
            address_line2=row.branch_address_line2,
            city=row.branch_city,
            state=row.branch_state,
            country=row.branch_country,
            pincode=row.branch_pincode,
            type="Head Office",
            status="ACTIVE",
            branch_close="N",
        )
        db.add(branch)
        db.commit()
        db.refresh(branch)

        exists = db.query(User).filter(User.shop_id == shop.shop_id, User.user_name == admin_username).first()
        if exists:
            raise HTTPException(400, "Admin username already exists")

        user = User(
            shop_id=shop.shop_id,
            user_name=admin_username,
            password=encode_password(admin_password),
            name=row.admin_name or admin_username,
            role=admin_role.role_id,
            status=True,
            branch_id=branch.branch_id,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        row.status = "ACCEPTED"
        row.decided_at = datetime.utcnow()
        row.decided_by = str(owner.get("platform_username") or "")
        row.decision_note = (note or "").strip() or None
        row.created_shop_id = shop.shop_id
        row.created_branch_id = branch.branch_id
        row.created_admin_user_id = user.user_id
        db.commit()
        db.refresh(row)

        return {
            "success": True,
            "request_id": row.request_id,
            "status": row.status,
            "shop_id": shop.shop_id,
            "branch_id": branch.branch_id,
            "admin_username": admin_username,
            "admin_password": admin_password,
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Setup failed: {str(e)}")


@router.post("/onboard/requests/{request_id}/reject")
def reject_onboard_request(
    request_id: int,
    note: str | None = None,
    db: Session = Depends(get_db),
    owner=Depends(PlatformOwnerOnly),
):
    row = db.query(PlatformOnboardRequest).filter(PlatformOnboardRequest.request_id == request_id).first()
    if not row:
        raise HTTPException(404, "Request not found")
    if row.status != "PENDING":
        raise HTTPException(400, f"Request already {row.status}")

    row.status = "REJECTED"
    row.decided_at = datetime.utcnow()
    row.decided_by = str(owner.get("platform_username") or "")
    row.decision_note = (note or "").strip() or None
    db.commit()
    db.refresh(row)
    return {"success": True, "request_id": row.request_id, "status": row.status}


@router.get("/support/tickets")
def platform_list_tickets(
    ticket_type: str | None = None,
    status: str | None = None,
    limit: int = 200,
    db: Session = Depends(get_db),
    owner=Depends(PlatformOwnerOnly),
):
    q = db.query(SupportTicket).order_by(SupportTicket.ticket_id.desc())
    if ticket_type:
        q = q.filter(SupportTicket.ticket_type == ticket_type.upper())
    if status:
        q = q.filter(SupportTicket.status == status.upper())
    return q.limit(min(max(int(limit), 1), 500)).all()


@router.post("/support/tickets/{ticket_id}/status")
def platform_update_ticket_status(
    ticket_id: int,
    new_status: str,
    db: Session = Depends(get_db),
    owner=Depends(PlatformOwnerOnly),
):
    row = db.query(SupportTicket).filter(SupportTicket.ticket_id == ticket_id).first()
    if not row:
        raise HTTPException(404, "Ticket not found")

    row.status = (new_status or "").strip().upper() or row.status
    db.commit()
    db.refresh(row)
    return {"success": True, "ticket_id": row.ticket_id, "status": row.status}


def _demo_expiry(days: int) -> date:
    d = int(days)
    if d < 1 or d > 365:
        raise HTTPException(400, "Expiry days must be between 1 and 365")
    return (datetime.utcnow().date() + timedelta(days=d))


@router.post("/demo/tickets/{ticket_id}/accept")
def accept_demo_ticket(
    ticket_id: int,
    days: int = Query(7, ge=1, le=365),
    db: Session = Depends(get_db),
    owner=Depends(PlatformOwnerOnly),
):
    t = db.query(SupportTicket).filter(SupportTicket.ticket_id == ticket_id).first()
    if not t:
        raise HTTPException(404, "Ticket not found")
    if str(t.ticket_type or "").upper() != "DEMO":
        raise HTTPException(400, "Not a demo ticket")
    if str(t.status or "").upper() != "OPEN":
        raise HTTPException(400, f"Ticket already {t.status}")

    expires_on = _demo_expiry(days)

    # Use business / name as shop name fallback.
    shop_name = (t.business or "").strip() or (t.user_name or "").strip() or f"Demo Shop {ticket_id}"
    admin_username = "admin"
    admin_password = _generate_password()

    admin_role = _ensure_admin_role(db)

    try:
        shop = ShopDetails(
            shop_name=shop_name,
            owner_name=t.user_name,
            mobile=getattr(t, "phone", None) or None,
            mailid=getattr(t, "email", None) or None,
            billing_type="store",
            gst_enabled=False,
            gst_percent=0,
            gst_mode="inclusive",
            is_demo=True,
            expires_on=expires_on,
        )
        db.add(shop)
        db.commit()
        db.refresh(shop)

        branch = Branch(
            shop_id=shop.shop_id,
            branch_name="Head Office",
            type="Head Office",
            status="ACTIVE",
            branch_close="N",
        )
        db.add(branch)
        db.commit()
        db.refresh(branch)

        user = User(
            shop_id=shop.shop_id,
            user_name=admin_username,
            password=encode_password(admin_password),
            name="Demo Admin",
            role=admin_role.role_id,
            status=True,
            branch_id=branch.branch_id,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        t.status = "RESOLVED"
        t.provisioned_shop_id = shop.shop_id
        t.provisioned_branch_id = branch.branch_id
        t.provisioned_admin_user_id = user.user_id
        t.provisioned_expires_on = expires_on
        t.decided_by = str(owner.get("platform_username") or "")
        t.decided_at = datetime.utcnow()
        db.commit()

        return {
            "success": True,
            "ticket_id": t.ticket_id,
            "shop_id": shop.shop_id,
            "branch_id": branch.branch_id,
            "admin_username": admin_username,
            "admin_password": admin_password,
            "expires_on": str(expires_on),
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Failed to provision demo: {str(e)}")


@router.post("/demo/tickets/{ticket_id}/reject")
def reject_demo_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    owner=Depends(PlatformOwnerOnly),
):
    t = db.query(SupportTicket).filter(SupportTicket.ticket_id == ticket_id).first()
    if not t:
        raise HTTPException(404, "Ticket not found")
    if str(t.ticket_type or "").upper() != "DEMO":
        raise HTTPException(400, "Not a demo ticket")
    if str(t.status or "").upper() != "OPEN":
        raise HTTPException(400, f"Ticket already {t.status}")

    t.status = "CLOSED"
    t.decided_by = str(owner.get("platform_username") or "")
    t.decided_at = datetime.utcnow()
    db.commit()
    return {"success": True, "ticket_id": t.ticket_id, "status": t.status}


@router.get("/support/tickets/{ticket_id}/attachment")
def platform_download_ticket_attachment(
    ticket_id: int,
    db: Session = Depends(get_db),
    owner=Depends(PlatformOwnerOnly),
):
    row = db.query(SupportTicket).filter(SupportTicket.ticket_id == ticket_id).first()
    if not row or not row.attachment_path:
        raise HTTPException(404, "Attachment not found")

    p = Path(row.attachment_path)
    try:
        resolved = p.resolve()
        resolved.relative_to(SUPPORT_UPLOADS_DIR.resolve())
    except Exception:
        raise HTTPException(400, "Invalid attachment path")

    if not resolved.exists():
        raise HTTPException(404, "Attachment file missing")

    mime_type, _ = guess_type(str(resolved))
    return FileResponse(
        str(resolved),
        filename=(row.attachment_filename or resolved.name),
        media_type=(mime_type or "application/octet-stream"),
    )
