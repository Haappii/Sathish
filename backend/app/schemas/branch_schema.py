from pydantic import BaseModel
from typing import Optional

class BranchBase(BaseModel):
    branch_name: str
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    pincode: Optional[str] = None
    type: Optional[str] = "Branch"
    status: Optional[str] = "ACTIVE"

class BranchCreate(BranchBase):
    pass

class BranchUpdate(BranchBase):
    pass

class BranchOut(BranchBase):
    branch_id: int

    class Config:
        orm_mode = True
