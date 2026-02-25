from pydantic import BaseModel
from typing import Optional


class BranchBase(BaseModel):
    # Some legacy rows may have NULL branch_name; default to empty string to avoid 422 validation errors.
    branch_name: Optional[str] = ""
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    pincode: Optional[str] = None
    type: Optional[str] = "Branch"
    status: Optional[str] = "ACTIVE"

    # Optional: default discount settings (stored in system_parameters)
    discount_enabled: Optional[bool] = False
    discount_type: Optional[str] = "flat"  # flat | percent
    discount_value: Optional[float] = 0

    # Optional: print settings (stored in system_parameters)
    kot_required: Optional[bool] = True
    receipt_required: Optional[bool] = True

class BranchCreate(BranchBase):
    pass

class BranchUpdate(BranchBase):
    pass

class BranchOut(BranchBase):
    branch_id: int

    class Config:
        from_attributes = True
