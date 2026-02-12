from pydantic import BaseModel
from typing import Optional


class DuePaymentCreate(BaseModel):
    invoice_number: str
    amount: float
    payment_mode: Optional[str] = "cash"
    reference_no: Optional[str] = None
    notes: Optional[str] = None


class DueSummary(BaseModel):
    due_id: int
    invoice_id: int
    invoice_number: str
    branch_id: Optional[int] = None
    customer_id: Optional[int] = None
    customer_name: Optional[str] = None
    mobile: Optional[str] = None

    original_amount: float
    paid_amount: float
    returns_amount: float
    outstanding_amount: float
    status: str

    class Config:
        from_attributes = True
