import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import authAxios from "../api/authAxios";
import { useToast } from "../components/Toast";
import { getSession } from "../utils/auth";
import { modulesToPermMap } from "../utils/navigationMenu";

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
      const res = await authAxios.get("/branch/list");
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
        <h2 className="text-lg font-bold text-slate-800">Supplier Ledger</h2>
        <button
          onClick={() => {
            loadSuppliers();
            loadAging();
            loadSupplierDetails(selectedSupplierId);
          }}
          className="px-3 py-1.5 rounded-lg border bg-white shadow-sm text-[12px]"
        >
          Refresh
        </button>
      </div>

      {isAdmin && (
        <div className="flex items-center gap-2 text-[12px]">
          <span className="text-slate-600">Branch</span>
          <select
            className="border rounded-lg px-2 py-1.5 text-[12px]"
            value={branchId}
            onChange={(e) => setBranchId(Number(e.target.value))}
          >
            {branches.map((b) => (
              <option key={b.branch_id} value={b.branch_id}>
                {b.branch_name}
              </option>
              ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="rounded-xl border bg-white p-4 space-y-2">
          <div className="text-sm font-semibold">Aging</div>
          {aging.length === 0 ? (
            <div className="text-[12px] text-slate-500">No dues</div>
          ) : (
            <div className="space-y-2">
              {aging.map((a) => (
                <button
                  key={a.supplier_id}
                  onClick={() => setSelectedSupplierId(String(a.supplier_id))}
                  className={`w-full text-left rounded-lg border px-3 py-2 text-[12px] hover:bg-gray-50 ${
                    Number(selectedSupplierId) === Number(a.supplier_id) ? "bg-blue-50 border-blue-200" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold truncate">{a.supplier_name}</div>
                    <div className="font-bold text-rose-700">
                      Rs. {Number(a.total_due || 0).toFixed(2)}
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2 mt-1 text-[11px] text-slate-600">
                    <div>Not due: {Number(a.not_due || 0).toFixed(0)}</div>
                    <div>0-30: {Number(a.due_0_30 || 0).toFixed(0)}</div>
                    <div>31-60: {Number(a.due_31_60 || 0).toFixed(0)}</div>
                    <div>90+: {Number(a.due_90_plus || 0).toFixed(0)}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-white p-4 space-y-2">
          <div className="text-sm font-semibold">Supplier</div>
          <select
            className="border rounded-lg px-2 py-2 text-[12px] w-full"
            value={selectedSupplierId}
            onChange={(e) => setSelectedSupplierId(e.target.value)}
          >
            <option value="">Select supplier</option>
            {suppliers.map((s) => (
              <option key={s.supplier_id} value={s.supplier_id}>
                {s.supplier_name}
              </option>
            ))}
          </select>

          {selectedSupplier && (
            <div className="text-[12px] text-slate-700 space-y-1">
              <div className="font-semibold">{selectedSupplier.supplier_name}</div>
              <div className="text-slate-500">
                Terms: {Number(selectedSupplier.credit_terms_days || 0)} days
              </div>
            </div>
          )}

          <div className="pt-2 border-t">
            <div className="text-sm font-semibold">Record Payment</div>
            <div className="grid grid-cols-1 gap-2">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  className="border rounded-lg px-2 py-2 text-[12px]"
                  placeholder="Amount"
                  value={payment.amount}
                  onChange={(e) => setPayment({ ...payment, amount: e.target.value })}
                />
                <select
                  className="border rounded-lg px-2 py-2 text-[12px]"
                  value={payment.payment_mode}
                  onChange={(e) => setPayment({ ...payment, payment_mode: e.target.value })}
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="bank">Bank</option>
                </select>
              </div>
              <select
                className="border rounded-lg px-2 py-2 text-[12px]"
                value={payment.po_id}
                onChange={(e) => setPayment({ ...payment, po_id: e.target.value })}
              >
                <option value="">Apply to (optional) - Any PO</option>
                {openPos.map((p) => (
                  <option key={p.po_id} value={p.po_id}>
                    {p.po_number} (Due Rs.{Number(p.due_amount || 0).toFixed(0)})
                  </option>
                ))}
              </select>
              <input
                className="border rounded-lg px-2 py-2 text-[12px]"
                placeholder="Reference no (optional)"
                value={payment.reference_no}
                onChange={(e) => setPayment({ ...payment, reference_no: e.target.value })}
              />
              <input
                className="border rounded-lg px-2 py-2 text-[12px]"
                placeholder="Notes (optional)"
                value={payment.notes}
                onChange={(e) => setPayment({ ...payment, notes: e.target.value })}
              />
              <button
                onClick={recordPayment}
                disabled={!canWrite}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-[12px] disabled:opacity-60"
              >
                Save Payment
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4 space-y-2 overflow-x-auto">
          <div className="text-sm font-semibold">Open POs</div>
          {openPos.length === 0 ? (
            <div className="text-[12px] text-slate-500">Select a supplier</div>
          ) : (
            <table className="min-w-[700px] w-full text-left text-[12px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-2">PO</th>
                  <th className="p-2">Date</th>
                  <th className="p-2 text-right">Total</th>
                  <th className="p-2 text-right">Paid</th>
                  <th className="p-2 text-right">Due</th>
                </tr>
              </thead>
              <tbody>
                {openPos.map((p) => (
                  <tr key={p.po_id} className="border-t">
                    <td className="p-2 font-semibold">{p.po_number}</td>
                    <td className="p-2">{p.order_date}</td>
                    <td className="p-2 text-right">{Number(p.total_amount || 0).toFixed(2)}</td>
                    <td className="p-2 text-right">{Number(p.paid_amount || 0).toFixed(2)}</td>
                    <td className="p-2 text-right font-bold text-rose-700">
                      {Number(p.due_amount || 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="pt-3 border-t">
            <div className="text-sm font-semibold">Statement</div>
            {statement.length === 0 ? (
              <div className="text-[12px] text-slate-500">No entries</div>
            ) : (
              <table className="min-w-[700px] w-full text-left text-[12px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2">Time</th>
                    <th className="p-2">Type</th>
                    <th className="p-2">Ref</th>
                    <th className="p-2 text-right">Debit</th>
                    <th className="p-2 text-right">Credit</th>
                    <th className="p-2">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.map((e) => (
                    <tr key={e.entry_id} className="border-t">
                      <td className="p-2">
                        {e.entry_time ? new Date(e.entry_time).toLocaleString() : "-"}
                      </td>
                      <td className="p-2 font-semibold">{e.entry_type}</td>
                      <td className="p-2">{e.reference_no || "-"}</td>
                      <td className="p-2 text-right">{Number(e.debit || 0).toFixed(2)}</td>
                      <td className="p-2 text-right">{Number(e.credit || 0).toFixed(2)}</td>
                      <td className="p-2">{e.notes || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
