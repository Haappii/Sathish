import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import authAxios from "../api/authAxios";
import { useToast } from "../components/Toast";
import { getSession } from "../utils/auth";
import { modulesToPermMap } from "../utils/navigationMenu";

export default function ReorderAlerts() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const session = getSession() || {};

  const roleLower = String(session?.role || session?.role_name || "").toLowerCase();
  const isAdmin = roleLower === "admin";
  const [allowed, setAllowed] = useState(null);

  useEffect(() => {
    authAxios.get("/permissions/my")
      .then((r) => {
        const map = modulesToPermMap(r?.data?.modules);
        setAllowed(Boolean(map?.inventory?.can_read));
      })
      .catch(() => setAllowed(false));
  }, []);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState("");

  const loadBranches = async () => {
    if (!isAdmin) return;
    try {
      const res = await authAxios.get("/branch/active");
      setBranches(res.data || []);
    } catch {
      setBranches([]);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (isAdmin && branchId) params.branch_id = Number(branchId);
      const res = await authAxios.get("/inventory/reorder-alerts", { params });
      setRows(res.data || []);
    } catch (err) {
      setRows([]);
      const msg = err?.response?.data?.detail || "Failed to load reorder alerts";
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!allowed) return;
    loadBranches();
    load();
  }, [allowed, isAdmin]);

  useEffect(() => {
    if (!allowed) return;
    load();
  }, [branchId, allowed]);

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
    <div className="bg-gray-100 min-h-screen p-3 space-y-3 text-[11px]">
      <div className="flex items-center justify-between bg-white border rounded-lg px-3 py-2">
        <button
          onClick={() => navigate("/home", { replace: true })}
          className="text-gray-600 hover:text-black"
        >
          &larr; Back
        </button>
        <div className="font-bold text-sm">Reorder Alerts</div>
        <div />
      </div>

      <div className="bg-white border rounded-lg p-3 space-y-2">
        <div className="flex flex-wrap gap-2 items-end">
          {isAdmin && (
            <div className="min-w-[220px]">
              <label className="text-[10px] text-gray-600">Branch (Admin)</label>
              <select
                className="w-full border rounded-lg px-2 py-1"
                value={branchId}
                onChange={e => setBranchId(e.target.value)}
              >
                <option value="">Current branch</option>
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
          <div className="p-3 text-gray-500">No reorder alerts</div>
        ) : (
          <table className="min-w-[800px] w-full text-left">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2">Item</th>
                <th className="p-2 text-right">Qty</th>
                <th className="p-2 text-right">Min</th>
                <th className="p-2 text-right">Short By</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.item_id} className="border-t">
                  <td className="p-2 font-semibold">{r.item_name}</td>
                  <td className="p-2 text-right">{Number(r.quantity || 0)}</td>
                  <td className="p-2 text-right">{Number(r.min_stock || 0)}</td>
                  <td className="p-2 text-right font-bold text-rose-600">
                    {Number(r.short_by || 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
