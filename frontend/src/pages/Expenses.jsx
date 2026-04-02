import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import authAxios from "../api/authAxios";
import { useToast } from "../components/Toast";
import { getSession } from "../utils/auth";
import { modulesToPermMap } from "../utils/navigationMenu";

const isoToday = () => new Date().toISOString().slice(0, 10);

const monthStart = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}-01`;
};

const inputCls = "border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] bg-gray-50 focus:outline-none focus:border-blue-400 focus:bg-white transition w-full";
const labelCls = "text-[10px] font-semibold text-gray-500 uppercase tracking-wide";

export default function Expenses() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const session = getSession() || {};

  const [allowed, setAllowed] = useState(null);
  const [canWrite, setCanWrite] = useState(false);

  const [fromDate, setFromDate] = useState(monthStart());
  const [toDate, setToDate] = useState(isoToday());

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    amount: "",
    category: "",
    payment_mode: "cash",
    note: "",
  });

  useEffect(() => {
    authAxios
      .get("/permissions/my")
      .then((r) => {
        const map = modulesToPermMap(r?.data?.modules);
        setAllowed(Boolean(map?.expenses?.can_read));
        setCanWrite(Boolean(map?.expenses?.can_write));
      })
      .catch(() => {
        const roleLower = String(session?.role || session?.role_name || "").toLowerCase();
        const ok = roleLower === "admin" || roleLower === "manager";
        setAllowed(ok);
        setCanWrite(ok);
      });
  }, []);

  const totalAmount = useMemo(
    () => rows.reduce((sum, r) => sum + Number(r?.amount || 0), 0),
    [rows]
  );

  const load = async () => {
    if (!fromDate || !toDate) return;
    setLoading(true);
    try {
      const res = await authAxios.get("/expenses/list", {
        params: { from_date: fromDate, to_date: toDate },
      });
      setRows(res?.data || []);
    } catch (err) {
      setRows([]);
      const msg = err?.response?.data?.detail || "Failed to load expenses";
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (allowed) load();
  }, [allowed, fromDate, toDate]);

  const save = async () => {
    if (saving) return;
    if (!form.amount || !form.category) {
      showToast("Amount and category are required", "error");
      return;
    }
    setSaving(true);
    try {
      await authAxios.post("/expenses/", {
        expense_date: isoToday(),
        amount: Number(form.amount),
        category: String(form.category || "").trim(),
        payment_mode: form.payment_mode,
        note: String(form.note || "").trim() || null,
        branch_id: session?.branch_id ?? null,
      });
      showToast("Expense saved", "success");
      setForm({ amount: "", category: "", payment_mode: "cash", note: "" });
      await load();
    } catch (err) {
      const msg = err?.response?.data?.detail || "Failed to save expense";
      showToast(msg, "error");
    } finally {
      setSaving(false);
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

  const modeColor = { cash: "text-emerald-600", upi: "text-blue-600", card: "text-purple-600", bank: "text-amber-600" };

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
          <h1 className="text-base font-bold text-gray-800">Expenses</h1>
          <p className="text-[11px] text-gray-400">{rows.length} record{rows.length !== 1 ? "s" : ""} · ₹{totalAmount.toFixed(2)} total</p>
        </div>
        <button
          onClick={load}
          className="px-4 py-1.5 rounded-xl border text-[12px] font-medium text-gray-600 hover:bg-gray-50 transition"
        >
          Refresh
        </button>
      </div>

      <div className="px-4 sm:px-6 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Add Expense Form */}
          <div className="bg-white border rounded-2xl shadow-sm p-4 space-y-3">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Add Expense</p>
            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className={labelCls}>Amount *</label>
                <input
                  type="number"
                  className={inputCls}
                  placeholder="0.00"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelCls}>Category *</label>
                <input
                  className={inputCls}
                  placeholder="e.g. Tea, Fuel, Rent"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelCls}>Payment Mode</label>
                <select
                  className={inputCls}
                  value={form.payment_mode}
                  onChange={(e) => setForm({ ...form, payment_mode: e.target.value })}
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="bank">Bank</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelCls}>Note (optional)</label>
                <input
                  className={inputCls}
                  placeholder="Optional note..."
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                />
              </div>
            </div>
            <button
              onClick={save}
              disabled={!canWrite || saving}
              className="w-full px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-semibold transition disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Expense"}
            </button>
          </div>

          {/* Expense List */}
          <div className="lg:col-span-2 space-y-3">
            {/* Date Filter */}
            <div className="bg-white border rounded-2xl shadow-sm px-4 py-3 flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1">
                <label className={labelCls}>From Date</label>
                <input
                  type="date"
                  className="border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] bg-gray-50 focus:outline-none focus:border-blue-400 transition"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelCls}>To Date</label>
                <input
                  type="date"
                  className="border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] bg-gray-50 focus:outline-none focus:border-blue-400 transition"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </div>
              <div className="ml-auto flex items-end">
                <div className="text-right">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">Total</p>
                  <p className="text-lg font-bold text-gray-800">₹{totalAmount.toFixed(2)}</p>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center h-40 text-sm text-gray-400">Loading expenses...</div>
              ) : rows.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-2">
                  <div className="text-sm text-gray-400">No expenses in selected range</div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[600px] w-full text-[12px]">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="px-4 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Date</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Category</th>
                        <th className="px-4 py-2.5 text-right font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Amount</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Mode</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Note</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {rows.map((r, idx) => (
                        <tr key={r.expense_id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/40"}>
                          <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{String(r.expense_date || "").slice(0, 10)}</td>
                          <td className="px-4 py-2.5 font-semibold text-gray-800">{r.category}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-gray-800">₹{Number(r.amount || 0).toFixed(2)}</td>
                          <td className="px-4 py-2.5">
                            <span className={`text-[11px] font-semibold capitalize ${modeColor[r.payment_mode] || "text-gray-600"}`}>
                              {r.payment_mode}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-gray-500 max-w-[220px] truncate">{r.note || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
