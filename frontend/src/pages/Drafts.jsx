import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import authAxios from "../api/authAxios";
import { useToast } from "../components/Toast";

export default function Drafts() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await authAxios.get("/invoice/draft/list");
      setRows(res.data || []);
    } catch {
      showToast("Failed to load drafts", "error");
      setRows([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const convert = async (draftId) => {
    try {
      const res = await authAxios.post(`/invoice/draft/convert/${draftId}`);
      const inv = res?.data?.invoice_number;
      showToast(inv ? `Converted to ${inv}` : "Converted", "success");
      load();
    } catch (err) {
      const msg = err?.response?.data?.detail || "Convert failed";
      showToast(msg, "error");
    }
  };

  const remove = async (draftId) => {
    try {
      await authAxios.delete(`/invoice/draft/${draftId}`);
      showToast("Draft deleted", "success");
      load();
    } catch (err) {
      const msg = err?.response?.data?.detail || "Delete failed";
      showToast(msg, "error");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 sm:px-6 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate("/home", { replace: true })}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
        >
          Back
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-gray-800">Draft Bills</h1>
          <p className="text-[11px] text-gray-400">
            {rows.length} draft{rows.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={load}
          className="px-4 py-1.5 rounded-xl border text-[12px] font-medium text-gray-600 hover:bg-gray-50 transition"
        >
          Refresh
        </button>
      </div>

      <div className="px-4 sm:px-6 py-4 space-y-3">
        <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-sm text-gray-400">
              Loading drafts...
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <div className="text-sm text-gray-400">No drafts found</div>
              <div className="text-[11px] text-gray-400">
                Use "Hold" in Sales Billing to save a draft
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[680px] w-full text-[12px]">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide text-[10px]">
                      Draft #
                    </th>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide text-[10px]">
                      Customer
                    </th>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide text-[10px]">
                      Mobile
                    </th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-500 uppercase tracking-wide text-[10px]">
                      Items
                    </th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-500 uppercase tracking-wide text-[10px]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map((row, index) => (
                    <tr
                      key={row.draft_id}
                      className={index % 2 === 0 ? "bg-white" : "bg-gray-50/40"}
                    >
                      <td className="px-4 py-2.5 font-semibold text-gray-800">
                        {row.draft_number}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {row.customer_name || "-"}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{row.mobile || "-"}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">
                        {(row.items || []).length}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => convert(row.draft_id)}
                            className="px-3 py-1 rounded-xl text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition"
                          >
                            Convert
                          </button>
                          <button
                            onClick={() => remove(row.draft_id)}
                            className="px-3 py-1 rounded-xl border text-[11px] font-medium text-rose-600 border-rose-200 bg-rose-50 hover:bg-rose-100 transition"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
