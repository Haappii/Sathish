from __future__ import annotations

import calendar
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.branch import Branch
from app.models.employee import Employee, EmployeeAttendance, EmployeeWagePayment
from app.models.shop_details import ShopDetails
from app.schemas.employee import (
    AttendanceBulkUpsert,
    AttendanceResponse,
    AttendanceUpsert,
    EmployeeCreate,
    EmployeeResponse,
    EmployeeUpdate,
    EmployeeWageSummary,
    WageDueRow,
    WageOverallSummary,
    WagePaymentCreate,
    WagePaymentResponse,
)
from app.services.audit_service import log_action
from app.utils.permissions import require_permission

router = APIRouter(prefix="/employees", tags=["Employee Management"])


class EmployeeBulkRow(BaseModel):
    employee_name: str
    employee_code: Optional[str] = None
    mobile: Optional[str] = None
    designation: Optional[str] = None
    wage_type: Optional[str] = "DAILY"
    daily_wage: Optional[float] = 0
    monthly_wage: Optional[float] = 0
    join_date: Optional[str] = None
    notes: Optional[str] = None
    branch_name: Optional[str] = None

WAGE_TYPES = {"DAILY", "MONTHLY", "ON_DEMAND"}
ATT_STATUSES = {"PRESENT", "ABSENT", "HALF_DAY", "LEAVE"}


def _round2(v) -> float:
    try:
        return round(float(v or 0), 2)
    except Exception:
        return 0.0


def _safe_float(v, default: float = 0.0) -> float:
    try:
        return float(v)
    except Exception:
        return default


def _normalize_wage_type(v: str | None) -> str:
    x = str(v or "DAILY").strip().upper().replace(" ", "_")
    if x not in WAGE_TYPES:
        raise HTTPException(400, "wage_type must be DAILY, MONTHLY, or ON_DEMAND")
    return x


def _normalize_attendance_status(v: str | None) -> str:
    x = str(v or "PRESENT").strip().upper().replace(" ", "_")
    if x not in ATT_STATUSES:
        raise HTTPException(400, "status must be PRESENT, ABSENT, HALF_DAY, or LEAVE")
    return x


def _resolve_branch(branch_id_param, user) -> int:
    role = str(getattr(user, "role_name", "") or "").strip().lower()
    if role == "admin":
        branch_raw = branch_id_param if branch_id_param not in (None, "") else getattr(user, "branch_id", None)
    else:
        branch_raw = getattr(user, "branch_id", None)
    try:
        return int(branch_raw)
    except (TypeError, ValueError):
        raise HTTPException(400, "Branch required")


def _ensure_employee_access(employee: Employee, user):
    role = str(getattr(user, "role_name", "") or "").strip().lower()
    if role != "admin" and int(employee.branch_id or 0) != int(getattr(user, "branch_id", 0) or 0):
        raise HTTPException(403, "Not allowed")


def _business_date(db: Session, shop_id: int) -> date:
    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == shop_id).first()
    if shop and shop.app_date:
        return shop.app_date
    return datetime.utcnow().date()


def _first_day(d: date) -> date:
    return d.replace(day=1)


def _daily_factor(status: str, worked_units: float | None) -> float:
    st = _normalize_attendance_status(status)
    units = _safe_float(worked_units, 1.0)
    units = max(0.0, min(units, 1.0))
    if st == "ABSENT":
        return 0.0
    if st == "LEAVE":
        return 0.0
    if st == "HALF_DAY":
        return units if units > 0 else 0.5
    return units if units > 0 else 1.0


def _monthly_factor(status: str, worked_units: float | None) -> float:
    st = _normalize_attendance_status(status)
    units = _safe_float(worked_units, 1.0)
    units = max(0.0, min(units, 1.0))
    if st == "ABSENT":
        return 0.0
    if st == "HALF_DAY":
        return units if units > 0 else 0.5
    if st == "LEAVE":
        return 1.0
    return units if units > 0 else 1.0


