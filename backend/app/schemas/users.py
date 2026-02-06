from pydantic import BaseModel
from typing import Optional


class UserCreate(BaseModel):
    user_name: str
    password: str
    name: Optional[str] = None
    role: int
    branch_id: Optional[int] = None
    status: bool = True


class UserUpdate(BaseModel):
    user_name: Optional[str] = None
    password: Optional[str] = None
    name: Optional[str] = None
    role: Optional[int] = None
    branch_id: Optional[int] = None
    status: Optional[bool] = None
    login_status: Optional[bool] = None


class UserResponse(BaseModel):
    user_id: int
    user_name: str
    name: Optional[str]
    role: int
    branch_id: Optional[int]
    status: bool
    login_status: bool

    class Config:
        from_attributes = True
