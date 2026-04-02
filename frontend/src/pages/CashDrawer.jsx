import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import authAxios from "../api/authAxios";
import { useToast } from "../components/Toast";
import { modulesToPermMap } from "../utils/navigationMenu";

const DENOMS = ["2000", "500", "200", "100", "50", "20", "10", "5", "2", "1"];

const calcDenomTotal = (counts) => {
  let total = 0;
  for (const d of DENOMS) {
    const c = Number(counts?.[d] || 0);
    total += Number(d) * (Number.isFinite(c) ? c : 0);
  }
  return total;
};

const inputCls = "border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] bg-gray-50 focus:outline-none focus:border-blue-400 focus:bg-white transition w-full";
const labelCls = "text-[10px] font-semibold text-gray-500 uppercase tracking-wide";

export default function CashDrawer() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [allowed, setAllowed] = useState(null);
  const [canWrite, setCanWrite] = useState(false);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ shift: null, movements: [], summary: null });

  const [openForm, setOpenForm] = useState({ opening_cash: "", opening_notes: "" });
  const [moveForm, setMoveForm] = useState({ movement_type: "IN", amount: "", reason: "" });
  const [closeForm, setCloseForm] = useState({ closing_notes: "" });
  const [denoms, setDenoms] = useState(() =>
    Object.fromEntries(DENOMS.map((d) => [d, ""]))
  );

  const denomTotal = useMemo(() => calcDenomTotal(denoms), [denoms]);

  useEffect(() => {
    authAxios
      .get("/permissions/my")
      .then((r) => {
        const map = modulesToPermMap(r?.data?.modules);
        setAllowed(Boolean(map?.cash_drawer?.can_read));
        setCanWrite(Boolean(map?.cash_drawer?.can_write));
      })
      .catch(() => {
        setAllowed(false);
        setCanWrite(false);
      });
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await authAxios.get("/cash-drawer/current");
      setData(res.data || { shift: null, movements: [], summary: null });
    } catch (e) {
      showToast(e?.response?.data?.detail || "Failed to load cash drawer", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!allowed) return;
    load();
  }, [allowed]);

  const openShift = async () => {
    if (!canWrite) return showToast("Not allowed", "error");
    try {
      await authAxios.post("/cash-drawer/open", {
        opening_cash: Number(openForm.opening_cash || 0),
        opening_notes: openForm.opening_notes || undefined,
      });
      setOpenForm({ opening_cash: "", opening_notes: "" });
      showToast("Shift opened", "success");
      load();
    } catch (e) {
      showToast(e?.response?.data?.detail || "Failed to open shift", "error");
    }
  };

  const addMovement = async () => {
    if (!canWrite) return showToast("Not allowed", "error");
    const amt = Number(moveForm.amount || 0);
    if (!amt || amt <= 0) return showToast("Enter amount", "error");
    try {
      await authAxios.post("/cash-drawer/movement", {
        movement_type: moveForm.movement_type,
        amount: amt,
        reason: moveForm.reason || undefined,
      });
      setMoveForm({ movement_type: "IN", amount: "", reason: "" });
      showToast("Saved", "success");
      load();
    } catch (e) {
      showToast(e?.response?.data?.detail || "Failed to save", "error");
    }
  };

  const closeShift = async () => {
    if (!canWrite) return showToast("Not allowed", "error");
    try {
      const denomCounts = Object.fromEntries(
        DENOMS.map((d) => [d, Number(denoms?.[d] || 0)])
      );
      await authAxios.post("/cash-drawer/close", {
        denomination_counts: denomCounts,
        closing_notes: closeForm.closing_notes || undefined,
      });
      setCloseForm({ closing_notes: "" });
      setDenoms(Object.fromEntries(DENOMS.map((d) => [d, ""])));
      showToast("Shift closed", "success");
      load();
    } catch (e) {
      showToast(e?.response?.data?.detail || "Failed to close shift", "error");
    }
  };

  if (allowed === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-red-500 font-medium">You are not authorized to access this page</p>
      </div>
    );
  }

  const shift = data?.shift || null;
  const movements = data?.movements || [];
  const summary = data?.summary || null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 sm:px-6 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate("/home", { replace: true })}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
        >
          ← Back
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-gray-800">Cash Drawer</h1>
          <p className="text-[11px] text-gray-400">
            {shift ? (
              <span className="text-emerald-600 font-semibold">Shift Open · since {new Date(shift.opened_at).toLocaleTimeString()}</span>
            ) : (
              "No active shift"
            )}
          </p>
        </div>
        <button
          onClick={load}
          className="px-4 py-1.5 rounded-xl border text-[12px] font-medium text-gray-600 hover:bg-gray-50 transition"
        >
          Refresh
        </button>
      </div>

      <div className="px-4 sm:px-6 py-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-sm text-gray-400">Loading...</div>
        ) : !shift ? (
          /* Open Shift */
          <div className="bg-white border rounded-2xl shadow-sm p-5 max-w-md">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-4">Open New Shift</p>
            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className={labelCls}>Opening Cash</label>
                <input
                  type="number"
                  className={inputCls}
                  placeholder="0.00"
                  value={openForm.opening_cash}
                  onChange={(e) => setOpenForm({ ...openForm, opening_cash: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelCls}>Notes (optional)</label>
                <input
                  className={inputCls}
                  placeholder="Opening notes..."
                  value={openForm.opening_notes}
                  onChange={(e) => setOpenForm({ ...openForm, opening_notes: e.target.value })}
                />
              </div>
              <button
                onClick={openShift}
                disabled={!canWrite}
                className="w-full px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-semibold transition disabled:opacity-60"
              >
                Open Shift
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Current Shift Summary */}
              <div className="bg-white border rounded-2xl shadow-sm p-4 space-y-3">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Current Shift</p>
                <div className="space-y-2 text-[12px]">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Status</span>
                    <span className="font-semibold text-emerald-600">{shift.status}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Opened</span>
                    <span className="font-semibold text-gray-800">{new Date(shift.opened_at).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Opening Cash</span>
                    <span className="font-semibold text-gray-800">₹{Number(shift.opening_cash || 0).toFixed(2)}</span>
                  </div>
                </div>

                {summary && (
                  <div className="border-t pt-3 space-y-2 text-[12px]">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Expected Cash</p>
                    {[
                      { label: "Cash Sales", val: summary.cash_sales, color: "text-gray-800" },
                      { label: "Collections", val: summary.cash_collections, color: "text-gray-800" },
                      { label: "Cash In", val: summary.cash_in, color: "text-emerald-600" },
                      { label: "Cash Out", val: summary.cash_out, color: "text-rose-600" },
                      { label: "Refunds", val: summary.cash_refunds, color: "text-amber-600" },
                    ].map(({ label, val, color }) => (
                      <div key={label} className="flex items-center justify-between">
                        <span className="text-gray-500">{label}</span>
                        <span className={`font-semibold ${color}`}>₹{Number(val || 0).toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between border-t pt-2 mt-1">
                      <span className="font-bold text-gray-700">Expected</span>
                      <span className="font-bold text-gray-900">₹{Number(summary.expected_cash || 0).toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Cash In / Out */}
              <div className="bg-white border rounded-2xl shadow-sm p-4 space-y-3">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Cash In / Out</p>
                <div className="space-y-3">
                  <div className="flex flex-col gap-1">
                    <label className={labelCls}>Movement Type</label>
                    <div className="flex gap-2">
                      {["IN", "OUT"].map((t) => (
                        <button
                          key={t}
                          onClick={() => setMoveForm({ ...moveForm, movement_type: t })}
                          className={`flex-1 py-1.5 rounded-xl text-[12px] font-semibold border transition ${
                            moveForm.movement_type === t
                              ? t === "IN"
                                ? "bg-emerald-600 text-white border-emerald-600"
                                : "bg-rose-600 text-white border-rose-600"
                              : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                          }`}
                        >
                          {t === "IN" ? "Cash In" : "Cash Out"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className={labelCls}>Amount</label>
                    <input
                      type="number"
                      className={inputCls}
                      placeholder="0.00"
                      value={moveForm.amount}
                      onChange={(e) => setMoveForm({ ...moveForm, amount: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className={labelCls}>Reason (optional)</label>
                    <input
                      className={inputCls}
                      placeholder="Reason..."
                      value={moveForm.reason}
                      onChange={(e) => setMoveForm({ ...moveForm, reason: e.target.value })}
                    />
                  </div>
                  <button
                    onClick={addMovement}
                    disabled={!canWrite}
                    className="w-full px-4 py-2 rounded-xl text-white text-[12px] font-semibold transition disabled:opacity-60"
                    style={{ backgroundColor: "#0B3C8C" }}
                  >
                    Save Movement
                  </button>
                </div>
              </div>

              {/* Close Shift */}
              <div className="bg-white border rounded-2xl shadow-sm p-4 space-y-3">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Close Shift — Denomination Count</p>
                <div className="grid grid-cols-2 gap-2">
                  {DENOMS.map((d) => (
                    <div key={d} className="flex items-center gap-2">
                      <span className="w-10 text-[11px] font-semibold text-gray-600 flex-shrink-0">₹{d}</span>
                      <input
                        type="number"
                        className="border border-gray-200 rounded-xl px-2 py-1 text-[12px] bg-gray-50 focus:outline-none w-full"
                        placeholder="0"
                        value={denoms?.[d] ?? ""}
                        onChange={(e) => setDenoms({ ...denoms, [d]: e.target.value })}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between text-[12px] bg-gray-50 rounded-xl px-3 py-2">
                  <span className="text-gray-600">Actual Cash</span>
                  <span className="font-bold text-gray-800">₹{Number(denomTotal || 0).toFixed(2)}</span>
                </div>
                {summary && (
                  <div className="flex items-center justify-between text-[12px] bg-amber-50 rounded-xl px-3 py-2">
                    <span className="text-amber-700">Variance</span>
                    <span className={`font-bold ${denomTotal - Number(summary.expected_cash || 0) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      ₹{(denomTotal - Number(summary.expected_cash || 0)).toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <label className={labelCls}>Closing Notes (optional)</label>
                  <textarea
                    className="border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] bg-gray-50 focus:outline-none w-full resize-none"
                    placeholder="Notes..."
                    rows={2}
                    value={closeForm.closing_notes}
                    onChange={(e) => setCloseForm({ closing_notes: e.target.value })}
                  />
                </div>
                <button
                  onClick={closeShift}
                  disabled={!canWrite}
                  className="w-full px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[12px] font-semibold transition disabled:opacity-60"
                >
                  Close Shift
                </button>
              </div>
            </div>

            {/* Movements Table */}
            <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Movements · {movements.length}</p>
              </div>
              {movements.length === 0 ? (
                <div className="flex items-center justify-center h-24">
                  <p className="text-[12px] text-gray-400">No movements this shift</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[600px] w-full text-[12px]">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="px-4 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Type</th>
                        <th className="px-4 py-2.5 text-right font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Amount</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Reason</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {movements.map((m, idx) => (
                        <tr key={m.movement_id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/40"}>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-semibold ${
                              m.movement_type === "IN"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-rose-50 text-rose-700"
                            }`}>
                              {m.movement_type === "IN" ? "↑ IN" : "↓ OUT"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-bold text-gray-800">₹{Number(m.amount || 0).toFixed(2)}</td>
                          <td className="px-4 py-2.5 text-gray-600">{m.reason || "—"}</td>
                          <td className="px-4 py-2.5 text-gray-500">
                            {m.created_at ? new Date(m.created_at).toLocaleString() : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
