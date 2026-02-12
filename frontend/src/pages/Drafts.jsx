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

  useEffect(() => { load(); }, []);

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
    <div className="bg-gray-100 min-h-screen p-3 space-y-3 text-[11px]">

      <div className="flex items-center justify-between bg-white border rounded-lg px-3 py-2">
        <button
          onClick={() => navigate("/dashboard", { replace: true })}
          className="text-gray-600 hover:text-black"
        >
          &larr; Back
        </button>
        <div className="font-bold text-sm">Draft Bills</div>
        <button
          onClick={load}
          className="px-3 py-1.5 rounded-lg bg-blue-600 text-white shadow"
        >
          Refresh
        </button>
      </div>

      <div className="bg-white border rounded-lg overflow-x-auto">
        {loading ? (
          <div className="p-3 text-gray-500">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="p-3 text-gray-500">No drafts</div>
        ) : (
          <table className="min-w-[760px] w-full text-left">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2">Draft</th>
                <th className="p-2">Customer</th>
                <th className="p-2">Mobile</th>
                <th className="p-2 text-right">Items</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.draft_id} className="border-t">
                  <td className="p-2 font-semibold">{r.draft_number}</td>
                  <td className="p-2">{r.customer_name || "-"}</td>
                  <td className="p-2">{r.mobile || "-"}</td>
                  <td className="p-2 text-right">{(r.items || []).length}</td>
                  <td className="p-2">
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => convert(r.draft_id)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white shadow"
                      >
                        Convert
                      </button>
                      <button
                        onClick={() => remove(r.draft_id)}
                        className="px-3 py-1.5 rounded-lg border bg-white shadow"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="text-[10px] text-gray-500">
        Tip: Use “Hold” in Sales Billing to save a draft.
      </div>
    </div>
  );
}

