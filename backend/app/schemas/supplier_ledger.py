from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date


class SupplierLedgerPaymentCreate(BaseModel):
    supplier_id: int
    branch_id: Optional[int] = None
    po_id: Optional[int] = None
    amount: float
    payment_mode: Optional[str] = "cash"
    reference_no: Optional[str] = None
    notes: Optional[str] = None


class SupplierLedgerEntryOut(BaseModel):
    entry_id: int
    entry_type: str
    reference_no: Optional[str] = None
    po_id: Optional[int] = None
    debit: float
    credit: float
    notes: Optional[str] = None
    entry_time: datetime

    class Config:
        from_attributes = True


class SupplierAgingRow(BaseModel):
    supplier_id: int
    supplier_name: str
    total_due: float
    not_due: float
    overdue: float
    due_0_30: float
    due_31_60: float
    due_61_90: float
    due_90_plus: float


class SupplierOpenPoRow(BaseModel):
    po_id: int
    po_number: str
    order_date: date
    total_amount: float
    paid_amount: float
    due_amount: float
    due_date: Optional[date] = None