def _calculate_attendance_wage(employee: Employee, *, status: str, worked_units: float, wage_amount: float | None) -> float:
    if wage_amount is not None:
        return max(0.0, _round2(wage_amount))

    wage_type = _normalize_wage_type(employee.wage_type)
    if wage_type == "MONTHLY":
        return 0.0

    factor = _daily_factor(status, worked_units)
    if wage_type == "ON_DEMAND":
        return _round2(max(0.0, _safe_float(employee.daily_wage, 0.0) * factor))

    # DAILY
    return _round2(max(0.0, _safe_float(employee.daily_wage, 0.0) * factor))


def _attendance_stats(rows: list[EmployeeAttendance]) -> dict[str, float]:
    out = {"PRESENT": 0.0, "HALF_DAY": 0.0, "LEAVE": 0.0, "ABSENT": 0.0}
    for r in rows:
        st = _normalize_attendance_status(r.status)
        if st == "HALF_DAY":
            out["HALF_DAY"] += 1.0
        elif st == "PRESENT":
            out["PRESENT"] += 1.0
        elif st == "LEAVE":
            out["LEAVE"] += 1.0
        else:
            out["ABSENT"] += 1.0
    return out


def _sum_payments(
    db: Session,
    *,
    shop_id: int,
    employee_id: int,
    from_date: date | None = None,
    to_date: date | None = None,
) -> float:
    query = db.query(func.coalesce(func.sum(EmployeeWagePayment.amount), 0)).filter(
        EmployeeWagePayment.shop_id == shop_id,
        EmployeeWagePayment.employee_id == employee_id,
    )
    if from_date:
        query = query.filter(EmployeeWagePayment.payment_date >= from_date)
    if to_date:
        query = query.filter(EmployeeWagePayment.payment_date <= to_date)
    return _round2(query.scalar() or 0)


def _effective_row_wage(employee: Employee, row: EmployeeAttendance) -> float:
    stored = _safe_float(row.wage_amount, 0.0)
    wage_type = _normalize_wage_type(employee.wage_type)
    if wage_type == "MONTHLY":
        return 0.0
    if stored > 0:
        return _round2(stored)
    return _calculate_attendance_wage(
        employee,
        status=row.status,
        worked_units=row.worked_units,
        wage_amount=None,
    )


def _monthly_earned(
    employee: Employee,
    *,
    start_date: date,
    end_date: date,
    attendance_by_date: dict[date, EmployeeAttendance],
) -> float:
    if start_date > end_date:
        return 0.0
    monthly_wage = _safe_float(employee.monthly_wage, 0.0)
    if monthly_wage <= 0:
        return 0.0

    total = 0.0
    day = start_date
    while day <= end_date:
        days_in_month = calendar.monthrange(day.year, day.month)[1]
        day_rate = monthly_wage / max(days_in_month, 1)
        row = attendance_by_date.get(day)
        if row:
            factor = _monthly_factor(row.status, row.worked_units)
        else:
            factor = 1.0
        total += day_rate * factor
        day += timedelta(days=1)
    return _round2(total)


def _lifetime_start(db: Session, *, employee: Employee, fallback: date) -> date:
    if employee.join_date:
        return employee.join_date
    min_att = (
        db.query(func.min(EmployeeAttendance.attendance_date))
        .filter(
            EmployeeAttendance.shop_id == employee.shop_id,
            EmployeeAttendance.employee_id == employee.employee_id,
        )
        .scalar()
    )
    min_pay = (
        db.query(func.min(EmployeeWagePayment.payment_date))
        .filter(
            EmployeeWagePayment.shop_id == employee.shop_id,
            EmployeeWagePayment.employee_id == employee.employee_id,
        )
        .scalar()
    )
    candidates = [d for d in [min_att, min_pay, fallback] if d is not None]
    return min(candidates) if candidates else fallback


