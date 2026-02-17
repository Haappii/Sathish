from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta, date

from app.db import get_db
from app.models.invoice import Invoice
from app.models.invoice_details import InvoiceDetail
from app.models.shop_details import ShopDetails
from app.utils.auth_user import get_current_user

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

def get_business_date(db: Session, shop_id: int) -> date:
    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == shop_id).first()
    return shop.app_date if shop and shop.app_date else datetime.now().date()


@router.get("/stats")
def get_dashboard_stats(
    request: Request,
    db: Session = Depends(get_db),
    user = Depends(get_current_user)
):

    # Default branch is the user’s active branch (from session)
    branch_id = user.branch_id

    # Admin may supply a different branch_id via query param
    q_branch = request.query_params.get("branch_id")
    if str(user.role_name).lower() == "admin" and q_branch:
        branch_id = int(q_branch)

    today = get_business_date(db, user.shop_id)

    base_query = db.query(Invoice).filter(
        func.date(Invoice.created_time) == today,
        Invoice.shop_id == user.shop_id
    )

    # Apply branch filter
    base_query = base_query.filter(Invoice.branch_id == branch_id)

    today_bills_count = db.query(func.count(Invoice.invoice_id)) \
        .filter(func.date(Invoice.created_time) == today) \
        .filter(Invoice.shop_id == user.shop_id) \
        .filter(Invoice.branch_id == branch_id) \
        .scalar()

    today_sales = db.query(func.sum(Invoice.total_amount)) \
        .filter(func.date(Invoice.created_time) == today) \
        .filter(Invoice.shop_id == user.shop_id) \
        .filter(Invoice.branch_id == branch_id) \
        .scalar() or 0

    total_bills = db.query(func.count(Invoice.invoice_id)) \
        .filter(Invoice.shop_id == user.shop_id) \
        .filter(Invoice.branch_id == branch_id) \
        .scalar()

    return {
        "branch_id": branch_id,
        "today_sales": float(today_sales),
        "today_bills": int(today_bills_count),
        "total_bills": int(total_bills)
    }


@router.get("/trends")
def get_trends(
    period: str = "day",  # day|week|month
    size: int = 7,
    request: Request = None,
    db: Session = Depends(get_db),
    user = Depends(get_current_user)
):
    branch_id = user.branch_id
    q_branch = request.query_params.get("branch_id")
    if str(user.role_name).lower() == "admin" and q_branch:
        branch_id = int(q_branch)

    biz_date = get_business_date(db, user.shop_id)
    period = (period or "day").lower()
    size = max(1, min(int(size or 7), 31 if period == "day" else 24))

    if period == "day":
        start = biz_date - timedelta(days=size - 1)
        rows = (
            db.query(
                func.date(Invoice.created_time).label("d"),
                func.sum(Invoice.total_amount).label("sales"),
                func.count(Invoice.invoice_id).label("bills"),
            )
            .filter(
                Invoice.shop_id == user.shop_id,
                Invoice.branch_id == branch_id,
                func.date(Invoice.created_time).between(start, biz_date)
            )
            .group_by(func.date(Invoice.created_time))
            .order_by(func.date(Invoice.created_time))
            .all()
        )
        data_map = {r.d: r for r in rows}
        data = []
        for i in range(size):
            d = start + timedelta(days=i)
            r = data_map.get(d)
            data.append({
                "label": d.strftime("%d %b"),
                "sales": float(r.sales or 0) if r else 0.0,
                "bills": int(r.bills or 0) if r else 0
            })
        return {"period": "day", "data": data}

    if period == "week":
        # weeks ending on business date
        end = biz_date
        start = biz_date - timedelta(weeks=size - 1, days=6)
        rows = (
            db.query(
                func.date_trunc("week", Invoice.created_time).label("w"),
                func.sum(Invoice.total_amount).label("sales"),
                func.count(Invoice.invoice_id).label("bills"),
            )
            .filter(
                Invoice.shop_id == user.shop_id,
                Invoice.branch_id == branch_id,
                func.date(Invoice.created_time).between(start, end)
            )
            .group_by(func.date_trunc("week", Invoice.created_time))
            .order_by(func.date_trunc("week", Invoice.created_time))
            .all()
        )
        data_map = {r.w.date(): r for r in rows}
        data = []
        # build week starts
        start_week = (start - timedelta(days=start.weekday()))
        for i in range(size):
            wk_start = start_week + timedelta(weeks=i)
            r = data_map.get(wk_start)
            label = f"{wk_start.strftime('%d %b')}"
            data.append({
                "label": label,
                "sales": float(r.sales or 0) if r else 0.0,
                "bills": int(r.bills or 0) if r else 0
            })
        return {"period": "week", "data": data}

    # month
    end = biz_date
    start_month = date(end.year, end.month, 1)
    # move back size-1 months
    y, m = start_month.year, start_month.month
    for _ in range(size - 1):
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    start = date(y, m, 1)
    rows = (
        db.query(
            func.date_trunc("month", Invoice.created_time).label("m"),
            func.sum(Invoice.total_amount).label("sales"),
            func.count(Invoice.invoice_id).label("bills"),
        )
        .filter(
            Invoice.shop_id == user.shop_id,
            Invoice.branch_id == branch_id,
            func.date(Invoice.created_time).between(start, end)
        )
        .group_by(func.date_trunc("month", Invoice.created_time))
        .order_by(func.date_trunc("month", Invoice.created_time))
        .all()
    )
    data_map = {r.m.date(): r for r in rows}
    data = []
    y, m = start.year, start.month
    for _ in range(size):
        cur = date(y, m, 1)
        r = data_map.get(cur)
        data.append({
            "label": cur.strftime("%b %Y"),
            "sales": float(r.sales or 0) if r else 0.0,
            "bills": int(r.bills or 0) if r else 0
        })
        m += 1
        if m == 13:
            m = 1
            y += 1
    return {"period": "month", "data": data}


