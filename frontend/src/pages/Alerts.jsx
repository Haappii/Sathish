import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";

import authAxios from "../api/authAxios";
import { useToast } from "../components/Toast";
import { modulesToPermMap } from "../utils/navigationMenu";

export default function Alerts() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [allowed, setAllowed] = useState(null);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    authAxios
      .get("/permissions/my")
      .then((r) => {
        const map = modulesToPermMap(r?.data?.modules);
        setAllowed(Boolean(map?.alerts?.can_read));
      })
      .catch(() => setAllowed(false));
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await authAxios.get("/alerts/summary");
      setSummary(res.data || null);
    } catch (e) {
      setSummary(null);
      showToast(e?.response?.data?.detail || "Failed to load alerts", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!allowed) return;
    load();
  }, [allowed]);

  if (allowed === null) {
    return (
      <div className="mt-10 text-center text-sm font-medium text-gray-600">
        Loading...
      </div>
    );
  }
  if (!allowed) {
    return (
      <div className="mt-10 text-center text-sm font-medium text-red-600">
        You are not authorized to access this page
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate("/home", { replace: true })}
          className="px-3 py-1.5 rounded-lg border bg-white shadow-sm text-[12px]"
        >
          &larr; Back
        </button>
        <h2 className="text-lg font-bold text-slate-800">Alerts</h2>
        <button
          onClick={load}
          className="px-3 py-1.5 rounded-lg border bg-white shadow-sm text-[12px]"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-[12px] text-slate-500">Loading...</div>
      ) : !summary ? (
        <div className="text-[12px] text-slate-500">No data</div>
      ) : (
        <>
          <div className="rounded-xl border bg-white p-4 text-[12px] text-slate-700">
            Business date: <span className="font-bold">{summary.business_date}</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="rounded-xl border bg-white p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Low Stock</div>
                <Link className="text-[11px] text-blue-600 underline" to="/reorder-alerts">
                  Open
                </Link>
              </div>
              <div className="text-[12px]">
                Items below min stock:{" "}
                <span className="font-bold text-rose-700">
                  {Number(summary.low_stock_count || 0)}
                </span>
              </div>
              {summary.low_stock_top?.length ? (
                <div className="space-y-1">
                  {summary.low_stock_top.map((r) => (
                    <div key={r.item_id} className="flex items-center justify-between text-[11px]">
                      <div className="truncate">{r.item_name}</div>
                      <div className="font-bold text-rose-700">-{Number(r.short_by || 0)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-slate-500">No low-stock items</div>
              )}
            </div>

            <div className="rounded-xl border bg-white p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Day Close Pending</div>
                <Link className="text-[11px] text-blue-600 underline" to="/day-close">
                  Open
                </Link>
              </div>
              {summary.day_close_pending?.length ? (
                <div className="space-y-1 text-[11px]">
                  {summary.day_close_pending.map((b) => (
                    <div key={b.branch_id} className="flex items-center justify-between">
                      <div className="truncate">{b.branch_name}</div>
                      <div className="text-rose-700 font-bold">OPEN</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-emerald-700 font-semibold">
                  All branches closed
                </div>
              )}
            </div>

            <div className="rounded-xl border bg-white p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Open Shifts</div>
                <Link className="text-[11px] text-blue-600 underline" to="/cash-drawer">
                  Open
                </Link>
              </div>
              {summary.open_shifts?.length ? (
                <div className="space-y-1 text-[11px]">
                  {summary.open_shifts.map((s) => (
                    <div key={s.branch_id} className="flex items-center justify-between">
                      <div className="text-slate-600">Branch #{s.branch_id}</div>
                      <div className="font-bold">{Number(s.open_shifts || 0)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-slate-500">No open shifts</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
