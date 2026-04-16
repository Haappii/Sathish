import { useEffect, useState } from "react";
import { MdRefresh, MdTableRestaurant } from "react-icons/md";

import api from "../utils/apiClient";
import BackButton from "../components/BackButton";
import { useToast } from "../components/Toast";
import {
  ORDER_LIVE_STAGE_MAP,
  formatTrackingStatusLabel,
  getTrackingDisplayTitle,
} from "../utils/orderLive";

const STATUS_TONE = {
  ORDER_PLACED: "bg-sky-50 text-sky-700 border-sky-200",
  ORDER_PREPARING: "bg-amber-50 text-amber-700 border-amber-200",
  FOOD_PREPARED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  MOVED_TO_TABLE: "bg-violet-50 text-violet-700 border-violet-200",
  COMPLETED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  AWAITING_KOT: "bg-slate-100 text-slate-600 border-slate-200",
};

const SUMMARY_STATUSES = [
  { key: "ORDER_PLACED",    label: "Order Placed",    tone: "bg-sky-50 text-sky-700 border-sky-200",         dot: "bg-sky-500" },
  { key: "ORDER_PREPARING", label: "Order Preparing", tone: "bg-amber-50 text-amber-700 border-amber-200",   dot: "bg-amber-500" },
  { key: "FOOD_PREPARED",   label: "Food Prepared",   tone: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  { key: "MOVED_TO_TABLE",  label: "Moved To Table",  tone: "bg-violet-50 text-violet-700 border-violet-200", dot: "bg-violet-500" },
];

export default function OrderLiveTracking() {
  const { showToast } = useToast();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState("");
  const [activeTab, setActiveTab] = useState("live");

  const load = async ({ silent = false } = {}) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await api.get("/kot/tracking/orders");
      const list = Array.isArray(res?.data) ? res.data : [];
      const visibleRows = list.filter((row) => {
        const orderType = String(row?.order_type || "").trim().toUpperCase();
        const status = String(row?.status || "").trim().toUpperCase();
        const isHandedOverTakeaway =
          orderType === "TAKEAWAY" && (status === "SERVED" || status === "MOVED_TO_TABLE");
        return !isHandedOverTakeaway;
      });
      setRows(
        visibleRows.sort((a, b) => {
          const ai = ORDER_LIVE_STAGE_MAP[String(a?.status || "").toUpperCase()]?.index ?? 99;
          const bi = ORDER_LIVE_STAGE_MAP[String(b?.status || "").toUpperCase()]?.index ?? 99;
          if (ai !== bi) return ai - bi;
          return new Date(a?.opened_at || 0).getTime() - new Date(b?.opened_at || 0).getTime();
        })
      );
      setLastRefresh(new Date().toLocaleTimeString());
    } catch (err) {
      setRows([]);
      if (!silent) {
        showToast(err?.response?.data?.detail || "Failed to load live orders", "error");
      }
    } finally {
      setLoading(false);
      if (!silent) setRefreshing(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    void load();

    const timer = setInterval(() => {
      if (mounted) {
        void load({ silent: true });
      }
    }, 5000);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <BackButton to="/table-billing" />
          <div>
            <h1 className="text-xl font-extrabold text-slate-800">Order Live Tracking</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              Compact live board with table, status and item names
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Tab toggles */}
          <div className="flex rounded-xl border bg-white overflow-hidden text-[12px] font-semibold">
            {["live", "summary"].map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 capitalize transition ${
                  activeTab === tab
                    ? "bg-slate-800 text-white"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {tab === "live" ? "Live Board" : "Summary"}
              </button>
            ))}
          </div>

          {lastRefresh && (
            <span className="rounded-xl border bg-white px-3 py-1.5 text-[11px] font-medium text-slate-500">
              Updated {lastRefresh}
            </span>
          )}
          <button
            type="button"
            onClick={() => load()}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-xl border bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            <MdRefresh size={14} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border bg-white py-20 text-center text-sm text-slate-400 shadow-sm">
          Loading live orders...
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border bg-white px-6 py-20 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50">
            <MdTableRestaurant size={30} className="text-slate-300" />
          </div>
          <div className="mt-4 text-sm font-bold text-slate-700">No live orders yet</div>
          <p className="mt-1 text-xs text-slate-400">
            Generate KOT from a table order to start live tracking here.
          </p>
        </div>
      ) : activeTab === "summary" ? (
        /* ── Summary Tab ── */
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {SUMMARY_STATUSES.map(({ key, label, tone, dot }) => {
            const group = rows.filter(
              (r) => String(r.status || "").toUpperCase() === key
            );
            const totalItems = group.reduce(
              (acc, r) => acc + (r.items || []).length,
              0
            );
            return (
              <div key={key} className="rounded-2xl border bg-white shadow-sm overflow-hidden">
                {/* Status header */}
                <div className={`flex items-center justify-between px-4 py-3 border-b ${tone}`}>
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${dot}`} />
                    <span className="text-xs font-bold">{label}</span>
                  </div>
                  <span className="text-lg font-extrabold">{group.length}</span>
                </div>

                {/* Totals strip */}
                <div className="flex items-center gap-1 px-4 py-2 border-b bg-slate-50">
                  <span className="text-[11px] text-slate-500 font-medium">
                    Total items:
                  </span>
                  <span className="text-[11px] font-bold text-slate-700">{totalItems}</span>
                </div>

                {/* Order list */}
                {group.length === 0 ? (
                  <div className="px-4 py-6 text-center text-[11px] text-slate-400">
                    No orders
                  </div>
                ) : (
                  <ul className="divide-y">
                    {group.map((row) => {
                      const itemCount = (row.items || []).length;
                      return (
                        <li key={row.order_id} className="px-4 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[12px] font-semibold text-slate-800 truncate">
                              {getTrackingDisplayTitle({
                                tableName: row.table_name,
                                orderType: row.order_type,
                                tokenNumber: row.token_number,
                                orderId: row.order_id,
                              })}
                            </span>
                            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                              {itemCount} item{itemCount !== 1 ? "s" : ""}
                            </span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {(row.items || []).map((item) => (
                              <span
                                key={item.order_item_id}
                                className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600"
                              >
                                {item.item_name || "Item"}
                              </span>
                            ))}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* ── Live Board Tab ── */
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {rows.map((row) => {
            const statusLabel = formatTrackingStatusLabel(
              row.status,
              row.status_label || "Awaiting KOT",
              row.order_type
            );

            return (
              <div key={row.order_id} className="rounded-xl border bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 truncate text-sm font-extrabold text-slate-800">
                    {getTrackingDisplayTitle({
                      tableName: row.table_name,
                      orderType: row.order_type,
                      tokenNumber: row.token_number,
                      orderId: row.order_id,
                    })}
                  </div>
                  {statusLabel ? (
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                        STATUS_TONE[String(row.status || "").toUpperCase()] || STATUS_TONE.AWAITING_KOT
                      }`}
                    >
                      {statusLabel}
                    </span>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(row.items || []).length > 0 ? (
                    row.items.map((item) => (
                      <span
                        key={item.order_item_id}
                        className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700"
                      >
                        {item.item_name || "Item"}
                      </span>
                    ))
                  ) : (
                    <span className="text-[11px] text-slate-400">No items</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
