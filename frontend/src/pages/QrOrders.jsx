import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../utils/apiClient";
import { printDirectText } from "../utils/printDirect";
import { useToast } from "../components/Toast";
import { getSession } from "../utils/auth";
import { buildBusinessDateTimeLabel, getBusinessDate } from "../utils/businessDate";
import {
  MdTableRestaurant,
  MdOutlineOpenInNew,
  MdRefresh,
} from "react-icons/md";
import {
  FaCheck,
  FaTimes,
  FaPrint,
  FaUser,
  FaMobileAlt,
} from "react-icons/fa";
import BackButton from "../components/BackButton";

const BLUE = "#0B3C8C";

/* ── relative time helper ─────────────────────────────────────────────────── */
function timeAgo(ts) {
  if (!ts) return "";
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

/* ── KOT text builder (unchanged) ────────────────────────────────────────── */
function generateKOTText({ tableName, items }) {
  const WIDTH = 32;
  const NAME_COL = 22;
  const COUNT_COL = 8;
  const line = "-".repeat(WIDTH);
  const center = (txt) =>
    " ".repeat(Math.max(0, Math.floor((WIDTH - txt.length) / 2))) + txt;
  const rightCol = (txt, width) =>
    " ".repeat(Math.max(0, width - txt.length)) + txt;

  let t = "";
  t += center("KOT") + "\n";
  t += center(buildBusinessDateTimeLabel(getBusinessDate())) + "\n";
  t += center(tableName ? `Table ${tableName}` : "Table Billing") + "\n";
  t += line + "\n";
  t += "Item Name".padEnd(NAME_COL) + rightCol("Count", COUNT_COL) + "\n";
  t += line + "\n";
  (Array.isArray(items) ? items : []).forEach((it) => {
    const name = String(it.item_name || "").slice(0, NAME_COL).padEnd(NAME_COL);
    const count = String(Number(it.quantity || 0));
    t += name + rightCol(count, COUNT_COL) + "\n";
  });
  t += line + "\n";
  const totalCount = (items || []).reduce((s, it) => s + Number(it.quantity || 0), 0);
  t += center(`Total Count - ${totalCount}`) + "\n";
  t += line + "\n";
  return t;
}

/* ── single order card ────────────────────────────────────────────────────── */
function OrderCard({ order, busy, kotRequired, onAccept, onReject }) {
  const isBusy = busy === order.qr_order_id;
  const total = (order.items || []).reduce(
    (s, it) => s + Number(it.price || 0) * Number(it.quantity || 0),
    0
  );
  const itemCount = (order.items || []).reduce(
    (s, it) => s + Number(it.quantity || 0),
    0
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* amber stripe */}
      <div className="h-1 bg-amber-400 w-full" />

      <div className="p-4 space-y-3">
        {/* order header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="inline-block bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold px-2 py-0.5 rounded-full">
              Order #{order.qr_order_id}
            </span>
            {order.created_at && (
              <span className="ml-2 text-[11px] text-slate-400">{timeAgo(order.created_at)}</span>
            )}
          </div>
          <span className="text-[11px] font-bold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">
            {itemCount} {itemCount === 1 ? "item" : "items"}
          </span>
        </div>

        {/* customer */}
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {order.customer_name && (
            <span className="flex items-center gap-1.5 text-xs text-slate-600">
              <FaUser size={10} className="text-slate-400" />
              {order.customer_name}
            </span>
          )}
          {order.mobile && (
            <span className="flex items-center gap-1.5 text-xs text-slate-600">
              <FaMobileAlt size={10} className="text-slate-400" />
              {order.mobile}
            </span>
          )}
        </div>

        {/* items */}
        <div className="bg-slate-50 rounded-xl divide-y divide-slate-100">
          {(order.items || []).map((it) => (
            <div
              key={it.item_id}
              className="flex items-center justify-between px-3 py-2 gap-3"
            >
              <span className="text-sm text-slate-700 truncate flex-1">{it.item_name}</span>
              <div className="flex items-center gap-2 flex-shrink-0">
                {Number(it.price || 0) > 0 && (
                  <span className="text-xs text-slate-400">
                    ₹{Number(it.price || 0).toFixed(0)} ×
                  </span>
                )}
                <span className="text-sm font-bold text-slate-800">{it.quantity}</span>
              </div>
            </div>
          ))}
        </div>

        {/* total */}
        {total > 0 && (
          <div className="flex justify-end">
            <span className="text-xs text-slate-500">
              Subtotal:{" "}
              <span className="font-bold text-slate-700">₹{total.toFixed(2)}</span>
            </span>
          </div>
        )}

        {/* actions */}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => onReject(order.qr_order_id)}
            disabled={isBusy}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50 transition"
          >
            <FaTimes size={12} /> Reject
          </button>
          <button
            type="button"
            onClick={() => onAccept(order.qr_order_id)}
            disabled={isBusy}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50 transition hover:opacity-90"
            style={{ background: BLUE }}
          >
            {isBusy ? (
              <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            ) : kotRequired ? (
              <><FaPrint size={12} /> Accept + KOT</>
            ) : (
              <><FaCheck size={12} /> Accept</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── table group ──────────────────────────────────────────────────────────── */
function TableGroup({ tableId, tableName, orders, busy, kotRequired, onAccept, onReject, onOpenTable }) {
  return (
    <div className="space-y-3">
      {/* table header row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: BLUE }}
          >
            <MdTableRestaurant size={16} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">
              {tableName ? `Table ${tableName}` : `Table #${tableId}`}
            </p>
            <p className="text-[11px] text-slate-500">
              {orders.length} pending {orders.length === 1 ? "order" : "orders"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onOpenTable(tableId)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
        >
          <MdOutlineOpenInNew size={13} /> Open Table
        </button>
      </div>

      {/* order cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {orders.map((r) => (
          <OrderCard
            key={r.qr_order_id}
            order={r}
            busy={busy}
            kotRequired={kotRequired}
            onAccept={onAccept}
            onReject={onReject}
          />
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════════════════════ */
export default function QrOrders() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const kotPrintRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [printCfg, setPrintCfg] = useState({ kot_required: true });
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  const load = async () => {
    try {
      const res = await api.get("/qr-orders/pending");
      setRows(Array.isArray(res.data) ? res.data : []);
      setLastRefresh(Date.now());
    } catch {
      setRows([]);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const s = getSession() || {};
        if (s?.branch_id) {
          const br = await api.get(`/branch/${s.branch_id}`);
          if (mounted) {
            setPrintCfg({ kot_required: Boolean(br?.data?.kot_required ?? true) });
          }
        }
      } catch { /* keep defaults */ }
      await load();
      if (mounted) setLoading(false);
    })();

    const t = setInterval(load, 5000);
    return () => { mounted = false; clearInterval(t); };
  }, []);

  const printKOT = async ({ tableName, items }) => {
    const it = (Array.isArray(items) ? items : []).filter((x) => Number(x.quantity || 0) > 0);
    if (!it.length) return;
    const ok = await printDirectText(generateKOTText({ tableName, items: it }));
    if (!ok) showToast("Printing failed. Check printer/popup settings.", "error");
  };

  const accept = async (id) => {
    if (busyId) return;
    setBusyId(id);
    try {
      const res = await api.post(`/qr-orders/${id}/accept`);
      const data = res.data || {};
      if (printCfg.kot_required) {
        await printKOT({ tableName: data.table_name, items: data.items || [] });
        showToast("Order accepted · KOT printed", "success");
      } else {
        showToast("Order accepted", "success");
      }
      await load();
    } catch (e) {
      showToast(e?.response?.data?.detail || "Failed to accept order", "error");
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (id) => {
    if (busyId) return;
    if (!window.confirm("Reject this order?")) return;
    setBusyId(id);
    try {
      await api.post(`/qr-orders/${id}/reject`);
      showToast("Order rejected", "success");
      await load();
    } catch (e) {
      showToast(e?.response?.data?.detail || "Failed to reject order", "error");
    } finally {
      setBusyId(null);
    }
  };

  const grouped = useMemo(() => {
    const by = {};
    for (const r of rows) {
      const key = String(r.table_id || "0");
      if (!by[key]) by[key] = [];
      by[key].push(r);
    }
    return Object.values(by).sort((a, b) =>
      String(a[0]?.table_name || "").localeCompare(String(b[0]?.table_name || ""))
    );
  }, [rows]);

  const pendingCount = rows.length;

  /* ── render ── */
  return (
    <div className="space-y-6">

      {/* ── header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <BackButton to="/table-billing" />
          <div>
            <h2 className="text-xl font-extrabold text-slate-800">QR Orders</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Auto-refreshes every 5 seconds
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* live badge */}
          {pendingCount > 0 && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold px-3 py-1.5 rounded-full">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              {pendingCount} pending
            </div>
          )}
          <button
            type="button"
            onClick={load}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
          >
            <MdRefresh size={14} /> Refresh
          </button>
        </div>
      </div>

      <div ref={kotPrintRef} className="hidden" />

      {/* ── body ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-400">
          <div className="w-8 h-8 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" />
          <p className="text-sm">Loading orders…</p>
        </div>
      ) : pendingCount === 0 ? (
        <div className="bg-white border rounded-2xl shadow-sm flex flex-col items-center justify-center gap-4 py-20 text-center px-6">
          <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center">
            <MdTableRestaurant size={32} className="text-slate-300" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-600">No pending orders</p>
            <p className="text-xs text-slate-400 mt-1">
              New orders from customers will appear here automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/table-billing")}
            className="mt-1 px-4 py-2 rounded-xl border text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
          >
            Go to Table Billing
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map((list) => (
            <TableGroup
              key={String(list[0]?.table_id)}
              tableId={list[0]?.table_id}
              tableName={list[0]?.table_name}
              orders={list}
              busy={busyId}
              kotRequired={printCfg.kot_required}
              onAccept={accept}
              onReject={reject}
              onOpenTable={(id) => navigate(`/table-order/${id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
