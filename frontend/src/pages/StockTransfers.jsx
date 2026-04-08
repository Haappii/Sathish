import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MdSwapHoriz, MdAdd, MdRemove, MdRefresh, MdCheckCircle,
  MdCancel, MdLocalShipping, MdDownload, MdArrowBack, MdExpandMore, MdExpandLess
} from "react-icons/md";
import { FaBoxOpen } from "react-icons/fa";

import authAxios from "../api/authAxios";
import { useToast } from "../components/Toast";
import { getSession } from "../utils/auth";
import { isHotelShop } from "../utils/shopType";

const BLUE = "#0B3C8C";

const STATUS_STYLE = {
  REQUESTED:  { bg: "bg-amber-50",   text: "text-amber-700",  dot: "bg-amber-400"  },
  APPROVED:   { bg: "bg-blue-50",    text: "text-blue-700",   dot: "bg-blue-400"   },
  DISPATCHED: { bg: "bg-purple-50",  text: "text-purple-700", dot: "bg-purple-400" },
  RECEIVED:   { bg: "bg-emerald-50", text: "text-emerald-700",dot: "bg-emerald-500"},
  REJECTED:   { bg: "bg-red-50",     text: "text-red-700",    dot: "bg-red-400"    },
  CANCELLED:  { bg: "bg-slate-100",  text: "text-slate-500",  dot: "bg-slate-400"  },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.REQUESTED;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
}

