from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.coupon import Coupon
from app.models.shop_details import ShopDetails
from app.schemas.coupons import CouponCreate, CouponUpdate, CouponOut, CouponValidateOut
from app.services.audit_service import log_action
from app.utils.permissions import require_permission

router = APIRouter(prefix="/coupons", tags=["Coupons"])


def _business_date(db: Session, shop_id: int) -> date:
    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == shop_id).first()
    if shop and shop.app_date:
        return shop.app_date
    return datetime.utcnow().date()


@router.get("/", response_model=list[CouponOut])
def list_coupons(
    db: Session = Depends(get_db),
    user=Depends(require_permission("coupons", "read")),
):
    return (
        db.query(Coupon)
        .filter(Coupon.shop_id == user.shop_id)
        .order_by(Coupon.coupon_id.desc())
        .all()
    )


@router.post("/", response_model=CouponOut)
def create_coupon(
    payload: CouponCreate,
    db: Session = Depends(get_db),
    user=Depends(require_permission("coupons", "write")),
):
    code = str(payload.code or "").strip().upper()
    if not code:
        raise HTTPException(400, "code is required")

    if (payload.discount_type or "").strip().upper() not in {"FLAT", "PERCENT"}:
        raise HTTPException(400, "discount_type must be FLAT or PERCENT")
    if float(payload.value or 0) <= 0:
        raise HTTPException(400, "value must be > 0")

    exists = (
        db.query(Coupon)
        .filter(Coupon.shop_id == user.shop_id, Coupon.code == code)
        .first()
    )
    if exists:
        raise HTTPException(400, "Coupon code already exists")

    c = Coupon(
        shop_id=user.shop_id,
        code=code,
        name=payload.name,
        discount_type=str(payload.discount_type or "FLAT").strip().upper(),
        value=float(payload.value or 0),
        min_bill_amount=float(payload.min_bill_amount) if payload.min_bill_amount is not None else None,
        max_discount=float(payload.max_discount) if payload.max_discount is not None else None,
        start_date=payload.start_date,
        end_date=payload.end_date,
        active=bool(payload.active),
        created_by=user.user_id,
    )
    db.add(c)
    db.commit()
    db.refresh(c)

    log_action(
        db,
        shop_id=user.shop_id,
        module="Coupons",
        action="CREATE",
        record_id=c.code,
        new={
            "coupon_id": c.coupon_id,
            "discount_type": c.discount_type,
            "value": float(c.value or 0),
            "active": bool(c.active),
        },
        user_id=user.user_id,
    )

    return c


@router.put("/{coupon_id}", response_model=CouponOut)
def update_coupon(
    coupon_id: int,
    payload: CouponUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_permission("coupons", "write")),
):
    c = (
        db.query(Coupon)
        .filter(Coupon.coupon_id == coupon_id, Coupon.shop_id == user.shop_id)
        .first()
    )
    if not c:
        raise HTTPException(404, "Coupon not found")

    old = {
        "name": c.name,
        "discount_type": c.discount_type,
        "value": float(c.value or 0),
        "active": bool(c.active),
    }

    data = payload.model_dump(exclude_unset=True)
    if "discount_type" in data:
        dt = str(data["discount_type"] or "").strip().upper()
        if dt not in {"FLAT", "PERCENT"}:
            raise HTTPException(400, "discount_type must be FLAT or PERCENT")
        data["discount_type"] = dt
    if "value" in data and data["value"] is not None and float(data["value"] or 0) <= 0:
        raise HTTPException(400, "value must be > 0")

    for k, v in data.items():
        setattr(c, k, v)

    db.commit()
    db.refresh(c)

    log_action(
        db,
        shop_id=user.shop_id,
        module="Coupons",
        action="UPDATE",
        record_id=c.code,
        old=old,
        new={
            "name": c.name,
            "discount_type": c.discount_type,
            "value": float(c.value or 0),
            "active": bool(c.active),
        },
        user_id=user.user_id,
    )

    return c


@router.delete("/{coupon_id}")
def deactivate_coupon(
    coupon_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("coupons", "write")),
):
    c = (
        db.query(Coupon)
        .filter(Coupon.coupon_id == coupon_id, Coupon.shop_id == user.shop_id)
        .first()
    )
    if not c:
        raise HTTPException(404, "Coupon not found")

    prev = bool(c.active)
    c.active = False
    db.commit()

    log_action(
        db,
        shop_id=user.shop_id,
        module="Coupons",
        action="DISABLE",
        record_id=c.code,
        old={"active": prev},
        new={"active": bool(c.active)},
        user_id=user.user_id,
    )

    return {"success": True}


@router.get("/validate/{code}", response_model=CouponValidateOut)
def validate_coupon(
    code: str,
    amount: float = Query(..., ge=0),
    db: Session = Depends(get_db),
    user=Depends(require_permission("coupons", "read")),
):
    code_u = str(code or "").strip().upper()
    if not code_u:
        return {"valid": False, "message": "Invalid code", "discount_amount": 0}

    c = (
        db.query(Coupon)
        .filter(Coupon.shop_id == user.shop_id, Coupon.code == code_u)
        .first()
    )
    if not c or not bool(c.active):
        return {"valid": False, "message": "Coupon not found", "discount_amount": 0}

    today = _business_date(db, user.shop_id)
    if c.start_date and today < c.start_date:
        return {"valid": False, "message": "Coupon not active yet", "discount_amount": 0}
    if c.end_date and today > c.end_date:
        return {"valid": False, "message": "Coupon expired", "discount_amount": 0}

    min_amt = float(c.min_bill_amount or 0)
    if min_amt and float(amount or 0) < min_amt:
        return {
            "valid": False,
            "message": f"Minimum bill amount is {min_amt:.2f}",
            "discount_amount": 0,
        }

    disc = 0.0
    dtype = str(c.discount_type or "").strip().upper()
    val = float(c.value or 0)
    if dtype == "PERCENT":
        disc = (float(amount or 0) * val) / 100.0
    else:
        disc = val

    if c.max_discount is not None:
        disc = min(disc, float(c.max_discount or 0))
    disc = max(0.0, min(disc, float(amount or 0)))

    return {"valid": True, "message": "OK", "discount_amount": disc}

