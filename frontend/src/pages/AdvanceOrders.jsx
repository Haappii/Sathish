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

const money2 = (v) => Number(v || 0).toFixed(2);

const dueFor = (order) =>
  Number(order?.due_amount ?? Math.max(0, Number(order?.total_amount || 0) - Number(order?.advance_amount || 0)));

const paidFor = (order) => Number(order?.amount_paid ?? order?.advance_amount ?? 0);

const paymentStatusFor = (order) => {
  if (order?.payment_status) return order.payment_status;
  const paid = paidFor(order);
  const due = dueFor(order);
  if (due <= 0) return "PAID";
  if (paid > 0) return "PARTIAL";
  return "UNPAID";
};

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const normalizeOrderItems = (items) => {
  const rows = Array.isArray(items) ? items : [];
  return rows.map((it) => {
    const qty = Math.max(1, toNum(it?.qty || 1));
    const rate = Math.max(0, toNum(it?.rate ?? it?.price ?? 0));
    return {
      item_id: it?.item_id || null,
      item_name: String(it?.item_name || "Item"),
      qty,
      rate,
      amount: Number((qty * rate).toFixed(2)),
    };
  });
};

const sumOrderItems = (items) => normalizeOrderItems(items).reduce((acc, it) => acc + toNum(it.amount), 0);

