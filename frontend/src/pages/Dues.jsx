import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import authAxios from "../api/authAxios";
import { useToast } from "../components/Toast";
import { getSession } from "../utils/auth";

export default function Dues() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const session = getSession() || {};

  const roleLower = String(session?.role || "").toLowerCase();
  const isAdmin = roleLower === "admin";

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");

  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState("");

  const [payInput, setPayInput] = useState({}); // invoice_number -> {amount, mode, ref}

  const loadBranches = async () => {
    if (!isAdmin) return;
    try {
      const res = await authAxios.get("/branch/active");
      setBranches(res.data || []);
    } catch {}
  };

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (q) params.q = q;
      if (isAdmin && branchId) params.branch_id = Number(branchId);

      const res = await authAxios.get("/dues/open", { params });
      setRows(res.data || []);
    } catch {
      showToast("Failed to load dues", "error");
      setRows([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadBranches();
  }, [isAdmin]);

  useEffect(() => {
    load();
  }, [branchId]);

  const setPay = (inv, patch) => {
    setPayInput(prev => ({
      ...prev,
      [inv]: { amount: "", mode: "cash", ref: "", ...(prev[inv] || {}), ...patch }
    }));
  };

  const pay = async (inv) => {
    const entry = payInput[inv] || {};
    const amount = Number(entry.amount || 0);
    if (!amount || amount <= 0) return showToast("Enter amount", "error");

    try {
      await authAxios.post("/dues/pay", {
        invoice_number: inv,
        amount,
        payment_mode: entry.mode || "cash",
        reference_no: entry.ref || null
      });
      showToast("Payment recorded", "success");
      setPayInput(prev => ({ ...prev, [inv]: { amount: "", mode: "cash", ref: "" } }));
      load();
    } catch (err) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Payment failed";
      showToast(msg, "error");
    }
  };

  const totalOutstanding = rows.reduce((s, r) => s + Number(r.outstanding_amount || 0), 0);

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
          <h1 className="text-base font-bold text-gray-800">Customer Dues</h1>
          {rows.length > 0 && (
            <p className="text-[11px] text-rose-500 font-semibold">
              Total Outstanding: ₹{totalOutstanding.toFixed(2)}
            </p>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b px-4 sm:px-6 py-3 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] text-gray-500 font-medium">Search</label>
          <input
            className="border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] bg-gray-50 focus:outline-none focus:border-blue-400 w-52"
            placeholder="Invoice no / mobile..."
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === "Enter" && load()}
          />
        </div>
        {isAdmin && (
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] text-gray-500 font-medium">Branch</label>
            <select
              className="border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] bg-gray-50 focus:outline-none focus:border-blue-400"
              value={branchId}
              onChange={e => setBranchId(e.target.value)}
            >
              <option value="">All branches</option>
              {branches.map(b => (
                <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] text-transparent select-none">.</label>
          <button
            onClick={load}
            className="px-4 py-1.5 rounded-xl text-[12px] font-semibold text-white transition"
            style={{ backgroundColor: "#0B3C8C" }}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-4">
        <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-sm text-gray-400">Loading dues...</div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <div className="text-2xl">✅</div>
              <div className="text-sm text-gray-400">No open dues found</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1000px] w-full text-[11px]">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    {["Invoice", "Customer", "Mobile", "Original", "Paid", "Returns", "Outstanding", "Record Payment"].map((h, i) => (
                      <th key={h} className={`px-3 py-2.5 font-semibold text-gray-500 uppercase tracking-wide text-[10px] ${i >= 3 && i <= 6 ? "text-right" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map((r, idx) => {
                    const inv = r.invoice_number;
                    const entry = payInput[inv] || { amount: "", mode: "cash", ref: "" };
                    return (
                      <tr key={r.due_id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/40"}>
                        <td className="px-3 py-2.5 font-semibold text-gray-800">{inv}</td>
                        <td className="px-3 py-2.5 text-gray-600">{r.customer_name || "—"}</td>
                        <td className="px-3 py-2.5 text-gray-600">{r.mobile || "—"}</td>
                        <td className="px-3 py-2.5 text-right text-gray-600">₹{Number(r.original_amount || 0).toFixed(2)}</td>
                        <td className="px-3 py-2.5 text-right text-emerald-600">₹{Number(r.paid_amount || 0).toFixed(2)}</td>
                        <td className="px-3 py-2.5 text-right text-gray-600">₹{Number(r.returns_amount || 0).toFixed(2)}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-rose-600">₹{Number(r.outstanding_amount || 0).toFixed(2)}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1.5 items-center">
                            <input
                              type="number"
                              className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-[11px] bg-gray-50 focus:outline-none focus:border-blue-400"
                              placeholder="Amount"
                              value={entry.amount}
                              onChange={e => setPay(inv, { amount: e.target.value })}
                            />
                            <select
                              className="border border-gray-200 rounded-lg px-2 py-1 text-[11px] bg-gray-50 focus:outline-none"
                              value={entry.mode}
                              onChange={e => setPay(inv, { mode: e.target.value })}
                            >
                              <option value="cash">Cash</option>
                              <option value="card">Card</option>
                              <option value="upi">UPI</option>
                              <option value="bank">Bank</option>
                            </select>
                            <input
                              className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-[11px] bg-gray-50 focus:outline-none"
                              placeholder="Ref"
                              value={entry.ref}
                              onChange={e => setPay(inv, { ref: e.target.value })}
                            />
                            <button
                              onClick={() => pay(inv)}
                              className="px-3 py-1 rounded-lg text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition"
                            >
                              Pay
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
