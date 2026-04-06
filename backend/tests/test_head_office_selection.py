from app.models.branch import Branch
from app.models.shop_details import ShopDetails
from app.models.users import User


def _create_branch(db_session, *, branch_id: int, branch_name: str, branch_type: str = "Branch") -> Branch:
    branch = Branch(
        branch_id=branch_id,
        shop_id=1,
        branch_name=branch_name,
        type=branch_type,
        status="ACTIVE",
        branch_close="N",
    )
    db_session.add(branch)
    db_session.commit()
    db_session.refresh(branch)
    return branch


def test_shop_details_returns_selected_head_office_branch(client, auth_headers, db_session):
    branch = _create_branch(db_session, branch_id=3001, branch_name="City Branch")

    resp = client.post(
        "/api/shop/",
        json={"head_office_branch_id": branch.branch_id},
        headers=auth_headers,
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["head_office_branch_id"] == branch.branch_id

    details = client.get("/api/shop/details", headers=auth_headers)
    assert details.status_code == 200, details.text
    assert details.json()["head_office_branch_id"] == branch.branch_id


def test_shop_details_falls_back_to_legacy_head_office_branch(client, auth_headers, db_session):
    shop = db_session.query(ShopDetails).filter(ShopDetails.shop_id == 1).first()
    assert shop is not None

    shop.head_office_branch_id = None
    db_session.add(shop)
    db_session.commit()

    details = client.get("/api/shop/details", headers=auth_headers)
    assert details.status_code == 200, details.text
    assert details.json()["head_office_branch_id"] == 1


def test_shop_close_uses_selected_head_office_branch(client, auth_headers, db_session, seeded_db):
    shop = db_session.query(ShopDetails).filter(ShopDetails.shop_id == 1).first()
    admin = db_session.query(User).filter(User.user_id == seeded_db["user_id"]).first()
    branch = _create_branch(db_session, branch_id=3002, branch_name="Selected HO")

    shop.head_office_branch_id = branch.branch_id
    db_session.add(shop)
    db_session.commit()

    admin.branch_id = 1
    db_session.add(admin)
    db_session.commit()

    blocked = client.post(
        "/api/day-close/shop",
        params={"date_str": "2026-03-01"},
        headers=auth_headers,
    )
    assert blocked.status_code == 403
    assert blocked.json()["detail"] == "Shop close allowed only from Head Office"

    active_branch_ids = [
        int(row.branch_id)
        for row in db_session.query(Branch)
        .filter(Branch.shop_id == 1, Branch.status == "ACTIVE")
        .all()
        if int(row.branch_id) != int(branch.branch_id)
    ]
    for branch_id in active_branch_ids:
        close_branch = client.post(
            "/api/day-close/branch",
            params={"date_str": "2026-03-01", "branch_id": branch_id},
            headers=auth_headers,
        )
        assert close_branch.status_code == 200, close_branch.text

    admin.branch_id = branch.branch_id
    db_session.add(admin)
    db_session.commit()

    allowed = client.post(
        "/api/day-close/shop",
        params={"date_str": "2026-03-01"},
        headers=auth_headers,
    )
    assert allowed.status_code == 200, allowed.text
    assert allowed.json()["message"] == "Shop day closed"