def _employee_wage_summary(
    db: Session,
    *,
    employee: Employee,
    period_from: date,
    period_to: date,
    as_of_date: date,
) -> dict:
    start = max(period_from, employee.join_date) if employee.join_date else period_from
    end = max(start, period_to)

    att_period = (
        db.query(EmployeeAttendance)
        .filter(
            EmployeeAttendance.shop_id == employee.shop_id,
            EmployeeAttendance.employee_id == employee.employee_id,
            EmployeeAttendance.attendance_date >= start,
            EmployeeAttendance.attendance_date <= end,
        )
        .all()
    )
    stats = _attendance_stats(att_period)

    wage_type = _normalize_wage_type(employee.wage_type)
    if wage_type == "MONTHLY":
        by_date_period = {x.attendance_date: x for x in att_period}
        earned_period = _monthly_earned(employee, start_date=start, end_date=end, attendance_by_date=by_date_period)
    else:
        earned_period = _round2(sum(_effective_row_wage(employee, row) for row in att_period))

    paid_period = _sum_payments(
        db,
        shop_id=employee.shop_id,
        employee_id=employee.employee_id,
        from_date=start,
        to_date=end,
    )

    lifetime_start = _lifetime_start(db, employee=employee, fallback=start)
    lifetime_end = max(lifetime_start, as_of_date)

    if wage_type == "MONTHLY":
        att_till = (
            db.query(EmployeeAttendance)
            .filter(
                EmployeeAttendance.shop_id == employee.shop_id,
                EmployeeAttendance.employee_id == employee.employee_id,
                EmployeeAttendance.attendance_date >= lifetime_start,
                EmployeeAttendance.attendance_date <= lifetime_end,
            )
            .all()
        )
        by_date_till = {x.attendance_date: x for x in att_till}
        earned_till = _monthly_earned(
            employee,
            start_date=lifetime_start,
            end_date=lifetime_end,
            attendance_by_date=by_date_till,
        )
    else:
        att_till = (
            db.query(EmployeeAttendance)
            .filter(
                EmployeeAttendance.shop_id == employee.shop_id,
                EmployeeAttendance.employee_id == employee.employee_id,
                EmployeeAttendance.attendance_date >= lifetime_start,
                EmployeeAttendance.attendance_date <= lifetime_end,
            )
            .all()
        )
        earned_till = _round2(sum(_effective_row_wage(employee, row) for row in att_till))

    paid_till = _sum_payments(
        db,
        shop_id=employee.shop_id,
        employee_id=employee.employee_id,
        from_date=lifetime_start,
        to_date=lifetime_end,
    )

    return {
        "employee_id": employee.employee_id,
        "employee_name": employee.employee_name,
        "branch_id": employee.branch_id,
        "wage_type": wage_type,
        "period_from": start,
        "period_to": end,
        "as_of_date": as_of_date,
        "present_days": _round2(stats["PRESENT"]),
        "half_days": _round2(stats["HALF_DAY"]),
        "leave_days": _round2(stats["LEAVE"]),
        "absent_days": _round2(stats["ABSENT"]),
        "earned_amount": _round2(earned_period),
        "paid_amount": _round2(paid_period),
        "due_amount": _round2(earned_period - paid_period),
        "earned_till_as_of": _round2(earned_till),
        "paid_till_as_of": _round2(paid_till),
        "due_till_as_of": _round2(earned_till - paid_till),
    }


@router.get("", response_model=list[EmployeeResponse])
@router.get("/", response_model=list[EmployeeResponse])
def list_employees(
    branch_id: int | None = Query(None),
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    user=Depends(require_permission("employees", "read")),
):
    bid = _resolve_branch(branch_id, user)
    query = db.query(Employee).filter(Employee.shop_id == user.shop_id, Employee.branch_id == bid)
    if not include_inactive:
        query = query.filter(Employee.active == True)  # noqa: E712
    return query.order_by(Employee.employee_name.asc()).all()