export default function StockTransfers() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const session = getSession() || {};
  const currentBranchId = Number(session?.branch_id || 0);
  const roleLower = String(session?.role || "").toLowerCase();
  const isAdmin   = roleLower === "admin";
  const isManager = roleLower === "manager";

  const [loading, setLoading]   = useState(true);
  const [transfers, setTransfers] = useState([]);
  const [branches, setBranches]   = useState([]);
  const [items, setItems]         = useState([]);
  const [isHotel, setIsHotel]     = useState(false);
  const [expanded, setExpanded]   = useState({});

  const [create, setCreate] = useState({
    to_branch_id: "",
    notes: "",
    items: [{ item_id: "", quantity: "" }]
  });

  const branchName = useMemo(() => {
    const m = {};
    branches.forEach(b => { m[b.branch_id] = b.branch_name; });
    return m;
  }, [branches]);

  const itemName = useMemo(() => {
    const m = {};
    items.forEach(i => { m[i.item_id] = i.item_name; });
    return m;
  }, [items]);

  const load = async () => {
    setLoading(true);
    try {
      const [shopRes, resTransfers, resBranches, resItems] = await Promise.all([
        authAxios.get("/shop/details"),
        authAxios.get("/stock-transfers/list"),
        authAxios.get(isAdmin ? "/branch/list" : "/branch/active"),
        authAxios.get("/items/")
      ]);

      const hotel = isHotelShop(shopRes.data || {});
      setIsHotel(hotel);

      const allItems = resItems.data || [];
      // Hotels transfer raw materials only; stores transfer sellable items
      const filtered = hotel
        ? allItems.filter(it => !!it.is_raw_material)
        : allItems.filter(it => !it.is_raw_material);

      setTransfers(resTransfers.data || []);
      setBranches(resBranches.data || []);
      setItems(filtered);
    } catch {
      showToast("Failed to load transfers", "error");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  /* ---- form helpers ---- */
  const setItemRow = (idx, patch) =>
    setCreate(p => { const n = { ...p, items: [...p.items] }; n.items[idx] = { ...n.items[idx], ...patch }; return n; });
  const addRow    = () => setCreate(p => ({ ...p, items: [...p.items, { item_id: "", quantity: "" }] }));
  const removeRow = idx => setCreate(p => ({ ...p, items: p.items.filter((_, i) => i !== idx) }));

  const submit = async () => {
    const toId = Number(create.to_branch_id || 0);
    if (!toId) return showToast("Select destination branch", "error");
    const rows = create.items
      .map(x => ({ item_id: Number(x.item_id || 0), quantity: Number(x.quantity || 0) }))
      .filter(x => x.item_id && x.quantity > 0);
    if (!rows.length) return showToast("Add at least one item", "error");
    try {
      await authAxios.post("/stock-transfers/", { to_branch_id: toId, notes: create.notes || null, items: rows });
      showToast("Transfer requested", "success");
      setCreate({ to_branch_id: "", notes: "", items: [{ item_id: "", quantity: "" }] });
      load();
    } catch (err) {
      showToast(err?.response?.data?.detail || "Create failed", "error");
    }
  };

  const doAction = async (id, fn) => {
    try { await fn(); showToast("Updated", "success"); load(); }
    catch (err) { showToast(err?.response?.data?.detail || "Action failed", "error"); }
  };

  const toggleExpand = id => setExpanded(p => ({ ...p, [id]: !p[id] }));

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Header ─────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 transition text-sm font-medium"
            >
              <MdArrowBack size={18} /> Back
            </button>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${BLUE}15` }}>
                <MdSwapHoriz size={20} style={{ color: BLUE }} />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-800">Stock Transfers</h1>
                <p className="text-xs text-slate-500">{isHotel ? "Raw material transfers" : "Item transfers between branches"}</p>
              </div>
            </div>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white transition"
            style={{ background: BLUE }}
          >
            <MdRefresh size={16} /> Refresh
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6 max-w-5xl mx-auto">

        {/* ── Create Transfer Card ────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-blue-50">
              <MdAdd size={16} className="text-blue-600" />
            </div>
            <h2 className="font-semibold text-slate-800 text-sm">New Transfer Request</h2>
          </div>

          <div className="p-5 space-y-4">
            {/* To branch + Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Destination Branch *</label>
                <select
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition"
                  value={create.to_branch_id}
                  onChange={e => setCreate(p => ({ ...p, to_branch_id: e.target.value }))}
                >
                  <option value="">Select branch…</option>
                  {branches
                    .filter(b => Number(b.branch_id) !== currentBranchId)
                    .map(b => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Notes (optional)</label>
                <input
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition"
                  value={create.notes}
                  onChange={e => setCreate(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Reason / remarks…"
                />
              </div>
            </div>

            {/* Item rows */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-600">Items *</label>
              {create.items.map((r, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <select
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition"
                    value={r.item_id}
                    onChange={e => setItemRow(idx, { item_id: e.target.value })}
                  >
                    <option value="">Select item…</option>
                    {items.map(i => <option key={i.item_id} value={i.item_id}>{i.item_name}</option>)}
                  </select>
                  <input
                    type="number"
                    min="1"
                    className="w-24 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-center bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition"
                    value={r.quantity}
                    onChange={e => setItemRow(idx, { quantity: e.target.value })}
                    placeholder="Qty"
                  />
                  <button
                    onClick={() => removeRow(idx)}
                    disabled={create.items.length === 1}
                    className="w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-400 hover:text-red-500 hover:border-red-200 disabled:opacity-30 transition"
                  >
                    <MdRemove size={16} />
                  </button>
                </div>
              ))}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={addRow}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
                >
                  <MdAdd size={15} /> Add Item
                </button>
                <button
                  onClick={submit}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 transition"
                >
                  <MdLocalShipping size={15} /> Request Transfer
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Transfers List ──────────────────────── */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-700 px-1">Transfer History</h2>

          {loading ? (
            <div className="bg-white rounded-2xl border border-slate-200 py-12 text-center text-sm text-slate-400">
              Loading…
            </div>
          ) : transfers.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
              <FaBoxOpen size={32} className="mx-auto mb-3 text-slate-300" />
              <p className="text-sm text-slate-500">No transfers yet</p>
            </div>
          ) : (
            transfers.map(t => (
              <div key={t.transfer_id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {/* Transfer row */}
                <div className="px-5 py-4 flex flex-wrap items-center gap-3">
                  {/* Transfer number + status */}
                  <div className="flex-1 min-w-[160px]">
                    <p className="font-semibold text-slate-800 text-sm">{t.transfer_number}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {t.created_at ? new Date(t.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : ""}
                    </p>
                  </div>

                  {/* From → To */}
                  <div className="flex items-center gap-2 text-sm">
                    <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-medium text-xs">
                      {branchName[t.from_branch_id] || `Branch ${t.from_branch_id}`}
                    </span>
                    <MdSwapHoriz size={16} className="text-slate-400" />
                    <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-medium text-xs">
                      {branchName[t.to_branch_id] || `Branch ${t.to_branch_id}`}
                    </span>
                  </div>

                  <StatusBadge status={t.status} />

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {isAdmin && t.status === "REQUESTED" && (
                      <>
                        <button
                          onClick={() => doAction(t.transfer_id, () => authAxios.post(`/stock-transfers/${t.transfer_id}/approve`))}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold transition"
                        >
                          <MdCheckCircle size={13} /> Approve
                        </button>
                        <button
                          onClick={() => doAction(t.transfer_id, () => authAxios.post(`/stock-transfers/${t.transfer_id}/reject`))}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-semibold transition"
                        >
                          <MdCancel size={13} /> Reject
                        </button>
                      </>
                    )}
                    {(isAdmin || (isManager && Number(t.from_branch_id) === currentBranchId)) && t.status === "APPROVED" && (
                      <button
                        onClick={() => doAction(t.transfer_id, () => authAxios.post(`/stock-transfers/${t.transfer_id}/dispatch`))}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold transition"
                      >
                        <MdLocalShipping size={13} /> Dispatch
                      </button>
                    )}
                    {(isAdmin || (isManager && Number(t.to_branch_id) === currentBranchId)) && t.status === "DISPATCHED" && (
                      <button
                        onClick={() => doAction(t.transfer_id, () => authAxios.post(`/stock-transfers/${t.transfer_id}/receive`))}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition"
                        style={{ background: BLUE }}
                      >
                        <MdDownload size={13} /> Receive
                      </button>
                    )}
                    {isAdmin && ["REQUESTED", "APPROVED"].includes(t.status) && (
                      <button
                        onClick={() => doAction(t.transfer_id, () => authAxios.post(`/stock-transfers/${t.transfer_id}/cancel`))}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                      >
                        Cancel
                      </button>
                    )}

                    {/* Expand items */}
                    {t.items?.length > 0 && (
                      <button
                        onClick={() => toggleExpand(t.transfer_id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-500 hover:bg-slate-50 transition"
                      >
                        {expanded[t.transfer_id] ? <MdExpandLess size={14} /> : <MdExpandMore size={14} />}
                        {t.items.length} item{t.items.length !== 1 ? "s" : ""}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expandable items list */}
                {expanded[t.transfer_id] && t.items?.length > 0 && (
                  <div className="border-t border-slate-100 bg-slate-50 px-5 py-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {t.items.map((it, i) => (
                        <div key={i} className="bg-white rounded-xl border border-slate-100 px-3 py-2">
                          <p className="text-xs font-semibold text-slate-700 truncate">
                            {itemName[it.item_id] || it.item_name || `Item ${it.item_id}`}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">Qty: <span className="font-semibold text-slate-600">{it.quantity}</span></p>
                        </div>
                      ))}
                    </div>
                    {t.notes && (
                      <p className="text-xs text-slate-500 mt-2 italic">Note: {t.notes}</p>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
