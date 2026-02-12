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
        // fallback: allow managers/admins to try (backend still enforces)
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
        params: {
          from_date: fromDate,
          to_date: toDate,
        },
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
        <h2 className="text-lg font-bold text-slate-800">Expenses</h2>
        <button
          onClick={load}
          className="px-3 py-1.5 rounded-lg border bg-white shadow-sm text-[12px]"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-xl border bg-white p-4 space-y-3">
          <div className="text-sm font-semibold text-slate-700">Add Expense</div>
          <div className="grid grid-cols-1 gap-2 text-[12px]">
            <input
              type="number"
              className="border rounded-lg px-2 py-2"
              placeholder="Amount"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
            <input
              className="border rounded-lg px-2 py-2"
              placeholder="Category (e.g. Tea, Fuel)"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
            <select
              className="border rounded-lg px-2 py-2"
              value={form.payment_mode}
              onChange={(e) => setForm({ ...form, payment_mode: e.target.value })}
            >
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="bank">Bank</option>
            </select>
            <input
              className="border rounded-lg px-2 py-2"
              placeholder="Note (optional)"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </div>
          <button
            onClick={save}
            disabled={!canWrite || saving}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-[12px] disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Expense"}
          </button>
        </div>

        <div className="rounded-xl border bg-white p-4 space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm font-semibold text-slate-700">Expense List</div>
            <div className="flex items-center gap-2 text-[12px]">
              <label className="text-slate-600">From</label>
              <input
                type="date"
                className="border rounded-lg px-2 py-1"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
              <label className="text-slate-600">To</label>
              <input
                type="date"
                className="border rounded-lg px-2 py-1"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
          </div>

          <div className="text-[12px] text-slate-600">
            Total: <span className="font-semibold text-slate-800">Rs. {totalAmount.toFixed(2)}</span>
          </div>

          {loading ? (
            <div className="text-sm text-gray-500">Loading...</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-gray-500">No expenses in selected range</div>
          ) : (
            <div className="overflow-auto rounded-lg border">
              <table className="min-w-full text-[12px]">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="text-left px-3 py-2">Date</th>
                    <th className="text-left px-3 py-2">Category</th>
                    <th className="text-right px-3 py-2">Amount</th>
                    <th className="text-left px-3 py-2">Mode</th>
                    <th className="text-left px-3 py-2">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.expense_id} className="border-t">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {String(r.expense_date || "").slice(0, 10)}
                      </td>
                      <td className="px-3 py-2">{r.category}</td>
                      <td className="px-3 py-2 text-right">
                        {Number(r.amount || 0).toFixed(2)}
                      </td>
                      <td className="px-3 py-2">{r.payment_mode}</td>
                      <td className="px-3 py-2 max-w-[260px] truncate">
                        {r.note || ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

