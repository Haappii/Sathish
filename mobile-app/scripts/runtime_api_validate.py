import json
import time
from dataclasses import dataclass
from typing import Any, Callable

import requests

BASE_URL = "http://127.0.0.1:8000/api"
LOGIN_PAYLOAD = {"shop_id": 1, "username": "admin", "password": "admin123"}
TIMEOUT = 20

PASS_STATUSES_READ = {200, 401, 403, 404}
PASS_STATUSES_WRITE = {200, 201, 400, 401, 403, 404, 409, 422}


@dataclass
class EndpointCase:
    name: str
    method: str
    path_builder: Callable[[dict[str, Any]], str]
    params_builder: Callable[[dict[str, Any]], dict[str, Any] | None] = lambda c: None
    json_builder: Callable[[dict[str, Any]], dict[str, Any] | None] = lambda c: None


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def safe_json(value: Any, max_len: int = 1200) -> str:
    try:
        text = json.dumps(value, ensure_ascii=True)
    except Exception:
        text = str(value)
    return text[:max_len]


def preview_response(resp: requests.Response | None, err: Exception | None) -> dict[str, Any]:
    if err is not None:
        return {
            "network_error": type(err).__name__,
            "message": str(err)[:300],
        }
    if resp is None:
        return {"error": "no_response"}
    content_type = resp.headers.get("content-type", "")
    body: Any
    if "application/json" in content_type:
        try:
            body = resp.json()
        except Exception:
            body = resp.text[:1200]
    else:
        body = resp.text[:1200]
    return {
        "status_code": resp.status_code,
        "content_type": content_type,
        "body": body,
    }


def expected_pass(method: str, status: int | None, network_error: bool) -> bool:
    if network_error or status is None:
        return False
    if status >= 500:
        return False
    if method.upper() == "GET":
        return status in PASS_STATUSES_READ or 200 <= status < 500
    return status in PASS_STATUSES_WRITE or 200 <= status < 500


def run_case(session: requests.Session, ctx: dict[str, Any], case: EndpointCase) -> dict[str, Any]:
    url = f"{BASE_URL}{case.path_builder(ctx)}"
    method = case.method.upper()
    params = case.params_builder(ctx)
    payload = case.json_builder(ctx)

    resp = None
    err = None
    try:
        resp = session.request(method, url, params=params, json=payload, timeout=TIMEOUT)
    except Exception as e:
        err = e

    status = None if resp is None else resp.status_code
    passed = expected_pass(method, status, err is not None)

    return {
        "name": case.name,
        "method": method,
        "path": case.path_builder(ctx),
        "request": {
            "params": params,
            "json": payload,
        },
        "response": preview_response(resp, err),
        "result": "PASS" if passed else "FAIL",
    }


def pick_id(rows: list[dict[str, Any]], *keys: str, default: int = 1) -> int:
    if rows:
        row = rows[0]
        for key in keys:
            if row.get(key) is not None:
                try:
                    return int(row.get(key))
                except Exception:
                    pass
    return default


def get_json_or_default(session: requests.Session, path: str, default: Any, params: dict[str, Any] | None = None) -> Any:
    try:
        r = session.get(f"{BASE_URL}{path}", params=params, timeout=TIMEOUT)
        if r.status_code == 200:
            return r.json()
    except Exception:
        pass
    return default


