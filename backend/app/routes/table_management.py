from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import IntegrityError

from app.db import get_db
from app.models.table_billing import TableMaster
from app.utils.permissions import require_permission
from app.utils.shop_type import ensure_hotel_billing_type

router = APIRouter(
    prefix="/tables",
    tags=["Table Management"]
)

TAKEAWAY_TABLE_NAME = "__TAKEAWAY__"

# ------------------------------
# LIST TABLES BY BRANCH
# ------------------------------
@router.get("/branch/{branch_id}")
def list_tables(
    branch_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("setup", "read"))
):
    ensure_hotel_billing_type(db, user.shop_id)
    if str(user.role_name).lower() != "admin" and branch_id != user.branch_id:
        raise HTTPException(403, "Not allowed")
    tables = (
        db.query(TableMaster)
        .options(joinedload(TableMaster.category))
        .filter(
            TableMaster.shop_id == user.shop_id,
            TableMaster.branch_id == branch_id,
            TableMaster.table_name != TAKEAWAY_TABLE_NAME,
        )
        .order_by(TableMaster.table_name)
        .all()
    )

    return [
        {
            "table_id": t.table_id,
            "table_name": t.table_name,
            "capacity": t.capacity,
            "category_id": t.category_id,
            "category_name": t.category.category_name if t.category else None,
            "status": t.status
        }
        for t in tables
    ]

# ------------------------------
# CREATE TABLE
# ------------------------------
@router.post("/create")
def create_table(
    payload: dict,
    db: Session = Depends(get_db),
    user=Depends(require_permission("setup", "write"))
):
    ensure_hotel_billing_type(db, user.shop_id)
    if str(user.role_name).lower() != "admin" and payload.get("branch_id") != user.branch_id:
        raise HTTPException(403, "Not allowed")
    if str(payload.get("table_name") or "").strip() == TAKEAWAY_TABLE_NAME:
        raise HTTPException(400, "Reserved table name")
    table = TableMaster(
        shop_id=user.shop_id,
        table_name=payload["table_name"],
        capacity=payload["capacity"],
        branch_id=payload["branch_id"],
        category_id=payload.get("category_id"),
        status="FREE"
    )
    db.add(table)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(400, "Table name already exists in this category")
    db.refresh(table)

    return {"success": True, "table_id": table.table_id}

# ------------------------------
# UPDATE TABLE
# ------------------------------
@router.put("/{table_id}")
def update_table(
    table_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    user=Depends(require_permission("setup", "write"))
):
    ensure_hotel_billing_type(db, user.shop_id)
    table = db.query(TableMaster).filter(
        TableMaster.table_id == table_id,
        TableMaster.shop_id == user.shop_id
    ).first()

    if not table:
        raise HTTPException(404, "Table not found")

    if str(user.role_name).lower() != "admin" and table.branch_id != user.branch_id:
        raise HTTPException(403, "Not allowed")
    if str(payload.get("table_name") or "").strip() == TAKEAWAY_TABLE_NAME:
        raise HTTPException(400, "Reserved table name")
    table.table_name = payload["table_name"]
    table.capacity = payload["capacity"]
    table.category_id = payload.get("category_id")
    db.commit()

    return {"success": True}

# ------------------------------
# DELETE TABLE
# ------------------------------
@router.delete("/{table_id}")
def delete_table(
    table_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("setup", "write"))
):
    ensure_hotel_billing_type(db, user.shop_id)
    table = db.query(TableMaster).filter(
        TableMaster.table_id == table_id,
        TableMaster.shop_id == user.shop_id
    ).first()

    if not table:
        raise HTTPException(404, "Table not found")

    if str(user.role_name).lower() != "admin" and table.branch_id != user.branch_id:
        raise HTTPException(403, "Not allowed")
    if table.status != "FREE":
        raise HTTPException(400, "Table is occupied")

    db.delete(table)
    db.commit()

    return {"success": True}

# ------------------------------
# UPDATE TABLE STATUS
# ------------------------------
@router.patch("/{table_id}/status")
def update_table_status(
    table_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    user=Depends(require_permission("billing", "write"))
):
    ensure_hotel_billing_type(db, user.shop_id)
    table = db.query(TableMaster).filter(
        TableMaster.table_id == table_id,
        TableMaster.shop_id == user.shop_id,
        TableMaster.branch_id == user.branch_id
    ).first()

    if not table:
        raise HTTPException(404, "Table not found")

    new_status = payload.get("status")
    if new_status not in ["FREE", "OCCUPIED", "PAID"]:
        raise HTTPException(400, "Invalid status")

    table.status = new_status
    if new_status == "FREE":
        table.table_start_time = None
    db.commit()

    return {"success": True}
