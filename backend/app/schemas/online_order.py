from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class OnlineOrderItemIn(BaseModel):
    provider_item_id: Optional[str] = None
    item_id: Optional[int] = None
    item_name: str
    quantity: float = 1
    unit_price: float = 0
    line_total: Optional[float] = None
    notes: Optional[str] = None


class OnlineOrderCreateIn(BaseModel):
    provider: str
    provider_order_id: str
    provider_order_number: Optional[str] = None
    branch_id: Optional[int] = None
    order_type: Optional[str] = "DELIVERY"
    status: Optional[str] = "NEW"
    customer_name: Optional[str] = None
    customer_mobile: Optional[str] = None
    customer_address: Optional[str] = None
    subtotal_amount: Optional[float] = 0
    tax_amount: Optional[float] = 0
    discount_amount: Optional[float] = 0
    delivery_charge: Optional[float] = 0
    packaging_charge: Optional[float] = 0
    total_amount: Optional[float] = 0
    payment_mode: Optional[str] = None
    payment_status: Optional[str] = None
    notes: Optional[str] = None
    partner_id: Optional[str] = None
    source_created_at: Optional[datetime] = None
    items: list[OnlineOrderItemIn] = []


class OnlineOrderWebhookIn(BaseModel):
    event: Optional[str] = None
    provider_order_id: str
    provider_order_number: Optional[str] = None
    provider_status: Optional[str] = None
    branch_id: Optional[int] = None
    partner_id: Optional[str] = None
    order_type: Optional[str] = "DELIVERY"
    customer_name: Optional[str] = None
    customer_mobile: Optional[str] = None
    customer_address: Optional[str] = None
    subtotal_amount: Optional[float] = 0
    tax_amount: Optional[float] = 0
    discount_amount: Optional[float] = 0
    delivery_charge: Optional[float] = 0
    packaging_charge: Optional[float] = 0
    total_amount: Optional[float] = 0
    payment_mode: Optional[str] = None
    payment_status: Optional[str] = None
    notes: Optional[str] = None
    source_created_at: Optional[datetime] = None
    items: list[OnlineOrderItemIn] = []
    raw_payload: Optional[dict[str, Any]] = None


class OnlineOrderStatusUpdate(BaseModel):
    status: str
    note: Optional[str] = None


class OnlineOrderItemOut(BaseModel):
    order_item_id: int
    item_id: Optional[int] = None
    provider_item_id: Optional[str] = None
    item_name: str
    quantity: float
    unit_price: float
    line_total: float
    notes: Optional[str] = None

    class Config:
        from_attributes = True


class OnlineOrderEventOut(BaseModel):
    event_id: int
    event_type: str
    provider_status: Optional[str] = None
    message: Optional[str] = None
    payload: Optional[dict[str, Any]] = None
    actor_user_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class OnlineOrderOut(BaseModel):
    online_order_id: int
    shop_id: int
    branch_id: Optional[int] = None
    provider: str
    partner_id: Optional[str] = None
    provider_order_id: str
    provider_order_number: Optional[str] = None
    order_type: Optional[str] = None
    status: str
    customer_name: Optional[str] = None
    customer_mobile: Optional[str] = None
    customer_address: Optional[str] = None
    subtotal_amount: float
    tax_amount: float
    discount_amount: float
    delivery_charge: float
    packaging_charge: float
    total_amount: float
    payment_mode: Optional[str] = None
    payment_status: Optional[str] = None
    notes: Optional[str] = None
    webhook_event: Optional[str] = None
    accepted_at: Optional[datetime] = None
    dispatched_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    source_created_at: Optional[datetime] = None
    invoice_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class OnlineOrderDetailOut(OnlineOrderOut):
    items: list[OnlineOrderItemOut] = []
    events: list[OnlineOrderEventOut] = []


class OnlineOrderListOut(BaseModel):
    rows: list[OnlineOrderOut]
    total: int


class OnlineOrderSummaryOut(BaseModel):
    total: int
    new_count: int
    active_count: int
    delivered_count: int
    cancelled_count: int
    pending_for_action: int