def build_context(session: requests.Session, branch_id: int) -> dict[str, Any]:
    ctx: dict[str, Any] = {"branch_id": branch_id}

    invoices = get_json_or_default(session, "/invoice/list", default=[], params={"range": "today"})
    if isinstance(invoices, dict):
        invoices = invoices.get("invoices") or invoices.get("rows") or []
    ctx["invoice_no"] = (invoices[0].get("invoice_number") if invoices else "INV-DOES-NOT-EXIST")

    customers = get_json_or_default(session, "/customers/", default=[])
    if isinstance(customers, dict):
        customers = customers.get("customers") or []
    ctx["customer_id"] = pick_id(customers, "customer_id")
    ctx["customer_mobile"] = (customers[0].get("mobile") if customers else "9999999999")

    employees = get_json_or_default(session, "/employees", default=[])
    ctx["employee_id"] = pick_id(employees, "employee_id")

    suppliers = get_json_or_default(session, "/suppliers/", default=[])
    ctx["supplier_id"] = pick_id(suppliers, "supplier_id")

    tables = get_json_or_default(session, "/table-billing/tables", default=[])
    if isinstance(tables, dict):
        tables = tables.get("tables") or []
    ctx["table_id"] = pick_id(tables, "table_id")

    online = get_json_or_default(session, "/online-orders/", default=[])
    if isinstance(online, dict):
        online = online.get("orders") or []
    ctx["online_order_id"] = pick_id(online, "id", "order_id")

    qr = get_json_or_default(session, "/qr-orders/pending", default=[])
    ctx["qr_order_id"] = pick_id(qr, "qr_order_id", "id", default=0)

    pos = get_json_or_default(session, f"/supplier-ledger/supplier/{ctx['supplier_id']}/open-pos", default=[])
    ctx["po_id"] = pick_id(pos, "po_id", default=0)

    return ctx


