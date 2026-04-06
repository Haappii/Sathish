from datetime import date

from app.models.employee import Employee, EmployeeAttendance, EmployeeWagePayment
from app.models.shop_details import ShopDetails


def _set_business_date(db_session, as_of_date: date) -> None:
    shop = db_session.query(ShopDetails).filter(ShopDetails.shop_id == 1).first()
    shop.app_date = as_of_date
    db_session.add(shop)
    db_session.commit()


def _create_employee(
    db_session,
    *,
    employee_name: str,
    active: bool = True,
    join_date: date | None = None,
) -> Employee:
    row = Employee(
        shop_id=1,
        branch_id=1,
        employee_name=employee_name,
        wage_type="DAILY",
        daily_wage=500,
        monthly_wage=0,
        join_date=join_date,
        active=active,
        created_by=1,
    )
    db_session.add(row)
    db_session.commit()
    db_session.refresh(row)
    return row


def _cleanup_employee_records(db_session, employee_id: int) -> None:
    db_session.query(EmployeeAttendance).filter(
        EmployeeAttendance.employee_id == employee_id
    ).delete(synchronize_session=False)
    db_session.query(EmployeeWagePayment).filter(
        EmployeeWagePayment.employee_id == employee_id
    ).delete(synchronize_session=False)
    db_session.query(Employee).filter(
        Employee.employee_id == employee_id
    ).delete(synchronize_session=False)
    db_session.commit()


def test_deactivate_employee_blocks_pending_payable_balance(
    client,
    auth_headers,
    db_session,
):
    as_of_date = date(2026, 2, 10)
    _set_business_date(db_session, as_of_date)
    employee = _create_employee(
        db_session,
        employee_name="Pending Payable Employee",
        join_date=as_of_date,
    )

    try:
        db_session.add(
            EmployeeAttendance(
                shop_id=1,
                employee_id=employee.employee_id,
                branch_id=1,
                attendance_date=as_of_date,
                status="PRESENT",
                worked_units=1,
                wage_amount=500,
                created_by=1,
            )
        )
        db_session.commit()

        resp = client.delete(f"/api/employees/{employee.employee_id}", headers=auth_headers)

        assert resp.status_code == 400, resp.text
        assert "payable" in resp.json()["detail"].lower()

        db_session.expire_all()
        employee = db_session.query(Employee).filter(Employee.employee_id == employee.employee_id).first()
        assert employee is not None
        assert employee.active is True
    finally:
        _cleanup_employee_records(db_session, employee.employee_id)


def test_deactivate_employee_blocks_pending_receivable_balance(
    client,
    auth_headers,
    db_session,
):
    as_of_date = date(2026, 2, 10)
    _set_business_date(db_session, as_of_date)
    employee = _create_employee(
        db_session,
        employee_name="Pending Receivable Employee",
        join_date=as_of_date,
    )

    try:
        db_session.add(
            EmployeeAttendance(
                shop_id=1,
                employee_id=employee.employee_id,
                branch_id=1,
                attendance_date=as_of_date,
                status="PRESENT",
                worked_units=1,
                wage_amount=500,
                created_by=1,
            )
        )
        db_session.add(
            EmployeeWagePayment(
                shop_id=1,
                employee_id=employee.employee_id,
                branch_id=1,
                payment_date=as_of_date,
                amount=650,
                payment_mode="CASH",
                created_by=1,
            )
        )
        db_session.commit()

        resp = client.delete(f"/api/employees/{employee.employee_id}", headers=auth_headers)

        assert resp.status_code == 400, resp.text
        assert "receivable" in resp.json()["detail"].lower()

        db_session.expire_all()
        employee = db_session.query(Employee).filter(Employee.employee_id == employee.employee_id).first()
        assert employee is not None
        assert employee.active is True
    finally:
        _cleanup_employee_records(db_session, employee.employee_id)


def test_restore_employee_reactivates_inactive_employee(
    client,
    auth_headers,
    db_session,
):
    employee = _create_employee(
        db_session,
        employee_name="Inactive Employee",
        active=False,
        join_date=date(2026, 2, 10),
    )

    try:
        resp = client.post(f"/api/employees/{employee.employee_id}/restore", headers=auth_headers)

        assert resp.status_code == 200, resp.text
        assert resp.json()["employee_id"] == employee.employee_id
        assert resp.json()["active"] is True

        db_session.expire_all()
        employee = db_session.query(Employee).filter(Employee.employee_id == employee.employee_id).first()
        assert employee is not None
        assert employee.active is True
    finally:
        _cleanup_employee_records(db_session, employee.employee_id)