@router.get("/trend-metric")
def get_trend_metric(
    metric: str = "sales",
    period: str = "day",
    size: int = 7,
    compare: str | None = None,
    request: Request = None,
    db: Session = Depends(get_db),
    user = Depends(get_current_user)
):
    branch_id = user.branch_id
    q_branch = request.query_params.get("branch_id")
    if str(user.role_name).lower() == "admin" and q_branch:
        branch_id = int(q_branch)

    biz_date = get_business_date(db, user.shop_id)
    period = (period or "day").lower()
    metric = (metric or "sales").lower()
    size = max(1, min(int(size or 7), 31 if period == "day" else 24))

    def group_key(col):
        if period == "day":
            return func.date(col)
        if period == "week":
            return func.date_trunc("week", col)
        return func.date_trunc("month", col)

    def label_for(dt_obj):
        if period == "day":
            return dt_obj.strftime("%d %b")
        if period == "week":
            return dt_obj.strftime("%d %b")
        return dt_obj.strftime("%b %Y")

    if period == "day":
        start = biz_date - timedelta(days=size - 1)
        end = biz_date
    elif period == "week":
        end = biz_date
        start = biz_date - timedelta(weeks=size - 1, days=6)
    else:
        end = biz_date
        start_month = date(end.year, end.month, 1)
        y, m = start_month.year, start_month.month
        for _ in range(size - 1):
            m -= 1
            if m == 0:
                m = 12
                y -= 1
        start = date(y, m, 1)

    if compare == "prev":
        if period == "day":
            prev_end = start - timedelta(days=1)
            prev_start = prev_end - timedelta(days=size - 1)
        elif period == "week":
            prev_end = start - timedelta(days=1)
            prev_start = prev_end - timedelta(weeks=size - 1, days=6)
        else:
            prev_end = start - timedelta(days=1)
            prev_start = date(prev_end.year, prev_end.month, 1)
            y, m = prev_start.year, prev_start.month
            for _ in range(size - 1):
                m -= 1
                if m == 0:
                    m = 12
                    y -= 1
            prev_start = date(y, m, 1)
        start, end = prev_start, prev_end

    if metric in ["sales", "bills", "gst", "discount", "avg_bill"]:
        agg_col = {
            "sales": func.sum(Invoice.total_amount),
            "bills": func.count(Invoice.invoice_id),
            "gst": func.sum(Invoice.tax_amt),
            "discount": func.sum(Invoice.discounted_amt),
            "avg_bill": func.avg(Invoice.total_amount)
        }[metric]
        rows = (
            db.query(
                group_key(Invoice.created_time).label("k"),
                agg_col.label("v")
            )
            .filter(
                Invoice.shop_id == user.shop_id,
                Invoice.branch_id == branch_id,
                func.date(Invoice.created_time).between(start, end)
            )
            .group_by(group_key(Invoice.created_time))
            .order_by(group_key(Invoice.created_time))
            .all()
        )
        data_map = {
            (r.k.date() if hasattr(r.k, "date") else r.k): r
            for r in rows
        }
    elif metric in ["items"]:
        rows = (
            db.query(
                group_key(Invoice.created_time).label("k"),
                func.sum(InvoiceDetail.quantity).label("v")
            )
            .join(InvoiceDetail, InvoiceDetail.invoice_id == Invoice.invoice_id)
            .filter(
                Invoice.shop_id == user.shop_id,
                Invoice.branch_id == branch_id,
                func.date(Invoice.created_time).between(start, end)
            )
            .group_by(group_key(Invoice.created_time))
            .order_by(group_key(Invoice.created_time))
            .all()
        )
        data_map = {
            (r.k.date() if hasattr(r.k, "date") else r.k): r
            for r in rows
        }
    elif metric in ["expense"]:
        from app.models.branch_expense import BranchExpense
        rows = (
            db.query(
                group_key(BranchExpense.expense_date).label("k"),
                func.sum(BranchExpense.amount).label("v")
            )
            .filter(
                BranchExpense.shop_id == user.shop_id,
                BranchExpense.branch_id == branch_id,
                BranchExpense.expense_date.between(start, end)
            )
            .group_by(group_key(BranchExpense.expense_date))
            .order_by(group_key(BranchExpense.expense_date))
            .all()
        )
        data_map = {
            (r.k.date() if hasattr(r.k, "date") else r.k): r
            for r in rows
        }
    elif metric in ["profit", "gross_profit"]:
        from sqlalchemy import and_, case
        from app.models.branch_expense import BranchExpense
        from app.models.sales_return import SalesReturn, SalesReturnItem

        inv_total_expr = func.coalesce(Invoice.total_amount, 0)
        inv_tax_expr = func.coalesce(Invoice.tax_amt, 0)
        inv_sales_ex_tax_expr = inv_total_expr - inv_tax_expr
        inv_discount_ex_tax_expr = case(
            (
                inv_total_expr > 0,
                func.coalesce(Invoice.discounted_amt, 0)
                * (inv_sales_ex_tax_expr / func.nullif(inv_total_expr, 0)),
            ),
            else_=0,
        )

        inv_sum_rows = (
            db.query(
                group_key(Invoice.created_time).label("k"),
                func.sum(inv_sales_ex_tax_expr).label("sales_ex_tax"),
                func.sum(inv_discount_ex_tax_expr).label("discount_ex_tax"),
            )
            .filter(
                Invoice.shop_id == user.shop_id,
                Invoice.branch_id == branch_id,
                func.date(Invoice.created_time).between(start, end)
            )
            .group_by(group_key(Invoice.created_time))
            .order_by(group_key(Invoice.created_time))
            .all()
        )
        inv_cogs_rows = (
            db.query(
                group_key(Invoice.created_time).label("k"),
                func.sum(
                    func.coalesce(InvoiceDetail.buy_price, 0) * func.coalesce(InvoiceDetail.quantity, 0)
                ).label("cogs"),
            )
            .join(InvoiceDetail, InvoiceDetail.invoice_id == Invoice.invoice_id)
            .filter(
                Invoice.shop_id == user.shop_id,
                Invoice.branch_id == branch_id,
                func.date(Invoice.created_time).between(start, end)
            )
            .group_by(group_key(Invoice.created_time))
            .order_by(group_key(Invoice.created_time))
            .all()
        )

        ret_inv_total_expr = func.coalesce(Invoice.total_amount, 0)
        ret_inv_tax_expr = func.coalesce(Invoice.tax_amt, 0)
        ret_inv_sales_ex_tax_expr = ret_inv_total_expr - ret_inv_tax_expr
        ret_discount_ex_tax_expr = case(
            (
                ret_inv_total_expr > 0,
                func.coalesce(SalesReturn.discount_amount, 0)
                * (ret_inv_sales_ex_tax_expr / func.nullif(ret_inv_total_expr, 0)),
            ),
            else_=0,
        )
        ret_sum_rows = (
            db.query(
                group_key(SalesReturn.created_on).label("k"),
                func.sum(
                    func.coalesce(SalesReturn.refund_amount, 0)
                    + func.coalesce(SalesReturn.discount_amount, 0)
                    - func.coalesce(SalesReturn.tax_amount, 0)
                ).label("sales_ex_tax"),
                func.sum(ret_discount_ex_tax_expr).label("discount_ex_tax"),
            )
            .join(
                Invoice,
                and_(
                    Invoice.invoice_id == SalesReturn.invoice_id,
                    Invoice.shop_id == SalesReturn.shop_id,
                ),
            )
            .filter(
                SalesReturn.shop_id == user.shop_id,
                SalesReturn.branch_id == branch_id,
                SalesReturn.status != "CANCELLED",
                func.date(SalesReturn.created_on).between(start, end)
            )
            .group_by(group_key(SalesReturn.created_on))
            .order_by(group_key(SalesReturn.created_on))
            .all()
        )

        inv_cost_sq = (
            db.query(
                InvoiceDetail.invoice_id.label("invoice_id"),
                InvoiceDetail.item_id.label("item_id"),
                func.max(InvoiceDetail.buy_price).label("buy_price"),
            )
            .filter(InvoiceDetail.shop_id == user.shop_id)
            .group_by(InvoiceDetail.invoice_id, InvoiceDetail.item_id)
            .subquery()
        )
        ret_cogs_rows = (
            db.query(
                group_key(SalesReturn.created_on).label("k"),
                func.sum(SalesReturnItem.quantity * inv_cost_sq.c.buy_price).label("cogs"),
            )
            .join(SalesReturn, SalesReturn.return_id == SalesReturnItem.return_id)
            .join(
                inv_cost_sq,
                and_(
                    inv_cost_sq.c.invoice_id == SalesReturn.invoice_id,
                    inv_cost_sq.c.item_id == SalesReturnItem.item_id,
                ),
            )
            .filter(
                SalesReturnItem.shop_id == user.shop_id,
                SalesReturn.shop_id == user.shop_id,
                SalesReturn.branch_id == branch_id,
                SalesReturn.status != "CANCELLED",
                func.date(SalesReturn.created_on).between(start, end),
            )
            .group_by(group_key(SalesReturn.created_on))
            .order_by(group_key(SalesReturn.created_on))
            .all()
        )

        expense_rows = (
            db.query(
                group_key(BranchExpense.expense_date).label("k"),
                func.sum(BranchExpense.amount).label("expense")
            )
            .filter(
                BranchExpense.shop_id == user.shop_id,
                BranchExpense.branch_id == branch_id,
                BranchExpense.expense_date.between(start, end)
            )
            .group_by(group_key(BranchExpense.expense_date))
            .order_by(group_key(BranchExpense.expense_date))
            .all()
        )

        def norm_k(val):
            return val.date() if hasattr(val, "date") else val

        inv_sum_map = {norm_k(r.k): r for r in inv_sum_rows}
        inv_cogs_map = {norm_k(r.k): r for r in inv_cogs_rows}
        ret_sum_map = {norm_k(r.k): r for r in ret_sum_rows}
        ret_cogs_map = {norm_k(r.k): r for r in ret_cogs_rows}
        expense_map = {norm_k(r.k): r for r in expense_rows}

        keys = set()
        keys.update(inv_sum_map.keys())
        keys.update(inv_cogs_map.keys())
        keys.update(ret_sum_map.keys())
        keys.update(ret_cogs_map.keys())
        keys.update(expense_map.keys())

        data_map = {}
        for k in keys:
            inv_sum = inv_sum_map.get(k)
            inv_cogs = inv_cogs_map.get(k)
            ret_sum = ret_sum_map.get(k)
            ret_cogs = ret_cogs_map.get(k)
            exp = expense_map.get(k)

            inv_sales_ex_tax = float(getattr(inv_sum, "sales_ex_tax", 0) or 0)
            inv_discount_ex_tax = float(getattr(inv_sum, "discount_ex_tax", 0) or 0)
            inv_cogs_amt = float(getattr(inv_cogs, "cogs", 0) or 0)

            ret_sales_ex_tax = float(getattr(ret_sum, "sales_ex_tax", 0) or 0)
            ret_discount_ex_tax = float(getattr(ret_sum, "discount_ex_tax", 0) or 0)
            ret_cogs_amt = float(getattr(ret_cogs, "cogs", 0) or 0)

            expense = float(getattr(exp, "expense", 0) or 0)

            sales = inv_sales_ex_tax - ret_sales_ex_tax
            discount = inv_discount_ex_tax - ret_discount_ex_tax
            cogs_net = inv_cogs_amt - ret_cogs_amt

            gross_profit = (sales - discount) - cogs_net
            net_profit = gross_profit - expense
            data_map[k] = {"k": k, "v": gross_profit if metric == "gross_profit" else net_profit}
    else:
        data_map = {}

    data = []
    if period == "day":
        for i in range(size):
            d = start + timedelta(days=i)
            r = data_map.get(d)
            v = r.v if hasattr(r, "v") else (r.get("v") if r else 0)
            data.append({"label": label_for(d), "value": float(v or 0)})
    elif period == "week":
        start_week = (start - timedelta(days=start.weekday()))
        for i in range(size):
            wk_start = start_week + timedelta(weeks=i)
            r = data_map.get(wk_start)
            v = r.v if hasattr(r, "v") else (r.get("v") if r else 0)
            data.append({"label": label_for(wk_start), "value": float(v or 0)})
    else:
        y, m = start.year, start.month
        for _ in range(size):
            cur = date(y, m, 1)
            r = data_map.get(cur)
            v = r.v if hasattr(r, "v") else (r.get("v") if r else 0)
            data.append({"label": label_for(cur), "value": float(v or 0)})
            m += 1
            if m == 13:
                m = 1
                y += 1

    return {"period": period, "metric": metric, "data": data}