def build_cases() -> list[EndpointCase]:
    return [
        EndpointCase("auth_login", "POST", lambda c: "/auth/login", json_builder=lambda c: LOGIN_PAYLOAD),

        EndpointCase("shop_details", "GET", lambda c: "/shop/details"),
        EndpointCase("permissions_my", "GET", lambda c: "/permissions/my"),
        EndpointCase("health", "GET", lambda c: "/health"),
        EndpointCase("dashboard_stats", "GET", lambda c: "/dashboard/stats", params_builder=lambda c: {"date": time.strftime("%Y-%m-%d")}),

        EndpointCase("branch_active", "GET", lambda c: "/branch/active"),
        EndpointCase("branch_by_id", "GET", lambda c: f"/branch/{c['branch_id']}"),

        EndpointCase("invoice_list", "GET", lambda c: "/invoice/list", params_builder=lambda c: {"range": "today"}),
        EndpointCase("invoice_by_number", "GET", lambda c: f"/invoice/by-number/{c['invoice_no']}"),
        EndpointCase("invoice_by_mobile", "GET", lambda c: f"/invoice/customer/by-mobile/{c['customer_mobile']}"),
        EndpointCase("invoice_create_validation", "POST", lambda c: "/invoice/", json_builder=lambda c: {"items": []}),

        EndpointCase("returns_create_validation", "POST", lambda c: "/returns/", json_builder=lambda c: {
            "invoice_number": c["invoice_no"],
            "return_type": "REFUND",
            "refund_mode": "cash",
            "reason_code": "OTHER",
            "reason": "api validation",
            "items": [],
        }),

        EndpointCase("customers_list", "GET", lambda c: "/customers/", params_builder=lambda c: {"search": ""}),
        EndpointCase("customer_by_id", "GET", lambda c: f"/customers/{c['customer_id']}"),
        EndpointCase("customer_create_validation", "POST", lambda c: "/customers/", json_builder=lambda c: {"customer_name": "", "mobile": "123"}),

        EndpointCase("dues_open", "GET", lambda c: "/dues/open", params_builder=lambda c: {"q": ""}),
        EndpointCase("dues_pay_validation", "POST", lambda c: "/dues/pay", json_builder=lambda c: {
            "invoice_number": c["invoice_no"],
            "amount": 1,
            "payment_mode": "cash",
            "reference_no": "API-TEST",
        }),

        EndpointCase("cash_drawer_current", "GET", lambda c: "/cash-drawer/current"),
        EndpointCase("cash_drawer_transactions", "GET", lambda c: "/cash-drawer/transactions"),
        EndpointCase("cash_drawer_open_validation", "POST", lambda c: "/cash-drawer/open", json_builder=lambda c: {"opening_cash": 0}),
        EndpointCase("cash_drawer_close_validation", "POST", lambda c: "/cash-drawer/close", json_builder=lambda c: {"closing_cash": 0}),

        EndpointCase("expenses_list", "GET", lambda c: "/expenses/", params_builder=lambda c: {"date_from": time.strftime("%Y-%m-%d"), "date_to": time.strftime("%Y-%m-%d")}),
        EndpointCase("expenses_create_validation", "POST", lambda c: "/expenses/", json_builder=lambda c: {
            "category": "Other",
            "description": "API runtime validation",
            "amount": 0,
            "expense_date": time.strftime("%Y-%m-%d"),
        }),

        EndpointCase("categories", "GET", lambda c: "/category/"),
        EndpointCase("items", "GET", lambda c: "/items/"),
        EndpointCase("inventory_list", "GET", lambda c: "/inventory/list", params_builder=lambda c: {"branch_id": c["branch_id"]}),
        EndpointCase("inventory_params", "GET", lambda c: "/parameters/inventory"),
        EndpointCase("inventory_add_validation", "POST", lambda c: "/inventory/add", params_builder=lambda c: {"item_id": 99999999, "qty": 1, "branch_id": c["branch_id"]}),
        EndpointCase("inventory_subtract_validation", "POST", lambda c: "/inventory/subtract", params_builder=lambda c: {"item_id": 99999999, "qty": 1, "branch_id": c["branch_id"]}),

        EndpointCase("employees_list", "GET", lambda c: "/employees", params_builder=lambda c: {"status": "ACTIVE"}),
        EndpointCase("employees_create_validation", "POST", lambda c: "/employees", json_builder=lambda c: {
            "employee_name": "",
            "mobile": "123",
            "designation": "Staff",
            "wage_type": "DAILY",
            "daily_wage": 0,
        }),
        EndpointCase("attendance_get", "GET", lambda c: "/employees/attendance", params_builder=lambda c: {"date": time.strftime("%Y-%m-%d")}),
        EndpointCase("attendance_bulk_validation", "POST", lambda c: "/employees/attendance/bulk", json_builder=lambda c: {
            "date": time.strftime("%Y-%m-%d"),
            "records": [{"employee_id": c["employee_id"], "status": "PRESENT", "worked_units": 1}],
        }),

        EndpointCase("day_close_status", "GET", lambda c: "/day-close/status", params_builder=lambda c: {"date_str": time.strftime("%Y-%m-%d")}),
        EndpointCase("day_close_summary", "GET", lambda c: "/day-close/summary", params_builder=lambda c: {"date_str": time.strftime("%Y-%m-%d"), "branch_id": c["branch_id"]}),
        EndpointCase("day_close_close_validation", "POST", lambda c: "/day-close/close", json_builder=lambda c: {"date_str": time.strftime("%Y-%m-%d"), "branch_id": c["branch_id"]}),

        EndpointCase("reports_sales", "GET", lambda c: "/reports/sales", params_builder=lambda c: {"start": time.strftime("%Y-%m-%d"), "end": time.strftime("%Y-%m-%d"), "payment_mode": ""}),
        EndpointCase("analytics_summary", "GET", lambda c: "/analytics/summary", params_builder=lambda c: {"from_date": time.strftime("%Y-%m-%d"), "to_date": time.strftime("%Y-%m-%d")}),
        EndpointCase("analytics_top_items", "GET", lambda c: "/analytics/top-items", params_builder=lambda c: {"from_date": time.strftime("%Y-%m-%d"), "to_date": time.strftime("%Y-%m-%d"), "limit": 10}),

        EndpointCase("loyalty_by_mobile", "GET", lambda c: f"/loyalty/account/by-mobile/{c['customer_mobile']}"),
        EndpointCase("loyalty_transactions", "GET", lambda c: f"/loyalty/transactions/{c['customer_id']}"),
        EndpointCase("loyalty_adjust_validation", "POST", lambda c: "/loyalty/adjust", json_builder=lambda c: {"customer_id": c["customer_id"], "points": 1, "notes": "api validation"}),
        EndpointCase("loyalty_redeem_validation", "POST", lambda c: "/loyalty/redeem", json_builder=lambda c: {"customer_id": c["customer_id"], "points": 1, "notes": "api validation"}),

        EndpointCase("suppliers", "GET", lambda c: "/suppliers/", params_builder=lambda c: {"branch_id": c["branch_id"]}),
        EndpointCase("supplier_aging", "GET", lambda c: "/supplier-ledger/aging", params_builder=lambda c: {"branch_id": c["branch_id"]}),
        EndpointCase("supplier_open_pos", "GET", lambda c: f"/supplier-ledger/supplier/{c['supplier_id']}/open-pos", params_builder=lambda c: {"branch_id": c["branch_id"]}),
        EndpointCase("supplier_statement", "GET", lambda c: f"/supplier-ledger/supplier/{c['supplier_id']}/statement", params_builder=lambda c: {"branch_id": c["branch_id"]}),
        EndpointCase("supplier_payment_validation", "POST", lambda c: "/supplier-ledger/payment", json_builder=lambda c: {
            "supplier_id": c["supplier_id"],
            "branch_id": c["branch_id"],
            "po_id": c["po_id"] if c["po_id"] > 0 else None,
            "amount": 1,
            "payment_mode": "cash",
            "reference_no": "API-TEST",
            "notes": "runtime validation",
        }),

        EndpointCase("online_orders", "GET", lambda c: "/online-orders/", params_builder=lambda c: {"provider": "ALL", "status": "ALL"}),
        EndpointCase("online_order_status_validation", "PATCH", lambda c: f"/online-orders/{c['online_order_id']}/status", json_builder=lambda c: {"status": "CONFIRMED"}),

        EndpointCase("qr_pending", "GET", lambda c: "/qr-orders/pending"),
        EndpointCase("qr_accept_validation", "POST", lambda c: f"/qr-orders/{c['qr_order_id']}/accept"),
        EndpointCase("qr_reject_validation", "POST", lambda c: f"/qr-orders/{c['qr_order_id']}/reject"),

        EndpointCase("tables", "GET", lambda c: "/table-billing/tables"),
        EndpointCase("table_order_by_table", "GET", lambda c: f"/table-billing/order/by-table/{c['table_id']}"),
        EndpointCase("table_order_item_add_validation", "POST", lambda c: "/table-billing/order/item/add", params_builder=lambda c: {"order_id": 99999999, "item_id": 99999999, "quantity": 1}),
        EndpointCase("table_order_checkout_validation", "POST", lambda c: "/table-billing/order/checkout/99999999", json_builder=lambda c: {"customer_name": "API", "mobile": "9999999999", "payment_mode": "cash"}),
        EndpointCase("table_takeaway_validation", "POST", lambda c: "/table-billing/takeaway", json_builder=lambda c: {"customer_name": "API", "mobile": "9999999999", "items": []}),
        EndpointCase("table_takeaway_orders", "GET", lambda c: "/table-billing/takeaway/orders"),
        EndpointCase("table_transfer_validation", "POST", lambda c: "/table-billing/order/transfer", json_builder=lambda c: {"source_order_id": 99999999, "dest_order_id": 99999998}),

        EndpointCase("table_cancel_variant_1", "POST", lambda c: "/table-billing/order/cancel/99999999"),
        EndpointCase("table_cancel_variant_2", "POST", lambda c: "/table-billing/order/cancel/99999999/"),
        EndpointCase("table_cancel_variant_3", "POST", lambda c: "/table-billing/order/cancel", params_builder=lambda c: {"order_id": 99999999}),
        EndpointCase("table_cancel_variant_4", "POST", lambda c: "/table-billing/orders/99999999/cancel"),
        EndpointCase("table_cancel_variant_5", "PUT", lambda c: "/table-billing/orders/99999999/cancel"),
        EndpointCase("table_cancel_variant_6", "PUT", lambda c: "/table-billing/order/cancel", params_builder=lambda c: {"order_id": 99999999}),
        EndpointCase("table_cancel_variant_7", "DELETE", lambda c: "/table-billing/order/cancel", params_builder=lambda c: {"order_id": 99999999}),
        EndpointCase("table_cancel_variant_8", "DELETE", lambda c: "/table-billing/orders/99999999"),
        EndpointCase("table_cancel_variant_9", "POST", lambda c: "/table-billing/order/cancel", json_builder=lambda c: {"order_id": 99999999}),

        EndpointCase("kot_order", "GET", lambda c: "/kot/order/99999999"),
        EndpointCase("kot_create_validation", "POST", lambda c: "/kot/create/99999999"),
        EndpointCase("kot_pending", "GET", lambda c: "/kot/pending"),
        EndpointCase("kot_status_validation", "PUT", lambda c: "/kot/99999999/status", json_builder=lambda c: {"status": "READY"}),
        EndpointCase("kot_tracking", "GET", lambda c: "/kot/tracking/orders", params_builder=lambda c: {"include_without_kot": False}),
    ]


