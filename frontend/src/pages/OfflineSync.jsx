import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import authAxios from "../api/authAxios";
import { useToast } from "../components/Toast";
import { modulesToPermMap } from "../utils/navigationMenu";
import {
  getOfflineBills,
  removeOfflineBill,
  clearOfflineBills,
  updateOfflineBill,
  syncOfflineBills,
} from "../utils/offlineBills";
import { saveAs } from "file-saver";

export default function OfflineSync() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [allowed, setAllowed] = useState(null);
  const [canWrite, setCanWrite] = useState(false);

  const [rows, setRows] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    authAxios
      .get("/permissions/my")
      .then((r) => {
        const map = modulesToPermMap(r?.data?.modules);
        setAllowed(Boolean(map?.billing?.can_read));
        setCanWrite(Boolean(map?.billing?.can_write));
      })
      .catch(() => {
        setAllowed(false);
        setCanWrite(false);
      });
  }, []);

  const load = () => setRows(getOfflineBills());

  useEffect(() => {
    if (!allowed) return;
    load();
  }, [allowed]);

  const removeRow = (id) => setRows(removeOfflineBill(id));

  const clearAll = () => {
    clearOfflineBills();
    setRows([]);
  };

  const syncOne = async (row) => {
    if (!canWrite) return showToast("Not allowed", "error");
    try {
      updateOfflineBill(row.id, { lastAttemptAt: new Date().toISOString() });
      const res = await syncOfflineBills({ ids: [row.id], showToast });
      load();
      return res;
    } catch (e) {
      showToast(e?.message || "Sync failed", "error");
      return { ok: false, error: e?.message };
    }
  };

  const syncAll = async () => {
    if (!rows.length) return;
    if (!canWrite) return showToast("Not allowed", "error");
    setSyncing(true);
    try {
      showToast("Syncing offline bills...", "info");
      const res = await syncOfflineBills({ showToast });
      load();
      if (res.failed > 0) {
        showToast(`Sync done: ${res.synced} success, ${res.failed} failed`, "warning");
      } else if (res.synced > 0) {
        showToast(`Sync done: ${res.synced} success`, "success");
      } else if (res.skipped) {
        showToast("No offline bills to sync", "info");
      }
    } finally {
      setSyncing(false);
    }
  };

  const exportCsv = () => {
    if (!rows.length) {
      showToast("No offline bills to export", "info");
      return;
    }
    setExporting(true);
    try {
      const headers = [
        "Created At",
        "Customer",
        "Mobile",
        "Items",
        "Payable",
        "Attempts",
        "Last Error",
      ];
      const lines = rows.map((r) => {
        const pay = Number(r?.payload?.total_amount || 0).toFixed(2);
        const items = Number(r?.payload?.items?.length || 0);
        return [
          r.createdAt || "",
          (r?.payload?.customer_name || "").replace(/"/g, '""'),
          r?.payload?.mobile || "",
          items,
          pay,
          Number(r?.attempts || 0),
          (r?.lastError || "").replace(/"/g, '""'),
        ]
          .map((v) => `"${v}"`)
          .join(",");
      });
      const csv = [headers.join(","), ...lines].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      saveAs(blob, `offline-bills-${new Date().toISOString().slice(0, 10)}.csv`);
    } finally {
      setExporting(false);
    }
  };

  const totalCount = rows.length;
  const totalItems = useMemo(
    () =>
      rows.reduce((sum, r) => sum + Number(r?.payload?.items?.length || 0), 0),
    [rows]
  );

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
        <h2 className="text-lg font-bold text-slate-800">Offline Sync</h2>
        <button
          onClick={load}
          className="px-3 py-1.5 rounded-lg border bg-white shadow-sm text-[12px]"
        >
          Refresh
        </button>
      </div>

      <div className="rounded-xl border bg-white p-4 text-[12px] text-slate-700 flex flex-wrap gap-4">
        <div>
          Pending bills: <span className="font-bold">{totalCount}</span>
        </div>
        <div>
          Total item lines: <span className="font-bold">{totalItems}</span>
        </div>
        {syncing && (
          <div className="text-blue-700 text-[12px] font-semibold flex items-center gap-1">
            <span className="inline-block w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
            Syncing…
          </div>
        )}
        <div className="ml-auto flex gap-2 flex-wrap">
          <button
            onClick={exportCsv}
            disabled={exporting || !rows.length}
            className="px-3 py-1.5 rounded-lg border bg-white shadow-sm text-[12px] disabled:opacity-60"
          >
            {exporting ? "Exporting..." : "Export CSV"}
          </button>
          <button
            onClick={syncAll}
            disabled={!canWrite || syncing || !rows.length}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[12px] disabled:opacity-60"
          >
            {syncing ? "Syncing..." : "Sync All"}
          </button>
          <button
            onClick={clearAll}
            disabled={syncing || !rows.length}
            className="px-3 py-1.5 rounded-lg border text-[12px] disabled:opacity-60"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="rounded-xl border bg-white overflow-x-auto">
        {rows.length === 0 ? (
          <div className="p-3 text-[12px] text-slate-500">No offline bills</div>
        ) : (
          <table className="min-w-[1100px] w-full text-left text-[12px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2">Created</th>
                <th className="p-2">Customer</th>
                <th className="p-2">Mobile</th>
                <th className="p-2 text-right">Items</th>
                <th className="p-2 text-right">Payable</th>
                <th className="p-2 text-right">Attempts</th>
                <th className="p-2">Last Error</th>
                <th className="p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2">
                    {r.createdAt ? new Date(r.createdAt).toLocaleString() : "-"}
                  </td>
                  <td className="p-2 font-semibold">{r?.payload?.customer_name || "-"}</td>
                  <td className="p-2">{r?.payload?.mobile || "-"}</td>
                  <td className="p-2 text-right">{Number(r?.payload?.items?.length || 0)}</td>
                  <td className="p-2 text-right font-bold">
                    {Number(r?.payload?.total_amount || 0).toFixed(2)}
                  </td>
                  <td className="p-2 text-right">{Number(r?.attempts || 0)}</td>
                  <td className="p-2 text-rose-700">{r?.lastError || ""}</td>
                  <td className="p-2 flex items-center gap-2">
                    <button
                      onClick={() => syncOne(r)}
                      disabled={!canWrite || syncing}
                      className="px-2 py-1 rounded border text-[11px] disabled:opacity-60"
                    >
                      Sync
                    </button>
                    <button
                      onClick={() => removeRow(r.id)}
                      disabled={syncing}
                      className="px-2 py-1 rounded border text-[11px] text-rose-600 disabled:opacity-60"
                    >
                      Remove
                    </button>
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
