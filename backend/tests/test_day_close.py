from datetime import date, datetime

from app.models.branch import Branch
from app.models.advance_order import AdvanceOrder
from app.models.branch_expense import BranchExpense
from app.models.cash_drawer import CashMovement, CashShift
from app.models.day_close import BranchDayClose
from app.models.employee import Employee, EmployeeWagePayment
from app.models.invoice import Invoice
from app.models.invoice_payment import InvoicePayment
from app.models.sales_return import SalesReturn
from app.models.sales_return_meta import SalesReturnMeta
from app.models.table_billing import Order, TableMaster


def _create_branch(db_session, *, branch_id: int, branch_name: str) -> Branch:
    branch = Branch(
        branch_id=branch_id,
        shop_id=1,
        branch_name=branch_name,
        type="Branch",
        status="ACTIVE",
        branch_close="N",
    )
    db_session.add(branch)
    db_session.flush()
    return branch


def test_close_branch_day_ignores_hidden_takeaway_orders(
    client,
    auth_headers,
    db_session,
    seeded_db,
):
    branch = _create_branch(db_session, branch_id=2001, branch_name="Takeaway Branch")
    table = TableMaster(
        shop_id=1,
        branch_id=branch.branch_id,
        table_name="__TAKEAWAY__",
        capacity=0,
        status="FREE",
    )
    db_session.add(table)
    db_session.flush()

    db_session.add(
        Order(
            shop_id=1,
            branch_id=branch.branch_id,
            table_id=table.table_id,
            order_type="TAKEAWAY",
            status="OPEN",
            opened_by=seeded_db["user_id"],
        )
    )
    db_session.commit()

    resp = client.post(
        "/api/day-close/branch",
        params={"date_str": "2026-02-07", "branch_id": branch.branch_id},
        headers=auth_headers,
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["message"] == "Branch day closed"

    close = (
        db_session.query(BranchDayClose)
        .filter(
            BranchDayClose.shop_id == 1,
            BranchDayClose.branch_id == branch.branch_id,
            BranchDayClose.close_date == date(2026, 2, 7),
        )
        .first()
    )
    assert close is not None


def test_close_branch_day_blocks_open_table_orders(
    client,
    auth_headers,
    db_session,
    seeded_db,
):
    branch = _create_branch(db_session, branch_id=2002, branch_name="Dining Branch")
    table = TableMaster(
        shop_id=1,
        branch_id=branch.branch_id,
        table_name="T-01",
        capacity=4,
        status="OCCUPIED",
    )
    db_session.add(table)
    db_session.flush()

    db_session.add(
        Order(
            shop_id=1,
            branch_id=branch.branch_id,
            table_id=table.table_id,
            order_type="DINE_IN",
            status="OPEN",
            opened_by=seeded_db["user_id"],
        )
    )
    db_session.commit()

    resp = client.post(
        "/api/day-close/branch",
        params={"date_str": "2026-02-08", "branch_id": branch.branch_id},
        headers=auth_headers,
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == (
        "Please complete or cancel all open table orders before closing the branch."
    )


def test_day_close_cash_summary_includes_business_cash_flows_and_excludes_wages(
    client,
    auth_headers,
    db_session,
    seeded_db,
):
    business_day = date(2026, 4, 13)
    business_dt = datetime(2026, 4, 13, 10, 0, 0)

    shift = CashShift(
        shop_id=1,
        branch_id=1,
        status="OPEN",
        opened_by=seeded_db["user_id"],
        opened_at=business_dt,
        opening_cash=100,
    )
    db_session.add(shift)
    db_session.flush()

    db_session.add_all(
        [
            CashMovement(
                shop_id=1,
                branch_id=1,
                shift_id=shift.shift_id,
                movement_type="IN",
                amount=10,
                reason="Top up",
                created_at=business_dt,
                created_by=seeded_db["user_id"],
            ),
            CashMovement(
                shop_id=1,
                branch_id=1,
                shift_id=shift.shift_id,
                movement_type="OUT",
                amount=5,
                reason="Withdrawal",
                created_at=business_dt,
                created_by=seeded_db["user_id"],
            ),
        ]
    )

    invoice_cash = Invoice(
        shop_id=1,
        branch_id=1,
        invoice_number="DC-INV-1001",
        total_amount=100,
        tax_amt=0,
        discounted_amt=0,
        payment_mode="cash",
        created_user=seeded_db["user_id"],
        created_time=business_dt,
    )
    invoice_split = Invoice(
        shop_id=1,
        branch_id=1,
        invoice_number="DC-INV-1002",
        total_amount=100,
        tax_amt=0,
        discounted_amt=0,
        payment_mode="split",
        payment_split={"cash": 30, "upi": 70},
        created_user=seeded_db["user_id"],
        created_time=business_dt,
    )
    invoice_due = Invoice(
        shop_id=1,
        branch_id=1,
        invoice_number="DC-INV-1003",
        total_amount=200,
        tax_amt=0,
        discounted_amt=0,
        payment_mode="due",
        created_user=seeded_db["user_id"],
        created_time=business_dt,
    )
    db_session.add_all([invoice_cash, invoice_split, invoice_due])
    db_session.flush()

    db_session.add(InvoicePayment(
        shop_id=1,
        invoice_id=invoice_due.invoice_id,
        invoice_number=invoice_due.invoice_number,
        customer_id=None,
        branch_id=1,
        amount=50,
        payment_mode="cash",
        paid_on=business_dt,
        created_by=seeded_db["user_id"],
    ))

    db_session.add(AdvanceOrder(
        shop_id=1,
        branch_id=1,
        customer_name="Advance Customer",
        customer_phone="9999990000",
        expected_date=business_day,
        total_amount=100,
        advance_amount=15,
        advance_payment_mode="CASH",
        status="PENDING",
        created_at=business_dt,
        created_by=seeded_db["user_id"],
    ))

    db_session.add(BranchExpense(
        shop_id=1,
        branch_id=1,
        expense_date=business_day,
        amount=25,
        category="Packing",
        payment_mode="CASH",
        note="Covers day close expense",
        created_by=seeded_db["user_id"],
        created_at=business_dt,
    ))

    employee = Employee(
        shop_id=1,
        branch_id=1,
        employee_name="Worker",
        wage_type="DAILY",
        daily_wage=500,
        created_by=seeded_db["user_id"],
    )
    db_session.add(employee)
    db_session.flush()

    db_session.add(EmployeeWagePayment(
        shop_id=1,
        employee_id=employee.employee_id,
        branch_id=1,
        payment_date=business_day,
        amount=40,
        payment_mode="CASH",
        created_by=seeded_db["user_id"],
    ))

    return_cash = SalesReturn(
        shop_id=1,
        branch_id=1,
        return_number="DC-RET-1001",
        invoice_id=invoice_cash.invoice_id,
        invoice_number=invoice_cash.invoice_number,
        subtotal_amount=20,
        tax_amount=0,
        discount_amount=0,
        refund_amount=20,
        status="COMPLETED",
        created_by=seeded_db["user_id"],
        created_on=business_dt,
    )
    return_wallet = SalesReturn(
        shop_id=1,
        branch_id=1,
        return_number="DC-RET-1002",
        invoice_id=invoice_split.invoice_id,
        invoice_number=invoice_split.invoice_number,
        subtotal_amount=30,
        tax_amount=0,
        discount_amount=0,
        refund_amount=30,
        status="COMPLETED",
        created_by=seeded_db["user_id"],
        created_on=business_dt,
    )
    db_session.add_all([return_cash, return_wallet])
    db_session.flush()

    db_session.add_all(
        [
            SalesReturnMeta(
                shop_id=1,
                return_id=return_cash.return_id,
                refund_mode="CASH",
                created_by=seeded_db["user_id"],
            ),
            SalesReturnMeta(
                shop_id=1,
                return_id=return_wallet.return_id,
                refund_mode="WALLET",
                created_by=seeded_db["user_id"],
            ),
        ]
    )
    db_session.commit()

    resp = client.get(
        "/api/day-close/cash-summary",
        params={"date_str": "2026-04-13", "branch_id": 1},
        headers=auth_headers,
    )

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["cash_sales"] == 130.0
    assert data["cash_collections"] == 50.0
    assert data["cash_advance_payments"] == 15.0
    assert data["cash_top_up"] == 10.0
    assert data["cash_in"] == 205.0
    assert data["return_cash"] == 20.0
    assert data["cash_expense"] == 25.0
    assert data["cash_wages"] == 40.0
    assert data["cash_withdrawal"] == 5.0
    assert data["cash_out"] == 50.0
    assert data["operational_cash_out"] == 45.0
    assert data["system_cash"] == 255.0
