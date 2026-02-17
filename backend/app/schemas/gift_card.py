from __future__ import annotations

from datetime import date
from pydantic import BaseModel
from typing import Optional


class GiftCardCreate(BaseModel):
    amount: float
    expires_on: Optional[date] = None
    customer_name: Optional[str] = None
    mobile: Optional[str] = None
    note: Optional[str] = None


class GiftCardRedeem(BaseModel):
    code: str
    amount: float
    ref_type: Optional[str] = "MANUAL"
    ref_no: Optional[str] = None


class GiftCardOut(BaseModel):
    gift_card_id: int
    code: str
    status: str
    initial_amount: float
    balance_amount: float
    issued_on: Optional[str] = None
    expires_on: Optional[str] = None
    redeemed_on: Optional[str] = None
    customer_name: Optional[str] = None
    mobile: Optional[str] = None
    note: Optional[str] = None

    class Config:
        from_attributes = True

