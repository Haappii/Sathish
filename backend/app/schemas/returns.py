from pydantic import BaseModel
from typing import List, Optional


class SalesReturnItemIn(BaseModel):
    item_id: int
    quantity: int
    condition: Optional[str] = "GOOD"  # GOOD / DAMAGED
    restock: Optional[bool] = None     # default based on condition


class SalesReturnCreate(BaseModel):
    invoice_number: str
    reason_code: Optional[str] = None
    reason: Optional[str] = None
    return_type: Optional[str] = "REFUND"  # REFUND / EXCHANGE
    refund_mode: Optional[str] = "CASH"    # CASH / CARD / UPI / STORE_CREDIT / WALLET
    note: Optional[str] = None
    items: List[SalesReturnItemIn]


class SalesReturnItemOut(BaseModel):
    item_id: int
    quantity: int
    unit_price: float
    line_subtotal: float
    condition: Optional[str] = None
    restock: Optional[bool] = None

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

    return_type: Optional[str] = None
    refund_mode: Optional[str] = None
    reason_code: Optional[str] = None
    reason: Optional[str] = None
    note: Optional[str] = None
    status: str

    items: List[SalesReturnItemOut] = []

    class Config:
        from_attributes = True
