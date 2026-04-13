import { useEffect, useState, useCallback } from "react";

import authAxios from "../api/authAxios";
import { useToast } from "../components/Toast";
import BackButton from "../components/BackButton";
import { getSession } from "../utils/auth";
import { getBusinessDate } from "../utils/businessDate";

const BLUE = "#0B3C8C";
const STATUS_COLORS = {
  PENDING: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  CONFIRMED: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  READY: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  COMPLETED: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  CANCELLED: { bg: "bg-red-50", text: "text-red-600", border: "border-red-200" },
};
const STATUS_LIST = ["PENDING", "CONFIRMED", "READY", "COMPLETED", "CANCELLED"];
const PAYMENT_MODES = ["CASH", "UPI", "CARD"];

const fmt = (v) =>
  `₹${Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.PENDING;
  return (
    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${c.bg} ${c.text} ${c.border}`}>
      {status}
    </span>
  );
}

const EMPTY_FORM = {
  customer_name: "",
  customer_phone: "",
  expected_date: "",
  expected_time: "",
  notes: "",
  total_amount: "",
  advance_amount: "",
  advance_payment_mode: "CASH",
  order_items: [],
};

export default function AdvanceOrders() {
  const { showToast } = useToast();
  const session = getSession() || {};
  const roleLower = (session?.role || "").toLowerCase();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState(getBusinessDate());
  const [filterStatus, setFilterStatus] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState(null);
  const [statusEdit, setStatusEdit] = useState(null); // { id, status }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterDate) params.expected_date = filterDate;
      if (filterStatus) params.status = filterStatus;
      const r = await authAxios.get("/advance-orders/", { params });
      setOrders(r.data || []);
    } catch (e) {
      showToast(e?.response?.data?.detail || "Failed to load advance orders", "error");
    } finally {
      setLoading(false);
    }
  }, [filterDate, filterStatus]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditId(null);
    setForm({ ...EMPTY_FORM, expected_date: filterDate || getBusinessDate() });
    setShowForm(true);
  };

  const openEdit = (order) => {
    setEditId(order.order_id);
    setForm({
      customer_name: order.customer_name || "",
      customer_phone: order.customer_phone || "",
      expected_date: order.expected_date || "",
      expected_time: order.expected_time || "",
      notes: order.notes || "",
      total_amount: order.total_amount || "",
      advance_amount: order.advance_amount || "",
      advance_payment_mode: order.advance_payment_mode || "CASH",
      order_items: order.order_items || [],
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.customer_name.trim()) return showToast("Customer name is required", "error");
    if (!form.expected_date) return showToast("Expected date is required", "error");

    setSaving(true);
    try {
      const payload = {
        ...form,
        total_amount: parseFloat(form.total_amount || 0),
        advance_amount: parseFloat(form.advance_amount || 0),
        branch_id: session?.branch_id || undefined,
      };
      if (editId) {
        await authAxios.put(`/advance-orders/${editId}`, payload);
        showToast("Order updated", "success");
      } else {
        await authAxios.post("/advance-orders/", payload);
        showToast("Advance order created", "success");
      }
      setShowForm(false);
      load();
    } catch (e) {
      const detail =
        e?.response?.data?.detail ||
        e?.response?.data?.message ||
        (typeof e?.response?.data === "string" ? e.response.data : "") ||
        e?.message ||
        "Failed to save";
      showToast(detail, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      await authAxios.put(`/advance-orders/${orderId}`, { status: newStatus });
      showToast("Status updated", "success");
      setStatusEdit(null);
      load();
    } catch (e) {
      showToast(e?.response?.data?.detail || "Failed to update status", "error");
    }
  };

  const handleDelete = async (orderId) => {
    if (!window.confirm("Delete this advance order?")) return;
    try {
      await authAxios.delete(`/advance-orders/${orderId}`);
      showToast("Order deleted", "success");
      load();
    } catch (e) {
      showToast(e?.response?.data?.detail || "Cannot delete", "error");
    }
  };

  const inputCls = "w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400 transition";
  const labelCls = "block text-[11px] font-semibold text-gray-500 mb-1";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 sm:px-6 py-3 flex items-center gap-3 flex-wrap">
        <BackButton />
        <div className="flex-1">
          <h1 className="text-base font-bold text-gray-800">Advance Orders</h1>
          <p className="text-[11px] text-gray-400">Pre-booked customer orders for future dates</p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-1.5 rounded-xl text-sm font-semibold text-white"
          style={{ backgroundColor: BLUE }}
        >
          + New Order
        </button>
      </div>

      {/* Filters */}
      <div className="px-4 sm:px-6 py-3 flex flex-wrap gap-3 bg-white border-b">
        <div>
          <label className={labelCls}>Expected Date</label>
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm bg-gray-50 focus:outline-none focus:border-blue-400"
          />
        </div>
        <div>
          <label className={labelCls}>Status</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm bg-gray-50 focus:outline-none focus:border-blue-400"
          >
            <option value="">All</option>
            {STATUS_LIST.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <button
            onClick={load}
            disabled={loading}
            className="px-4 py-1.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: BLUE }}
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* List */}
      <div className="px-4 sm:px-6 py-5">
        {loading ? (
          <div className="text-center py-12 text-sm text-gray-400">Loading…</div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-400">No advance orders found</div>
        ) : (
          <div className="space-y-3">
            {orders.map((o) => (
              <div key={o.order_id} className="bg-white border rounded-2xl shadow-sm p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-bold text-gray-800 text-sm">{o.customer_name}</p>
                    {o.customer_phone && (
                      <p className="text-xs text-gray-500">{o.customer_phone}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-0.5">
                      {o.expected_date}{o.expected_time ? ` at ${o.expected_time}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge status={o.status} />
                    {statusEdit?.id === o.order_id ? (
                      <div className="flex items-center gap-1">
                        <select
                          value={statusEdit.status}
                          onChange={(e) => setStatusEdit({ id: o.order_id, status: e.target.value })}
                          className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-gray-50"
                        >
                          {STATUS_LIST.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <button
                          onClick={() => handleStatusChange(o.order_id, statusEdit.status)}
                          className="text-xs px-2 py-1 rounded-lg text-white font-semibold"
                          style={{ backgroundColor: BLUE }}
                        >Save</button>
                        <button
                          onClick={() => setStatusEdit(null)}
                          className="text-xs px-2 py-1 rounded-lg border text-gray-500"
                        >✕</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setStatusEdit({ id: o.order_id, status: o.status })}
                        className="text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                      >Change Status</button>
                    )}
                  </div>
                </div>

                <div className="mt-2 flex gap-4 flex-wrap">
                  <div>
                    <span className="text-[10px] text-gray-400 font-semibold uppercase">Total</span>
                    <p className="text-sm font-bold text-gray-800">{fmt(o.total_amount)}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 font-semibold uppercase">Advance</span>
                    <p className="text-sm font-bold text-emerald-700">{fmt(o.advance_amount)}</p>
                  </div>
                  {o.advance_payment_mode && (
                    <div>
                      <span className="text-[10px] text-gray-400 font-semibold uppercase">Mode</span>
                      <p className="text-sm font-semibold text-gray-600">{o.advance_payment_mode}</p>
                    </div>
                  )}
                </div>

                {o.notes && (
                  <p className="mt-2 text-xs text-gray-500 italic">{o.notes}</p>
                )}

                {Array.isArray(o.order_items) && o.order_items.length > 0 && (
                  <div className="mt-2 border-t pt-2">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Items</p>
                    <div className="space-y-0.5">
                      {o.order_items.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-xs text-gray-600">
                          <span>{item.item_name || "Item"} × {item.qty || 1}</span>
                          <span>{fmt(item.amount || 0)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {o.status !== "COMPLETED" && o.status !== "CANCELLED" && (
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => openEdit(o)}
                      className="text-xs px-3 py-1 rounded-lg border text-gray-600 hover:bg-gray-50"
                    >Edit</button>
                    {roleLower === "admin" || roleLower === "manager" ? (
                      <button
                        onClick={() => handleDelete(o.order_id)}
                        className="text-xs px-3 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                      >Delete</button>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit Drawer */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
          <div className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h2 className="font-bold text-gray-800">{editId ? "Edit Advance Order" : "New Advance Order"}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Customer Name *</label>
                  <input
                    className={inputCls}
                    placeholder="Customer name"
                    value={form.customer_name}
                    onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelCls}>Phone</label>
                  <input
                    className={inputCls}
                    placeholder="Phone number"
                    value={form.customer_phone}
                    onChange={(e) => setForm({ ...form, customer_phone: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Expected Date *</label>
                  <input
                    type="date"
                    className={inputCls}
                    value={form.expected_date}
                    onChange={(e) => setForm({ ...form, expected_date: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelCls}>Expected Time</label>
                  <input
                    type="time"
                    className={inputCls}
                    value={form.expected_time}
                    onChange={(e) => setForm({ ...form, expected_time: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Total Amount (₹)</label>
                  <input
                    type="number"
                    min="0"
                    className={inputCls}
                    placeholder="0.00"
                    value={form.total_amount}
                    onChange={(e) => setForm({ ...form, total_amount: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelCls}>Advance Paid (₹)</label>
                  <input
                    type="number"
                    min="0"
                    className={inputCls}
                    placeholder="0.00"
                    value={form.advance_amount}
                    onChange={(e) => setForm({ ...form, advance_amount: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelCls}>Payment Mode</label>
                  <select
                    className={inputCls}
                    value={form.advance_payment_mode}
                    onChange={(e) => setForm({ ...form, advance_payment_mode: e.target.value })}
                  >
                    {PAYMENT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className={labelCls}>Notes</label>
                <textarea
                  rows={2}
                  className={inputCls}
                  placeholder="Special instructions, item list, etc."
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-2 rounded-xl border text-sm font-semibold text-gray-600 hover:bg-gray-50"
                >Cancel</button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
                  style={{ backgroundColor: BLUE }}
                >
                  {saving ? "Saving…" : editId ? "Update" : "Create"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
