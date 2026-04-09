import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MdRefresh, MdTableRestaurant } from "react-icons/md";

import api from "../utils/apiClient";
import BackButton from "../components/BackButton";
import { useToast } from "../components/Toast";
import {
  ORDER_LIVE_STAGES,
  ORDER_LIVE_STAGE_MAP,
  formatOrderLiveAge,
} from "../utils/orderLive";

const STATUS_TONE = {
  ORDER_PLACED: "bg-sky-50 text-sky-700 border-sky-200",
  ORDER_PREPARING: "bg-amber-50 text-amber-700 border-amber-200",
  FOOD_PREPARED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  MOVED_TO_TABLE: "bg-violet-50 text-violet-700 border-violet-200",
  AWAITING_KOT: "bg-slate-100 text-slate-600 border-slate-200",
};

function StatusStepper({ status }) {
  const activeIndex = ORDER_LIVE_STAGE_MAP[String(status || "").toUpperCase()]?.index ?? -1;

  return (
    <div className="grid grid-cols-4 gap-2">
      {ORDER_LIVE_STAGES.map((stage, index) => {
        const done = activeIndex >= index;
        return (
          <div
            key={stage.key}
            className={`rounded-xl border px-2 py-2 text-center transition ${
              done
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-white text-slate-400"
            }`}
          >
            <div className="text-[10px] font-semibold uppercase tracking-wide">
              Step {index + 1}
            </div>
            <div className="mt-1 text-[11px] font-bold leading-tight">
              {stage.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function OrderLiveTracking() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState("");

  const load = async ({ silent = false } = {}) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await api.get("/kot/tracking/orders");
      const list = Array.isArray(res?.data) ? res.data : [];
      setRows(
        list.sort((a, b) => {
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
    (async () => {
      await load();
    })();

    const timer = setInterval(() => {
      if (mounted) load({ silent: true });
    }, 5000);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const counts = useMemo(() => {
    return rows.reduce((acc, row) => {
      const key = String(row?.status || "").toUpperCase();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }, [rows]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <BackButton to="/table-billing" />
          <div>
            <h1 className="text-xl font-extrabold text-slate-800">Order Live Tracking</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Tracks open hotel orders after KOT generation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {lastRefresh && (
            <span className="px-3 py-1.5 rounded-xl border bg-white text-[11px] font-medium text-slate-500">
              Updated {lastRefresh}
            </span>
          )}
          <button
            type="button"
            onClick={() => navigate("/kot")}
            className="px-3 py-1.5 rounded-xl border bg-white text-[12px] font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            Manage Status
          </button>
          <button
            type="button"
            onClick={() => load()}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border bg-white text-[12px] font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-60"
          >
            <MdRefresh size={14} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {ORDER_LIVE_STAGES.map((stage) => (
          <div key={stage.key} className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {stage.label}
            </div>
            <div className="mt-2 text-2xl font-extrabold text-slate-800">
              {counts[stage.key] || 0}
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="rounded-2xl border bg-white py-20 text-center text-sm text-slate-400 shadow-sm">
          Loading live orders...
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border bg-white py-20 px-6 text-center shadow-sm">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center">
            <MdTableRestaurant size={30} className="text-slate-300" />
          </div>
          <div className="mt-4 text-sm font-bold text-slate-700">No live orders yet</div>
          <p className="mt-1 text-xs text-slate-400">
            Generate KOT from a table order to start live tracking here.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {rows.map((row) => (
            <div key={row.order_id} className="rounded-2xl border bg-white shadow-sm overflow-hidden">
              <div className="px-4 py-4 border-b flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-extrabold text-slate-800">
                      {row.table_name ? `Table ${row.table_name}` : `Order #${row.order_id}`}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full border bg-slate-50 text-slate-500">
                      Order #{row.order_id}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {row.customer_name || "Walk-in"}{row.mobile ? ` · ${row.mobile}` : ""}{row.opened_at ? ` · ${formatOrderLiveAge(row.opened_at)}` : ""}
                  </div>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-full border text-[11px] font-bold ${
                    STATUS_TONE[String(row.status || "").toUpperCase()] || STATUS_TONE.AWAITING_KOT
                  }`}
                >
                  {row.status_label || "Awaiting KOT"}
                </span>
              </div>

              <div className="p-4 space-y-4">
                <StatusStepper status={row.status} />

                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl bg-slate-50 px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      KOTs
                    </div>
                    <div className="mt-1 text-lg font-bold text-slate-800">{row.kot_count || 0}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Lines
                    </div>
                    <div className="mt-1 text-lg font-bold text-slate-800">{row.item_count || 0}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Qty
                    </div>
                    <div className="mt-1 text-lg font-bold text-slate-800">{row.total_qty || 0}</div>
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-2">
                    KOT Summary
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(row.kots || []).map((kot) => (
                      <span
                        key={kot.kot_id}
                        className="px-2.5 py-1 rounded-full border bg-slate-50 text-[11px] font-medium text-slate-600"
                      >
                        {kot.kot_number} · {kot.status}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-2">
                    Items
                  </div>
                  <div className="rounded-xl border overflow-hidden">
                    {(row.items || []).slice(0, 6).map((item) => (
                      <div
                        key={item.order_item_id}
                        className="px-3 py-2 flex items-center justify-between gap-3 border-b last:border-b-0"
                      >
                        <span className="text-sm text-slate-700 truncate">{item.item_name}</span>
                        <span className="text-sm font-bold text-slate-800">{item.quantity}</span>
                      </div>
                    ))}
                    {(row.items || []).length > 6 && (
                      <div className="px-3 py-2 text-[11px] text-slate-400 bg-slate-50">
                        + {(row.items || []).length - 6} more item lines
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => navigate("/kot")}
                    className="px-3 py-1.5 rounded-xl border text-[11px] font-semibold text-slate-600 hover:bg-slate-50 transition"
                  >
                    Manage Status
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(`/table-order/${row.table_id}`)}
                    className="px-3 py-1.5 rounded-xl border text-[11px] font-semibold text-slate-600 hover:bg-slate-50 transition"
                  >
                    Open Order
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