@router.post("", response_model=EmployeeResponse)
@router.post("/", response_model=EmployeeResponse)
def create_employee(
    payload: EmployeeCreate,
    db: Session = Depends(get_db),
    user=Depends(require_permission("employees", "write")),
):
    bid = _resolve_branch(payload.branch_id, user)
    wage_type = _normalize_wage_type(payload.wage_type)
    daily_wage = _safe_float(payload.daily_wage, 0.0)
    monthly_wage = _safe_float(payload.monthly_wage, 0.0)
    if wage_type == "DAILY" and daily_wage <= 0:
        raise HTTPException(400, "daily_wage must be > 0 for DAILY wage type")
    if wage_type == "MONTHLY" and monthly_wage <= 0:
        raise HTTPException(400, "monthly_wage must be > 0 for MONTHLY wage type")

    code = (payload.employee_code or "").strip() or None
    if code:
        exists = (
            db.query(Employee.employee_id)
            .filter(
                Employee.shop_id == user.shop_id,
                Employee.employee_code == code,
            )
            .first()
        )
        if exists:
            raise HTTPException(400, "employee_code already exists")

    emp = Employee(
        shop_id=user.shop_id,
        branch_id=bid,
        employee_code=code,
        employee_name=(payload.employee_name or "").strip(),
        mobile=(payload.mobile or "").strip() or None,
        designation=(payload.designation or "").strip() or None,
        wage_type=wage_type,
        daily_wage=daily_wage,
        monthly_wage=monthly_wage,
        join_date=payload.join_date or _business_date(db, user.shop_id),
        notes=(payload.notes or "").strip() or None,
        active=bool(payload.active if payload.active is not None else True),
        created_by=user.user_id,
    )
    db.add(emp)
    log_action(
        db,
        shop_id=user.shop_id,
        module="Employees",
        action="CREATE",
        record_id=emp.employee_name,
        new={
            "employee_name": emp.employee_name,
            "branch_id": emp.branch_id,
            "wage_type": emp.wage_type,
        },
        user_id=user.user_id,
        commit=False,
    )
    db.commit()
    db.refresh(emp)
    return emp


@router.put("/{employee_id}", response_model=EmployeeResponse)
def update_employee(
    employee_id: int,
    payload: EmployeeUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_permission("employees", "write")),
):
    emp = (
        db.query(Employee)
        .filter(Employee.shop_id == user.shop_id, Employee.employee_id == employee_id)
        .first()
    )
    if not emp:
        raise HTTPException(404, "Employee not found")
    _ensure_employee_access(emp, user)

    old = {
        "employee_name": emp.employee_name,
        "wage_type": emp.wage_type,
        "daily_wage": emp.daily_wage,
        "monthly_wage": emp.monthly_wage,
        "active": emp.active,
    }

    data = payload.model_dump(exclude_unset=True)
    if "branch_id" in data and data.get("branch_id") is not None:
        data["branch_id"] = _resolve_branch(data.get("branch_id"), user)

    if "wage_type" in data:
        data["wage_type"] = _normalize_wage_type(data.get("wage_type"))

    wage_type = _normalize_wage_type(data.get("wage_type", emp.wage_type))
    next_daily = _safe_float(data.get("daily_wage", emp.daily_wage), 0.0)
    next_monthly = _safe_float(data.get("monthly_wage", emp.monthly_wage), 0.0)
    if wage_type == "DAILY" and next_daily <= 0:
        raise HTTPException(400, "daily_wage must be > 0 for DAILY wage type")
    if wage_type == "MONTHLY" and next_monthly <= 0:
        raise HTTPException(400, "monthly_wage must be > 0 for MONTHLY wage type")

    if "employee_code" in data:
        code = (data.get("employee_code") or "").strip() or None
        if code:
            exists = (
                db.query(Employee.employee_id)
                .filter(
                    Employee.shop_id == user.shop_id,
                    Employee.employee_code == code,
                    Employee.employee_id != emp.employee_id,
                )
                .first()
            )
            if exists:
                raise HTTPException(400, "employee_code already exists")
        data["employee_code"] = code

    for k, v in data.items():
        setattr(emp, k, v)

    log_action(
        db,
        shop_id=user.shop_id,
        module="Employees",
        action="UPDATE",
        record_id=emp.employee_id,
        old=old,
        new={
            "employee_name": emp.employee_name,
            "wage_type": emp.wage_type,
            "daily_wage": emp.daily_wage,
            "monthly_wage": emp.monthly_wage,
            "active": emp.active,
        },
        user_id=user.user_id,
        commit=False,
    )
    db.commit()
    db.refresh(emp)
    return emp


