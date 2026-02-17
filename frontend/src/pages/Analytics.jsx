import { useEffect, useMemo, useState } from "react";

import authAxios from "../api/authAxios";
import { useToast } from "../components/Toast";
import { getSession } from "../utils/auth";
import { modulesToPermMap } from "../utils/navigationMenu";
import BackButton from "../components/BackButton";

export default function Analytics() {
  const { showToast } = useToast();
  const session = getSession() || {};

  const roleLower = (session?.role || "").toString().toLowerCase();
  const isAdmin = roleLower === "admin";
  const [allowed, setAllowed] = useState(null);

  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState("");

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fmt = useMemo(() => {
    return (v) =>
      Number(v || 0).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
  }, []);

  const loadBranches = async () => {
    if (!isAdmin) return;
    try {
      const r = await authAxios.get("/branch/active");
      setBranches(r.data || []);
    } catch {}
  };

  const loadDefaultDates = async () => {
    try {
      const r = await authAxios.get("/shop/details");
      const appDate = r?.data?.app_date;
      const to = appDate || new Date().toISOString().slice(0, 10);
      const d = new Date(to);
      d.setDate(d.getDate() - 6);
      const from = d.toISOString().slice(0, 10);
      setFromDate(from);
      setToDate(to);
    } catch {
      const to = new Date().toISOString().slice(0, 10);
      const d = new Date();
      d.setDate(d.getDate() - 6);
      const from = d.toISOString().slice(0, 10);
      setFromDate(from);
      setToDate(to);
    }
  };

  const loadSummary = async () => {
    if (!fromDate || !toDate) return;
    try {
      setLoading(true);
      const params = {
        from_date: fromDate,
        to_date: toDate,
      };
      if (isAdmin && branchId) params.branch_id = branchId;

      const r = await authAxios.get("/analytics/summary", { params });
      setData(r.data || null);
    } catch (e) {
      showToast(e?.response?.data?.detail || "Failed to load analytics", "error");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    authAxios.get("/permissions/my")
      .then((r) => {
        const map = modulesToPermMap(r?.data?.modules);
        setAllowed(Boolean(map?.analytics?.can_read));
      })
      .catch(() => setAllowed(false));
  }, []);

  useEffect(() => {
    if (!allowed) return;
    loadBranches();
    loadDefaultDates();
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;
    loadSummary();
  }, [allowed, fromDate, toDate, branchId]);

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

  const fin = data?.financials || {};

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <BackButton />
          <h2 className="text-lg font-semibold text-gray-700">Analytics</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="border rounded px-2 py-1"
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="border rounded px-2 py-1"
          />

          {isAdmin && (
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="border rounded px-2 py-1"
            >
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.branch_id} value={b.branch_id}>
                  {b.branch_name}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={loadSummary}
            disabled={loading}
            className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm disabled:opacity-60"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="border rounded bg-white p-3">
          <div className="text-xs text-gray-500">Net Sales (Ex Tax)</div>
          <div className="text-xl font-bold text-gray-800">{fmt(fin.sales_ex_tax)}</div>
        </div>
        <div className="border rounded bg-white p-3">
          <div className="text-xs text-gray-500">Profit</div>
          <div className="text-xl font-bold text-gray-800">{fmt(fin.profit)}</div>
        </div>
        <div className="border rounded bg-white p-3">
          <div className="text-xs text-gray-500">Expense</div>
          <div className="text-xl font-bold text-gray-800">{fmt(fin.expense)}</div>
        </div>
        <div className="border rounded bg-white p-3">
          <div className="text-xs text-gray-500">Discount</div>
          <div className="text-xl font-bold text-gray-800">{fmt(fin.discount)}</div>
        </div>

        <div className="border rounded bg-white p-3">
          <div className="text-xs text-gray-500">Returns Refund</div>
          <div className="text-xl font-bold text-gray-800">{fmt(fin.returns_refund)}</div>
        </div>
        <div className="border rounded bg-white p-3">
          <div className="text-xs text-gray-500">Collections</div>
          <div className="text-xl font-bold text-gray-800">
            {fmt(data?.collections?.amount)}
          </div>
        </div>
        <div className="border rounded bg-white p-3">
          <div className="text-xs text-gray-500">Open Dues</div>
          <div className="text-xl font-bold text-gray-800">
            {fmt(data?.open_dues?.outstanding)}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {Number(data?.open_dues?.count || 0)} invoices
          </div>
        </div>
        <div className="border rounded bg-white p-3">
          <div className="text-xs text-gray-500">Stock Valuation</div>
          <div className="text-xl font-bold text-gray-800">
            {fmt(data?.stock?.valuation)}
          </div>
        </div>
      </div>

      {loading && (
        <div className="text-sm text-gray-600">Loading…</div>
      )}
    </div>
  );
}
