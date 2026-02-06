from pydantic import BaseModel
from typing import Optional
from datetime import date


class ExpenseCreate(BaseModel):
    expense_date: date
    amount: float
    category: str
    payment_mode: str = "cash"
    note: Optional[str] = None
    branch_id: Optional[int] = None


class ExpenseResponse(BaseModel):
    expense_id: int
    branch_id: int
    expense_date: date
    amount: float
    category: str
    payment_mode: str
    note: Optional[str] = None
    created_by: int

    class Config:
        from_attributes = True
