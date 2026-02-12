import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import authAxios from "../api/authAxios";
import { useToast } from "../components/Toast";
import { getSession } from "../utils/auth";

export default function StockTransfers() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const session = getSession() || {};

  const roleLower = String(session?.role || "").toLowerCase();
  const isAdmin = roleLower === "admin";
  const isManager = roleLower === "manager";

  const [loading, setLoading] = useState(true);
  const [transfers, setTransfers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [items, setItems] = useState([]);

  const [create, setCreate] = useState({
    to_branch_id: "",
    notes: "",
    items: [{ item_id: "", quantity: "" }]
  });

  const branchName = useMemo(() => {
    const map = {};
    branches.forEach(b => { map[b.branch_id] = b.branch_name; });
    return map;
  }, [branches]);

  const load = async () => {
    setLoading(true);
    try {
      const [resTransfers, resBranches, resItems] = await Promise.all([
        authAxios.get("/stock-transfers/list"),
        authAxios.get(isAdmin ? "/branch/list" : "/branch/active"),
        authAxios.get("/items/")
      ]);
      setTransfers(resTransfers.data || []);
      setBranches(resBranches.data || []);
      setItems(resItems.data || []);
    } catch {
      showToast("Failed to load transfers", "error");
      setTransfers([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const setItemRow = (idx, patch) => {
    setCreate(prev => {
      const next = { ...prev, items: [...prev.items] };
      next.items[idx] = { ...next.items[idx], ...patch };
      return next;
    });
  };

  const addRow = () => setCreate(prev => ({ ...prev, items: [...prev.items, { item_id: "", quantity: "" }] }));
  const removeRow = idx => setCreate(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));

  const submit = async () => {
    const toId = Number(create.to_branch_id || 0);
    if (!toId) return showToast("Select To branch", "error");

    const payloadItems = create.items
      .map(x => ({ item_id: Number(x.item_id || 0), quantity: Number(x.quantity || 0) }))
      .filter(x => x.item_id && x.quantity > 0);

    if (payloadItems.length === 0) return showToast("Add items", "error");

    try {
      await authAxios.post("/stock-transfers/", {
        to_branch_id: toId,
        notes: create.notes || null,
        items: payloadItems
      });
      showToast("Transfer requested", "success");
      setCreate({ to_branch_id: "", notes: "", items: [{ item_id: "", quantity: "" }] });
      load();
    } catch (err) {
      const msg = err?.response?.data?.detail || "Create failed";
      showToast(msg, "error");
    }
  };

  const action = async (id, fn) => {
    try {
      await fn();
      showToast("Updated", "success");
      load();
    } catch (err) {
      const msg = err?.response?.data?.detail || "Action failed";
      showToast(msg, "error");
    }
  };

  const currentBranchId = Number(session?.branch_id || 0);

  return (
    <div className="bg-gray-100 min-h-screen p-3 space-y-3 text-[11px]">

      <div className="flex items-center justify-between bg-white border rounded-lg px-3 py-2">
        <button
          onClick={() => navigate("/home", { replace: true })}
          className="text-gray-600 hover:text-black"
        >
          &larr; Back
        </button>
        <div className="font-bold text-sm">Stock Transfers</div>
        <button
          onClick={load}
          className="px-3 py-1.5 rounded-lg bg-blue-600 text-white shadow"
        >
          Refresh
        </button>
      </div>

      <div className="bg-white border rounded-lg p-3 space-y-2">
        <div className="font-semibold">Create Transfer</div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-gray-600">To Branch</label>
            <select
              className="w-full border rounded-lg px-2 py-1"
              value={create.to_branch_id}
              onChange={e => setCreate(prev => ({ ...prev, to_branch_id: e.target.value }))}
            >
              <option value="">Select</option>
              {branches
                .filter(b => Number(b.branch_id) !== currentBranchId)
                .map(b => (
                  <option key={b.branch_id} value={b.branch_id}>
                    {b.branch_name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-gray-600">Notes (optional)</label>
            <input
              className="w-full border rounded-lg px-2 py-1"
              value={create.notes}
              onChange={e => setCreate(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Reason / remarks..."
            />
          </div>
        </div>

        <div className="space-y-2">
          {create.items.map((r, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_120px_80px] gap-2 items-end">
              <div>
                <label className="text-[10px] text-gray-600">Item</label>
                <select
                  className="w-full border rounded-lg px-2 py-1"
                  value={r.item_id}
                  onChange={e => setItemRow(idx, { item_id: e.target.value })}
                >
                  <option value="">Select item</option>
                  {items.map(i => (
                    <option key={i.item_id} value={i.item_id}>
                      {i.item_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-gray-600">Qty</label>
                <input
                  type="number"
                  className="w-full border rounded-lg px-2 py-1"
                  value={r.quantity}
                  onChange={e => setItemRow(idx, { quantity: e.target.value })}
                  placeholder="0"
                />
              </div>
              <button
                onClick={() => removeRow(idx)}
                disabled={create.items.length === 1}
                className="px-3 py-1.5 rounded-lg border bg-white shadow"
              >
                Remove
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <button
              onClick={addRow}
              className="px-3 py-1.5 rounded-lg border bg-white shadow"
            >
              + Add Item
            </button>
            <button
              onClick={submit}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white shadow"
            >
              Request Transfer
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white border rounded-lg overflow-x-auto">
        {loading ? (
          <div className="p-3 text-gray-500">Loading...</div>
        ) : transfers.length === 0 ? (
          <div className="p-3 text-gray-500">No transfers</div>
        ) : (
          <table className="min-w-[900px] w-full text-left">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2">Transfer</th>
                <th className="p-2">From</th>
                <th className="p-2">To</th>
                <th className="p-2">Status</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map(t => (
                <tr key={t.transfer_id} className="border-t">
                  <td className="p-2 font-semibold">{t.transfer_number}</td>
                  <td className="p-2">{branchName[t.from_branch_id] || t.from_branch_id}</td>
                  <td className="p-2">{branchName[t.to_branch_id] || t.to_branch_id}</td>
                  <td className="p-2">{t.status}</td>
                  <td className="p-2">
                    <div className="flex gap-2 flex-wrap">
                      {isAdmin && t.status === "REQUESTED" && (
                        <>
                          <button
                            onClick={() => action(t.transfer_id, () => authAxios.post(`/stock-transfers/${t.transfer_id}/approve`))}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white shadow"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => action(t.transfer_id, () => authAxios.post(`/stock-transfers/${t.transfer_id}/reject`))}
                            className="px-3 py-1.5 rounded-lg bg-rose-600 text-white shadow"
                          >
                            Reject
                          </button>
                        </>
                      )}

                      {(isAdmin || (isManager && Number(t.from_branch_id) === currentBranchId)) && t.status === "APPROVED" && (
                        <button
                          onClick={() => action(t.transfer_id, () => authAxios.post(`/stock-transfers/${t.transfer_id}/dispatch`))}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 text-white shadow"
                        >
                          Dispatch
                        </button>
                      )}

                      {(isAdmin || (isManager && Number(t.to_branch_id) === currentBranchId)) && t.status === "DISPATCHED" && (
                        <button
                          onClick={() => action(t.transfer_id, () => authAxios.post(`/stock-transfers/${t.transfer_id}/receive`))}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white shadow"
                        >
                          Receive
                        </button>
                      )}

                      {isAdmin && (t.status === "REQUESTED" || t.status === "APPROVED") && (
                        <button
                          onClick={() => action(t.transfer_id, () => authAxios.post(`/stock-transfers/${t.transfer_id}/cancel`))}
                          className="px-3 py-1.5 rounded-lg border bg-white shadow"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
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
