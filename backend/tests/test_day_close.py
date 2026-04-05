from datetime import date

from app.models.branch import Branch
from app.models.day_close import BranchDayClose
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
