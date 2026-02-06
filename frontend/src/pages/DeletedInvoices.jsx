// src/pages/DeletedInvoices.jsx

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../utils/apiClient";
import { useToast } from "../components/Toast";

export default function DeletedInvoices() {
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [list, setList] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

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
  const restoreInvoice = async (archiveId) => {
    if (!window.confirm("Restore this deleted invoice?")) return;

    setLoading(true);
    try {
      await api.post(`/invoice/archive/restore/${archiveId}`);
      showToast("Invoice restored successfully");
      loadDeletedInvoices();
    } catch {
      showToast("Restore failed", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">

      {/* HEADER ROW */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="px-3 py-1.5 rounded-lg border bg-white shadow-sm text-[12px]"
          >
            &larr; Back
          </button>

          <h1 className="text-2xl font-bold">Deleted Invoices</h1>
        </div>

        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search Invoice / Mobile / Customer"
          className="border rounded px-3 py-1 text-sm w-72"
        />
      </div>

      {/* TABLE */}
      <div className="overflow-auto border rounded-lg">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-3 text-left">Invoice No</th>
              <th className="p-3 text-left">Customer</th>
              <th className="p-3 text-left">Mobile</th>
              <th className="p-3 text-right">Total</th>
              <th className="p-3 text-center">Deleted By</th>
              <th className="p-3 text-left">Deleted Time</th>
              <th className="p-3 text-center">Action</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map(inv => (
              <tr
                key={inv.archive_id}
                className="border-t hover:bg-gray-50"
              >
                <td className="p-3 font-medium">
                  {inv.invoice_number}
                </td>

                <td className="p-3">
                  {inv.customer_name || "NA"}
                </td>

                <td className="p-3">
                  {inv.mobile || "NA"}
                </td>

                <td className="p-3 text-right font-semibold">
                  ₹{Number(inv.total_amount || 0).toFixed(2)}
                </td>

                <td className="p-3 text-center">
                  {inv.deleted_by}
                </td>

                <td className="p-3">
                  {inv.deleted_time
                    ? new Date(inv.deleted_time).toLocaleString("en-GB", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit"
                      })
                    : ""}
                </td>

                <td className="p-3 text-center">
                  <button
                    disabled={loading}
                    onClick={() => restoreInvoice(inv.archive_id)}
                    className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-50"
                  >
                    Restore
                  </button>
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan="7"
                  className="p-6 text-center text-gray-500"
                >
                  No deleted invoices found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}



