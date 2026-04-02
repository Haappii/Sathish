import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import authAxios from "../api/authAxios";
import { useToast } from "../components/Toast";
import { getSession } from "../utils/auth";
import { modulesToPermMap } from "../utils/navigationMenu";

const inputCls = "border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] bg-gray-50 focus:outline-none focus:border-blue-400 focus:bg-white transition w-full";
const labelCls = "text-[10px] font-semibold text-gray-500 uppercase tracking-wide";

export default function SupplierLedger() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const session = getSession() || {};
  const roleLower = String(session?.role || "").toLowerCase();
  const isAdmin = roleLower === "admin";

  const [allowed, setAllowed] = useState(null);
  const [canWrite, setCanWrite] = useState(false);

  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(session?.branch_id || "");

  const [suppliers, setSuppliers] = useState([]);
  const [aging, setAging] = useState([]);

  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [openPos, setOpenPos] = useState([]);
  const [statement, setStatement] = useState([]);

  const [payment, setPayment] = useState({
    amount: "",
    payment_mode: "cash",
    reference_no: "",
    notes: "",
    po_id: "",
  });

  useEffect(() => {
    authAxios
      .get("/permissions/my")
      .then((r) => {
        const map = modulesToPermMap(r?.data?.modules);
        setAllowed(Boolean(map?.supplier_ledger?.can_read));
        setCanWrite(Boolean(map?.supplier_ledger?.can_write));
      })
      .catch(() => {
        setAllowed(false);
        setCanWrite(false);
      });
  }, []);

  const loadBranches = async () => {
    if (!isAdmin) return;
    try {
      const res = await authAxios.get("/branch/active");
      setBranches(res.data || []);
    } catch {
      setBranches([]);
    }
  };

  const loadSuppliers = async () => {
    try {
      const res = await authAxios.get("/suppliers/", {
        params: { branch_id: isAdmin ? branchId : undefined },
      });
      setSuppliers(res.data || []);
    } catch {
      setSuppliers([]);
      showToast("Failed to load suppliers", "error");
    }
  };

  const loadAging = async () => {
    try {
      const res = await authAxios.get("/supplier-ledger/aging", {
        params: { branch_id: isAdmin ? branchId : undefined },
      });
      setAging(res.data || []);
    } catch {
      setAging([]);
      showToast("Failed to load aging", "error");
    }
  };

  const loadSupplierDetails = async (sid) => {
    if (!sid) {
      setOpenPos([]);
      setStatement([]);
      return;
    }
    try {
      const [posRes, stRes] = await Promise.all([
        authAxios.get(`/supplier-ledger/supplier/${sid}/open-pos`, {
          params: { branch_id: isAdmin ? branchId : undefined },
        }),
        authAxios.get(`/supplier-ledger/supplier/${sid}/statement`, {
          params: { branch_id: isAdmin ? branchId : undefined },
        }),
      ]);
      setOpenPos(posRes.data || []);
      setStatement(stRes.data || []);
    } catch (e) {
      setOpenPos([]);
      setStatement([]);
      showToast(e?.response?.data?.detail || "Failed to load supplier ledger", "error");
    }
  };

  useEffect(() => {
    if (!allowed) return;
    loadBranches();
  }, [allowed, isAdmin]);

  useEffect(() => {
    if (!allowed) return;
    loadSuppliers();
    loadAging();
  }, [allowed, branchId]);

  useEffect(() => {
    if (!allowed) return;
    loadSupplierDetails(selectedSupplierId);
  }, [selectedSupplierId, branchId, allowed]);

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => Number(s.supplier_id) === Number(selectedSupplierId)) || null,
    [suppliers, selectedSupplierId]
  );

  const totalDue = useMemo(
    () => aging.reduce((s, a) => s + Number(a.total_due || 0), 0),
    [aging]
  );

  const recordPayment = async () => {
    if (!canWrite) return showToast("Not allowed", "error");
    if (!selectedSupplierId) return showToast("Select supplier", "error");
    const amt = Number(payment.amount || 0);
    if (!amt || amt <= 0) return showToast("Enter amount", "error");
    try {
      await authAxios.post("/supplier-ledger/payment", {
        supplier_id: Number(selectedSupplierId),
        branch_id: isAdmin ? Number(branchId) : undefined,
        po_id: payment.po_id ? Number(payment.po_id) : undefined,
        amount: amt,
        payment_mode: payment.payment_mode || "cash",
        reference_no: payment.reference_no || undefined,
        notes: payment.notes || undefined,
      });
      setPayment({ amount: "", payment_mode: "cash", reference_no: "", notes: "", po_id: "" });
      showToast("Payment recorded", "success");
      loadAging();
      loadSupplierDetails(selectedSupplierId);
    } catch (e) {
      showToast(e?.response?.data?.detail || "Payment failed", "error");
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
          <h1 className="text-base font-bold text-gray-800">Supplier Ledger</h1>
          {totalDue > 0 && (
            <p className="text-[11px] text-rose-500 font-semibold">Total Due: ₹{totalDue.toFixed(2)}</p>
          )}
        </div>
        {isAdmin && (
          <select
            className="border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] bg-gray-50 focus:outline-none"
            value={branchId}
            onChange={(e) => setBranchId(Number(e.target.value))}
          >
            {branches.map((b) => (
              <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>
            ))}
          </select>
        )}
        <button
          onClick={() => { loadSuppliers(); loadAging(); loadSupplierDetails(selectedSupplierId); }}
          className="px-4 py-1.5 rounded-xl border text-[12px] font-medium text-gray-600 hover:bg-gray-50 transition"
        >
          Refresh
        </button>
      </div>

      <div className="px-4 sm:px-6 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Aging Panel */}
          <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Aging — Outstanding</p>
            </div>
            <div className="divide-y divide-gray-50 max-h-[500px] overflow-y-auto">
              {aging.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 gap-1">
                  <div className="text-xl">✅</div>
                  <p className="text-[12px] text-gray-400">No outstanding dues</p>
                </div>
              ) : (
                aging.map((a) => (
                  <button
                    key={a.supplier_id}
                    onClick={() => setSelectedSupplierId(String(a.supplier_id))}
                    className={`w-full text-left px-4 py-3 transition hover:bg-gray-50 ${
                      Number(selectedSupplierId) === Number(a.supplier_id) ? "bg-blue-50" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12px] font-semibold text-gray-800 truncate">{a.supplier_name}</span>
                      <span className="text-[12px] font-bold text-rose-600 ml-2 flex-shrink-0">₹{Number(a.total_due || 0).toFixed(0)}</span>
                    </div>
                    <div className="flex gap-3 text-[10px] text-gray-400">
                      <span>0-30: ₹{Number(a.due_0_30 || 0).toFixed(0)}</span>
                      <span>31-60: ₹{Number(a.due_31_60 || 0).toFixed(0)}</span>
                      <span>90+: ₹{Number(a.due_90_plus || 0).toFixed(0)}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Supplier + Payment */}
          <div className="bg-white border rounded-2xl shadow-sm p-4 space-y-4">
            <div className="space-y-2">
              <p className={labelCls}>Select Supplier</p>
              <select
                className={inputCls}
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
              >
                <option value="">Select supplier...</option>
                {suppliers.map((s) => (
                  <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>
                ))}
              </select>

              {selectedSupplier && (
                <div className="bg-gray-50 rounded-xl px-3 py-2">
                  <p className="text-[12px] font-semibold text-gray-800">{selectedSupplier.supplier_name}</p>
                  <p className="text-[11px] text-gray-400">Credit terms: {Number(selectedSupplier.credit_terms_days || 0)} days</p>
                </div>
              )}
            </div>

            <div className="border-t pt-4 space-y-3">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Record Payment</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className={labelCls}>Amount</label>
                  <input
                    type="number"
                    className={inputCls}
                    placeholder="0.00"
                    value={payment.amount}
                    onChange={(e) => setPayment({ ...payment, amount: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelCls}>Mode</label>
                  <select
                    className={inputCls}
                    value={payment.payment_mode}
                    onChange={(e) => setPayment({ ...payment, payment_mode: e.target.value })}
                  >
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="card">Card</option>
                    <option value="bank">Bank</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelCls}>Apply to PO (optional)</label>
                <select
                  className={inputCls}
                  value={payment.po_id}
                  onChange={(e) => setPayment({ ...payment, po_id: e.target.value })}
                >
                  <option value="">Any PO</option>
                  {openPos.map((p) => (
                    <option key={p.po_id} value={p.po_id}>
                      {p.po_number} (Due ₹{Number(p.due_amount || 0).toFixed(0)})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelCls}>Reference No</label>
                <input
                  className={inputCls}
                  placeholder="Optional"
                  value={payment.reference_no}
                  onChange={(e) => setPayment({ ...payment, reference_no: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelCls}>Notes</label>
                <input
                  className={inputCls}
                  placeholder="Optional"
                  value={payment.notes}
                  onChange={(e) => setPayment({ ...payment, notes: e.target.value })}
                />
              </div>
              <button
                onClick={recordPayment}
                disabled={!canWrite}
                className="w-full px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-semibold transition disabled:opacity-60"
              >
                Save Payment
              </button>
            </div>
          </div>

          {/* Open POs + Statement */}
          <div className="space-y-4">
            {/* Open POs */}
            <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Open Purchase Orders</p>
              </div>
              {openPos.length === 0 ? (
                <div className="flex items-center justify-center h-24">
                  <p className="text-[12px] text-gray-400">{selectedSupplierId ? "No open POs" : "Select a supplier"}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[360px] w-full text-[12px]">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide text-[10px]">PO</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Date</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Total</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Due</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {openPos.map((p, idx) => (
                        <tr key={p.po_id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/40"}>
                          <td className="px-3 py-2 font-semibold text-gray-800">{p.po_number}</td>
                          <td className="px-3 py-2 text-gray-600">{p.order_date}</td>
                          <td className="px-3 py-2 text-right text-gray-600">₹{Number(p.total_amount || 0).toFixed(2)}</td>
                          <td className="px-3 py-2 text-right font-bold text-rose-600">₹{Number(p.due_amount || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Statement */}
            <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Ledger Statement</p>
              </div>
              {statement.length === 0 ? (
                <div className="flex items-center justify-center h-24">
                  <p className="text-[12px] text-gray-400">{selectedSupplierId ? "No entries" : "Select a supplier"}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[480px] w-full text-[12px]">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Time</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Type</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Debit</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Credit</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {statement.map((e, idx) => (
                        <tr key={e.entry_id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/40"}>
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                            {e.entry_time ? new Date(e.entry_time).toLocaleString() : "—"}
                          </td>
                          <td className="px-3 py-2 font-semibold text-gray-800">{e.entry_type}</td>
                          <td className="px-3 py-2 text-right text-rose-600 font-semibold">
                            {Number(e.debit || 0) > 0 ? `₹${Number(e.debit).toFixed(2)}` : "—"}
                          </td>
                          <td className="px-3 py-2 text-right text-emerald-600 font-semibold">
                            {Number(e.credit || 0) > 0 ? `₹${Number(e.credit).toFixed(2)}` : "—"}
                          </td>
                          <td className="px-3 py-2 text-gray-500">{e.notes || "—"}</td>
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