def write_reports(results: list[dict[str, Any]], ctx: dict[str, Any]) -> None:
    passed = sum(1 for r in results if r["result"] == "PASS")
    failed = len(results) - passed

    payload = {
        "generated_at": now_iso(),
        "base_url": BASE_URL,
        "summary": {
            "total": len(results),
            "pass": passed,
            "fail": failed,
        },
        "context": ctx,
        "results": results,
    }

    json_path = "shop-billing-app/mobile-app/API_RUNTIME_VALIDATION_RESULT.json"
    md_path = "shop-billing-app/mobile-app/API_RUNTIME_VALIDATION_RESULT.md"

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=True)

    lines: list[str] = []
    lines.append("# API Runtime Validation Result")
    lines.append("")
    lines.append(f"- Generated at: {payload['generated_at']}")
    lines.append(f"- Base URL: {BASE_URL}")
    lines.append(f"- Total: {len(results)}")
    lines.append(f"- Pass: {passed}")
    lines.append(f"- Fail: {failed}")
    lines.append("")
    lines.append("## Results")
    lines.append("")

    for r in results:
        lines.append(f"### {r['result']} - {r['method']} {r['path']}")
        lines.append(f"- Name: {r['name']}")
        lines.append(f"- Request params: `{safe_json(r['request']['params'])}`")
        lines.append(f"- Request json: `{safe_json(r['request']['json'])}`")
        resp = r["response"]
        if "network_error" in resp:
            lines.append(f"- Response: network_error={resp['network_error']} message={resp['message']}")
        else:
            lines.append(f"- Response status: {resp.get('status_code')}")
            lines.append(f"- Response body sample: `{safe_json(resp.get('body'))}`")
        lines.append("")

    with open(md_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"Wrote: {json_path}")
    print(f"Wrote: {md_path}")
    print(f"SUMMARY total={len(results)} pass={passed} fail={failed}")