@router.delete("/{employee_id}")
def deactivate_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("employees", "write")),
):
    emp = (
        db.query(Employee)
        .filter(Employee.shop_id == user.shop_id, Employee.employee_id == employee_id)
        .first()
    )
    if not emp:
        raise HTTPException(404, "Employee not found")
    _ensure_employee_access(emp, user)

    old = bool(emp.active)
    emp.active = False
    log_action(
        db,
        shop_id=user.shop_id,
        module="Employees",
        action="DEACTIVATE",
        record_id=emp.employee_id,
        old={"active": old},
        new={"active": bool(emp.active)},
        user_id=user.user_id,
        commit=False,
    )
    db.commit()
    return {"success": True}


@router.get("/wages/due", response_model=list[WageDueRow])
def list_wage_due(
    branch_id: int | None = Query(None),
    as_of_date: date | None = Query(None),
    only_due: bool = Query(True),
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    user=Depends(require_permission("employees", "read")),
):
    bid = _resolve_branch(branch_id, user)
    as_of = as_of_date or _business_date(db, user.shop_id)

    query = db.query(Employee).filter(Employee.shop_id == user.shop_id, Employee.branch_id == bid)
    if not include_inactive:
        query = query.filter(Employee.active == True)  # noqa: E712
    emps = query.order_by(Employee.employee_name.asc()).all()

    rows = []
    for emp in emps:
        summary = _employee_wage_summary(
            db,
            employee=emp,
            period_from=_first_day(as_of),
            period_to=as_of,
            as_of_date=as_of,
        )
        due = _round2(summary["due_till_as_of"])
        if only_due and due <= 0:
            continue
        rows.append(
            {
                "employee_id": emp.employee_id,
                "employee_name": emp.employee_name,
                "branch_id": emp.branch_id,
                "wage_type": emp.wage_type,
                "earned_till_as_of": summary["earned_till_as_of"],
                "paid_till_as_of": summary["paid_till_as_of"],
                "due_till_as_of": due,
            }
        )
    rows.sort(key=lambda x: x["due_till_as_of"], reverse=True)
    return rows


@router.get("/wages/summary", response_model=WageOverallSummary)
def wages_summary(
    branch_id: int | None = Query(None),
    as_of_date: date | None = Query(None),
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    user=Depends(require_permission("employees", "read")),
):
    due_rows = list_wage_due(
        branch_id=branch_id,
        as_of_date=as_of_date,
        only_due=False,
        include_inactive=include_inactive,
        db=db,
        user=user,
    )
    as_of = as_of_date or _business_date(db, user.shop_id)
    earned = _round2(sum(x["earned_till_as_of"] for x in due_rows))
    paid = _round2(sum(x["paid_till_as_of"] for x in due_rows))
    due = _round2(sum(x["due_till_as_of"] for x in due_rows))
    return {
        "as_of_date": as_of,
        "employee_count": len(due_rows),
        "earned_till_as_of": earned,
        "paid_till_as_of": paid,
        "due_till_as_of": due,
        "rows": due_rows,
    }


@router.get("/{employee_id}", response_model=EmployeeResponse)
def get_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("employees", "read")),
):
    emp = (
        db.query(Employee)
        .filter(Employee.shop_id == user.shop_id, Employee.employee_id == employee_id)
        .first()
    )
    if not emp:
        raise HTTPException(404, "Employee not found")
    _ensure_employee_access(emp, user)
    return emp


