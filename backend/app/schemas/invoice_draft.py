from pydantic import BaseModel
from typing import List, Optional


class DraftItemIn(BaseModel):
    item_id: int
    quantity: int
    amount: float


class DraftCreate(BaseModel):
    customer_name: Optional[str] = None
    mobile: Optional[str] = None
    customer_gst: Optional[str] = None
    discounted_amt: float = 0
    payment_mode: Optional[str] = "cash"
    payment_split: Optional[dict] = None
    notes: Optional[str] = None
    items: List[DraftItemIn]


class DraftItemOut(BaseModel):
    item_id: int
    item_name: Optional[str] = None
    quantity: int
    amount: float

    class Config:
        from_attributes = True


class DraftOut(BaseModel):
    draft_id: int
    draft_number: str
    branch_id: int
    status: str
    customer_name: Optional[str] = None
    mobile: Optional[str] = None
    gst_number: Optional[str] = None
    discounted_amt: float
    payment_mode: str
    payment_split: Optional[dict] = None
    notes: Optional[str] = None
    items: List[DraftItemOut] = []

    class Config:
        from_attributes = True
