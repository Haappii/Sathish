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

  const shift = data?.shift || null;
  const movements = data?.movements || [];
  const summary = data?.summary || null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate("/home", { replace: true })}
          className="px-3 py-1.5 rounded-lg border bg-white shadow-sm text-[12px]"
        >
          &larr; Back
        </button>
        <h2 className="text-lg font-bold text-slate-800">Cash Drawer / Shift</h2>
        <button
          onClick={load}
          className="px-3 py-1.5 rounded-lg border bg-white shadow-sm text-[12px]"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading...</div>
      ) : !shift ? (
        <div className="rounded-xl border bg-white p-4 space-y-2">
          <div className="text-sm font-semibold">Open Shift</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="number"
              className="border rounded-lg px-2 py-2 text-[12px]"
              placeholder="Opening cash"
              value={openForm.opening_cash}
              onChange={(e) => setOpenForm({ ...openForm, opening_cash: e.target.value })}
            />
            <input
              className="border rounded-lg px-2 py-2 text-[12px] sm:col-span-2"
              placeholder="Notes (optional)"
              value={openForm.opening_notes}
              onChange={(e) => setOpenForm({ ...openForm, opening_notes: e.target.value })}
            />
          </div>
          <button
            onClick={openShift}
            disabled={!canWrite}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-[12px] disabled:opacity-60"
          >
            Open Shift
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="rounded-xl border bg-white p-4 space-y-2">
              <div className="text-sm font-semibold">Current Shift</div>
              <div className="text-[12px] text-slate-700 space-y-1">
                <div>
                  <span className="text-slate-500">Status:</span>{" "}
                  <span className="font-bold">{shift.status}</span>
                </div>
                <div>
                  <span className="text-slate-500">Opened:</span>{" "}
                  <span className="font-semibold">
                    {new Date(shift.opened_at).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Opening cash:</span>{" "}
                  <span className="font-semibold">Rs. {Number(shift.opening_cash || 0).toFixed(2)}</span>
                </div>
              </div>

              {summary && (
                <div className="mt-2 text-[12px] rounded-lg bg-slate-50 border p-2 space-y-1">
                  <div className="font-semibold text-slate-700">Expected Cash (Live)</div>
                  <div className="grid grid-cols-2 gap-1">
                    <div className="text-slate-500">Cash sales</div>
                    <div className="text-right font-semibold">Rs. {Number(summary.cash_sales || 0).toFixed(2)}</div>
                    <div className="text-slate-500">Collections</div>
                    <div className="text-right font-semibold">Rs. {Number(summary.cash_collections || 0).toFixed(2)}</div>
                    <div className="text-slate-500">Cash in</div>
                    <div className="text-right font-semibold">Rs. {Number(summary.cash_in || 0).toFixed(2)}</div>
                    <div className="text-slate-500">Cash out</div>
                    <div className="text-right font-semibold">Rs. {Number(summary.cash_out || 0).toFixed(2)}</div>
                    <div className="text-slate-500">Refunds</div>
                    <div className="text-right font-semibold">Rs. {Number(summary.cash_refunds || 0).toFixed(2)}</div>
                    <div className="text-slate-700 font-bold">Expected</div>
                    <div className="text-right font-bold">Rs. {Number(summary.expected_cash || 0).toFixed(2)}</div>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl border bg-white p-4 space-y-2">
              <div className="text-sm font-semibold">Cash In / Out</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <select
                  className="border rounded-lg px-2 py-2 text-[12px]"
                  value={moveForm.movement_type}
                  onChange={(e) => setMoveForm({ ...moveForm, movement_type: e.target.value })}
                >
                  <option value="IN">Cash In</option>
                  <option value="OUT">Cash Out</option>
                </select>
                <input
                  type="number"
                  className="border rounded-lg px-2 py-2 text-[12px]"
                  placeholder="Amount"
                  value={moveForm.amount}
                  onChange={(e) => setMoveForm({ ...moveForm, amount: e.target.value })}
                />
                <input
                  className="border rounded-lg px-2 py-2 text-[12px]"
                  placeholder="Reason (optional)"
                  value={moveForm.reason}
                  onChange={(e) => setMoveForm({ ...moveForm, reason: e.target.value })}
                />
              </div>
              <button
                onClick={addMovement}
                disabled={!canWrite}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-[12px] disabled:opacity-60"
              >
                Save
              </button>
            </div>

            <div className="rounded-xl border bg-white p-4 space-y-2">
              <div className="text-sm font-semibold">Close Shift</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {DENOMS.map((d) => (
                  <div key={d} className="flex items-center gap-2">
                    <div className="w-12 text-[12px] text-slate-600">₹{d}</div>
                    <input
                      type="number"
                      className="border rounded-lg px-2 py-1.5 text-[12px] w-full"
                      placeholder="0"
                      value={denoms?.[d] ?? ""}
                      onChange={(e) => setDenoms({ ...denoms, [d]: e.target.value })}
                    />
                  </div>
                ))}
              </div>
              <div className="text-[12px] flex items-center justify-between pt-1">
                <span className="text-slate-600">Actual cash (from denominations)</span>
                <span className="font-bold">Rs. {Number(denomTotal || 0).toFixed(2)}</span>
              </div>
              <textarea
                className="border rounded-lg px-2 py-2 text-[12px] w-full"
                placeholder="Closing notes (optional)"
                rows={2}
                value={closeForm.closing_notes}
                onChange={(e) => setCloseForm({ closing_notes: e.target.value })}
              />
              <button
                onClick={closeShift}
                disabled={!canWrite}
                className="px-4 py-2 rounded-lg bg-rose-600 text-white text-[12px] disabled:opacity-60"
              >
                Close Shift
              </button>
            </div>
          </div>

          <div className="rounded-xl border bg-white overflow-x-auto">
            <div className="p-3 text-sm font-semibold">Movements</div>
            {movements.length === 0 ? (
              <div className="p-3 text-[12px] text-slate-500">No movements</div>
            ) : (
              <table className="min-w-[800px] w-full text-left text-[12px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2">Type</th>
                    <th className="p-2 text-right">Amount</th>
                    <th className="p-2">Reason</th>
                    <th className="p-2">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.movement_id} className="border-t">
                      <td className="p-2 font-semibold">
                        {m.movement_type === "IN" ? (
                          <span className="text-emerald-700">IN</span>
                        ) : (
                          <span className="text-rose-700">OUT</span>
                        )}
                      </td>
                      <td className="p-2 text-right font-bold">
                        Rs. {Number(m.amount || 0).toFixed(2)}
                      </td>
                      <td className="p-2">{m.reason || "-"}</td>
                      <td className="p-2">
                        {m.created_at ? new Date(m.created_at).toLocaleString() : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
