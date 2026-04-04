import { useEffect, useMemo, useState } from "react";
import authAxios from "../api/authAxios";
import { useToast } from "../components/Toast";
import { getSession } from "../utils/auth";
import { modulesToPermMap } from "../utils/navigationMenu";
import BackButton from "../components/BackButton";
import { FaClipboardList, FaPlus, FaCheck } from "react-icons/fa";
import { MdOutlineInventory2 } from "react-icons/md";

const BLUE = "#0B3C8C";

export default function StockAudit() {
  const { showToast } = useToast();
  const session = getSession() || {};
  const isAdmin = String(session?.role || "").toLowerCase() === "admin";

  const [allowed, setAllowed] = useState(null);
  const [canWrite, setCanWrite] = useState(false);
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(session?.branch_id || "");
  const [audits, setAudits] = useState([]);
  const [active, setActive] = useState(null);
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    authAxios.get("/permissions/my")
      .then(r => {
        const map = modulesToPermMap(r?.data?.modules);
        setAllowed(Boolean(map?.stock_audit?.can_read));
        setCanWrite(Boolean(map?.stock_audit?.can_write));
      })
      .catch(() => { setAllowed(false); setCanWrite(false); });
  }, []);

  const loadBranches = async () => {
    if (!isAdmin) return;
    try { const res = await authAxios.get("/branch/active"); setBranches(res.data || []); }
    catch { setBranches([]); }
  };

  const loadAudits = async () => {
    try {
      const res = await authAxios.get("/stock-audits/", { params: { branch_id: isAdmin ? branchId : undefined } });
      setAudits(res.data || []);
    } catch {
      setAudits([]);
      showToast("Failed to load audits", "error");
    }
  };

  const loadAudit = async auditId => {
    if (!auditId) return setActive(null);
    try { const res = await authAxios.get(`/stock-audits/${auditId}`); setActive(res.data || null); }
    catch (e) { setActive(null); showToast(e?.response?.data?.detail || "Failed to load audit", "error"); }
  };

  useEffect(() => { if (!allowed) return; loadBranches(); loadAudits(); }, [allowed]);
  useEffect(() => { if (!allowed) return; loadAudits(); setActive(null); }, [branchId, allowed]);

  const createAudit = async () => {
    if (!canWrite) return showToast("Not allowed", "error");
    try {
      const res = await authAxios.post("/stock-audits/", { branch_id: isAdmin ? Number(branchId) : undefined, notes: notes || undefined });
      showToast("Audit created", "success");
      setNotes("");
      await loadAudits();
      if (res?.data?.audit_id) loadAudit(res.data.audit_id);
    } catch (e) { showToast(e?.response?.data?.detail || "Create failed", "error"); }
  };

  const saveCounts = async () => {
    if (!canWrite) return showToast("Not allowed", "error");
    if (!active?.audit_id) return;
    const payload = (active.lines || [])
      .filter(l => l.counted_qty !== null && l.counted_qty !== undefined && l.counted_qty !== "")
      .map(l => ({ item_id: l.item_id, counted_qty: Number(l.counted_qty || 0), reason: l.reason || undefined }));
    try {
      await authAxios.put(`/stock-audits/${active.audit_id}/count`, payload);
      showToast("Saved", "success");
      loadAudit(active.audit_id);
    } catch (e) { showToast(e?.response?.data?.detail || "Save failed", "error"); }
  };

  const complete = async () => {
    if (!canWrite) return showToast("Not allowed", "error");
    if (!active?.audit_id) return;
    try {
      const res = await authAxios.post(`/stock-audits/${active.audit_id}/complete`);
      showToast(`Completed (adjusted ${res?.data?.adjusted_lines || 0})`, "success");
      loadAudits();
      loadAudit(active.audit_id);
    } catch (e) { showToast(e?.response?.data?.detail || "Complete failed", "error"); }
  };

  const filteredLines = useMemo(() => {
    const s = search.trim().toLowerCase();
    const lines = active?.lines || [];
    const out = s ? lines.filter(l => String(l.item_name || "").toLowerCase().includes(s)) : lines;
    return out.slice(0, 200);
  }, [active?.lines, search]);

  if (allowed === null) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><p className="text-sm text-slate-500">Loading…</p></div>;
  }
  if (!allowed) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl border border-red-100 p-8 text-center max-w-sm">
          <FaClipboardList size={32} className="mx-auto mb-3 text-red-400" />
          <p className="font-semibold text-slate-800">Access Denied</p>
          <p className="text-sm text-slate-500 mt-1">You are not authorized to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-4">
          <BackButton />
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${BLUE}15` }}>
              <MdOutlineInventory2 size={20} style={{ color: BLUE }} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">Stock Audit</h1>
              <p className="text-xs text-slate-500">Cycle count & inventory adjustment</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {isAdmin && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Branch</span>
                <select className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 transition" value={branchId} onChange={e => setBranchId(Number(e.target.value))}>
                  {branches.map(b => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}
                </select>
              </div>
            )}
            <button onClick={() => { loadAudits(); if (active?.audit_id) loadAudit(active.audit_id); }} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition">
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-[300px,1fr] gap-6">
        {/* Left: audit list + create */}
        <div className="space-y-4">
          {/* Create */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <span className="font-semibold text-sm text-slate-800">New Audit</span>
            </div>
            <div className="p-4 space-y-3">
              <textarea
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition resize-none"
                rows={2}
                placeholder="Notes (optional)"
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
              <button onClick={createAudit} disabled={!canWrite} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-white text-sm font-semibold shadow-sm hover:opacity-90 transition disabled:opacity-60" style={{ background: BLUE }}>
                <FaPlus size={11} /> Create Audit
              </button>
            </div>
          </div>

          {/* Audit list */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <span className="font-semibold text-sm text-slate-800">Audits</span>
              <span className="text-xs text-slate-400">{audits.length}</span>
            </div>
            <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
              {audits.length === 0 && <p className="p-4 text-sm text-slate-400 text-center">No audits yet</p>}
              {audits.map(a => (
                <button key={a.audit_id} onClick={() => loadAudit(a.audit_id)} className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition ${Number(active?.audit_id) === Number(a.audit_id) ? "bg-blue-50 border-l-2 border-blue-500" : ""}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-slate-800">{a.audit_number}</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${a.status === "COMPLETED" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-amber-50 text-amber-700 border border-amber-100"}`}>
                      {a.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{a.created_at}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: audit detail */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {!active ? (
            <div className="flex flex-col items-center justify-center h-full py-24 text-center">
              <FaClipboardList size={36} className="text-slate-200 mb-3" />
              <p className="text-sm text-slate-400">Select an audit to view details</p>
            </div>
          ) : (
            <>
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-slate-800">{active.audit_number}</h2>
                  <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full ${active.status === "COMPLETED" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-amber-50 text-amber-700 border border-amber-100"}`}>
                    {active.status}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button onClick={saveCounts} disabled={!canWrite || active.status !== "DRAFT"} className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold bg-blue-600 hover:bg-blue-700 transition disabled:opacity-50">
                    Save Counts
                  </button>
                  <button onClick={complete} disabled={!canWrite || active.status !== "DRAFT"} className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 transition disabled:opacity-50">
                    <FaCheck size={11} /> Complete
                  </button>
                </div>
              </div>

              <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3">
                <div className="relative flex-1 max-w-xs">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                  </svg>
                  <input className="w-full border border-slate-200 rounded-xl pl-8 pr-4 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition" placeholder="Search item…" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <span className="text-xs text-slate-400">{filteredLines.length} / {active.lines?.length || 0}</span>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-[800px] w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Item</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">System Qty</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">Counted Qty</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">Diff</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredLines.map(l => {
                      const diff = (l.counted_qty === null || l.counted_qty === undefined || l.counted_qty === "")
                        ? null
                        : Number(l.counted_qty || 0) - Number(l.system_qty || 0);
                      return (
                        <tr key={l.item_id} className="hover:bg-slate-50 transition">
                          <td className="px-4 py-2.5 font-medium text-slate-800">{l.item_name}</td>
                          <td className="px-4 py-2.5 text-right text-slate-600">{Number(l.system_qty || 0)}</td>
                          <td className="px-4 py-2.5 text-right">
                            <input
                              type="number"
                              className="w-24 border border-slate-200 rounded-lg px-2 py-1.5 text-right text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition"
                              disabled={active.status !== "DRAFT"}
                              value={l.counted_qty ?? ""}
                              onChange={e => {
                                const v = e.target.value;
                                setActive(prev => ({ ...prev, lines: (prev?.lines || []).map(x => x.item_id === l.item_id ? { ...x, counted_qty: v } : x) }));
                              }}
                            />
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {diff === null ? <span className="text-slate-300">—</span> : (
                              <span className={`font-bold ${diff > 0 ? "text-emerald-600" : diff < 0 ? "text-red-600" : "text-slate-500"}`}>
                                {diff > 0 ? `+${diff}` : diff}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <input
                              className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition"
                              disabled={active.status !== "DRAFT"}
                              value={l.reason ?? ""}
                              onChange={e => {
                                const v = e.target.value;
                                setActive(prev => ({ ...prev, lines: (prev?.lines || []).map(x => x.item_id === l.item_id ? { ...x, reason: v } : x) }));
                              }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
