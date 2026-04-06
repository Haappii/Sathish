from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, func
from sqlalchemy.orm import Session
from datetime import datetime, date, timedelta

from app.db import get_db
from app.models.branch import Branch
from app.models.table_billing import Order, TableMaster
from app.models.day_close import BranchDayClose, ShopDayClose
from app.models.month_close import BranchMonthClose, ShopMonthClose
from app.models.stock import Inventory
from app.models.date_wise_stock import DateWiseStock
from app.services.financials_service import calc_day_close_totals
from app.utils.permissions import require_permission
from app.utils.head_office import is_head_office_branch, get_head_office_branch_id
from app.models.shop_details import ShopDetails

router = APIRouter(prefix="/day-close", tags=["Day Close"])
TAKEAWAY_TABLE_NAME = "__TAKEAWAY__"

def parse_date(d: str) -> date:
    try:
        return datetime.strptime(d, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "Invalid date format YYYY-MM-DD")


def calc_totals(db: Session, shop_id: int, branch_id: int | None, from_dt: date, to_dt: date):
    return calc_day_close_totals(
        db,
        shop_id=shop_id,
        branch_id=branch_id,
        from_dt=from_dt,
        to_dt=to_dt,
    )


def snapshot_stock(db: Session, shop_id: int, branch_id: int, stock_date: date):
    db.query(DateWiseStock).filter(
        DateWiseStock.shop_id == shop_id,
        DateWiseStock.branch_id == branch_id,
        DateWiseStock.stock_date == stock_date
    ).delete()

    rows = (
        db.query(Inventory)
        .filter(Inventory.branch_id == branch_id, Inventory.shop_id == shop_id)
        .all()
    )
    for r in rows:
        db.add(DateWiseStock(
            stock_date=stock_date,
            shop_id=shop_id,
            branch_id=branch_id,
            item_id=r.item_id,
            quantity=r.quantity
        ))


def count_open_table_orders(db: Session, shop_id: int, branch_id: int) -> int:
    # Ignore hidden takeaway rows so branch close only blocks on actual table orders.
    return (
        db.query(Order.order_id)
        .outerjoin(
            TableMaster,
            and_(
                TableMaster.table_id == Order.table_id,
                TableMaster.shop_id == Order.shop_id,
            ),
        )
        .filter(
            Order.shop_id == shop_id,
            Order.branch_id == branch_id,
            Order.status == "OPEN",
            func.coalesce(func.upper(Order.order_type), "DINE_IN") != "TAKEAWAY",
            func.coalesce(TableMaster.table_name, "") != TAKEAWAY_TABLE_NAME,
        )
        .count()
    )


@router.get("/status")
def day_close_status(
    date_str: str,
    db: Session = Depends(get_db),
    user=Depends(require_permission("day_close", "read")),
):
    d = parse_date(date_str)
    branches = db.query(Branch).filter(
        Branch.status == "ACTIVE",
        Branch.shop_id == user.shop_id
    ).all()

    return [
        {
            "branch_id": b.branch_id,
            "branch_name": b.branch_name,
            "closed": (b.branch_close or "N").upper() == "Y",
        }
        for b in branches
    ]


