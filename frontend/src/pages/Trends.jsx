import { useEffect, useState } from "react";
import authAxios from "../api/authAxios";
import { getSession } from "../utils/auth";
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
  { key: "sales", label: "Sales Amount", type: "currency" },
  { key: "bills", label: "Bills Count", type: "number" },
  { key: "profit", label: "Profit", type: "currency" },
  { key: "gst", label: "GST Collected", type: "currency" },
  { key: "discount", label: "Discount Given", type: "currency" },
  { key: "avg_bill", label: "Average Bill", type: "currency" },
  { key: "items", label: "Items Sold", type: "number" },
  { key: "expense", label: "Expenses", type: "currency" }
];

export default function Trends() {
  const session = getSession() || {};
  const isAdmin =
    (session?.role || "").toString().toLowerCase() === "admin";

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
      const size = p === "day" ? 14 : p === "week" ? 12 : 12;
      const r = await authAxios.get("/dashboard/trend-metric", {
        params: { metric: m, period: p, size, branch_id: b || undefined }
      });
      const r2 = await authAxios.get("/dashboard/trend-metric", {
        params: { metric: m, period: p, size, branch_id: b || undefined, compare: "prev" }
      });
      const current = r.data?.data || [];
      const prev = r2.data?.data || [];
      const merged = current.map((d, idx) => ({
        ...d,
        prev_value: prev[idx]?.value ?? 0
      }));
      setData(merged);
      setCompareData(prev);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBranches();
  }, []);

  useEffect(() => {
    loadTrend(metric, period, branchId);
  }, [metric, period, branchId]);

  const metricMeta = METRICS.find(m => m.key === metric);
  const selectedBranch = branches.find(
    b => String(b.branch_id) === String(branchId)
  );
  const buildExportName = () => {
    const now = new Date();
    const pad = n => String(n).padStart(2, "0");
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const label = (metricMeta?.label || "Trend").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_");
    return `${label}_${period}_${stamp}`;
  };

  const exportPDF = (title) => {
    if (!data.length) return;
    const doc = new jsPDF("p", "mm", "a4");
    doc.setFontSize(14);
    doc.text(`${title} (${period.toUpperCase()})`, 14, 16);
    doc.setFontSize(9);
    doc.text(
      `Branch: ${selectedBranch?.branch_name || "All Branches"}`,
      14,
      22
    );
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
      headStyles: { fillColor: [15, 23, 42] },
    });
    doc.save(`${buildExportName()}.pdf`);
  };

  const exportExcel = (title) => {
    if (!data.length) return;
    const headerBranch = selectedBranch?.branch_name || "All Branches";
    const ws = XLSX.utils.aoa_to_sheet([
      [title, period.toUpperCase()],
      ["Branch", headerBranch],
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
    saveAs(
      new Blob([XLSX.write(wb, { bookType: "xlsx", type: "array" })]),
      `${buildExportName()}.xlsx`
    );
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen space-y-4">
        <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Trends</h2>
        <div className="flex gap-2">
          <button
            onClick={() => exportPDF(metricMeta?.label)}
            className="px-3 py-2 text-xs rounded bg-red-600 text-white"
          >
            Export PDF
          </button>
          <button
            onClick={() => exportExcel(metricMeta?.label)}
            className="px-3 py-2 text-xs rounded bg-emerald-600 text-white"
          >
            Export Excel
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
        <div className="bg-white rounded-xl border p-3">
          <p className="text-xs text-slate-500 mb-2">Trend Types</p>
          <div className="space-y-2">
            {METRICS.map(m => (
              <button
                key={m.key}
                onClick={() => setMetric(m.key)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition
                  ${metric === m.key
                    ? "bg-slate-800 text-white"
                    : "bg-slate-50 hover:bg-slate-100 text-slate-700"
                  }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="font-semibold text-sm">{metricMeta?.label}</p>
            <div className="flex gap-2 items-center">
              {isAdmin && (
                <select
                  value={branchId}
                  onChange={e => setBranchId(e.target.value)}
                  className="border rounded px-2 py-1 text-xs"
                >
                  <option value="">All Branches</option>
                  {branches.map(b => (
                    <option key={b.branch_id} value={b.branch_id}>
                      {b.branch_name}
                    </option>
                  ))}
                </select>
              )}
              {["day", "week", "month"].map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition
                    ${period === p
                      ? "bg-slate-800 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {p.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="h-72">
            {loading ? (
              <div className="text-sm text-slate-500">Loading...</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis />
                  <Tooltip
                    formatter={(v, name, ctx) => {
                      const curr = Number(ctx?.payload?.value || 0);
                      const prev = Number(ctx?.payload?.prev_value || 0);
                      const growth = prev === 0 ? "" : ` (${(((curr - prev) / prev) * 100).toFixed(2)}%)`;
                      const val = metricMeta?.type === "currency" ? `₹ ${v}` : v;
                      return name === "Current" ? `${val}${growth}` : val;
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#2563eb"
                    strokeWidth={2}
                    name="Current"
                  />
                  <Line
                    type="monotone"
                    dataKey="prev_value"
                    stroke="#94a3b8"
                    strokeWidth={2}
                    name="Previous"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
