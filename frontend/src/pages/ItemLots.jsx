import { useEffect, useState } from "react";
import authAxios from "../api/authAxios";
import { useToast } from "../components/Toast";
import { getSession } from "../utils/auth";
import { modulesToPermMap } from "../utils/navigationMenu";
import BackButton from "../components/BackButton";
import { FaBoxes } from "react-icons/fa";

const BLUE = "#0B3C8C";

export default function ItemLots() {
  const { showToast } = useToast();
  const session = getSession() || {};
  const isAdmin = String(session?.role || "").toLowerCase() === "admin";

  const [allowed, setAllowed] = useState(null);
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(session?.branch_id || "");
  const [items, setItems] = useState([]);
  const [itemId, setItemId] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authAxios.get("/permissions/my")
      .then(r => {
        const map = modulesToPermMap(r?.data?.modules);
        setAllowed(Boolean(map?.item_lots?.can_read));
      })
      .catch(() => setAllowed(false));
  }, []);

  const loadBranches = async () => {
    if (!isAdmin) return;
    try { const res = await authAxios.get("/branch/active"); setBranches(res.data || []); }
    catch { setBranches([]); }
  };

  const loadItems = async () => {
    try {
      const res = await authAxios.get("/items/");
      setItems((res.data || []).filter(it => !it?.is_raw_material));
    } catch { setItems([]); }
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
    } finally { setLoading(false); }
  };

  useEffect(() => { if (!allowed) return; loadBranches(); loadItems(); }, [allowed]);
  useEffect(() => { if (!allowed) return; loadLots(); }, [allowed, branchId, itemId, batchNo]);

  if (allowed === null) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><p className="text-sm text-slate-500">Loading…</p></div>;
  }
  if (!allowed) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl border border-red-100 p-8 text-center max-w-sm">
          <FaBoxes size={32} className="mx-auto mb-3 text-red-400" />
          <p className="font-semibold text-slate-800">Access Denied</p>
          <p className="text-sm text-slate-500 mt-1">You are not authorized to access this page.</p>
        </div>
      </div>
    );
  }

  const selectClass = "border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-4">
          <BackButton />
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${BLUE}15` }}>
              <FaBoxes size={16} style={{ color: BLUE }} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">Batch / Expiry / Serial Lots</h1>
              <p className="text-xs text-slate-500">{rows.length} lot{rows.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <button onClick={loadLots} className="ml-auto px-4 py-2 rounded-xl text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition">
            Refresh
          </button>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Filters */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex flex-wrap gap-3 items-end">
            {isAdmin && (
              <div className="space-y-1.5 min-w-[200px]">
                <label className="text-xs font-semibold text-slate-600">Branch</label>
                <select className={selectClass} value={branchId} onChange={e => setBranchId(Number(e.target.value))}>
                  {branches.map(b => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}
                </select>
              </div>
            )}
            <div className="space-y-1.5 min-w-[240px] flex-1">
              <label className="text-xs font-semibold text-slate-600">Item</label>
              <select className={selectClass} value={itemId} onChange={e => setItemId(e.target.value)}>
                <option value="">All items</option>
                {items.map(i => <option key={i.item_id} value={i.item_id}>{i.item_name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5 min-w-[180px]">
              <label className="text-xs font-semibold text-slate-600">Batch No</label>
              <input
                className={selectClass}
                placeholder="Search batch…"
                value={batchNo}
                onChange={e => setBatchNo(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-400">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center">
              <FaBoxes size={32} className="mx-auto mb-3 text-slate-200" />
              <p className="text-sm text-slate-400">No lots found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[900px] w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {["Item", "Batch", "Expiry", "Serial", "Qty", "Unit Cost", "Source", "Created"].map(h => (
                      <th key={h} className={`px-4 py-3 text-xs font-semibold text-slate-600 ${["Qty", "Unit Cost"].includes(h) ? "text-right" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map(r => (
                    <tr key={r.lot_id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 font-medium text-slate-800">{r.item_name}</td>
                      <td className="px-4 py-3 text-slate-600">{r.batch_no || <span className="text-slate-300">—</span>}</td>
                      <td className="px-4 py-3">
                        {r.expiry_date ? (
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${new Date(r.expiry_date) < new Date() ? "bg-red-50 text-red-600 border border-red-100" : "bg-emerald-50 text-emerald-700 border border-emerald-100"}`}>
                            {r.expiry_date}
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{r.serial_no || <span className="text-slate-300">—</span>}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-800">{Number(r.quantity || 0)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {r.unit_cost == null ? <span className="text-slate-300">—</span> : Number(r.unit_cost || 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs">
                        {r.source_type || "—"}{r.source_ref ? ` (${r.source_ref})` : ""}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{r.created_at || "—"}</td>
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
