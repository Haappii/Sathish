import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MdRefresh, MdTableRestaurant } from "react-icons/md";

import api from "../utils/apiClient";
import BackButton from "../components/BackButton";
import { useToast } from "../components/Toast";
import {
  KOT_STATUS_STAGES,
  KOT_STATUS_STAGE_MAP,
  formatTrackingStatusLabel,
  formatKotStatusLabel,
  formatOrderLiveAge,
  getNextKotAction,
  getTrackingDisplayTitle,
} from "../utils/orderLive";

const STATUS_TONE = {
  PENDING: "bg-sky-50 text-sky-700 border-sky-200",
  PREPARING: "bg-amber-50 text-amber-700 border-amber-200",
  READY: "bg-emerald-50 text-emerald-700 border-emerald-200",
  SERVED: "bg-violet-50 text-violet-700 border-violet-200",
  COMPLETED: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

export default function KitchenDisplay() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [lastRefresh, setLastRefresh] = useState("");

  const load = async ({ silent = false } = {}) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await api.get("/kot/tracking/orders");
      setRows(Array.isArray(res?.data) ? res.data : []);
      setLastRefresh(new Date().toLocaleTimeString());
    } catch (err) {
      setRows([]);
      if (!silent) {
        showToast(err?.response?.data?.detail || "Failed to load KOT cards", "error");
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

  const cards = useMemo(() => {
    const flattened = [];

    for (const row of rows) {
      for (const kot of row?.kots || []) {
        const status = String(kot?.status || "").toUpperCase();
        if (status === "COMPLETED") continue;

        flattened.push({
          orderId: row.order_id,
          tableId: row.table_id,
          tableName: row.table_name,
          orderType: row.order_type,
          tokenNumber: row.token_number,
          kotId: kot.kot_id,
          kotNumber: kot.kot_number,
          status,
          statusLabel: formatTrackingStatusLabel(
            status,
            kot.status_label || formatKotStatusLabel(status),
            row.order_type
          ),
          printedAt: kot.printed_at || row.opened_at,
          items: Array.isArray(kot.items) ? kot.items : [],
        });
      }
    }

    return flattened.sort((a, b) => {
      const ai = KOT_STATUS_STAGE_MAP[a.status]?.index ?? 99;
      const bi = KOT_STATUS_STAGE_MAP[b.status]?.index ?? 99;
      if (ai !== bi) return ai - bi;
      return new Date(a.printedAt || 0).getTime() - new Date(b.printedAt || 0).getTime();
    });
  }, [rows]);

  const counts = useMemo(() => {
    return cards.reduce((acc, card) => {
      acc[card.status] = (acc[card.status] || 0) + 1;
      return acc;
    }, {});
  }, [cards]);

  const updateStatus = async (card, nextStatus) => {
    if (!card?.kotId || !nextStatus || busyId) return;
    setBusyId(card.kotId);
    try {
      await api.put(`/kot/${card.kotId}/status`, { status: nextStatus });
      showToast(`${card.kotNumber || `KOT #${card.kotId}`} updated`, "success");
      await load({ silent: true });
    } catch (err) {
      showToast(err?.response?.data?.detail || "Failed to update KOT status", "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <BackButton to="/table-billing" />
          <div>
            <h1 className="text-xl font-extrabold text-slate-800">Order Status Manager</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              One compact card per KOT
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {lastRefresh && (
            <span className="rounded-xl border bg-white px-3 py-1.5 text-[11px] font-medium text-slate-500">
              Updated {lastRefresh}
            </span>
          )}
          <button
            type="button"
            onClick={() => navigate("/order-live")}
            className="rounded-xl border bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Open Live Screen
          </button>
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

      <div className="flex flex-wrap gap-2">
        {KOT_STATUS_STAGES.map((stage) => (
          <div
            key={stage.key}
            className="rounded-full border bg-white px-3 py-1 text-[11px] font-semibold text-slate-600 shadow-sm"
          >
            {stage.label}: {counts[stage.key] || 0}
          </div>
        ))}
      </div>

      {loading ? (
        <div className="rounded-2xl border bg-white py-20 text-center text-sm text-slate-400 shadow-sm">
          Loading KOT cards...
        </div>
      ) : cards.length === 0 ? (
        <div className="rounded-2xl border bg-white px-6 py-20 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50">
            <MdTableRestaurant size={30} className="text-slate-300" />
          </div>
          <div className="mt-4 text-sm font-bold text-slate-700">No active KOT cards</div>
          <p className="mt-1 text-xs text-slate-400">
            Generate KOT from a table order to manage it here.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {cards.map((card) => {
            const action = getNextKotAction(card.status, card.orderType);
            const busy = busyId === card.kotId;
            const isTakeaway = String(card.orderType || "").toUpperCase() === "TAKEAWAY";

            return (
              <div key={card.kotId} className="rounded-xl border bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-extrabold text-slate-800">
                      {getTrackingDisplayTitle(card)}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                      <span className="rounded-full border bg-slate-50 px-2 py-0.5 font-semibold text-slate-600">
                        {card.kotNumber}
                      </span>
                      <span>Order #{card.orderId}</span>
                      {card.printedAt ? <span>{formatOrderLiveAge(card.printedAt)}</span> : null}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                      STATUS_TONE[card.status] || "bg-slate-100 text-slate-600 border-slate-200"
                    }`}
                  >
                    {card.statusLabel}
                  </span>
                </div>

                <div className="mt-3 space-y-1.5">
                  {card.items.length > 0 ? (
                    <>
                      {card.items.slice(0, 5).map((item) => (
                        <div
                          key={item.id || item.order_item_id}
                          className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5"
                        >
                          <span className="truncate text-[12px] font-medium text-slate-700">
                            {item.item_name || "Item"}
                          </span>
                          <span className="shrink-0 text-[11px] font-bold text-slate-800">
                            x{item.quantity || 0}
                          </span>
                        </div>
                      ))}
                      {card.items.length > 5 && (
                        <div className="px-1 text-[11px] text-slate-400">
                          + {card.items.length - 5} more items
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] text-slate-400">
                      No items in this KOT
                    </div>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-end gap-2">
                  {card.tableId && !isTakeaway ? (
                    <button
                      type="button"
                      onClick={() => navigate(`/table-order/${card.tableId}`)}
                      className="rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
                    >
                      Open
                    </button>
                  ) : null}
                  {action ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => updateStatus(card, action.status)}
                      className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                    >
                      {busy ? "Saving..." : action.label}
                    </button>
                  ) : null}
                  {card.status === "SERVED" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => updateStatus(card, "COMPLETED")}
                      className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {busy ? "Saving..." : "Completed"}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
