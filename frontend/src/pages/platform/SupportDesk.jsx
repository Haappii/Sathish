import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import platformAxios from "../../api/platformAxios";
import { getPlatformToken, clearPlatformToken } from "../../utils/platformAuth";
import { useToast } from "../../components/Toast";

const STATUS_OPTIONS = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];
const TYPE_OPTIONS = ["DEMO", "BUG", "REQUEST", "OUTAGE", "OTHER"];

const STATUS_CONFIG = {
  OPEN:        { color: "bg-amber-500/20 border-amber-500/30 text-amber-200",   dot: "bg-amber-400",   label: "Open" },
  IN_PROGRESS: { color: "bg-blue-500/20 border-blue-500/30 text-blue-200",     dot: "bg-blue-400",    label: "In Progress" },
  RESOLVED:    { color: "bg-emerald-500/20 border-emerald-500/30 text-emerald-200", dot: "bg-emerald-400", label: "Resolved" },
  CLOSED:      { color: "bg-slate-500/20 border-slate-500/30 text-slate-300",  dot: "bg-slate-400",   label: "Closed" },
};

const TYPE_CONFIG = {
  DEMO:    { color: "bg-violet-500/20 text-violet-200",  icon: "🎬" },
  BUG:     { color: "bg-red-500/20 text-red-200",        icon: "🐛" },
  REQUEST: { color: "bg-cyan-500/20 text-cyan-200",      icon: "💬" },
  OUTAGE:  { color: "bg-orange-500/20 text-orange-200",  icon: "⚡" },
  OTHER:   { color: "bg-slate-500/20 text-slate-200",    icon: "📋" },
};

