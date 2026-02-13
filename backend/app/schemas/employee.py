from datetime import date
from typing import Optional

from pydantic import BaseModel


class EmployeeBase(BaseModel):
    employee_code: Optional[str] = None
    employee_name: Optional[str] = None
    mobile: Optional[str] = None
    designation: Optional[str] = None
    wage_type: Optional[str] = "DAILY"  # DAILY | MONTHLY | ON_DEMAND
    daily_wage: Optional[float] = 0
    monthly_wage: Optional[float] = 0
    join_date: Optional[date] = None
    notes: Optional[str] = None
    active: Optional[bool] = True
    branch_id: Optional[int] = None


class EmployeeCreate(EmployeeBase):
    employee_name: str


class EmployeeUpdate(EmployeeBase):
    pass


class EmployeeResponse(BaseModel):
    employee_id: int
    shop_id: int
    branch_id: int
    employee_code: Optional[str] = None
    employee_name: str
    mobile: Optional[str] = None
    designation: Optional[str] = None
    wage_type: str
    daily_wage: float
    monthly_wage: float
    join_date: Optional[date] = None
    notes: Optional[str] = None
    active: bool

    class Config:
        from_attributes = True


class AttendanceUpsert(BaseModel):
    attendance_date: Optional[date] = None
    status: Optional[str] = "PRESENT"  # PRESENT | ABSENT | HALF_DAY | LEAVE
    worked_units: Optional[float] = 1
    wage_amount: Optional[float] = None
    notes: Optional[str] = None
    branch_id: Optional[int] = None


class AttendanceBulkItem(BaseModel):
    employee_id: int
    status: Optional[str] = "PRESENT"
    worked_units: Optional[float] = 1
    wage_amount: Optional[float] = None
    notes: Optional[str] = None


class AttendanceBulkUpsert(BaseModel):
    attendance_date: Optional[date] = None
    branch_id: Optional[int] = None
    items: list[AttendanceBulkItem]


class AttendanceResponse(BaseModel):
    attendance_id: int
    employee_id: int
    branch_id: int
    attendance_date: date
    status: str
    worked_units: float
    wage_amount: float
    notes: Optional[str] = None

    class Config:
        from_attributes = True


class WagePaymentCreate(BaseModel):
    payment_date: Optional[date] = None
    amount: float
    payment_mode: Optional[str] = "CASH"
    notes: Optional[str] = None
    branch_id: Optional[int] = None


class WagePaymentResponse(BaseModel):
    payment_id: int
    employee_id: int
    branch_id: int
    payment_date: date
    amount: float
    payment_mode: str
    notes: Optional[str] = None

    class Config:
        from_attributes = True


class EmployeeWageSummary(BaseModel):
    employee_id: int
    employee_name: str
    branch_id: int
    wage_type: str
    period_from: date
    period_to: date
    as_of_date: date
    present_days: float
    half_days: float
    leave_days: float
    absent_days: float
    earned_amount: float
    paid_amount: float
    due_amount: float
    earned_till_as_of: float
    paid_till_as_of: float
    due_till_as_of: float


class WageDueRow(BaseModel):
    employee_id: int
    employee_name: str
    branch_id: int
    wage_type: str
    earned_till_as_of: float
    paid_till_as_of: float
    due_till_as_of: float


class WageOverallSummary(BaseModel):
    as_of_date: date
    employee_count: int
    earned_till_as_of: float
    paid_till_as_of: float
    due_till_as_of: float
    rows: list[WageDueRow]
