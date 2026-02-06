from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.roles import Role
from app.schemas.roles import RoleCreate, RoleUpdate, RoleResponse

router = APIRouter(prefix="/roles", tags=["Roles"])


@router.get("/", response_model=list[RoleResponse])
def list_roles(db: Session = Depends(get_db)):
    return db.query(Role).order_by(Role.role_name).all()


@router.post("/", response_model=RoleResponse)
def create_role(request: RoleCreate, db: Session = Depends(get_db)):
    exists = db.query(Role).filter(Role.role_name == request.role_name).first()
    if exists:
        raise HTTPException(status_code=400, detail="Role already exists")

    role = Role(role_name=request.role_name, status=request.status)
    db.add(role)
    db.commit()
    db.refresh(role)
    return role


@router.put("/{role_id}", response_model=RoleResponse)
def update_role(role_id: int, request: RoleUpdate, db: Session = Depends(get_db)):
    role = db.query(Role).filter(Role.role_id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    if request.role_name is not None:
        role.role_name = request.role_name

    if request.status is not None:
        role.status = request.status

    db.commit()
    db.refresh(role)
    return role
