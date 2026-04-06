from pydantic import BaseModel, Field
from typing import Optional, Any
from datetime import datetime


class CashShiftOpen(BaseModel):
    opening_cash: float = Field(default=0, ge=0, le=9999999.99, description="Opening cash amount")
    opening_notes: Optional[str] = Field(None, max_length=255, description="Optional opening notes")


class CashShiftClose(BaseModel):
    actual_cash: Optional[float] = Field(None, ge=0, le=9999999.99, description="Actual cash counted")
    denomination_counts: Optional[dict[str, Any]] = Field(None, description="Count of each denomination")
    closing_notes: Optional[str] = Field(None, max_length=255, description="Optional closing notes")


class CashMovementCreate(BaseModel):
    movement_type: str  # IN/OUT
    amount: float = Field(gt=0, le=9999999.99, description="Amount to add or remove")
    reason: Optional[str] = Field(None, max_length=255, description="Reason for movement")


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

