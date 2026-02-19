import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import authAxios from "../api/authAxios";
import { useToast } from "../components/Toast";
import { getSession } from "../utils/auth";
import { modulesToPermMap } from "../utils/navigationMenu";

export default function StockAudit() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const session = getSession() || {};
  const roleLower = String(session?.role || "").toLowerCase();
  const isAdmin = roleLower === "admin";

  const [allowed, setAllowed] = useState(null);
  const [canWrite, setCanWrite] = useState(false);

  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(session?.branch_id || "");

  const [audits, setAudits] = useState([]);
  const [active, setActive] = useState(null);
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    authAxios
      .get("/permissions/my")
      .then((r) => {
        const map = modulesToPermMap(r?.data?.modules);
        setAllowed(Boolean(map?.stock_audit?.can_read));
        setCanWrite(Boolean(map?.stock_audit?.can_write));
      })
      .catch(() => {
        setAllowed(false);
        setCanWrite(false);
      });
  }, []);

  const loadBranches = async () => {
    if (!isAdmin) return;
    try {
      const res = await authAxios.get("/branch/active");
      setBranches(res.data || []);
    } catch {
      setBranches([]);
    }
  };

  const loadAudits = async () => {
    try {
      const res = await authAxios.get("/stock-audits/", {
        params: { branch_id: isAdmin ? branchId : undefined },
      });
      setAudits(res.data || []);
    } catch {
      setAudits([]);
      showToast("Failed to load audits", "error");
    }
  };

  const loadAudit = async (auditId) => {
    if (!auditId) return setActive(null);
    try {
      const res = await authAxios.get(`/stock-audits/${auditId}`);
      setActive(res.data || null);
    } catch (e) {
      setActive(null);
      showToast(e?.response?.data?.detail || "Failed to load audit", "error");
    }
  };

  useEffect(() => {
    if (!allowed) return;
    loadBranches();
    loadAudits();
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;
    loadAudits();
    setActive(null);
  }, [branchId, allowed]);

  const createAudit = async () => {
    if (!canWrite) return showToast("Not allowed", "error");
    try {
      const res = await authAxios.post("/stock-audits/", {
        branch_id: isAdmin ? Number(branchId) : undefined,
        notes: notes || undefined,
      });
      showToast("Audit created", "success");
      setNotes("");
      await loadAudits();
      if (res?.data?.audit_id) loadAudit(res.data.audit_id);
    } catch (e) {
      showToast(e?.response?.data?.detail || "Create failed", "error");
    }
  };

  const saveCounts = async () => {
    if (!canWrite) return showToast("Not allowed", "error");
    if (!active?.audit_id) return;
    const payload = (active.lines || [])
      .filter((l) => l.counted_qty !== null && l.counted_qty !== undefined && l.counted_qty !== "")
      .map((l) => ({
        item_id: l.item_id,
        counted_qty: Number(l.counted_qty || 0),
        reason: l.reason || undefined,
      }));

    try {
      await authAxios.put(`/stock-audits/${active.audit_id}/count`, payload);
      showToast("Saved", "success");
      loadAudit(active.audit_id);
    } catch (e) {
      showToast(e?.response?.data?.detail || "Save failed", "error");
    }
  };

  const complete = async () => {
    if (!canWrite) return showToast("Not allowed", "error");
    if (!active?.audit_id) return;
    try {
      const res = await authAxios.post(`/stock-audits/${active.audit_id}/complete`);
      showToast(`Completed (adjusted ${res?.data?.adjusted_lines || 0})`, "success");
      loadAudits();
      loadAudit(active.audit_id);
    } catch (e) {
      showToast(e?.response?.data?.detail || "Complete failed", "error");
    }
  };

  const filteredLines = useMemo(() => {
    const s = search.trim().toLowerCase();
    const lines = active?.lines || [];
    const out = s
      ? lines.filter((l) => String(l.item_name || "").toLowerCase().includes(s))
      : lines;
    return out.slice(0, 200);
  }, [active?.lines, search]);

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
        <h2 className="text-lg font-bold text-slate-800">Stock Audit / Cycle Count</h2>
        <button
          onClick={() => {
            loadAudits();
            if (active?.audit_id) loadAudit(active.audit_id);
          }}
          className="px-3 py-1.5 rounded-lg border bg-white shadow-sm text-[12px]"
        >
          Refresh
        </button>
      </div>

      {isAdmin && (
        <div className="flex items-center gap-2 text-[12px]">
          <span className="text-slate-600">Branch</span>
          <select
            className="border rounded-lg px-2 py-1.5 text-[12px]"
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="rounded-xl border bg-white p-4 space-y-2">
          <div className="text-sm font-semibold">Audits</div>
          <div className="space-y-2">
            <textarea
              className="border rounded-lg px-2 py-2 text-[12px] w-full"
              rows={2}
              placeholder="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <button
              onClick={createAudit}
              disabled={!canWrite}
              className="w-full px-4 py-2 rounded-lg bg-emerald-600 text-white text-[12px] disabled:opacity-60"
            >
              Create New Audit
            </button>
          </div>

          <div className="space-y-2 pt-3 border-t">
            {audits.length === 0 ? (
              <div className="text-[12px] text-slate-500">No audits</div>
            ) : (
              audits.map((a) => (
                <button
                  key={a.audit_id}
                  onClick={() => loadAudit(a.audit_id)}
                  className={`w-full text-left rounded-lg border px-3 py-2 text-[12px] hover:bg-gray-50 ${
                    Number(active?.audit_id) === Number(a.audit_id) ? "bg-blue-50 border-blue-200" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{a.audit_number}</div>
                    <div className="text-[11px] text-slate-600">{a.status}</div>
                  </div>
                  <div className="text-[11px] text-slate-500">{a.created_at}</div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="lg:col-span-2 rounded-xl border bg-white p-4 space-y-2 overflow-x-auto">
          {!active ? (
            <div className="text-[12px] text-slate-500">Select an audit</div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">{active.audit_number}</div>
                  <div className="text-[11px] text-slate-500">
                    Status: <span className="font-semibold">{active.status}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={saveCounts}
                    disabled={!canWrite || active.status !== "DRAFT"}
                    className="px-3 py-2 rounded-lg bg-blue-600 text-white text-[12px] disabled:opacity-60"
                  >
                    Save Counts
                  </button>
                  <button
                    onClick={complete}
                    disabled={!canWrite || active.status !== "DRAFT"}
                    className="px-3 py-2 rounded-lg bg-rose-600 text-white text-[12px] disabled:opacity-60"
                  >
                    Complete
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t">
                <input
                  className="border rounded-lg px-2 py-2 text-[12px] w-[260px]"
                  placeholder="Search item..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="text-[11px] text-slate-500">
                  Showing {filteredLines.length} / {active.lines?.length || 0}
                </div>
              </div>

              <table className="min-w-[900px] w-full text-left text-[12px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2">Item</th>
                    <th className="p-2 text-right">System</th>
                    <th className="p-2 text-right">Counted</th>
                    <th className="p-2 text-right">Diff</th>
                    <th className="p-2">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLines.map((l) => (
                    <tr key={l.item_id} className="border-t">
                      <td className="p-2 font-semibold">{l.item_name}</td>
                      <td className="p-2 text-right">{Number(l.system_qty || 0)}</td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          className="border rounded px-2 py-1 w-24 text-right"
                          disabled={active.status !== "DRAFT"}
                          value={l.counted_qty ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            setActive((prev) => {
                              const lines = (prev?.lines || []).map((x) =>
                                x.item_id === l.item_id ? { ...x, counted_qty: v } : x
                              );
                              return { ...prev, lines };
                            });
                          }}
                        />
                      </td>
                      <td className="p-2 text-right font-bold">
                        {l.counted_qty === null || l.counted_qty === undefined || l.counted_qty === ""
                          ? "-"
                          : Number(l.counted_qty || 0) - Number(l.system_qty || 0)}
                      </td>
                      <td className="p-2">
                        <input
                          className="border rounded px-2 py-1 w-full"
                          disabled={active.status !== "DRAFT"}
                          value={l.reason ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            setActive((prev) => {
                              const lines = (prev?.lines || []).map((x) =>
                                x.item_id === l.item_id ? { ...x, reason: v } : x
                              );
                              return { ...prev, lines };
                            });
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
