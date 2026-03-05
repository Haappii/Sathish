from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.supplier import Supplier
from app.schemas.supplier import SupplierCreate, SupplierUpdate, SupplierResponse
from app.services.audit_service import log_action
from app.utils.permissions import require_permission

router = APIRouter(prefix="/suppliers", tags=["Suppliers"])


def resolve_branch(branch_id_param, user):
    role = str(getattr(user, "role_name", "") or "").strip().lower()
    if role == "admin":
        branch_raw = branch_id_param if branch_id_param not in (None, "") else getattr(user, "branch_id", None)
    else:
        branch_raw = getattr(user, "branch_id", None)

    try:
        return int(branch_raw)
    except (TypeError, ValueError):
        raise HTTPException(400, "Branch required")


def resolve_branch_optional(branch_id_param, user):
    role = str(getattr(user, "role_name", "") or "").strip().lower()
    if role == "admin":
        if branch_id_param in (None, ""):
            return None
        try:
            return int(branch_id_param)
        except (TypeError, ValueError):
            raise HTTPException(400, "Invalid branch_id")
    return resolve_branch(branch_id_param, user)


@router.get("/", response_model=list[SupplierResponse])
def list_suppliers(
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("suppliers", "read")),
):
    bid = resolve_branch_optional(branch_id, user)
    q = db.query(Supplier).filter(
        Supplier.shop_id == user.shop_id,
        Supplier.status == "ACTIVE"
    )
    if bid is not None:
        q = q.filter(Supplier.branch_id == bid)
    return q.order_by(Supplier.supplier_name).all()


@router.post("/", response_model=SupplierResponse)
def create_supplier(
    payload: SupplierCreate,
    db: Session = Depends(get_db),
    user=Depends(require_permission("suppliers", "write")),
):
    bid = resolve_branch(payload.branch_id, user)

    supplier = Supplier(
        shop_id=user.shop_id,
        branch_id=bid,
        supplier_name=payload.supplier_name,
        phone=payload.phone,
        email=payload.email,
        gstin=payload.gstin,
        address_line1=payload.address_line1,
        address_line2=payload.address_line2,
        address_line3=payload.address_line3,
        city=payload.city,
        state=payload.state,
        pincode=payload.pincode,
        contact_person=payload.contact_person,
        credit_terms_days=payload.credit_terms_days or 0,
        status=payload.status or "ACTIVE",
        created_by=user.user_id
    )
    db.add(supplier)
    db.commit()
    db.refresh(supplier)

    log_action(
        db,
        shop_id=user.shop_id,
        module="Suppliers",
        action="CREATE",
        record_id=supplier.supplier_id,
        new={
            "supplier_name": supplier.supplier_name,
            "branch_id": supplier.branch_id,
            "status": supplier.status,
        },
        user_id=user.user_id,
    )
    return supplier


@router.put("/{supplier_id}", response_model=SupplierResponse)
def update_supplier(
    supplier_id: int,
    payload: SupplierUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_permission("suppliers", "write")),
):
    supplier = db.query(Supplier).filter(
        Supplier.supplier_id == supplier_id,
        Supplier.shop_id == user.shop_id
    ).first()
    if not supplier:
        raise HTTPException(404, "Supplier not found")

    if supplier.shop_id != user.shop_id:
        raise HTTPException(403, "Not allowed")
    if str(user.role_name).lower() != "admin" and supplier.branch_id != user.branch_id:
        raise HTTPException(403, "Not allowed")

    old = {
        "supplier_name": supplier.supplier_name,
        "phone": supplier.phone,
        "email": supplier.email,
        "gstin": supplier.gstin,
        "status": supplier.status,
    }

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(supplier, key, value)

    db.commit()
    db.refresh(supplier)

    log_action(
        db,
        shop_id=user.shop_id,
        module="Suppliers",
        action="UPDATE",
        record_id=supplier.supplier_id,
        old=old,
        new={
            "supplier_name": supplier.supplier_name,
            "phone": supplier.phone,
            "email": supplier.email,
            "gstin": supplier.gstin,
            "status": supplier.status,
        },
        user_id=user.user_id,
    )
    return supplier


@router.delete("/{supplier_id}")
def delete_supplier(
    supplier_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("suppliers", "write")),
):
    supplier = db.query(Supplier).filter(
        Supplier.supplier_id == supplier_id,
        Supplier.shop_id == user.shop_id
    ).first()
    if not supplier:
        raise HTTPException(404, "Supplier not found")

    if supplier.shop_id != user.shop_id:
        raise HTTPException(403, "Not allowed")
    if str(user.role_name).lower() != "admin" and supplier.branch_id != user.branch_id:
        raise HTTPException(403, "Not allowed")

    old_status = supplier.status
    supplier.status = "INACTIVE"
    db.commit()

    log_action(
        db,
        shop_id=user.shop_id,
        module="Suppliers",
        action="DELETE",
        record_id=supplier.supplier_id,
        old={"status": old_status},
        new={"status": supplier.status},
        user_id=user.user_id,
    )
    return {"success": True}