@router.post("/branch")
def close_branch_day(
    date_str: str,
    branch_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("day_close", "write")),
):
    d = parse_date(date_str)

    open_table_orders = count_open_table_orders(
        db,
        int(user.shop_id),
        int(branch_id),
    )
    if open_table_orders > 0:
        raise HTTPException(
            400,
            "Please complete or cancel all open table orders before closing the branch."
        )

    exists = db.query(BranchDayClose).filter(
        BranchDayClose.branch_id == branch_id,
        BranchDayClose.close_date == d,
        BranchDayClose.shop_id == user.shop_id
    ).first()
    if exists:
        raise HTTPException(400, "Branch already closed for this date")

    totals = calc_totals(db, user.shop_id, branch_id, d, d)
    close = BranchDayClose(
        shop_id=user.shop_id,
        branch_id=branch_id,
        close_date=d,
        closed_by=user.user_id,
        **totals
    )
    db.add(close)
    snapshot_stock(db, user.shop_id, branch_id, d)
    # mark branch closed
    db.query(Branch).filter(
        Branch.branch_id == branch_id,
        Branch.shop_id == user.shop_id
    ).update(
        {"branch_close": "Y"}
    )
    db.commit()

    # If all branches closed, close shop
    branches = db.query(Branch).filter(
        Branch.status == "ACTIVE",
        Branch.shop_id == user.shop_id
    ).all()
    closed_count = db.query(BranchDayClose).filter(
        BranchDayClose.close_date == d,
        BranchDayClose.shop_id == user.shop_id
    ).count()
    if closed_count == len(branches):
        shop_exists = db.query(ShopDayClose).filter(
            ShopDayClose.close_date == d,
            ShopDayClose.shop_id == user.shop_id
        ).first()
        if not shop_exists:
            shop_totals = calc_totals(db, user.shop_id, None, d, d)
            shop_close = ShopDayClose(
                shop_id=user.shop_id,
                close_date=d,
                closed_by=user.user_id,
                **shop_totals
            )
            db.add(shop_close)
            db.commit()

    return {"message": "Branch day closed", "totals": totals}


