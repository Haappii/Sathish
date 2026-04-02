import { useEffect, useState } from "react";
import authAxios from "../api/authAxios";
import { getSession } from "../utils/auth";
import BackButton from "../components/BackButton";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

const METRICS = [
  { key: "sales",        label: "Sales Amount",   type: "currency", icon: "₹" },
  { key: "bills",        label: "Bills Count",    type: "number",   icon: "#" },
  { key: "gross_profit", label: "Gross Profit",   type: "currency", icon: "%" },
  { key: "profit",       label: "Net Profit",     type: "currency", icon: "%" },
  { key: "gst",          label: "GST Collected",  type: "currency", icon: "%" },
  { key: "discount",     label: "Discount Given", type: "currency", icon: "₹" },
  { key: "avg_bill",     label: "Avg Bill Value", type: "currency", icon: "₹" },
  { key: "items",        label: "Items Sold",     type: "number",   icon: "#" },
  { key: "expense",      label: "Expenses",       type: "currency", icon: "₹" },
];

const BLUE = "#0B3C8C";

const CustomTooltip = ({ active, payload, label, metricMeta }) => {
  if (!active || !payload?.length) return null;
  const curr = Number(payload.find(p => p.dataKey === "value")?.value || 0);
  const prev = Number(payload.find(p => p.dataKey === "prev_value")?.value || 0);
  const growth = prev === 0 ? null : (((curr - prev) / prev) * 100).toFixed(1);
  const fmt = v => metricMeta?.type === "currency" ? `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : Number(v).toLocaleString("en-IN");

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-3 py-2.5 text-[12px]">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-blue-600 flex-shrink-0" />
        <span className="text-gray-500">Current</span>
        <span className="font-bold text-gray-800 ml-auto">{fmt(curr)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-gray-300 flex-shrink-0" />
        <span className="text-gray-500">Previous</span>
        <span className="font-semibold text-gray-600 ml-auto">{fmt(prev)}</span>
      </div>
      {growth !== null && (
        <div className={`mt-1.5 pt-1.5 border-t text-center font-bold ${Number(growth) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
          {Number(growth) >= 0 ? "▲" : "▼"} {Math.abs(growth)}%
        </div>
      )}
    </div>
  );
};

