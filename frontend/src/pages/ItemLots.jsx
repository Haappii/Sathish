import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import authAxios from "../api/authAxios";
import { useToast } from "../components/Toast";
import { getSession } from "../utils/auth";
import { modulesToPermMap } from "../utils/navigationMenu";

export default function ItemLots() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const session = getSession() || {};
  const roleLower = String(session?.role || "").toLowerCase();
  const isAdmin = roleLower === "admin";

  const [allowed, setAllowed] = useState(null);

  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(session?.branch_id || "");

  const [items, setItems] = useState([]);
  const [itemId, setItemId] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authAxios
      .get("/permissions/my")
      .then((r) => {
        const map = modulesToPermMap(r?.data?.modules);
        setAllowed(Boolean(map?.item_lots?.can_read));
      })
      .catch(() => setAllowed(false));
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

  const loadItems = async () => {
    try {
      const res = await authAxios.get("/items/");
      setItems(res.data || []);
    } catch {
      setItems([]);
    }
  };

  const loadLots = async () => {
    setLoading(true);
    try {
      const res = await authAxios.get("/item-lots/", {
        params: {
          branch_id: isAdmin ? branchId : undefined,
          item_id: itemId ? Number(itemId) : undefined,
          batch_no: batchNo || undefined,
        },
      });
      setRows(res.data || []);
    } catch (e) {
      setRows([]);
      showToast(e?.response?.data?.detail || "Failed to load lots", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!allowed) return;
    loadBranches();
    loadItems();
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;
    loadLots();
  }, [allowed, branchId, itemId, batchNo]);

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
        <h2 className="text-lg font-bold text-slate-800">Batch / Expiry / Serial Lots</h2>
        <button
          onClick={loadLots}
          className="px-3 py-1.5 rounded-lg border bg-white shadow-sm text-[12px]"
        >
          Refresh
        </button>
      </div>

      <div className="rounded-xl border bg-white p-4 space-y-2 text-[12px]">
        <div className="flex flex-wrap gap-2 items-end">
          {isAdmin && (
            <div className="min-w-[220px]">
              <label className="text-[10px] text-gray-600">Branch (Admin)</label>
              <select
                className="w-full border rounded-lg px-2 py-2"
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

          <div className="min-w-[260px]">
            <label className="text-[10px] text-gray-600">Item</label>
            <select
              className="w-full border rounded-lg px-2 py-2"
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
            >
              <option value="">All items</option>
              {items.map((i) => (
                <option key={i.item_id} value={i.item_id}>
                  {i.item_name}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[200px]">
            <label className="text-[10px] text-gray-600">Batch No</label>
            <input
              className="w-full border rounded-lg px-2 py-2"
              placeholder="Batch no"
              value={batchNo}
              onChange={(e) => setBatchNo(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white overflow-x-auto">
        {loading ? (
          <div className="p-3 text-[12px] text-slate-500">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="p-3 text-[12px] text-slate-500">No lots</div>
        ) : (
          <table className="min-w-[1200px] w-full text-left text-[12px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2">Item</th>
                <th className="p-2">Batch</th>
                <th className="p-2">Expiry</th>
                <th className="p-2">Serial</th>
                <th className="p-2 text-right">Qty</th>
                <th className="p-2 text-right">Unit Cost</th>
                <th className="p-2">Source</th>
                <th className="p-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.lot_id} className="border-t">
                  <td className="p-2 font-semibold">{r.item_name}</td>
                  <td className="p-2">{r.batch_no || "-"}</td>
                  <td className="p-2">{r.expiry_date || "-"}</td>
                  <td className="p-2">{r.serial_no || "-"}</td>
                  <td className="p-2 text-right font-bold">{Number(r.quantity || 0)}</td>
                  <td className="p-2 text-right">
                    {r.unit_cost == null ? "-" : Number(r.unit_cost || 0).toFixed(2)}
                  </td>
                  <td className="p-2">
                    {r.source_type || "-"} {r.source_ref ? `(${r.source_ref})` : ""}
                  </td>
                  <td className="p-2">{r.created_at || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
