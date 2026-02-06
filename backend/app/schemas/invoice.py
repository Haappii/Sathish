from pydantic import BaseModel
from typing import List, Optional

# ---------- INPUT ITEM ----------
class InvoiceItem(BaseModel):
    item_id: int
    quantity: int
    amount: float


# ---------- CREATE ----------
class InvoiceCreate(BaseModel):
    customer_name: Optional[str] = None
    mobile: Optional[str] = None
    customer_gst: Optional[str] = None
    discounted_amt: float = 0
    payment_mode: Optional[str] = "cash"
    payment_split: Optional[dict] = None
    items: List[InvoiceItem]


# ---------- UPDATE ----------
class InvoiceUpdate(BaseModel):
    customer_name: Optional[str] = None
    mobile: Optional[str] = None
    customer_gst: Optional[str] = None
    discounted_amt: float = 0
    payment_mode: Optional[str] = None
    payment_split: Optional[dict] = None
    items: List[InvoiceItem]


# ---------- BASIC RESPONSE ----------
class InvoiceResponse(BaseModel):
    invoice_id: int
    invoice_number: str
    total_amount: float
    tax_amt: float
    discounted_amt: float
    payment_mode: Optional[str] = None
    payment_split: Optional[dict] = None

    class Config:
        from_attributes = True


# ---------- DETAIL ITEM ----------
class InvoiceItemDetail(BaseModel):
    item_id: int
    item_name: str
    quantity: int
    price: float
    amount: float
    tax_percent: float | None = None
    tax_amount: float | None = None

    class Config:
        from_attributes = True


# ---------- FULL RESPONSE ----------
class InvoiceFullResponse(BaseModel):
    invoice_id: int
    invoice_number: str
    customer_name: Optional[str]
    mobile: Optional[str]
    total_amount: float
    discounted_amt: float
    tax_amt: float
    created_time: str
    payment_mode: Optional[str] = None
    payment_split: Optional[dict] = None
    items: List[InvoiceItemDetail]

    class Config:
        from_attributes = True
