from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.db import get_db
from app.models.customer import Customer
from app.schemas.customers import CustomerCreate, CustomerUpdate, CustomerResponse
from app.utils.auth_user import get_current_user
from app.services.credit_service import normalize_mobile
from app.services.audit_service import log_action
from app.utils.permissions import require_permission

router = APIRouter(prefix="/customers", tags=["Customers"])


@router.get("/search", response_model=list[CustomerResponse])
def search_customers(
    q: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    user=Depends(require_permission("customers", "read")),
):
    query = db.query(Customer).filter(Customer.shop_id == user.shop_id)

    if q:
        s = f"%{q.strip()}%"
        query = query.filter(
            or_(
                Customer.customer_name.ilike(s),
                Customer.mobile.ilike(s),
            )
        )

    return query.order_by(Customer.customer_name).limit(limit).all()


@router.get("/{customer_id}", response_model=CustomerResponse)
def get_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("customers", "read")),
):
    row = (
        db.query(Customer)
        .filter(Customer.customer_id == customer_id, Customer.shop_id == user.shop_id)
        .first()
    )
    if not row:
        raise HTTPException(404, "Customer not found")
    return row


@router.get("/by-mobile/{mobile}", response_model=CustomerResponse)
def get_customer_by_mobile(
    mobile: str,
    db: Session = Depends(get_db),
    user=Depends(require_permission("customers", "read")),
):
    m = normalize_mobile(mobile)
    if not m:
        raise HTTPException(400, "Invalid mobile number")

    row = (
        db.query(Customer)
        .filter(Customer.shop_id == user.shop_id, Customer.mobile == m)
        .first()
    )
    if not row:
        raise HTTPException(404, "Customer not found")
    return row


@router.post("/", response_model=CustomerResponse)
def create_customer(
    payload: CustomerCreate,
    db: Session = Depends(get_db),
    user=Depends(require_permission("customers", "write")),
):
    m = normalize_mobile(payload.mobile)
    if not m:
        raise HTTPException(400, "Invalid mobile number")

    existing = (
        db.query(Customer)
        .filter(Customer.shop_id == user.shop_id, Customer.mobile == m)
        .first()
    )

    if existing:
        old = {
            "customer_name": existing.customer_name,
            "email": existing.email,
            "gst_number": existing.gst_number,
            "status": existing.status,
        }
        existing.customer_name = payload.customer_name.strip()
        existing.email = payload.email
        existing.gst_number = payload.gst_number
        existing.address_line1 = payload.address_line1
        existing.address_line2 = payload.address_line2
        existing.city = payload.city
        existing.state = payload.state
        existing.pincode = payload.pincode
        if payload.status:
            existing.status = payload.status
        db.commit()
        db.refresh(existing)

        log_action(
            db,
            shop_id=user.shop_id,
            module="Customers",
            action="UPSERT",
            record_id=existing.customer_id,
            old=old,
            new={
                "customer_name": existing.customer_name,
                "email": existing.email,
                "gst_number": existing.gst_number,
                "status": existing.status,
            },
            user_id=user.user_id,
        )

        return existing

    row = Customer(
        shop_id=user.shop_id,
        customer_name=payload.customer_name.strip(),
        mobile=m,
        email=payload.email,
        gst_number=payload.gst_number,
        address_line1=payload.address_line1,
        address_line2=payload.address_line2,
        city=payload.city,
        state=payload.state,
        pincode=payload.pincode,
        status=payload.status or "ACTIVE",
        created_by=user.user_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    log_action(
        db,
        shop_id=user.shop_id,
        module="Customers",
        action="CREATE",
        record_id=row.customer_id,
        new={
            "customer_name": row.customer_name,
            "mobile": row.mobile,
            "status": row.status,
        },
        user_id=user.user_id,
    )

    return row


@router.put("/{customer_id}", response_model=CustomerResponse)
def update_customer(
    customer_id: int,
    payload: CustomerUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_permission("customers", "write")),
):
    row = (
        db.query(Customer)
        .filter(Customer.customer_id == customer_id, Customer.shop_id == user.shop_id)
        .first()
    )
    if not row:
        raise HTTPException(404, "Customer not found")

    old = {
        "customer_name": row.customer_name,
        "mobile": row.mobile,
        "email": row.email,
        "gst_number": row.gst_number,
        "status": row.status,
    }

    data = payload.model_dump(exclude_unset=True)
    if "mobile" in data:
        m = normalize_mobile(data.get("mobile"))
        if not m:
            raise HTTPException(400, "Invalid mobile number")
        data["mobile"] = m

    for k, v in data.items():
        setattr(row, k, v)

    db.commit()
    db.refresh(row)

    log_action(
        db,
        shop_id=user.shop_id,
        module="Customers",
        action="UPDATE",
        record_id=row.customer_id,
        old=old,
        new={
            "customer_name": row.customer_name,
            "mobile": row.mobile,
            "email": row.email,
            "gst_number": row.gst_number,
            "status": row.status,
        },
        user_id=user.user_id,
    )

    return row