export default function Trends() {
  const session = getSession() || {};
  const isAdmin = (session?.role || "").toString().toLowerCase() === "admin";

  const [metric, setMetric] = useState("sales");
  const [period, setPeriod] = useState("day");
  const [data, setData] = useState([]);
  const [compareData, setCompareData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState("");

  const loadBranches = async () => {
    if (!isAdmin) return;
    const r = await authAxios.get("/branch/active");
    setBranches(r.data || []);
  };

  const loadTrend = async (m = metric, p = period, b = branchId) => {
    try {
      setLoading(true);
      const size = p === "day" ? 14 : 12;
      const [r, r2] = await Promise.all([
        authAxios.get("/dashboard/trend-metric", {
          params: { metric: m, period: p, size, branch_id: b || undefined }
        }),
        authAxios.get("/dashboard/trend-metric", {
          params: { metric: m, period: p, size, branch_id: b || undefined, compare: "prev" }
        })
      ]);
      const current = r.data?.data || [];
      const prev = r2.data?.data || [];
      setData(current.map((d, idx) => ({ ...d, prev_value: prev[idx]?.value ?? 0 })));
      setCompareData(prev);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadBranches(); }, []);
  useEffect(() => { loadTrend(metric, period, branchId); }, [metric, period, branchId]);

  const metricMeta = METRICS.find(m => m.key === metric);
  const selectedBranch = branches.find(b => String(b.branch_id) === String(branchId));

  const buildExportName = () => {
    const now = new Date();
    const pad = n => String(n).padStart(2, "0");
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
    return `${(metricMeta?.label || "Trend").replace(/\s+/g, "_")}_${period}_${stamp}`;
  };

  const exportPDF = () => {
    if (!data.length) return;
    const doc = new jsPDF("p", "mm", "a4");
    doc.setFontSize(14);
    doc.text(`${metricMeta?.label} (${period.toUpperCase()})`, 14, 16);
    doc.setFontSize(9);
    doc.text(`Branch: ${selectedBranch?.branch_name || "All Branches"}`, 14, 22);
    autoTable(doc, {
      startY: 26,
      head: [["Period", "Current", "Previous", "Growth %"]],
      body: data.map(r => {
        const prev = Number(r.prev_value || 0);
        const curr = Number(r.value || 0);
        const growth = prev === 0 ? "" : (((curr - prev) / prev) * 100).toFixed(2);
        return [r.label, curr, prev, growth];
      }),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [11, 60, 140] },
    });
    doc.save(`${buildExportName()}.pdf`);
  };

  const exportExcel = () => {
    if (!data.length) return;
    const ws = XLSX.utils.aoa_to_sheet([
      [metricMeta?.label, period.toUpperCase()],
      ["Branch", selectedBranch?.branch_name || "All Branches"],
      [],
      ["Period", "Current", "Previous", "Growth %"],
      ...data.map(r => {
        const prev = Number(r.prev_value || 0);
        const curr = Number(r.value || 0);
        const growth = prev === 0 ? "" : (((curr - prev) / prev) * 100).toFixed(2);
        return [r.label, curr, prev, growth];
      })
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Trends");
    saveAs(new Blob([XLSX.write(wb, { bookType: "xlsx", type: "array" })]), `${buildExportName()}.xlsx`);
  };

  // Summary stats from data
  const currTotal = data.reduce((s, d) => s + Number(d.value || 0), 0);
  const prevTotal = data.reduce((s, d) => s + Number(d.prev_value || 0), 0);
  const growth = prevTotal === 0 ? null : (((currTotal - prevTotal) / prevTotal) * 100).toFixed(1);
  const fmt = v => metricMeta?.type === "currency"
    ? `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
    : Number(v).toLocaleString("en-IN");

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 sm:px-6 py-3 flex items-center gap-3">
        <BackButton />
        <div className="flex-1">
          <h1 className="text-base font-bold text-gray-800">Trends</h1>
          <p className="text-[11px] text-gray-400">{metricMeta?.label} · {period === "day" ? "Daily" : period === "week" ? "Weekly" : "Monthly"}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportPDF}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[12px] font-medium text-rose-600 border-rose-200 bg-rose-50 hover:bg-rose-100 transition"
          >
            PDF
          </button>
          <button
            onClick={exportExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[12px] font-medium text-emerald-600 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition"
          >
            Excel
          </button>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">
          {/* Metric Selector */}
          <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Metric</p>
            </div>
            <div className="p-2 space-y-0.5">
              {METRICS.map(m => (
                <button
                  key={m.key}
                  onClick={() => setMetric(m.key)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-[12px] font-medium transition flex items-center gap-2.5 ${
                    metric === m.key
                      ? "text-white shadow-sm"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                  style={metric === m.key ? { backgroundColor: BLUE } : {}}
                >
                  <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                    metric === m.key ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
                  }`}>{m.icon}</span>
                  <span className="truncate">{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Chart Panel */}
          <div className="space-y-4">
            {/* Summary Stats */}
            {!loading && data.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white border rounded-2xl shadow-sm p-3">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Current Period</p>
                  <p className="text-lg font-bold text-gray-800 mt-1 truncate">{fmt(currTotal)}</p>
                </div>
                <div className="bg-white border rounded-2xl shadow-sm p-3">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Previous Period</p>
                  <p className="text-lg font-bold text-gray-500 mt-1 truncate">{fmt(prevTotal)}</p>
                </div>
                <div className="bg-white border rounded-2xl shadow-sm p-3">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Growth</p>
                  {growth === null ? (
                    <p className="text-lg font-bold text-gray-400 mt-1">—</p>
                  ) : (
                    <p className={`text-lg font-bold mt-1 ${Number(growth) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {Number(growth) >= 0 ? "▲" : "▼"} {Math.abs(growth)}%
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Chart */}
            <div className="bg-white border rounded-2xl shadow-sm p-4">
              {/* Toolbar */}
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <p className="text-[12px] font-semibold text-gray-700">{metricMeta?.label} over time</p>
                <div className="flex items-center gap-2">
                  {isAdmin && (
                    <select
                      value={branchId}
                      onChange={e => setBranchId(e.target.value)}
                      className="border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] bg-gray-50 focus:outline-none"
                    >
                      <option value="">All Branches</option>
                      {branches.map(b => (
                        <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>
                      ))}
                    </select>
                  )}
                  <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
                    {["day", "week", "month"].map(p => (
                      <button
                        key={p}
                        onClick={() => setPeriod(p)}
                        className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition ${
                          period === p ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"
                        }`}
                      >
                        {p === "day" ? "Daily" : p === "week" ? "Weekly" : "Monthly"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="h-72">
                {loading ? (
                  <div className="flex items-center justify-center h-full text-sm text-gray-400">Loading chart...</div>
                ) : data.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-sm text-gray-400">No data available</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={55}
                        tickFormatter={v => metricMeta?.type === "currency" ? `₹${Number(v).toLocaleString("en-IN")}` : v}
                      />
                      <Tooltip content={<CustomTooltip metricMeta={metricMeta} />} />
                      <Legend
                        wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
                        formatter={(value) => <span className="text-gray-600">{value}</span>}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke={BLUE}
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: BLUE, strokeWidth: 0 }}
                        activeDot={{ r: 5 }}
                        name="Current"
                      />
                      <Line
                        type="monotone"
                        dataKey="prev_value"
                        stroke="#cbd5e1"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={{ r: 2, fill: "#cbd5e1", strokeWidth: 0 }}
                        name="Previous"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Data Table */}
            {!loading && data.length > 0 && (
              <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Period Breakdown</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="px-4 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Period</th>
                        <th className="px-4 py-2.5 text-right font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Current</th>
                        <th className="px-4 py-2.5 text-right font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Previous</th>
                        <th className="px-4 py-2.5 text-right font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Growth</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {data.map((row, idx) => {
                        const curr = Number(row.value || 0);
                        const prev = Number(row.prev_value || 0);
                        const g = prev === 0 ? null : (((curr - prev) / prev) * 100).toFixed(1);
                        return (
                          <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/40"}>
                            <td className="px-4 py-2.5 font-medium text-gray-700">{row.label}</td>
                            <td className="px-4 py-2.5 text-right font-semibold text-gray-800">{fmt(curr)}</td>
                            <td className="px-4 py-2.5 text-right text-gray-400">{fmt(prev)}</td>
                            <td className="px-4 py-2.5 text-right">
                              {g === null ? (
                                <span className="text-gray-400">—</span>
                              ) : (
                                <span className={`font-semibold ${Number(g) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                  {Number(g) >= 0 ? "▲" : "▼"} {Math.abs(g)}%
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
