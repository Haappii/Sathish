from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class StockAuditCreate(BaseModel):
    branch_id: Optional[int] = None
    notes: Optional[str] = None
    item_ids: Optional[List[int]] = None


class StockAuditLineCount(BaseModel):
    item_id: int
    counted_qty: int
    reason: Optional[str] = None


class StockAuditLineOut(BaseModel):
    item_id: int
    item_name: str
    system_qty: int
    counted_qty: Optional[int] = None
    difference_qty: Optional[int] = None
    reason: Optional[str] = None


class StockAuditOut(BaseModel):
    audit_id: int
    audit_number: str
    branch_id: int
    status: str
    notes: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    lines: List[StockAuditLineOut] = []