@router.get("/{employee_id}/attendance", response_model=list[AttendanceResponse])
def list_employee_attendance(
    employee_id: int,
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    db: Session = Depends(get_db),
    user=Depends(require_permission("employees", "read")),
):
    emp = (
        db.query(Employee)
        .filter(Employee.shop_id == user.shop_id, Employee.employee_id == employee_id)
        .first()
    )
    if not emp:
        raise HTTPException(404, "Employee not found")
    _ensure_employee_access(emp, user)

    end = to_date or _business_date(db, user.shop_id)
    start = from_date or _first_day(end)
    if start > end:
        raise HTTPException(400, "from_date cannot be after to_date")

    rows = (
        db.query(EmployeeAttendance)
        .filter(
            EmployeeAttendance.shop_id == user.shop_id,
            EmployeeAttendance.employee_id == employee_id,
            EmployeeAttendance.attendance_date >= start,
            EmployeeAttendance.attendance_date <= end,
        )
        .order_by(EmployeeAttendance.attendance_date.desc())
        .limit(limit)
        .all()
    )
    return rows


@router.post("/{employee_id}/attendance", response_model=AttendanceResponse)
def upsert_employee_attendance(
    employee_id: int,
    payload: AttendanceUpsert,
    db: Session = Depends(get_db),
    user=Depends(require_permission("employees", "write")),
):
    emp = (
        db.query(Employee)
        .filter(Employee.shop_id == user.shop_id, Employee.employee_id == employee_id)
        .first()
    )
    if not emp:
        raise HTTPException(404, "Employee not found")
    _ensure_employee_access(emp, user)

    att_date = payload.attendance_date or _business_date(db, user.shop_id)
    st = _normalize_attendance_status(payload.status)
    units = max(0.0, min(_safe_float(payload.worked_units, 1.0), 1.0))
    if st == "HALF_DAY" and units == 0:
        units = 0.5
    if st in {"ABSENT", "LEAVE"}:
        units = 0.0 if st == "ABSENT" else 1.0

    computed_wage = _calculate_attendance_wage(
        emp,
        status=st,
        worked_units=units,
        wage_amount=payload.wage_amount,
    )

    row = (
        db.query(EmployeeAttendance)
        .filter(
            EmployeeAttendance.shop_id == user.shop_id,
            EmployeeAttendance.employee_id == employee_id,
            EmployeeAttendance.attendance_date == att_date,
        )
        .first()
    )
    action = "UPDATE_ATTENDANCE" if row else "CREATE_ATTENDANCE"
    if not row:
        row = EmployeeAttendance(
            shop_id=user.shop_id,
            employee_id=employee_id,
            branch_id=emp.branch_id,
            attendance_date=att_date,
            created_by=user.user_id,
        )
        db.add(row)

    row.status = st
    row.worked_units = units
    row.wage_amount = computed_wage
    row.notes = (payload.notes or "").strip() or None

    log_action(
        db,
        shop_id=user.shop_id,
        module="Employees",
        action=action,
        record_id=f"{emp.employee_name}:{att_date}",
        new={
            "employee_id": employee_id,
            "attendance_date": str(att_date),
            "status": st,
            "worked_units": units,
            "wage_amount": computed_wage,
        },
        user_id=user.user_id,
        commit=False,
    )
    db.commit()
    db.refresh(row)
    return row


