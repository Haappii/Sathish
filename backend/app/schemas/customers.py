from pydantic import BaseModel
from typing import Optional


class CustomerCreate(BaseModel):
    customer_name: str
    mobile: str
    email: Optional[str] = None
    gst_number: Optional[str] = None

    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None

    status: Optional[str] = "ACTIVE"


class CustomerUpdate(BaseModel):
    customer_name: Optional[str] = None
    mobile: Optional[str] = None
    email: Optional[str] = None
    gst_number: Optional[str] = None

    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None

    status: Optional[str] = None


class CustomerResponse(BaseModel):
    customer_id: int
    customer_name: str
    mobile: str
    email: Optional[str] = None
    gst_number: Optional[str] = None

    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None

    status: Optional[str] = None

    class Config:
        from_attributes = True
