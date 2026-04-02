from __future__ import annotations

from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.reservation import TableReservation
from app.models.shop_details import ShopDetails
from app.models.branch import Branch
from app.models.table_billing import TableMaster

router = APIRouter(prefix="/public/reservations", tags=["Public Reservations"])


@router.get("/shop-info")
def get_shop_info(
    shop_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """Return public shop/branch info needed to render the booking form."""
    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == shop_id).first()
    if not shop:
        raise HTTPException(404, "Shop not found")

    branches = (
        db.query(Branch)
        .filter(Branch.shop_id == shop_id, Branch.is_active == True)
        .all()
    )

    return {
        "shop_id": shop.shop_id,
        "shop_name": shop.shop_name or "",
        "address": shop.address or "",
        "mobile": shop.mobile or "",
        "branches": [
            {"branch_id": b.branch_id, "branch_name": b.branch_name}
            for b in branches
        ],
    }


@router.get("/tables")
def get_public_tables(
    shop_id: int = Query(...),
    branch_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """Return free tables for a branch (no auth required)."""
    tables = (
        db.query(TableMaster)
        .filter(
            TableMaster.shop_id == shop_id,
            TableMaster.branch_id == branch_id,
        )
        .order_by(TableMaster.table_name)
        .all()
    )
    return [
        {
            "table_id": t.table_id,
            "table_name": t.table_name,
            "capacity": t.capacity,
        }
        for t in tables
    ]


@router.post("/")
def create_public_reservation(
    payload: dict,
    db: Session = Depends(get_db),
):
    """Create a reservation without authentication (public booking form)."""
    shop_id = payload.get("shop_id")
    branch_id = payload.get("branch_id")
    customer_name = (payload.get("customer_name") or "").strip()
    mobile = (payload.get("mobile") or "").strip()
    reservation_date_str = payload.get("reservation_date")
    reservation_time = (payload.get("reservation_time") or "").strip()

    if not shop_id:
        raise HTTPException(400, "shop_id is required")
    if not branch_id:
        raise HTTPException(400, "branch_id is required")
    if not customer_name:
        raise HTTPException(400, "customer_name is required")
    if not mobile:
        raise HTTPException(400, "mobile is required")
    if not reservation_date_str:
        raise HTTPException(400, "reservation_date is required")
    if not reservation_time:
        raise HTTPException(400, "reservation_time is required")

    # Validate shop exists
    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == int(shop_id)).first()
    if not shop:
        raise HTTPException(404, "Shop not found")

    try:
        res_date = date.fromisoformat(reservation_date_str)
    except ValueError:
        raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD")

    row = TableReservation(
        shop_id=int(shop_id),
        branch_id=int(branch_id),
        table_id=payload.get("table_id") or None,
        customer_name=customer_name,
        mobile=mobile,
        email=(payload.get("email") or "").strip() or None,
        reservation_date=res_date,
        reservation_time=reservation_time,
        guests=int(payload.get("guests") or 1),
        notes=(payload.get("notes") or "").strip() or None,
        status="PENDING",
        created_by=None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return {
        "reservation_id": row.reservation_id,
        "customer_name": row.customer_name,
        "reservation_date": str(row.reservation_date),
        "reservation_time": row.reservation_time,
        "guests": row.guests,
        "status": row.status,
        "shop_name": shop.shop_name or "",
    }
