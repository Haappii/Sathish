from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime


class CouponCreate(BaseModel):
    code: str
    name: Optional[str] = None
    discount_type: str = "FLAT"  # FLAT/PERCENT
    value: float
    min_bill_amount: Optional[float] = None
    max_discount: Optional[float] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    active: bool = True


class CouponUpdate(BaseModel):
    name: Optional[str] = None
    discount_type: Optional[str] = None
    value: Optional[float] = None
    min_bill_amount: Optional[float] = None
    max_discount: Optional[float] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    active: Optional[bool] = None


class CouponOut(BaseModel):
    coupon_id: int
    code: str
    name: Optional[str] = None
    discount_type: str
    value: float
    min_bill_amount: Optional[float] = None
    max_discount: Optional[float] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class CouponValidateOut(BaseModel):
    valid: bool
    message: str
    discount_amount: float = 0

