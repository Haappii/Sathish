from pydantic import BaseModel
from typing import Optional, List


class DuePaymentCreate(BaseModel):
    invoice_number: str
    amount: float
    payment_mode: Optional[str] = "cash"
    reference_no: Optional[str] = None
    notes: Optional[str] = None


class InvoiceItemSmall(BaseModel):
    """Simplified invoice item for dues display"""
    item_id: int
    item_name: str
    quantity: int
    price: float
    amount: float
    tax_percent: Optional[float] = None
    tax_amount: Optional[float] = None

    class Config:
        from_attributes = True


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
    
    # Invoice details
    tax_amt: Optional[float] = 0.0
    discounted_amt: Optional[float] = 0.0
    created_time: Optional[str] = None
    payment_mode: Optional[str] = None
    items: List[InvoiceItemSmall] = []

    class Config:
        from_attributes = True
