from pydantic import BaseModel
from typing import Optional


class SupplierBase(BaseModel):
    supplier_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    gstin: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    address_line3: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    contact_person: Optional[str] = None
    credit_terms_days: Optional[int] = 0
    status: Optional[str] = "ACTIVE"
    branch_id: Optional[int] = None


class SupplierCreate(SupplierBase):
    supplier_name: str


class SupplierUpdate(SupplierBase):
    pass


class SupplierResponse(BaseModel):
    supplier_id: int
    supplier_name: str
    branch_id: int
    phone: Optional[str]
    email: Optional[str]
    gstin: Optional[str]
    address_line1: Optional[str]
    address_line2: Optional[str]
    address_line3: Optional[str]
    city: Optional[str]
    state: Optional[str]
    pincode: Optional[str]
    contact_person: Optional[str]
    credit_terms_days: Optional[int]
    status: str

    class Config:
        from_attributes = True
