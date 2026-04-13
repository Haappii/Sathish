import { useEffect, useMemo, useState } from "react";

import authAxios from "../api/authAxios";
import { useToast } from "../components/Toast";
import { getSession } from "../utils/auth";
import { addDaysToBusinessDate, getBusinessDate, syncBusinessDate } from "../utils/businessDate";
import { modulesToPermMap } from "../utils/navigationMenu";
import BackButton from "../components/BackButton";

const BLUE = "#0B3C8C";

function KpiCard({ label, value, sub, accent = "blue", icon }) {
  const accentMap = {
    blue:   { bg: "bg-blue-50",    text: "text-blue-700",   icon: "bg-blue-100"   },
    green:  { bg: "bg-emerald-50", text: "text-emerald-700",icon: "bg-emerald-100" },
    rose:   { bg: "bg-rose-50",    text: "text-rose-700",   icon: "bg-rose-100"   },
    amber:  { bg: "bg-amber-50",   text: "text-amber-700",  icon: "bg-amber-100"  },
    purple: { bg: "bg-purple-50",  text: "text-purple-700", icon: "bg-purple-100" },
    gray:   { bg: "bg-gray-50",    text: "text-gray-700",   icon: "bg-gray-100"   },
  };
  const c = accentMap[accent] || accentMap.blue;
  return (
    <div className="bg-white border rounded-2xl shadow-sm p-4 flex items-start gap-3">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ${c.icon} ${c.text}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide leading-tight">{label}</p>
        <p className="text-xl font-bold text-gray-900 mt-0.5 truncate">{value}</p>
        {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-1 h-4 rounded-full" style={{ background: BLUE }} />
      <div>
        <p className="text-[12px] font-bold text-gray-700">{title}</p>
        {subtitle && <p className="text-[10px] text-gray-400">{subtitle}</p>}
      </div>
    </div>
  );
}

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

  const fmt = useMemo(() => (v) =>
    `₹${Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  []);

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
      const to = syncBusinessDate(r?.data?.app_date) || getBusinessDate();
      setFromDate(addDaysToBusinessDate(to, -6));
      setToDate(to);
    } catch {
      const to = getBusinessDate();
      setFromDate(addDaysToBusinessDate(to, -6));
      setToDate(to);
    }
  };

  const loadSummary = async () => {
    if (!fromDate || !toDate) return;
    try {
      setLoading(true);
      const params = { from_date: fromDate, to_date: toDate };
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

  const fin = data?.financials || {};
  const inputCls = "border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] bg-gray-50 focus:outline-none focus:border-blue-400 transition";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 sm:px-6 py-3 flex items-center gap-3 flex-wrap">
        <BackButton />
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-gray-800">Analytics</h1>
          {fromDate && toDate && (
            <p className="text-[11px] text-gray-400">{fromDate} — {toDate}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className={inputCls}
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className={inputCls}
          />
          {isAdmin && (
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className={inputCls}
            >
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>
              ))}
            </select>
          )}
          <button
            onClick={loadSummary}
            disabled={loading}
            className="px-4 py-1.5 rounded-xl text-[12px] font-semibold text-white transition disabled:opacity-60"
            style={{ backgroundColor: BLUE }}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-5 space-y-6">
        {loading && !data ? (
          <div className="flex items-center justify-center h-48 text-sm text-gray-400">Loading analytics...</div>
        ) : (
          <>
            {/* Financial Performance */}
            <div>
              <SectionHeader title="Financial Performance" subtitle="Revenue, profit, and cost breakdown" />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                <KpiCard label="Net Sales (Ex Tax)" value={fmt(fin.sales_ex_tax)} accent="blue" icon="₹" />
                <KpiCard label="Gross Profit" value={fmt(fin.gross_profit)} accent="green" icon="📈" />
                <KpiCard label="Net Profit" value={fmt(fin.profit)} accent="green" icon="💰" />
                <KpiCard label="GST Collected" value={fmt(fin.gst)} accent="purple" icon="%" />
                <KpiCard label="Discount Given" value={fmt(fin.discount)} accent="amber" icon="🏷" />
                <KpiCard label="Returns Refund" value={fmt(fin.returns_refund)} accent="rose" icon="↩" />
                <KpiCard label="Expenses" value={fmt(fin.expense)} accent="rose" icon="💸" />
              </div>
            </div>

            {/* Collections & Dues */}
            <div>
              <SectionHeader title="Collections & Dues" subtitle="Payments received and outstanding balances" />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                <KpiCard
                  label="Due Collections"
                  value={fmt(data?.collections?.amount)}
                  accent="green"
                  icon="✓"
                />
                <KpiCard
                  label="Open Dues"
                  value={fmt(data?.open_dues?.outstanding)}
                  sub={`${Number(data?.open_dues?.count || 0)} invoice${Number(data?.open_dues?.count || 0) !== 1 ? "s" : ""}`}
                  accent="rose"
                  icon="⚠"
                />
              </div>
            </div>

            {/* Inventory */}
            <div>
              <SectionHeader
                title="Inventory"
                subtitle={data?.billing_type === "hotel" ? "Raw material stock position" : "Stock value and position"}
              />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                <KpiCard
                  label={data?.billing_type === "hotel" ? "Raw Material Stock" : "Stock Valuation"}
                  value={fmt(data?.stock?.valuation)}
                  accent="blue"
                  icon="📦"
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
