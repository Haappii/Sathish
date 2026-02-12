from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class LoyaltyAccountOut(BaseModel):
    customer_id: int
    customer_name: str
    mobile: str
    points_balance: int
    tier: Optional[str] = None
    updated_at: Optional[datetime] = None


class LoyaltyAdjust(BaseModel):
    mobile: str
    points: int
    notes: Optional[str] = None


class LoyaltyRedeem(BaseModel):
    mobile: str
    points: int
    invoice_id: Optional[int] = None
    notes: Optional[str] = None


class LoyaltyTxnOut(BaseModel):
    txn_id: int
    txn_type: str
    points: int
    invoice_id: Optional[int] = None
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

