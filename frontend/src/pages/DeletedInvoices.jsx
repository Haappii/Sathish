// src/pages/DeletedInvoices.jsx

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../utils/apiClient";
import { useToast } from "../components/Toast";

const pad = n => String(n).padStart(2, "0");

export default function DeletedInvoices() {
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [list, setList] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmingRestore, setConfirmingRestore] = useState(null);
  const [appDateYMD, setAppDateYMD] = useState("");

  /* ================= LOAD APP DATE ================= */
  useEffect(() => {
    api.get("/shop/details").then(r => {
      const d = r?.data?.app_date;
      if (d) setAppDateYMD(d.slice(0, 10));
    }).catch(() => {});
  }, []);

  const toYMD = dateValue => {
    if (!dateValue) return "";
    const d = new Date(dateValue);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  };

  const isToday = dateValue => !!appDateYMD && toYMD(dateValue) === appDateYMD;

  /* ================= LOAD ================= */
  const loadDeletedInvoices = async () => {
    try {
      const res = await api.get("/invoice/archive/list");

      // ONLY DELETED
      const deletedOnly = (res.data || []).filter(
        inv => inv.delete_reason === "Deleted"
      );

      setList(deletedOnly);
      setFiltered(deletedOnly);
    } catch {
      showToast("Failed to load deleted invoices", "error");
    }
  };

  useEffect(() => {
    loadDeletedInvoices();
  }, []);

  /* ================= SEARCH ================= */
  useEffect(() => {
    const q = search.toLowerCase().trim();

    if (!q) {
      setFiltered(list);
      return;
    }

    setFiltered(
      list.filter(inv =>
        (inv.invoice_number || "").toLowerCase().includes(q) ||
        (inv.customer_name || "").toLowerCase().includes(q) ||
        (inv.mobile || "").includes(q)
      )
    );
  }, [search, list]);

  /* ================= RESTORE ================= */
  const restoreInvoice = async () => {
    if (!confirmingRestore?.archive_id) return;
    setLoading(true);
    try {
      await api.post(`/invoice/archive/restore/${confirmingRestore.archive_id}`);
      showToast("Invoice restored successfully", "success");
      setConfirmingRestore(null);
      await loadDeletedInvoices();
    } catch (err) {
      showToast(err?.response?.data?.detail || "Restore failed", "error");
    } finally {
      setLoading(false);
    }
  };

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
          <h1 className="text-base font-bold text-gray-800">Deleted Invoices</h1>
          <p className="text-[11px] text-gray-400">{filtered.length} invoice{filtered.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="relative">
          <svg className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Invoice / mobile / customer"
            className="border border-gray-200 rounded-xl pl-8 pr-3 py-1.5 text-[12px] bg-gray-50 focus:outline-none focus:border-blue-400 w-56"
          />
        </div>
      </div>

      <div className="px-4 sm:px-6 py-4">
        <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-[700px] w-full text-[12px]">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-4 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Invoice No</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Customer</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Mobile</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Total</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Deleted By</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Deleted Time</th>
                  <th className="px-4 py-2.5 text-center font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-4 py-12 text-center text-gray-400">
                      <div className="text-2xl mb-2">🗑</div>
                      No deleted invoices found
                    </td>
                  </tr>
                ) : (
                  filtered.map((inv, i) => (
                    <tr key={inv.archive_id} className={i % 2 === 0 ? "bg-white hover:bg-gray-50/50" : "bg-gray-50/40 hover:bg-gray-50"}>
                      <td className="px-4 py-2.5 font-semibold text-gray-800">{inv.invoice_number}</td>
                      <td className="px-4 py-2.5 text-gray-600">{inv.customer_name || "NA"}</td>
                      <td className="px-4 py-2.5 text-gray-600">{inv.mobile || "NA"}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-800">₹{Number(inv.total_amount || 0).toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-gray-600">{inv.deleted_by}</td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {inv.deleted_time
                          ? new Date(inv.deleted_time).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
                          : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {isToday(inv.created_time) ? (
                          <button
                            disabled={loading}
                            onClick={() => setConfirmingRestore(inv)}
                            className="px-3 py-1 rounded-xl text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition disabled:opacity-50"
                          >
                            Restore
                          </button>
                        ) : (
                          <span className="px-3 py-1 rounded-xl text-[11px] font-semibold text-gray-400 bg-gray-100">
                            Past Date
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {confirmingRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl border">
            <div className="border-b px-5 py-4">
              <h2 className="text-sm font-semibold text-gray-800">Restore Deleted Invoice</h2>
              <p className="mt-1 text-[12px] text-gray-500">
                {confirmingRestore.invoice_number
                  ? `Restore invoice ${confirmingRestore.invoice_number}?`
                  : "Restore this deleted invoice?"}
              </p>
            </div>

            <div className="px-5 py-4 text-[12px] text-gray-600 space-y-1">
              <div>
                <span className="font-medium text-gray-700">Customer:</span>{" "}
                {confirmingRestore.customer_name || "NA"}
              </div>
              <div>
                <span className="font-medium text-gray-700">Mobile:</span>{" "}
                {confirmingRestore.mobile || "NA"}
              </div>
              <div>
                <span className="font-medium text-gray-700">Total:</span>{" "}
                ₹{Number(confirmingRestore.total_amount || 0).toFixed(2)}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 rounded-b-2xl border-t bg-gray-50 px-5 py-3">
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setConfirmingRestore(null);
                  showToast("Restore cancelled", "warning");
                }}
                className="rounded-lg border bg-white px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={restoreInvoice}
                className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {loading ? "Restoring..." : "Confirm Restore"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