@router.post("/attendance/bulk")
def bulk_upsert_attendance(
    payload: AttendanceBulkUpsert,
    db: Session = Depends(get_db),
    user=Depends(require_permission("employees", "write")),
):
    if not payload.items:
        raise HTTPException(400, "items are required")
    att_date = payload.attendance_date or _business_date(db, user.shop_id)

    employee_ids = list({int(x.employee_id) for x in payload.items})
    rows = (
        db.query(Employee)
        .filter(Employee.shop_id == user.shop_id, Employee.employee_id.in_(employee_ids))
        .all()
    )
    emap = {int(x.employee_id): x for x in rows}

    updated = 0
    created = 0
    errors = []

    for item in payload.items:
        emp = emap.get(int(item.employee_id))
        if not emp:
            errors.append({"employee_id": item.employee_id, "error": "Employee not found"})
            continue
        try:
            _ensure_employee_access(emp, user)
            st = _normalize_attendance_status(item.status)
            units = max(0.0, min(_safe_float(item.worked_units, 1.0), 1.0))
            if st == "HALF_DAY" and units == 0:
                units = 0.5
            if st in {"ABSENT", "LEAVE"}:
                units = 0.0 if st == "ABSENT" else 1.0
            wage = _calculate_attendance_wage(
                emp,
                status=st,
                worked_units=units,
                wage_amount=item.wage_amount,
            )

            existing = (
                db.query(EmployeeAttendance)
                .filter(
                    EmployeeAttendance.shop_id == user.shop_id,
                    EmployeeAttendance.employee_id == emp.employee_id,
                    EmployeeAttendance.attendance_date == att_date,
                )
                .first()
            )
            if not existing:
                existing = EmployeeAttendance(
                    shop_id=user.shop_id,
                    employee_id=emp.employee_id,
                    branch_id=emp.branch_id,
                    attendance_date=att_date,
                    created_by=user.user_id,
                )
                db.add(existing)
                created += 1
            else:
                updated += 1

            existing.status = st
            existing.worked_units = units
            existing.wage_amount = wage
            existing.notes = (item.notes or "").strip() or None
        except HTTPException as e:
            errors.append({"employee_id": item.employee_id, "error": str(e.detail)})

    log_action(
        db,
        shop_id=user.shop_id,
        module="Employees",
        action="BULK_ATTENDANCE",
        record_id=str(att_date),
        new={"created": created, "updated": updated, "errors": len(errors)},
        user_id=user.user_id,
        commit=False,
    )
    db.commit()
    return {"attendance_date": str(att_date), "created": created, "updated": updated, "errors": errors}


@router.get("/{employee_id}/payments", response_model=list[WagePaymentResponse])
def list_wage_payments(
    employee_id: int,
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    user=Depends(require_permission("employees", "read")),
):
    emp = (
        db.query(Employee)
        .filter(Employee.shop_id == user.shop_id, Employee.employee_id == employee_id)
        .first()
    )
    if not emp:
        raise HTTPException(404, "Employee not found")
    _ensure_employee_access(emp, user)

    return (
        db.query(EmployeeWagePayment)
        .filter(
            EmployeeWagePayment.shop_id == user.shop_id,
            EmployeeWagePayment.employee_id == employee_id,
        )
        .order_by(EmployeeWagePayment.payment_date.desc(), EmployeeWagePayment.payment_id.desc())
        .limit(limit)
        .all()
    )


@router.post("/{employee_id}/payments", response_model=WagePaymentResponse)
def create_wage_payment(
    employee_id: int,
    payload: WagePaymentCreate,
    db: Session = Depends(get_db),
    user=Depends(require_permission("employees", "write")),
):
    emp = (
        db.query(Employee)
        .filter(Employee.shop_id == user.shop_id, Employee.employee_id == employee_id)
        .first()
    )
    if not emp:
        raise HTTPException(404, "Employee not found")
    _ensure_employee_access(emp, user)

    amount = _safe_float(payload.amount, 0.0)
    if amount <= 0:
        raise HTTPException(400, "amount must be > 0")

    payment_date = payload.payment_date or _business_date(db, user.shop_id)
    mode = (payload.payment_mode or "CASH").strip().upper()
    if mode not in {"CASH", "UPI", "BANK", "CARD", "OTHER"}:
        mode = "OTHER"

    row = EmployeeWagePayment(
        shop_id=user.shop_id,
        employee_id=employee_id,
        branch_id=emp.branch_id,
        payment_date=payment_date,
        amount=_round2(amount),
        payment_mode=mode,
        notes=(payload.notes or "").strip() or None,
        created_by=user.user_id,
    )
    db.add(row)
    log_action(
        db,
        shop_id=user.shop_id,
        module="Employees",
        action="WAGE_PAYMENT",
        record_id=f"{emp.employee_name}:{payment_date}",
        new={
            "employee_id": employee_id,
            "payment_date": str(payment_date),
            "amount": row.amount,
            "payment_mode": row.payment_mode,
        },
        user_id=user.user_id,
        commit=False,
    )
    db.commit()
    db.refresh(row)
    return row


