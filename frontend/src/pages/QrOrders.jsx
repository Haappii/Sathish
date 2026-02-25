import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../utils/apiClient";
import { printDirectText } from "../utils/printDirect";
import { useToast } from "../components/Toast";
import { getSession } from "../utils/auth";

const BLUE = "#0B3C8C";

export default function QrOrders() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const kotPrintRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [printCfg, setPrintCfg] = useState({ kot_required: true, receipt_required: true });

  const load = async () => {
    try {
      const res = await api.get("/qr-orders/pending");
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch {
      setRows([]);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const s = getSession() || {};
        if (s?.branch_id) {
          const br = await api.get(`/branch/${s.branch_id}`);
          if (mounted) {
            setPrintCfg({
              kot_required: Boolean(br?.data?.kot_required ?? true),
              receipt_required: Boolean(br?.data?.receipt_required ?? true),
            });
          }
        }
      } catch {
        // ignore; keep defaults
      }
      await load();
      if (mounted) setLoading(false);
    })();

    const t = setInterval(load, 5000);
    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, []);

  const pendingCount = rows.length;

  const generateKOTText = ({ tableName, items }) => {
    const WIDTH = 32;
    const NAME_COL = 22;
    const COUNT_COL = 8;
    const line = "-".repeat(WIDTH);
    const center = (txt) =>
      " ".repeat(Math.max(0, Math.floor((WIDTH - txt.length) / 2))) + txt;
    const rightCol = (txt, width) =>
      " ".repeat(Math.max(0, width - txt.length)) + txt;

    let t = "";
    t += center("KOT") + "\n";
    t += center(new Date().toLocaleString()) + "\n";
    t += center(tableName ? `Table ${tableName}` : "Table Billing") + "\n";
    t += line + "\n";
    t += "Item Name".padEnd(NAME_COL) + rightCol("Count", COUNT_COL) + "\n";
    t += line + "\n";

    const rows = Array.isArray(items) ? items : [];
    rows.forEach((it) => {
      const name = String(it.item_name || "").slice(0, NAME_COL).padEnd(NAME_COL);
      const count = String(Number(it.quantity || 0));
      t += name + rightCol(count, COUNT_COL) + "\n";
    });
    t += line + "\n";
    const totalCount = rows.reduce((sum, it) => sum + Number(it.quantity || 0), 0);
    t += center(`Total Count - ${totalCount}`) + "\n";
    t += line + "\n";
    return t;
  };

  const printKOT = async ({ tableName, items }) => {
    const it = (Array.isArray(items) ? items : []).filter((x) => Number(x.quantity || 0) > 0);
    if (!it.length) return;
    const ok = await printDirectText(generateKOTText({ tableName, items: it }));
    if (!ok) showToast("Printing failed. Check printer/popup settings.", "error");
  };

  const accept = async (id) => {
    if (busyId) return;
    setBusyId(id);
    try {
      const res = await api.post(`/qr-orders/${id}/accept`);
      const data = res.data || {};
      if (printCfg.kot_required) {
        await printKOT({
          tableName: data.table_name,
          items: data.items || [],
        });
        showToast("Order accepted and KOT printed", "success");
      } else {
        showToast("Order accepted", "success");
      }
      await load();
    } catch (e) {
      showToast(e?.response?.data?.detail || "Failed to accept order", "error");
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (id) => {
    if (busyId) return;
    const ok = window.confirm("Reject this order?");
    if (!ok) return;
    setBusyId(id);
    try {
      await api.post(`/qr-orders/${id}/reject`);
      showToast("Order rejected", "success");
      await load();
    } catch (e) {
      showToast(e?.response?.data?.detail || "Failed to reject order", "error");
    } finally {
      setBusyId(null);
    }
  };

  const grouped = useMemo(() => {
    const by = {};
    for (const r of rows || []) {
      const key = String(r.table_id || "0");
      if (!by[key]) by[key] = [];
      by[key].push(r);
    }
    return Object.values(by).sort((a, b) => {
      const ta = a?.[0]?.table_name || "";
      const tb = b?.[0]?.table_name || "";
      return String(ta).localeCompare(String(tb));
    });
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-slate-800">QR Orders</div>
          <div className="text-xs text-slate-500">
            Pending: <span className="font-semibold">{pendingCount}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate("/table-billing")}
          className="px-3 py-2 rounded-lg border text-[12px] hover:bg-slate-50"
        >
          Back to Tables
        </button>
      </div>

      <div ref={kotPrintRef} className="hidden" />

      {loading ? (
        <div className="text-sm text-slate-500">Loading...</div>
      ) : pendingCount === 0 ? (
        <div className="bg-white border rounded-2xl shadow p-4 text-sm text-slate-600">
          No pending QR orders.
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map((list) => {
            const tableName = list?.[0]?.table_name;
            const tableId = list?.[0]?.table_id;
            return (
              <div key={String(tableId)} className="bg-white border rounded-2xl shadow p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-slate-800">
                    {tableName ? `Table ${tableName}` : `Table #${tableId}`}
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(`/table-order/${tableId}`)}
                    className="px-3 py-1.5 rounded-lg text-white text-[12px]"
                    style={{ background: BLUE }}
                  >
                    Open Table
                  </button>
                </div>

                <div className="space-y-2">
                  {list.map((r) => (
                    <div key={r.qr_order_id} className="border rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-800">
                          Order #{r.qr_order_id}
                        </div>
                        <div className="text-[12px] text-slate-500">
                          {r.customer_name || "Customer"} • {r.mobile || ""} {r.email ? `• ${r.email}` : ""}
                        </div>
                        <div className="mt-2 text-[12px] text-slate-700">
                          {(r.items || []).map((it) => (
                            <div key={it.item_id} className="flex justify-between gap-3">
                              <span className="truncate">{it.item_name}</span>
                              <span className="font-semibold">× {it.quantity}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => reject(r.qr_order_id)}
                          disabled={busyId === r.qr_order_id}
                          className="px-3 py-2 rounded-lg border text-[12px] hover:bg-slate-50 disabled:opacity-60"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={() => accept(r.qr_order_id)}
                          disabled={busyId === r.qr_order_id}
                          className="px-3 py-2 rounded-lg text-white text-[12px] disabled:opacity-60"
                          style={{ background: BLUE }}
                        >
                          {printCfg.kot_required ? "Accept + Print KOT" : "Accept"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
