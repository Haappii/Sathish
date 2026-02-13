import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "../utils/apiClient";
import { useToast } from "../components/Toast";
import { getSession } from "../utils/auth";
import { API_BASE } from "../config/api";

const PROVIDERS = ["SWIGGY", "ZOMATO"];
const STATUSES = ["NEW", "ACCEPTED", "PREPARING", "READY", "DISPATCHED", "DELIVERED", "CANCELLED", "REJECTED"];
const STATUS_BADGE = {
  NEW: "bg-amber-100 text-amber-700",
  ACCEPTED: "bg-blue-100 text-blue-700",
  PREPARING: "bg-indigo-100 text-indigo-700",
  READY: "bg-cyan-100 text-cyan-700",
  DISPATCHED: "bg-purple-100 text-purple-700",
  DELIVERED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-rose-100 text-rose-700",
  REJECTED: "bg-red-100 text-red-700",
};

const pageSize = 30;

const fmtAmount = (v) => `Rs. ${Number(v || 0).toFixed(2)}`;
const fmtDateTime = (v) => {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const randomOrderId = (provider) => {
  const ts = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `${provider}-${ts}-${Math.floor(Math.random() * 900 + 100)}`;
};

export default function OnlineOrders() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const session = getSession() || {};
  const isAdmin = String(session?.role || "").toLowerCase() === "admin";

  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(session?.branch_id || "");
  const [shop, setShop] = useState({});

  const [provider, setProvider] = useState("");
  const [status, setStatus] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [summary, setSummary] = useState({
    total: 0,
    new_count: 0,
    active_count: 0,
    delivered_count: 0,
    cancelled_count: 0,
    pending_for_action: 0,
  });
  const [rows, setRows] = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(false);

  const [selectedId, setSelectedId] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState(null);

  const [formOpen, setFormOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [testForm, setTestForm] = useState({
    provider: "SWIGGY",
    provider_order_id: "",
    customer_name: "",
    customer_mobile: "",
    customer_address: "",
    payment_mode: "online",
    item_name: "",
    qty: 1,
    unit_price: 0,
  });

  const webhookBase = useMemo(
    () => `${String(API_BASE || "").replace(/\/api\/?$/, "")}/api/online-orders/webhook`,
    []
  );

  const applySearch = () => {
    setPage(1);
    setSearch(searchInput.trim());
  };

  const loadBranches = async () => {
    if (!isAdmin) return;
    try {
      const res = await api.get("/branch/list");
      setBranches(res?.data || []);
    } catch {
      setBranches([]);
    }
  };

  const loadShop = async () => {
    try {
      const res = await api.get("/shop/details");
      setShop(res?.data || {});
    } catch {
      setShop({});
    }
  };

  const loadSummary = async () => {
    try {
      const res = await api.get("/online-orders/summary", {
        params: {
          branch_id: isAdmin && branchId ? Number(branchId) : undefined,
        },
      });
      setSummary(res?.data || {});
    } catch {
      setSummary({
        total: 0,
        new_count: 0,
        active_count: 0,
        delivered_count: 0,
        cancelled_count: 0,
        pending_for_action: 0,
      });
    }
  };

  const loadRows = async () => {
    setLoading(true);
    try {
      const res = await api.get("/online-orders", {
        params: {
          provider: provider || undefined,
          status: status || undefined,
          search: search || undefined,
          branch_id: isAdmin && branchId ? Number(branchId) : undefined,
          page,
          page_size: pageSize,
        },
      });
      const data = res?.data || {};
      setRows(data.rows || []);
      setTotalRows(Number(data.total || 0));
      if (!selectedId && (data.rows || []).length) {
        setSelectedId(data.rows[0].online_order_id);
      }
    } catch {
      setRows([]);
      setTotalRows(0);
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (onlineOrderId) => {
    if (!onlineOrderId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    try {
      const res = await api.get(`/online-orders/${onlineOrderId}`);
      setDetail(res?.data || null);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshAll = async () => {
    await Promise.all([loadSummary(), loadRows()]);
    if (selectedId) await loadDetail(selectedId);
  };

  useEffect(() => {
    loadBranches();
    loadShop();
  }, []);

  useEffect(() => {
    loadSummary();
    loadRows();
  }, [provider, status, search, page, branchId]);

  useEffect(() => {
    loadDetail(selectedId);
  }, [selectedId]);

  const runAction = async (order, action) => {
    try {
      await api.post(`/online-orders/${order.online_order_id}/${action}`);
      showToast("Order status updated", "success");
      await refreshAll();
    } catch (e) {
      showToast(e?.response?.data?.detail || "Action failed", "error");
    }
  };

  const convertToInvoice = async (order) => {
    try {
      const res = await api.post(`/online-orders/${order.online_order_id}/convert-to-invoice`);
      const invNo = res?.data?.invoice_number;
      showToast(invNo ? `Invoice created: ${invNo}` : "Invoice created", "success");
      await refreshAll();
    } catch (e) {
      showToast(e?.response?.data?.detail || "Failed to create invoice", "error");
    }
  };

  const openCreateForm = () => {
    setTestForm((prev) => ({
      ...prev,
      provider_order_id: randomOrderId(prev.provider || "SWIGGY"),
      item_name: "",
      qty: 1,
      unit_price: 0,
    }));
    setFormOpen(true);
  };

  const createTestOrder = async () => {
    if (creating) return;
    if (!testForm.item_name.trim()) {
      showToast("Item name is required", "error");
      return;
    }
    if (!testForm.provider_order_id.trim()) {
      showToast("Provider order ID is required", "error");
      return;
    }
    const qty = Number(testForm.qty || 0);
    const unitPrice = Number(testForm.unit_price || 0);
    if (qty <= 0) {
      showToast("Quantity must be > 0", "error");
      return;
    }
    setCreating(true);
    try {
      const lineTotal = Number((qty * unitPrice).toFixed(2));
      await api.post("/online-orders", {
        provider: testForm.provider,
        provider_order_id: testForm.provider_order_id.trim(),
        branch_id: isAdmin ? Number(branchId || session?.branch_id || 0) : undefined,
        customer_name: testForm.customer_name?.trim() || null,
        customer_mobile: testForm.customer_mobile?.trim() || null,
        customer_address: testForm.customer_address?.trim() || null,
        payment_mode: testForm.payment_mode || "online",
        subtotal_amount: lineTotal,
        total_amount: lineTotal,
        items: [
          {
            item_name: testForm.item_name.trim(),
            quantity: qty,
            unit_price: unitPrice,
            line_total: lineTotal,
          },
        ],
      });
      showToast("Test online order created", "success");
      setFormOpen(false);
      await refreshAll();
    } catch (e) {
      showToast(e?.response?.data?.detail || "Failed to create test order", "error");
    } finally {
      setCreating(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/home", { replace: true })}
            className="px-3 py-1.5 rounded-lg border bg-white shadow-sm text-[12px]"
          >
            &larr; Back
          </button>
          <h2 className="text-lg font-semibold text-slate-800">Online Orders</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openCreateForm}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[12px]"
          >
            Create Test Order
          </button>
          <button
            onClick={refreshAll}
            className="px-3 py-1.5 rounded-lg border bg-white shadow-sm text-[12px]"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <Kpi label="Total" value={summary.total} />
        <Kpi label="New" value={summary.new_count} />
        <Kpi label="Active" value={summary.active_count} />
        <Kpi label="Pending Action" value={summary.pending_for_action} />
        <Kpi label="Delivered" value={summary.delivered_count} />
        <Kpi label="Cancelled/Rejected" value={summary.cancelled_count} />
      </div>

      <div className="rounded-xl border bg-white p-3 space-y-2">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
          <select
            className="border rounded-lg px-2 py-1.5 text-[12px]"
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Providers</option>
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <select
            className="border rounded-lg px-2 py-1.5 text-[12px]"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {isAdmin && (
            <select
              className="border rounded-lg px-2 py-1.5 text-[12px]"
              value={branchId}
              onChange={(e) => {
                setBranchId(e.target.value);
                setPage(1);
              }}
            >
              {branches.map((b) => (
                <option key={b.branch_id} value={b.branch_id}>
                  {b.branch_name}
                </option>
              ))}
            </select>
          )}

          <input
            className="border rounded-lg px-2 py-1.5 text-[12px] md:col-span-2"
            placeholder="Search order/customer/mobile"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applySearch();
            }}
          />
          <button
            onClick={applySearch}
            className="px-3 py-1.5 rounded-lg border bg-gray-50 text-[12px]"
          >
            Apply
          </button>
        </div>

        <div className="text-[11px] text-slate-500">
          Webhooks:{" "}
          <span className="font-semibold">Swiggy: {shop?.swiggy_enabled ? "Enabled" : "Disabled"}</span>{" "}
          ({shop?.swiggy_partner_id || "-"}) |{" "}
          <span className="font-semibold">Zomato: {shop?.zomato_enabled ? "Enabled" : "Disabled"}</span>{" "}
          ({shop?.zomato_partner_id || "-"})
        </div>
        <div className="text-[11px] text-slate-500 break-all">
          Endpoint format: {webhookBase}/{"{PROVIDER}"}/{"{SHOP_ID}"}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-3">
        <div className="xl:col-span-3 rounded-xl border bg-white overflow-hidden">
          <div className="px-3 py-2 border-b text-[12px] font-semibold text-slate-700">
            Orders ({totalRows})
          </div>
          <div className="max-h-[62vh] overflow-auto">
            {loading ? (
              <div className="p-4 text-sm text-slate-600">Loading...</div>
            ) : rows.length === 0 ? (
              <div className="p-4 text-sm text-slate-600">No online orders found</div>
            ) : (
              <table className="w-full text-[12px]">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="text-left p-2">Order</th>
                    <th className="text-left p-2">Customer</th>
                    <th className="text-left p-2">Amount</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const isSelected = Number(selectedId) === Number(r.online_order_id);
                    return (
                      <tr
                        key={r.online_order_id}
                        className={`border-t cursor-pointer ${isSelected ? "bg-blue-50" : "hover:bg-gray-50"}`}
                        onClick={() => setSelectedId(r.online_order_id)}
                      >
                        <td className="p-2">
                          <div className="font-semibold">{r.provider}</div>
                          <div className="text-slate-500">{r.provider_order_id}</div>
                        </td>
                        <td className="p-2">
                          <div>{r.customer_name || "-"}</div>
                          <div className="text-slate-500">{r.customer_mobile || "-"}</div>
                        </td>
                        <td className="p-2 font-semibold">{fmtAmount(r.total_amount)}</td>
                        <td className="p-2">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] ${STATUS_BADGE[r.status] || "bg-gray-100 text-gray-700"}`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="p-2 text-slate-500">{fmtDateTime(r.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <div className="px-3 py-2 border-t flex items-center justify-between text-[12px]">
            <div>
              Page {page} / {totalPages}
            </div>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2 py-1 border rounded disabled:opacity-50"
              >
                Prev
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-2 py-1 border rounded disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>

        <div className="xl:col-span-2 rounded-xl border bg-white p-3 space-y-3 max-h-[62vh] overflow-auto">
          {detailLoading ? (
            <div className="text-sm text-slate-600">Loading details...</div>
          ) : !detail ? (
            <div className="text-sm text-slate-600">Select an order to view details</div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">
                    {detail.provider} - {detail.provider_order_id}
                  </div>
                  <div className="text-xs text-slate-500">
                    {detail.provider_order_number || "-"}
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[11px] ${STATUS_BADGE[detail.status] || "bg-gray-100 text-gray-700"}`}>
                  {detail.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <Info label="Customer" value={detail.customer_name || "-"} />
                <Info label="Mobile" value={detail.customer_mobile || "-"} />
                <Info label="Payment" value={(detail.payment_mode || "-").toUpperCase()} />
                <Info label="Total" value={fmtAmount(detail.total_amount)} />
                <Info label="Created" value={fmtDateTime(detail.created_at)} />
                <Info label="Invoice" value={detail.invoice_id ? String(detail.invoice_id) : "-"} />
              </div>

              <div className="space-y-1">
                <div className="text-xs font-semibold text-slate-700">Items</div>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-[12px]">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left p-2">Item</th>
                        <th className="text-right p-2">Qty</th>
                        <th className="text-right p-2">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail.items || []).map((it) => (
                        <tr key={it.order_item_id} className="border-t">
                          <td className="p-2">{it.item_name}</td>
                          <td className="p-2 text-right">{Number(it.quantity || 0)}</td>
                          <td className="p-2 text-right">{fmtAmount(it.line_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {detail.status === "NEW" && (
                  <>
                    <ActionBtn label="Accept" onClick={() => runAction(detail, "accept")} />
                    <ActionBtn label="Reject" onClick={() => runAction(detail, "reject")} danger />
                  </>
                )}
                {detail.status === "ACCEPTED" && (
                  <>
                    <ActionBtn label="Preparing" onClick={() => runAction(detail, "prepare")} />
                    <ActionBtn label="Ready" onClick={() => runAction(detail, "ready")} />
                  </>
                )}
                {detail.status === "PREPARING" && (
                  <ActionBtn label="Ready" onClick={() => runAction(detail, "ready")} />
                )}
                {detail.status === "READY" && (
                  <ActionBtn label="Dispatch" onClick={() => runAction(detail, "dispatch")} />
                )}
                {detail.status === "DISPATCHED" && (
                  <ActionBtn label="Deliver" onClick={() => runAction(detail, "deliver")} />
                )}
                {!["DELIVERED", "CANCELLED", "REJECTED"].includes(detail.status) && (
                  <ActionBtn label="Cancel" onClick={() => runAction(detail, "cancel")} danger />
                )}
                {!detail.invoice_id && !["CANCELLED", "REJECTED"].includes(detail.status) && (
                  <ActionBtn label="Create Invoice" onClick={() => convertToInvoice(detail)} />
                )}
              </div>

              <div className="space-y-1">
                <div className="text-xs font-semibold text-slate-700">Timeline</div>
                <div className="border rounded-lg p-2 max-h-40 overflow-auto space-y-1">
                  {(detail.events || []).length === 0 ? (
                    <div className="text-[12px] text-slate-500">No events</div>
                  ) : (
                    detail.events.map((ev) => (
                      <div key={ev.event_id} className="text-[12px] border-b pb-1">
                        <div className="font-semibold">{ev.event_type}</div>
                        <div className="text-slate-500">
                          {ev.provider_status || "-"} | {fmtDateTime(ev.created_at)}
                        </div>
                        <div className="text-slate-600">{ev.message || "-"}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {formOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-4 w-full max-w-lg space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Create Test Online Order</h3>
              <button onClick={() => setFormOpen(false)}>x</button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[12px]">
              <label className="space-y-1">
                <span>Provider</span>
                <select
                  className="w-full border rounded px-2 py-1.5"
                  value={testForm.provider}
                  onChange={(e) =>
                    setTestForm((p) => ({
                      ...p,
                      provider: e.target.value,
                      provider_order_id: randomOrderId(e.target.value),
                    }))
                  }
                >
                  {PROVIDERS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span>Provider Order ID</span>
                <input
                  className="w-full border rounded px-2 py-1.5"
                  value={testForm.provider_order_id}
                  onChange={(e) => setTestForm((p) => ({ ...p, provider_order_id: e.target.value }))}
                />
              </label>
              <label className="space-y-1 col-span-2">
                <span>Customer Name</span>
                <input
                  className="w-full border rounded px-2 py-1.5"
                  value={testForm.customer_name}
                  onChange={(e) => setTestForm((p) => ({ ...p, customer_name: e.target.value }))}
                />
              </label>
              <label className="space-y-1">
                <span>Mobile</span>
                <input
                  className="w-full border rounded px-2 py-1.5"
                  value={testForm.customer_mobile}
                  onChange={(e) => setTestForm((p) => ({ ...p, customer_mobile: e.target.value }))}
                />
              </label>
              <label className="space-y-1">
                <span>Payment Mode</span>
                <select
                  className="w-full border rounded px-2 py-1.5"
                  value={testForm.payment_mode}
                  onChange={(e) => setTestForm((p) => ({ ...p, payment_mode: e.target.value }))}
                >
                  <option value="online">Online</option>
                  <option value="cash">Cash</option>
                  <option value="cod">COD</option>
                </select>
              </label>
              <label className="space-y-1 col-span-2">
                <span>Address</span>
                <input
                  className="w-full border rounded px-2 py-1.5"
                  value={testForm.customer_address}
                  onChange={(e) => setTestForm((p) => ({ ...p, customer_address: e.target.value }))}
                />
              </label>
              <label className="space-y-1 col-span-2">
                <span>Item Name</span>
                <input
                  className="w-full border rounded px-2 py-1.5"
                  value={testForm.item_name}
                  onChange={(e) => setTestForm((p) => ({ ...p, item_name: e.target.value }))}
                />
              </label>
              <label className="space-y-1">
                <span>Quantity</span>
                <input
                  type="number"
                  min="1"
                  className="w-full border rounded px-2 py-1.5"
                  value={testForm.qty}
                  onChange={(e) => setTestForm((p) => ({ ...p, qty: e.target.value }))}
                />
              </label>
              <label className="space-y-1">
                <span>Unit Price</span>
                <input
                  type="number"
                  min="0"
                  className="w-full border rounded px-2 py-1.5"
                  value={testForm.unit_price}
                  onChange={(e) => setTestForm((p) => ({ ...p, unit_price: e.target.value }))}
                />
              </label>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setFormOpen(false)}
                className="px-3 py-1.5 rounded border text-[12px]"
              >
                Cancel
              </button>
              <button
                disabled={creating}
                onClick={createTestOrder}
                className="px-3 py-1.5 rounded bg-emerald-600 text-white text-[12px] disabled:opacity-60"
              >
                {creating ? "Saving..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value }) {
  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-800">{Number(value || 0)}</div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-lg border bg-gray-50 p-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-[12px] text-slate-800">{value}</div>
    </div>
  );
}

function ActionBtn({ label, onClick, danger = false }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1.5 rounded text-[12px] ${
        danger ? "bg-rose-600 text-white" : "bg-slate-800 text-white"
      }`}
    >
      {label}
    </button>
  );
}
