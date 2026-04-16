from pydantic import BaseModel
from typing import Optional, List
from datetime import date


class PurchaseOrderItemCreate(BaseModel):
    item_id: int
    qty: int
    unit: Optional[str] = None
    unit_cost: Optional[float] = None
    sell_price: Optional[float] = None
    mrp_price: Optional[float] = None


class PurchaseOrderCreate(BaseModel):
    supplier_id: int
    branch_id: Optional[int] = None
    expected_date: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = "DRAFT"
    payment_status: Optional[str] = "UNPAID"
    items: List[PurchaseOrderItemCreate]


class PurchaseOrderItemReceive(BaseModel):
    item_id: int
    qty_received: int
    batch_no: Optional[str] = None
    expiry_date: Optional[str] = None  # YYYY-MM-DD
    serial_numbers: Optional[List[str]] = None


class PurchaseOrderReceive(BaseModel):
    items: List[PurchaseOrderItemReceive]


class PurchaseOrderPayment(BaseModel):
    payment_status: str
    paid_amount: Optional[float] = 0


class PurchaseOrderItemResponse(BaseModel):
    po_item_id: int
    item_id: int
    item_name: str
    qty_ordered: int
    qty_received: int
    unit: Optional[str] = None
    unit_cost: float
    sell_price: float
    mrp_price: float
    line_total: float

    class Config:
        from_attributes = True


class PurchaseOrderResponse(BaseModel):
    po_id: int
    po_number: str
    supplier_id: int
    branch_id: int
    order_date: date
    expected_date: Optional[date]
    status: str
    payment_status: str
    paid_amount: float
    total_amount: float
    notes: Optional[str]
    items: Optional[List[PurchaseOrderItemResponse]] = None

    class Config:
        from_attributes = True