@router.get("/{employee_id}/wage-summary", response_model=EmployeeWageSummary)
def employee_wage_summary(
    employee_id: int,
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    as_of_date: date | None = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_permission("employees", "read")),
):
    emp = (
        db.query(Employee)
        .filter(Employee.shop_id == user.shop_id, Employee.employee_id == employee_id)
        .first()
    )
    if not emp:
        raise HTTPException(404, "Employee not found")
    _ensure_employee_access(emp, user)

    end = to_date or _business_date(db, user.shop_id)
    start = from_date or _first_day(end)
    if start > end:
        raise HTTPException(400, "from_date cannot be after to_date")
    as_of = as_of_date or end
    if as_of < start:
        as_of = end

    return _employee_wage_summary(
        db,
        employee=emp,
        period_from=start,
        period_to=end,
        as_of_date=as_of,
    )


# ---------- BULK IMPORT (upsert by employee_name or code) ----------
@router.post("/bulk-import")
def bulk_import_employees(
    rows: list[EmployeeBulkRow],
    db: Session = Depends(get_db),
    user=Depends(require_permission("employees", "write")),
):
    branch_map = {
        str(b.branch_name).strip().lower(): b.branch_id
        for b in db.query(Branch).filter(Branch.shop_id == user.shop_id).all()
    }
    default_branch_id = _resolve_branch(None, user)

    inserted = 0
    updated = 0
    errors = []

    for i, row in enumerate(rows):
        name = (row.employee_name or "").strip()
        if not name:
            errors.append({"row": i + 1, "error": "employee_name is required"})
            continue

        try:
            wage_type = _normalize_wage_type(row.wage_type or "DAILY")
        except HTTPException:
            errors.append({"row": i + 1, "error": f"Invalid wage_type '{row.wage_type}'"})
            continue

        daily_wage = _safe_float(row.daily_wage, 0.0)
        monthly_wage = _safe_float(row.monthly_wage, 0.0)
        if wage_type == "DAILY" and daily_wage <= 0:
            errors.append({"row": i + 1, "error": f"'{name}': daily_wage must be > 0 for DAILY wage type"})
            continue
        if wage_type == "MONTHLY" and monthly_wage <= 0:
            errors.append({"row": i + 1, "error": f"'{name}': monthly_wage must be > 0 for MONTHLY wage type"})
            continue

        branch_id = branch_map.get((row.branch_name or "").strip().lower(), default_branch_id)

        join_dt = None
        if row.join_date:
            try:
                join_dt = date.fromisoformat(str(row.join_date)[:10])
            except ValueError:
                pass

        code = (row.employee_code or "").strip() or None

        try:
            existing = None
            if code:
                existing = db.query(Employee).filter(
                    Employee.shop_id == user.shop_id,
                    Employee.employee_code == code,
                ).first()
            if not existing:
                existing = db.query(Employee).filter(
                    Employee.shop_id == user.shop_id,
                    Employee.employee_name == name,
                ).first()

            if existing:
                existing.employee_name = name
                if code:
                    existing.employee_code = code
                existing.mobile = (row.mobile or "").strip() or existing.mobile
                existing.designation = (row.designation or "").strip() or existing.designation
                existing.wage_type = wage_type
                existing.daily_wage = daily_wage
                existing.monthly_wage = monthly_wage
                if join_dt:
                    existing.join_date = join_dt
                existing.notes = (row.notes or "").strip() or existing.notes
                existing.branch_id = branch_id
                existing.active = True
                updated += 1
            else:
                db.add(Employee(
                    shop_id=user.shop_id,
                    branch_id=branch_id,
                    employee_code=code,
                    employee_name=name,
                    mobile=(row.mobile or "").strip() or None,
                    designation=(row.designation or "").strip() or None,
                    wage_type=wage_type,
                    daily_wage=daily_wage,
                    monthly_wage=monthly_wage,
                    join_date=join_dt or _business_date(db, user.shop_id),
                    notes=(row.notes or "").strip() or None,
                    active=True,
                    created_by=user.user_id,
                ))
                inserted += 1
        except Exception as e:
            errors.append({"row": i + 1, "error": str(e)})

    db.commit()
    return {"inserted": inserted, "updated": updated, "errors": errors}