function fmtRelTime(val) {
  if (!val) return "";
  const d = new Date(val);
  if (isNaN(d)) return val;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

export default function SupportDesk() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const token = getPlatformToken();

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [filters, setFilters] = useState({ status: "OPEN", type: "", q: "" });
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!token) navigate("/platform/login", { replace: true });
  }, [token, navigate]);

  const load = async () => {
    try {
      setLoading(true);
      const res = await platformAxios.get("/platform/support/tickets", { params: { limit: 400 } });
      setTickets(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      showToast(e?.response?.data?.detail || "Failed to load tickets", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    return tickets.filter((t) => {
      const statusOk = filters.status ? String(t.status || "").toUpperCase() === filters.status : true;
      const typeOk = filters.type ? String(t.ticket_type || "").toUpperCase() === filters.type : true;
      const q = filters.q.trim().toLowerCase();
      const text = `${t.message || ""} ${t.user_name || ""} ${t.shop_name || ""} ${t.email || ""}`.toLowerCase();
      const qOk = q ? text.includes(q) : true;
      return statusOk && typeOk && qOk;
    });
  }, [tickets, filters]);

  const statusCounts = useMemo(() => {
    const counts = {};
    STATUS_OPTIONS.forEach((s) => { counts[s] = tickets.filter((t) => String(t.status || "").toUpperCase() === s).length; });
    return counts;
  }, [tickets]);

  const setStatus = async (ticketId, newStatus) => {
    if (busyId) return;
    setBusyId(ticketId);
    try {
      await platformAxios.post(`/platform/support/tickets/${ticketId}/status`, null, {
        params: { new_status: newStatus },
      });
      showToast("Status updated", "success");
      setSelected((s) => s ? { ...s, status: newStatus } : null);
      setTickets((prev) => prev.map((t) => t.ticket_id === ticketId ? { ...t, status: newStatus } : t));
    } catch (e) {
      showToast(e?.response?.data?.detail || "Update failed", "error");
    } finally {
      setBusyId(null);
    }
  };

  const logout = () => {
    clearPlatformToken();
    navigate("/platform/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">

        {/* ── HEADER ── */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-500/30 flex items-center justify-center text-lg">
              🎧
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-widest font-medium">Platform</p>
              <h1 className="text-2xl font-bold text-white">Support Desk</h1>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => navigate("/platform/dashboard")}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/8 hover:bg-white/15 border border-white/10 text-sm transition"
            >
              ← Dashboard
            </button>
            <button
              onClick={load}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/8 hover:bg-white/15 border border-white/10 text-sm transition"
            >
              ↻ Refresh
            </button>
            <button
              onClick={logout}
              className="px-4 py-2 rounded-xl bg-red-500/80 hover:bg-red-500 border border-red-400/20 text-sm transition"
            >
              Logout
            </button>
          </div>
        </header>

        {/* ── STATUS SUMMARY PILLS ── */}
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((s) => {
            const cfg = STATUS_CONFIG[s] || {};
            const active = filters.status === s;
            return (
              <button
                key={s}
                onClick={() => setFilters((f) => ({ ...f, status: active ? "" : s }))}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition ${
                  active
                    ? cfg.color + " ring-1 ring-white/20"
                    : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot || "bg-slate-400"}`} />
                {cfg.label || s}
                <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${active ? "bg-white/20" : "bg-white/10"}`}>
                  {statusCounts[s] || 0}
                </span>
              </button>
            );
          })}
          <div className="ml-auto text-xs text-slate-400 self-center">
            <span className="font-semibold text-white">{filtered.length}</span> / {tickets.length} tickets
          </div>
        </div>

        {/* ── FILTER BAR ── */}
        <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-3 flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">Type</label>
            <select
              className="mt-1 block rounded-xl px-3 py-2 bg-slate-900/80 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={filters.type}
              onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
            >
              {["", ...TYPE_OPTIONS].map((s) => (
                <option key={s || "ALL"} value={s}>{s || "All Types"}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">Search</label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">🔍</span>
              <input
                className="w-full rounded-xl pl-7 pr-3 py-2 bg-slate-900/80 border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Search message, user, shop..."
                value={filters.q}
                onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              />
            </div>
          </div>
          {(filters.status || filters.type || filters.q) && (
            <button
              onClick={() => setFilters({ status: "", type: "", q: "" })}
              className="px-3 py-2 rounded-xl bg-white/8 hover:bg-white/15 border border-white/10 text-xs text-slate-300 transition self-end"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* ── TICKET GRID ── */}
        {loading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3 animate-pulse">
                <div className="flex justify-between">
                  <div className="h-3 w-16 bg-white/10 rounded-full" />
                  <div className="h-3 w-20 bg-white/10 rounded-full" />
                </div>
                <div className="h-4 w-3/4 bg-white/10 rounded-full" />
                <div className="h-3 w-1/2 bg-white/10 rounded-full" />
                <div className="h-10 bg-white/5 rounded-xl" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="text-5xl opacity-30">🎫</div>
            <p className="text-slate-300 font-medium">No tickets match your filters</p>
            <p className="text-sm text-slate-500">Try adjusting the status or search criteria</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((t) => {
              const statusCfg = STATUS_CONFIG[String(t.status || "").toUpperCase()] || STATUS_CONFIG.OPEN;
              const typeCfg = TYPE_CONFIG[String(t.ticket_type || "").toUpperCase()] || TYPE_CONFIG.OTHER;
              return (
                <div
                  key={t.ticket_id}
                  className="group relative border border-white/10 rounded-2xl bg-white/5 hover:bg-white/8 hover:border-white/20 transition cursor-pointer overflow-hidden"
                  onClick={() => setSelected(t)}
                >
                  {/* status accent bar */}
                  <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${statusCfg.dot}`} />

                  <div className="p-4 pl-5">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] text-slate-500 font-mono">#{t.ticket_id}</span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${typeCfg.color}`}>
                          {typeCfg.icon} {t.ticket_type || "TICKET"}
                        </span>
                      </div>
                      <StatusPill status={t.status} />
                    </div>

                    <div className="text-sm font-semibold text-white mb-0.5 truncate">
                      {t.shop_name || "Unknown Shop"}
                      {t.branch_name ? <span className="text-slate-400 font-normal"> · {t.branch_name}</span> : null}
                    </div>
                    <div className="text-xs text-slate-400 mb-3">
                      {t.user_name || "User"}
                      {t.email ? ` · ${t.email}` : ""}
                    </div>

                    <p className="text-sm text-slate-300 line-clamp-2 leading-relaxed whitespace-pre-wrap">
                      {t.message || "—"}
                    </p>

                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-[11px] text-slate-500">
                        {fmtRelTime(t.created_on)}
                      </span>
                      {t.attachment_path ? (
                        <a
                          className="text-[11px] text-blue-400 hover:text-blue-300 hover:underline"
                          href={`/api/platform/support/tickets/${t.ticket_id}/attachment`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          📎 Attachment
                        </a>
                      ) : (
                        <span className="text-[11px] text-slate-600">No attachment</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── DETAIL PANEL ── */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-end"
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-lg h-full bg-slate-900 border-l border-white/10 overflow-y-auto flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* panel header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 sticky top-0 bg-slate-900 z-10">
              <div>
                <p className="text-xs text-slate-500 font-mono">Ticket #{selected.ticket_id}</p>
                <h2 className="text-lg font-bold text-white">Support Ticket</h2>
              </div>
              <button
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/8 hover:bg-white/15 text-slate-400 hover:text-white transition text-sm"
                onClick={() => setSelected(null)}
              >
                ✕
              </button>
            </div>

            <div className="flex-1 p-6 space-y-5">
              {/* type & status badges */}
              <div className="flex gap-2 flex-wrap">
                {(() => {
                  const typeCfg = TYPE_CONFIG[String(selected.ticket_type || "").toUpperCase()] || TYPE_CONFIG.OTHER;
                  return (
                    <span className={`text-xs font-semibold px-3 py-1.5 rounded-xl ${typeCfg.color}`}>
                      {typeCfg.icon} {selected.ticket_type || "TICKET"}
                    </span>
                  );
                })()}
                <StatusPill status={selected.status} />
                {selected.created_on && (
                  <span className="text-xs text-slate-500 self-center ml-auto">
                    {new Date(selected.created_on).toLocaleString()}
                  </span>
                )}
              </div>

              {/* info grid */}
              <div className="grid grid-cols-2 gap-3">
                <InfoBlock label="Customer" value={
                  [selected.user_name, selected.email, selected.phone].filter(Boolean).join(" · ") || "—"
                } />
                <InfoBlock label="Shop" value={
                  [selected.shop_name, selected.branch_name].filter(Boolean).join(" · ") || "—"
                } />
              </div>

              {/* message */}
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-2">Message</p>
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {selected.message || "—"}
                </div>
              </div>

              {/* attachment */}
              {selected.attachment_path ? (
                <a
                  className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 underline"
                  href={`/api/platform/support/tickets/${selected.ticket_id}/attachment`}
                  target="_blank"
                  rel="noreferrer"
                >
                  📎 Download Attachment
                </a>
              ) : (
                <p className="text-sm text-slate-600">No attachment</p>
              )}

              {/* status control */}
              <div className="border-t border-white/10 pt-5">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-3">Update Status</p>
                <div className="grid grid-cols-2 gap-2">
                  {STATUS_OPTIONS.map((s) => {
                    const cfg = STATUS_CONFIG[s] || {};
                    const isActive = String(selected.status || "").toUpperCase() === s;
                    return (
                      <button
                        key={s}
                        disabled={busyId === selected.ticket_id}
                        onClick={() => setStatus(selected.ticket_id, s)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold transition ${
                          isActive
                            ? cfg.color + " ring-1 ring-white/20"
                            : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10"
                        } disabled:opacity-50`}
                      >
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot || "bg-slate-400"}`} />
                        {cfg.label || s}
                        {isActive && <span className="ml-auto text-[9px] opacity-70">current</span>}
                        {busyId === selected.ticket_id && !isActive && (
                          <span className="ml-auto w-3 h-3 rounded-full border border-current border-t-transparent animate-spin" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }) {
  const cfg = STATUS_CONFIG[String(status || "").toUpperCase()] || {};
  return (
    <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-semibold ${cfg.color || "bg-slate-600/40 text-slate-300 border-slate-500/30"}`}>
      <span className={`w-1 h-1 rounded-full ${cfg.dot || "bg-slate-400"}`} />
      {cfg.label || status || "UNKNOWN"}
    </span>
  );
}

function InfoBlock({ label, value }) {
  return (
    <div className="bg-white/5 border border-white/8 rounded-xl p-3">
      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1">{label}</p>
      <p className="text-sm text-slate-200 leading-snug">{value}</p>
    </div>
  );
}
