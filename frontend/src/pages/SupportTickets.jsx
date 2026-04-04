import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import authAxios from "../api/authAxios";
import { useToast } from "../components/Toast";
import { getSession } from "../utils/auth";

const statusOptions = ["OPEN", "IN_PROGRESS", "CLOSED"];

export default function SupportTickets() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const session = getSession() || {};

  const roleLower = String(session?.role || session?.role_name || "").toLowerCase();
  const isAdmin = roleLower === "admin";
  const isManager = roleLower === "manager";
  const isStaff = isAdmin || isManager;

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  const [ticketType, setTicketType] = useState("");
  const [status, setStatus] = useState("");
  const [limit, setLimit] = useState(200);

  const [expandedId, setExpandedId] = useState(null);

  const expandedTicket = useMemo(
    () => rows.find(r => Number(r.ticket_id) === Number(expandedId)) || null,
    [rows, expandedId]
  );

  const load = async () => {
    setLoading(true);
    try {
      const params = {
        limit: Number(limit || 200)
      };
      if (isManager) params.ticket_type = "SUPPORT";
      else if (ticketType) params.ticket_type = ticketType;
      if (status) params.status = status;

      const res = await authAxios.get("/support/tickets", { params });
      setRows(res.data || []);
    } catch (err) {
      setRows([]);
      const msg = err?.response?.data?.detail || "Failed to load tickets";
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  const setTicketStatus = async (ticketId, newStatus) => {
    try {
      await authAxios.post(`/support/tickets/${ticketId}/status`, null, {
        params: { new_status: newStatus }
      });
      showToast("Status updated", "success");
      await load();
    } catch (err) {
      const msg = err?.response?.data?.detail || "Update failed";
      showToast(msg, "error");
    }
  };

  const downloadAttachment = async (t) => {
    if (!t?.ticket_id) return;
    try {
      const res = await authAxios.get(`/support/tickets/${t.ticket_id}/attachment`, {
        responseType: "blob"
      });
      const blob = new Blob([res.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = t.attachment_filename || `ticket_${t.ticket_id}_attachment`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      const msg = err?.response?.data?.detail || "Download failed";
      showToast(msg, "error");
    }
  };

  useEffect(() => {
    if (!isStaff) return;
    if (isManager) setTicketType("SUPPORT");
    load();
  }, [isStaff]);

  const statusMeta = {
    OPEN:        { label: "Open",        bg: "bg-amber-100",  text: "text-amber-700",  dot: "bg-amber-400"  },
    IN_PROGRESS: { label: "In Progress", bg: "bg-blue-100",   text: "text-blue-700",   dot: "bg-blue-500"   },
    CLOSED:      { label: "Closed",      bg: "bg-emerald-100",text: "text-emerald-700",dot: "bg-emerald-500" },
  };

  const typeMeta = {
    SUPPORT: { bg: "bg-indigo-100", text: "text-indigo-700" },
    DEMO:    { bg: "bg-purple-100", text: "text-purple-700"  },
  };

  const counts = useMemo(() => ({
    total:       rows.length,
    open:        rows.filter(r => r.status === "OPEN").length,
    in_progress: rows.filter(r => r.status === "IN_PROGRESS").length,
    closed:      rows.filter(r => r.status === "CLOSED").length,
  }), [rows]);

  if (!isStaff) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <span className="text-5xl">🔒</span>
        <p className="text-base font-semibold text-gray-600">You are not authorized to access this page.</p>
        <button onClick={() => navigate("/home", { replace: true })}
          className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold">
          Go Home
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/70 p-4 space-y-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/home", { replace: true })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border bg-white shadow-sm text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
          >
            ← Back
          </button>
          <div>
            <h1 className="text-base font-extrabold text-gray-800 leading-tight">Support Tickets</h1>
            <p className="text-[11px] text-gray-400">{counts.total} ticket{counts.total !== 1 ? "s" : ""} loaded</p>
          </div>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm transition"
        >
          ↻ Refresh
        </button>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total",       value: counts.total,       color: "from-slate-500 to-slate-700",     icon: "🎫" },
          { label: "Open",        value: counts.open,        color: "from-amber-400 to-amber-600",     icon: "📬" },
          { label: "In Progress", value: counts.in_progress, color: "from-blue-500 to-blue-700",       icon: "⚙️" },
          { label: "Closed",      value: counts.closed,      color: "from-emerald-500 to-emerald-700", icon: "✅" },
        ].map(s => (
          <div key={s.label} className={`relative overflow-hidden bg-gradient-to-br ${s.color} text-white rounded-2xl px-4 py-3.5 shadow-md`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-semibold opacity-75 uppercase tracking-wider">{s.label}</p>
                <p className="text-2xl font-extrabold mt-1 leading-none">{loading ? "—" : s.value}</p>
              </div>
              <span className="text-xl opacity-25 select-none">{s.icon}</span>
            </div>
            <div className="absolute -bottom-3 -right-3 w-14 h-14 rounded-full bg-white/10" />
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Type</label>
            {isManager ? (
              <div className="mt-1 border border-gray-200 rounded-xl px-3 py-1.5 text-xs bg-gray-50 text-gray-500 font-medium">
                SUPPORT only
              </div>
            ) : (
              <select
                className="mt-1 border border-gray-200 rounded-xl px-3 py-1.5 text-xs bg-gray-50 focus:outline-none focus:border-indigo-400"
                value={ticketType}
                onChange={e => setTicketType(e.target.value)}
              >
                <option value="">All Types</option>
                <option value="SUPPORT">SUPPORT</option>
                <option value="DEMO">DEMO</option>
              </select>
            )}
          </div>

          <div>
            <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Status</label>
            <select
              className="mt-1 border border-gray-200 rounded-xl px-3 py-1.5 text-xs bg-gray-50 focus:outline-none focus:border-indigo-400"
              value={status}
              onChange={e => setStatus(e.target.value)}
            >
              <option value="">All Statuses</option>
              {statusOptions.map(s => (
                <option key={s} value={s}>{s.replace("_", " ")}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Limit</label>
            <input
              type="number"
              className="mt-1 w-24 border border-gray-200 rounded-xl px-3 py-1.5 text-xs bg-gray-50 focus:outline-none focus:border-indigo-400"
              value={limit}
              onChange={e => setLimit(e.target.value)}
              min="1"
              max="500"
            />
          </div>

          <button
            onClick={load}
            className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm transition"
          >
            Apply
          </button>
        </div>
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4">

        {/* Ticket list */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Tickets</p>
            <p className="text-[11px] text-gray-400">{rows.length} result{rows.length !== 1 ? "s" : ""}</p>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-300">
              <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-xs">Loading tickets…</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-300">
              <span className="text-4xl mb-2">🎫</span>
              <p className="text-xs">No tickets found</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 overflow-y-auto max-h-[calc(100vh-320px)]">
              {rows.map(t => {
                const sm = statusMeta[t.status] || { label: t.status, bg: "bg-gray-100", text: "text-gray-600", dot: "bg-gray-400" };
                const tm = typeMeta[t.ticket_type] || { bg: "bg-gray-100", text: "text-gray-600" };
                const isSelected = Number(t.ticket_id) === Number(expandedId);
                return (
                  <div
                    key={t.ticket_id}
                    onClick={() => setExpandedId(t.ticket_id)}
                    className={`px-4 py-3 cursor-pointer transition-colors ${
                      isSelected ? "bg-indigo-50 border-l-2 border-indigo-500" : "hover:bg-gray-50 border-l-2 border-transparent"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-gray-700">#{t.ticket_id}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tm.bg} ${tm.text}`}>
                            {t.ticket_type || "—"}
                          </span>
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${sm.bg} ${sm.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} />
                            {sm.label}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-gray-700 mt-1 truncate">
                          {t.shop_name || "—"}{t.branch_name ? ` · ${t.branch_name}` : ""}
                        </p>
                        <p className="text-[11px] text-gray-400 truncate mt-0.5">
                          {t.branch_contact || t.phone || t.email || "No contact"}
                        </p>
                      </div>
                      {t.attachment_filename && (
                        <button
                          onClick={e => { e.stopPropagation(); downloadAttachment(t); }}
                          className="shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-lg border border-indigo-200 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition"
                        >
                          📎 File
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Ticket detail */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
          {!expandedTicket ? (
            <div className="flex flex-col items-center justify-center flex-1 py-20 text-gray-300">
              <span className="text-4xl mb-2">👈</span>
              <p className="text-xs">Select a ticket to view details</p>
            </div>
          ) : (() => {
            const sm = statusMeta[expandedTicket.status] || { label: expandedTicket.status, bg: "bg-gray-100", text: "text-gray-600", dot: "bg-gray-400" };
            const tm = typeMeta[expandedTicket.ticket_type] || { bg: "bg-gray-100", text: "text-gray-600" };
            return (
              <>
                {/* Detail header */}
                <div className="px-4 py-3 border-b border-gray-100 flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-extrabold text-gray-800">Ticket #{expandedTicket.ticket_id}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tm.bg} ${tm.text}`}>
                        {expandedTicket.ticket_type || "—"}
                      </span>
                    </div>
                    <div className={`inline-flex items-center gap-1 mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${sm.bg} ${sm.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} />
                      {sm.label}
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Change Status</label>
                    <select
                      className="border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs bg-gray-50 focus:outline-none focus:border-indigo-400"
                      value={expandedTicket.status || "OPEN"}
                      onChange={e => setTicketStatus(expandedTicket.ticket_id, e.target.value)}
                    >
                      {statusOptions.map(s => (
                        <option key={s} value={s}>{s.replace("_", " ")}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Detail body */}
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="bg-gray-50 rounded-xl px-3 py-2.5">
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">User</p>
                      <p className="text-xs font-semibold text-gray-800 mt-0.5">{expandedTicket.user_name || "—"}</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl px-3 py-2.5">
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Contact</p>
                      <p className="text-xs font-semibold text-gray-800 mt-0.5">
                        {expandedTicket.branch_contact || expandedTicket.phone || expandedTicket.email || "—"}
                      </p>
                    </div>
                    <div className="col-span-2 bg-gray-50 rounded-xl px-3 py-2.5">
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Shop / Branch</p>
                      <p className="text-xs font-semibold text-gray-800 mt-0.5">
                        {expandedTicket.shop_name || "—"}{expandedTicket.branch_name ? ` · ${expandedTicket.branch_name}` : ""}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Message</p>
                    <div className="bg-gray-50 rounded-xl px-3 py-3 border border-gray-100">
                      <pre className="whitespace-pre-wrap text-xs text-gray-700 leading-relaxed font-sans">
                        {expandedTicket.message || "No message"}
                      </pre>
                    </div>
                  </div>

                  {expandedTicket.attachment_filename && (
                    <button
                      onClick={() => downloadAttachment(expandedTicket)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-700 hover:from-emerald-600 hover:to-emerald-800 text-white text-xs font-bold shadow-sm transition"
                    >
                      📎 Download Attachment
                    </button>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