@router.post("/month/branch")
def close_branch_month(
    month: str,
    branch_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("day_close", "write")),
):
    # YYYY-MM
    try:
        start = datetime.strptime(month + "-01", "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "Invalid month format YYYY-MM")
    if start.month == 12:
        end = date(start.year + 1, 1, 1) - timedelta(days=1)
    else:
        end = date(start.year, start.month + 1, 1) - timedelta(days=1)

    exists = db.query(BranchMonthClose).filter(
        BranchMonthClose.branch_id == branch_id,
        BranchMonthClose.month_key == month,
        BranchMonthClose.shop_id == user.shop_id
    ).first()
    if exists:
        raise HTTPException(400, "Branch already closed for this month")

    totals = calc_totals(db, user.shop_id, branch_id, start, end)
    close = BranchMonthClose(
        shop_id=user.shop_id,
        branch_id=branch_id,
        month_key=month,
        month_start=start,
        month_end=end,
        closed_by=user.user_id,
        **totals
    )
    db.add(close)
    db.commit()

    # If all branches closed, close shop month
    branches = db.query(Branch).filter(
        Branch.status == "ACTIVE",
        Branch.shop_id == user.shop_id
    ).all()
    closed_count = db.query(BranchMonthClose).filter(
        BranchMonthClose.month_key == month,
        BranchMonthClose.shop_id == user.shop_id
    ).count()
    if closed_count == len(branches):
        shop_exists = db.query(ShopMonthClose).filter(
            ShopMonthClose.month_key == month,
            ShopMonthClose.shop_id == user.shop_id
        ).first()
        if not shop_exists:
            shop_totals = calc_totals(db, user.shop_id, None, start, end)
            shop_close = ShopMonthClose(
                shop_id=user.shop_id,
                month_key=month,
                month_start=start,
                month_end=end,
                closed_by=user.user_id,
                **shop_totals
            )
            db.add(shop_close)
            db.commit()

    return {"message": "Branch month closed", "totals": totals}


@router.post("/shop")
def close_shop_day(
    date_str: str,
    db: Session = Depends(get_db),
    user=Depends(require_permission("day_close", "write")),
):
    # Permission already checked by dependency.

    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == user.shop_id).first()
    if not is_head_office_branch(
        db,
        shop_id=user.shop_id,
        branch_id=getattr(user, "branch_id", None),
        shop=shop,
    ):
        raise HTTPException(403, "Shop close allowed only from Head Office")

    d = parse_date(date_str)

    # ensure all branches closed (using branch_close flag)
    head_office_branch_id = get_head_office_branch_id(db, shop_id=user.shop_id, shop=shop)
    branches = db.query(Branch).filter(
        Branch.status == "ACTIVE",
        Branch.shop_id == user.shop_id
    ).all()
    active_branches = [
        b for b in branches
        if head_office_branch_id is None or int(b.branch_id) != int(head_office_branch_id)
    ]
    closed_ids = set(
        r[0] for r in db.query(BranchDayClose.branch_id)
        .filter(BranchDayClose.close_date == d, BranchDayClose.shop_id == user.shop_id)
        .all()
    )

    if any(
        (b.branch_close or "N").upper() != "Y" and b.branch_id not in closed_ids
        for b in active_branches
    ):
        pending = [
            b.branch_name for b in active_branches
            if (b.branch_close or "N").upper() != "Y" and b.branch_id not in closed_ids
        ]
        detail = "All branches must be closed first"
        if pending:
            detail += f": {', '.join(pending)}"
        raise HTTPException(400, detail)

    # wipe existing day-close rows for this date and recalculate
    db.query(BranchDayClose).filter(
        BranchDayClose.close_date == d,
        BranchDayClose.shop_id == user.shop_id
    ).delete()
    db.query(ShopDayClose).filter(
        ShopDayClose.close_date == d,
        ShopDayClose.shop_id == user.shop_id
    ).delete()
    db.query(DateWiseStock).filter(
        DateWiseStock.stock_date == d,
        DateWiseStock.shop_id == user.shop_id
    ).delete()
    db.commit()

    for b in active_branches:
        totals = calc_totals(db, user.shop_id, b.branch_id, d, d)
        db.add(BranchDayClose(
            shop_id=user.shop_id,
            branch_id=b.branch_id,
            close_date=d,
            closed_by=user.user_id,
            **totals
        ))
        snapshot_stock(db, user.shop_id, b.branch_id, d)
    db.commit()

    shop_totals = calc_totals(db, user.shop_id, None, d, d)
    db.add(ShopDayClose(
        shop_id=user.shop_id,
        close_date=d,
        closed_by=user.user_id,
        **shop_totals
    ))

    # auto month close as part of shop close
    month_key = d.strftime("%Y-%m")
    month_start = date(d.year, d.month, 1)
    if d.month == 12:
        month_end = date(d.year + 1, 1, 1) - timedelta(days=1)
    else:
        month_end = date(d.year, d.month + 1, 1) - timedelta(days=1)

    db.query(BranchMonthClose).filter(
        BranchMonthClose.month_key == month_key,
        BranchMonthClose.shop_id == user.shop_id
    ).delete()
    db.query(ShopMonthClose).filter(
        ShopMonthClose.month_key == month_key,
        ShopMonthClose.shop_id == user.shop_id
    ).delete()
    db.commit()

    for b in active_branches:
        month_totals = calc_totals(db, user.shop_id, b.branch_id, month_start, month_end)
        db.add(BranchMonthClose(
            shop_id=user.shop_id,
            branch_id=b.branch_id,
            month_key=month_key,
            month_start=month_start,
            month_end=month_end,
            closed_by=user.user_id,
            **month_totals
        ))
    db.commit()

    shop_month_totals = calc_totals(db, user.shop_id, None, month_start, month_end)
    db.add(ShopMonthClose(
        shop_id=user.shop_id,
        month_key=month_key,
        month_start=month_start,
        month_end=month_end,
        closed_by=user.user_id,
        **shop_month_totals
    ))

    # advance app date
    if shop:
        shop.app_date = d + timedelta(days=1)
    # reset branch close flags
    db.query(Branch).filter(Branch.shop_id == user.shop_id).update({"branch_close": "N"})
    db.commit()

    return {"message": "Shop day closed", "totals": shop_totals, "next_date": (d + timedelta(days=1)).isoformat()}
