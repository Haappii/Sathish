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
      const res = await authAxios.get("/branch/list");
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

  return (
    <div className="bg-gray-100 min-h-screen p-3 space-y-3 text-[11px]">

      <div className="flex items-center justify-between bg-white border rounded-lg px-3 py-2">
        <button
          onClick={() => navigate("/dashboard", { replace: true })}
          className="text-gray-600 hover:text-black"
        >
          &larr; Back
        </button>
        <div className="font-bold text-sm">Customer Dues</div>
        <div />
      </div>

      <div className="bg-white border rounded-lg p-3 space-y-2">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[180px]">
            <label className="text-[10px] text-gray-600">Search</label>
            <input
              className="w-full border rounded-lg px-2 py-1"
              placeholder="Invoice no / mobile..."
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>

          {isAdmin && (
            <div className="min-w-[180px]">
              <label className="text-[10px] text-gray-600">Branch (Admin)</label>
              <select
                className="w-full border rounded-lg px-2 py-1"
                value={branchId}
                onChange={e => setBranchId(e.target.value)}
              >
                <option value="">All branches</option>
                {branches.map(b => (
                  <option key={b.branch_id} value={b.branch_id}>
                    {b.branch_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={load}
            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white shadow"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="bg-white border rounded-lg overflow-x-auto">
        {loading ? (
          <div className="p-3 text-gray-500">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="p-3 text-gray-500">No open dues</div>
        ) : (
          <table className="min-w-[900px] w-full text-left">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2">Invoice</th>
                <th className="p-2">Customer</th>
                <th className="p-2">Mobile</th>
                <th className="p-2 text-right">Original</th>
                <th className="p-2 text-right">Paid</th>
                <th className="p-2 text-right">Returns</th>
                <th className="p-2 text-right">Outstanding</th>
                <th className="p-2">Pay</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const inv = r.invoice_number;
                const entry = payInput[inv] || { amount: "", mode: "cash", ref: "" };
                return (
                  <tr key={r.due_id} className="border-t">
                    <td className="p-2 font-semibold">{inv}</td>
                    <td className="p-2">{r.customer_name || "-"}</td>
                    <td className="p-2">{r.mobile || "-"}</td>
                    <td className="p-2 text-right">{Number(r.original_amount || 0).toFixed(2)}</td>
                    <td className="p-2 text-right">{Number(r.paid_amount || 0).toFixed(2)}</td>
                    <td className="p-2 text-right">{Number(r.returns_amount || 0).toFixed(2)}</td>
                    <td className="p-2 text-right font-bold">
                      {Number(r.outstanding_amount || 0).toFixed(2)}
                    </td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-2 items-center">
                        <input
                          type="number"
                          className="w-[90px] border rounded-lg px-2 py-1"
                          placeholder="Amount"
                          value={entry.amount}
                          onChange={e => setPay(inv, { amount: e.target.value })}
                        />
                        <select
                          className="border rounded-lg px-2 py-1"
                          value={entry.mode}
                          onChange={e => setPay(inv, { mode: e.target.value })}
                        >
                          <option value="cash">Cash</option>
                          <option value="card">Card</option>
                          <option value="upi">UPI</option>
                          <option value="bank">Bank</option>
                        </select>
                        <input
                          className="w-[140px] border rounded-lg px-2 py-1"
                          placeholder="Ref (optional)"
                          value={entry.ref}
                          onChange={e => setPay(inv, { ref: e.target.value })}
                        />
                        <button
                          onClick={() => pay(inv)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white shadow"
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
        )}
      </div>

    </div>
  );
}

