from pydantic import BaseModel
from typing import List, Optional


class SalesReturnItemIn(BaseModel):
    item_id: int
    quantity: int


class SalesReturnCreate(BaseModel):
    invoice_number: str
    reason: Optional[str] = None
    items: List[SalesReturnItemIn]


class SalesReturnItemOut(BaseModel):
    item_id: int
    quantity: int
    unit_price: float
    line_subtotal: float

    class Config:
        from_attributes = True


class SalesReturnOut(BaseModel):
    return_id: int
    return_number: str
    invoice_number: str
    branch_id: int

    subtotal_amount: float
    tax_amount: float
    discount_amount: float
    refund_amount: float

    reason: Optional[str] = None
    status: str

    items: List[SalesReturnItemOut] = []

    class Config:
        from_attributes = True
