from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime


class CashShiftOpen(BaseModel):
    opening_cash: float = 0
    opening_notes: Optional[str] = None


class CashShiftClose(BaseModel):
    actual_cash: Optional[float] = None
    denomination_counts: Optional[dict[str, Any]] = None
    closing_notes: Optional[str] = None


class CashMovementCreate(BaseModel):
    movement_type: str  # IN/OUT
    amount: float
    reason: Optional[str] = None


class CashMovementOut(BaseModel):
    movement_id: int
    movement_type: str
    amount: float
    reason: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class CashShiftOut(BaseModel):
    shift_id: int
    branch_id: int
    status: str
    opened_at: datetime
    opening_cash: float
    expected_cash: Optional[float] = None
    actual_cash: Optional[float] = None
    diff_cash: Optional[float] = None
    denomination_counts: Optional[dict[str, Any]] = None
    closed_at: Optional[datetime] = None

    class Config:
        from_attributes = True

