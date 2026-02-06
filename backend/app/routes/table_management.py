from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.table_billing import TableMaster
from app.utils.auth_user import get_current_user

router = APIRouter(
    prefix="/tables",
    tags=["Table Management"]
)

# ------------------------------
# LIST TABLES BY BRANCH
# ------------------------------
@router.get("/branch/{branch_id}")
def list_tables(
    branch_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    if str(user.role_name).lower() != "admin" and branch_id != user.branch_id:
        raise HTTPException(403, "Not allowed")
    return (
        db.query(TableMaster)
        .filter(
            TableMaster.shop_id == user.shop_id,
            TableMaster.branch_id == branch_id
        )
        .order_by(TableMaster.table_name)
        .all()
    )

# ------------------------------
# CREATE TABLE
# ------------------------------
@router.post("/create")
def create_table(
    payload: dict,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    if str(user.role_name).lower() != "admin" and payload.get("branch_id") != user.branch_id:
        raise HTTPException(403, "Not allowed")
    table = TableMaster(
        shop_id=user.shop_id,
        table_name=payload["table_name"],
        capacity=payload["capacity"],
        branch_id=payload["branch_id"],
        status="FREE"
    )
    db.add(table)
    db.commit()
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
    user=Depends(get_current_user)
):
    table = db.query(TableMaster).filter(
        TableMaster.table_id == table_id,
        TableMaster.shop_id == user.shop_id
    ).first()

    if not table:
        raise HTTPException(404, "Table not found")

    if str(user.role_name).lower() != "admin" and table.branch_id != user.branch_id:
        raise HTTPException(403, "Not allowed")
    table.table_name = payload["table_name"]
    table.capacity = payload["capacity"]
    db.commit()

    return {"success": True}

# ------------------------------
# DELETE TABLE
# ------------------------------
@router.delete("/{table_id}")
def delete_table(
    table_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
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