function printAdvanceInvoice(order, { shopName, branchName, userName }) {
  const paid = paidFor(order);
  const due = dueFor(order);
  const createdAt = order?.created_at ? new Date(order.created_at) : new Date();
  const issueDate = Number.isNaN(createdAt.getTime()) ? new Date().toLocaleString() : createdAt.toLocaleString();
  const expected = `${order?.expected_date || "-"}${order?.expected_time ? ` ${order.expected_time}` : ""}`;
  const items = Array.isArray(order?.order_items) ? order.order_items : [];

  const html = `
    <html>
      <head>
        <title>Advance Invoice ${order?.order_id || ""}</title>
        <style>
          @page { size: 58mm auto; margin: 0; }
          html, body { margin: 0; padding: 0; width: 58mm; font-family: monospace; color: #111827; }
          .ticket { width: 58mm; box-sizing: border-box; padding: 2.2mm; }
          .center { text-align: center; }
          .title { font-size: 11px; font-weight: 700; }
          .muted { font-size: 9px; color: #475569; }
          .line { border-top: 1px dashed #9ca3af; margin: 6px 0; }
          .row { display: flex; justify-content: space-between; font-size: 10px; margin: 2px 0; gap: 8px; }
          .strong { font-weight: 700; }
          .items { margin-top: 4px; }
          .item { display: flex; justify-content: space-between; gap: 8px; font-size: 9px; margin: 2px 0; }
          .label { font-size: 9px; color: #475569; }
          .status { display: inline-block; padding: 2px 6px; border: 1px solid #cbd5e1; border-radius: 999px; font-size: 8px; font-weight: 700; }
        </style>
      </head>
      <body>
        <div class="ticket">
          <div class="center title">${shopName || "Shop"}</div>
          <div class="center muted">${branchName || ""}</div>
          <div class="center muted">Advance Booking Invoice</div>
          <div class="line"></div>

          <div class="row"><span>Order</span><span class="strong">#${order?.order_id || "-"}</span></div>
          <div class="row"><span>Issued</span><span>${issueDate}</span></div>
          <div class="row"><span>Delivery</span><span>${expected}</span></div>
          <div class="row"><span>Status</span><span class="status">${order?.status || "PENDING"}</span></div>

          <div class="line"></div>
          <div class="label">Customer</div>
          <div class="row"><span>${order?.customer_name || "NA"}</span><span>${order?.customer_phone || ""}</span></div>

          <div class="line"></div>
          <div class="items">
            ${items.length > 0
              ? items
                  .map((it) => `<div class="item"><span>${String(it?.item_name || "Item")} x ${Number(it?.qty || 1)}</span><span>${fmt(it?.amount || 0)}</span></div>`)
                  .join("")
              : '<div class="muted">Items will be prepared as per booking details.</div>'}
          </div>

          <div class="line"></div>
          <div class="row"><span>Total</span><span class="strong">₹${money2(order?.total_amount || 0)}</span></div>
          <div class="row"><span>Amount Paid</span><span class="strong">₹${money2(paid)}</span></div>
          <div class="row"><span>Amount Due On Delivery</span><span class="strong">₹${money2(due)}</span></div>
          <div class="row"><span>Payment Status</span><span class="strong">${paymentStatusFor(order)}</span></div>

          ${order?.notes ? `<div class="line"></div><div class="label">Notes</div><div class="muted">${String(order.notes)}</div>` : ""}

          <div class="line"></div>
          <div class="center muted">Handled by ${userName || "Staff"}</div>
          <div class="center muted">Thank you</div>
        </div>
      </body>
    </html>
  `;

  const win = window.open("", "_blank", "noopener,noreferrer,width=480,height=720");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

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
  const [collectDue, setCollectDue] = useState(null); // { order, amount, payment_mode, mark_completed }
  const [collectingDue, setCollectingDue] = useState(false);
  const [shopInfo, setShopInfo] = useState({});
  const [itemCatalog, setItemCatalog] = useState([]);
  const [itemSearch, setItemSearch] = useState("");

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

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await authAxios.get("/shop/details");
        if (mounted) setShopInfo(res?.data || {});
      } catch {
        if (mounted) setShopInfo({});
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await authAxios.get("/items/");
        if (!mounted) return;
        setItemCatalog(Array.isArray(res?.data) ? res.data : []);
      } catch {
        if (!mounted) return;
        setItemCatalog([]);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const openCreate = () => {
    setEditId(null);
    setForm({ ...EMPTY_FORM, expected_date: filterDate || getBusinessDate() });
    setItemSearch("");
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
    setItemSearch("");
    setShowForm(true);
  };

  const addItemToForm = (item) => {
    const itemId = item?.item_id;
    const itemName = String(item?.item_name || "Item");
    const itemRate = Math.max(0, toNum(item?.selling_price ?? item?.price ?? item?.mrp_price ?? 0));
    const current = normalizeOrderItems(form.order_items || []);
    const idx = current.findIndex((x) => String(x.item_id) === String(itemId));
    let next;
    if (idx >= 0) {
      next = current.map((x, i) => {
        if (i !== idx) return x;
        const qty = Math.max(1, toNum(x.qty) + 1);
        return { ...x, qty, amount: Number((qty * toNum(x.rate)).toFixed(2)) };
      });
    } else {
      next = [...current, { item_id: itemId, item_name: itemName, qty: 1, rate: itemRate, amount: Number(itemRate.toFixed(2)) }];
    }
    setForm({
      ...form,
      order_items: next,
      total_amount: String(sumOrderItems(next).toFixed(2)),
    });
  };

  const updateFormItem = (index, patch) => {
    const rows = normalizeOrderItems(form.order_items || []);
    const next = rows.map((row, i) => {
      if (i !== index) return row;
      const qty = Math.max(1, toNum(patch.qty ?? row.qty));
      const rate = Math.max(0, toNum(patch.rate ?? row.rate));
      return { ...row, qty, rate, amount: Number((qty * rate).toFixed(2)) };
    });
    setForm({
      ...form,
      order_items: next,
      total_amount: String(sumOrderItems(next).toFixed(2)),
    });
  };

  const removeFormItem = (index) => {
    const rows = normalizeOrderItems(form.order_items || []);
    const next = rows.filter((_, i) => i !== index);
    setForm({
      ...form,
      order_items: next,
      total_amount: String(sumOrderItems(next).toFixed(2)),
    });
  };

  const handleSave = async () => {
    if (!form.customer_name.trim()) return showToast("Customer name is required", "error");
    if (!form.expected_date) return showToast("Expected date is required", "error");

    setSaving(true);
    try {
      const payload = {
        ...form,
        order_items: normalizeOrderItems(form.order_items || []),
        total_amount: parseFloat((sumOrderItems(form.order_items || []) || form.total_amount || 0).toFixed(2)),
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

  const openCollectDue = (order) => {
    const due = dueFor(order);
    setCollectDue({
      order,
      amount: String(due > 0 ? due : ""),
      payment_mode: order?.advance_payment_mode || "CASH",
      mark_completed: due <= 0,
    });
  };

  const submitCollectDue = async () => {
    if (!collectDue?.order?.order_id) return;
    const amount = Number(collectDue.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast("Enter a valid due collection amount", "error");
      return;
    }

    setCollectingDue(true);
    try {
      await authAxios.post(`/advance-orders/${collectDue.order.order_id}/collect-due`, {
        amount,
        payment_mode: collectDue.payment_mode,
        mark_completed: Boolean(collectDue.mark_completed),
      });
      showToast("Due amount collected", "success");
      setCollectDue(null);
      load();
    } catch (e) {
      const detail =
        e?.response?.data?.detail ||
        e?.response?.data?.message ||
        (typeof e?.response?.data === "string" ? e.response.data : "") ||
        "Failed to collect due";
      showToast(detail, "error");
    } finally {
      setCollectingDue(false);
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
                  <div>
                    <span className="text-[10px] text-gray-400 font-semibold uppercase">Due</span>
                    <p className="text-sm font-bold text-red-600">{fmt(dueFor(o))}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 font-semibold uppercase">Payment</span>
                    <p className="text-sm font-semibold text-gray-700">{paymentStatusFor(o)}</p>
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
                    {dueFor(o) > 0 ? (
                      <button
                        onClick={() => openCollectDue(o)}
                        className="text-xs px-3 py-1 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                      >Collect Due</button>
                    ) : null}
                    <button
                      onClick={() => printAdvanceInvoice(o, {
                        shopName: shopInfo?.shop_name || session?.shop_name || "Haappii Billing",
                        branchName: session?.branch_name || "",
                        userName: session?.user_name || session?.name || "Staff",
                      })}
                      className="text-xs px-3 py-1 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50"
                    >Print Advance Invoice</button>
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
                    value={sumOrderItems(form.order_items || []).toFixed(2)}
                    readOnly
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
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
                <label className={labelCls}>Select Items</label>
                <input
                  className={inputCls}
                  placeholder="Search item to add"
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                />
                <div className="max-h-28 overflow-y-auto space-y-1">
                  {itemCatalog
                    .filter((it) => String(it?.item_name || "").toLowerCase().includes(String(itemSearch || "").toLowerCase()))
                    .slice(0, 10)
                    .map((it) => (
                      <button
                        type="button"
                        key={it.item_id}
                        onClick={() => addItemToForm(it)}
                        className="w-full flex items-center justify-between text-left px-2.5 py-2 rounded-lg border border-gray-200 bg-white hover:bg-blue-50"
                      >
                        <span className="text-xs font-medium text-gray-700">{it.item_name}</span>
                        <span className="text-xs font-bold text-blue-700">{fmt(it?.selling_price ?? it?.price ?? 0)}</span>
                      </button>
                    ))}
                </div>

                {(form.order_items || []).length > 0 && (
                  <div className="space-y-2 pt-1">
                    {(form.order_items || []).map((it, idx) => (
                      <div key={`${it.item_id || it.item_name}-${idx}`} className="rounded-lg border border-gray-200 bg-white p-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-gray-700 truncate">{it.item_name || "Item"}</p>
                          <button type="button" className="text-xs text-red-600" onClick={() => removeFormItem(idx)}>Remove</button>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-2">
                          <input
                            type="number"
                            min="1"
                            className="border border-gray-200 rounded-lg px-2 py-1 text-xs"
                            value={it.qty || 1}
                            onChange={(e) => updateFormItem(idx, { qty: e.target.value })}
                            placeholder="Qty"
                          />
                          <input
                            type="number"
                            min="0"
                            className="border border-gray-200 rounded-lg px-2 py-1 text-xs"
                            value={it.rate ?? 0}
                            onChange={(e) => updateFormItem(idx, { rate: e.target.value })}
                            placeholder="Rate"
                          />
                          <div className="border border-gray-100 rounded-lg px-2 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 flex items-center">
                            {fmt(it.amount || 0)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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

      {collectDue && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
          <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h2 className="font-bold text-gray-800">Collect Due Amount</h2>
              <button onClick={() => setCollectDue(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-5 space-y-3">
              <div className="text-xs text-gray-500">
                Order #{collectDue.order.order_id} · {collectDue.order.customer_name}
              </div>
              <div className="text-sm text-gray-700">
                Current due: <span className="font-bold text-red-600">{fmt(dueFor(collectDue.order))}</span>
              </div>
              <div>
                <label className={labelCls}>Amount to collect (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputCls}
                  value={collectDue.amount}
                  onChange={(e) => setCollectDue({ ...collectDue, amount: e.target.value })}
                />
              </div>
              <div>
                <label className={labelCls}>Payment Mode</label>
                <select
                  className={inputCls}
                  value={collectDue.payment_mode}
                  onChange={(e) => setCollectDue({ ...collectDue, payment_mode: e.target.value })}
                >
                  {PAYMENT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={Boolean(collectDue.mark_completed)}
                  onChange={(e) => setCollectDue({ ...collectDue, mark_completed: e.target.checked })}
                />
                Mark as completed if fully paid
              </label>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setCollectDue(null)}
                  className="flex-1 py-2 rounded-xl border text-sm font-semibold text-gray-600 hover:bg-gray-50"
                >Cancel</button>
                <button
                  onClick={submitCollectDue}
                  disabled={collectingDue}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
                  style={{ backgroundColor: BLUE }}
                >
                  {collectingDue ? "Saving…" : "Collect"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