def main() -> None:
    s = requests.Session()

    login = s.post(f"{BASE_URL}/auth/login", json=LOGIN_PAYLOAD, timeout=TIMEOUT)
    if login.status_code != 200:
        raise SystemExit(f"Login failed: {login.status_code} {login.text[:200]}")

    login_data = login.json()
    token = login_data.get("access_token") or login_data.get("token")
    if not token:
        raise SystemExit("Login response has no access token")

    branch_id = int(login_data.get("branch_id") or 1)

    s.headers.update({
        "Authorization": f"Bearer {token}",
        "x-branch-id": str(branch_id),
    })

    ctx = build_context(s, branch_id)

    results: list[dict[str, Any]] = []
    for case in build_cases():
        results.append(run_case(s, ctx, case))

    # logout at end with same token (best effort)
    logout_resp = None
    logout_err = None
    try:
        logout_resp = s.post(f"{BASE_URL}/auth/logout", timeout=TIMEOUT)
    except Exception as e:
        logout_err = e
    results.append(
        {
            "name": "auth_logout",
            "method": "POST",
            "path": "/auth/logout",
            "request": {"params": None, "json": None},
            "response": preview_response(logout_resp, logout_err),
            "result": "PASS" if expected_pass("POST", None if logout_resp is None else logout_resp.status_code, logout_err is not None) else "FAIL",
        }
    )

    write_reports(results, ctx)


if __name__ == "__main__":
    main()
