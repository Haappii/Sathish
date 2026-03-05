import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import platformAxios from "../../api/platformAxios";
import { getPlatformToken, clearPlatformToken } from "../../utils/platformAuth";
import { useToast } from "../../components/Toast";

const STATUS_OPTIONS = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];
const TYPE_OPTIONS = ["DEMO", "BUG", "REQUEST", "OUTAGE", "OTHER"];

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

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const setStatus = async (ticketId, newStatus) => {
    if (busyId) return;
    setBusyId(ticketId);
    try {
      await platformAxios.post(`/platform/support/tickets/${ticketId}/status`, null, {
        params: { new_status: newStatus },
      });
      showToast("Status updated", "success");
      await load();
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
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs text-slate-300 uppercase tracking-wide">Support Desk</div>
            <h1 className="text-2xl font-bold">Platform Tickets</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => navigate("/platform/dashboard")}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition"
            >
              ← Dashboard
            </button>
            <button
              onClick={load}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition"
            >
              Refresh
            </button>
            <button
              onClick={logout}
              className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 transition"
            >
              Logout
            </button>
          </div>
        </header>

        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-slate-300">Status</label>
            <select
              className="mt-1 rounded-lg px-3 py-2 bg-slate-900 border border-white/10 text-sm"
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            >
              {["", ...STATUS_OPTIONS].map((s) => (
                <option key={s || "ALL"} value={s}>
                  {s || "All"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-300">Type</label>
            <select
              className="mt-1 rounded-lg px-3 py-2 bg-slate-900 border border-white/10 text-sm"
              value={filters.type}
              onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
            >
              {["", ...TYPE_OPTIONS].map((s) => (
                <option key={s || "ALL"} value={s}>
                  {s || "All"}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-slate-300">Search</label>
            <input
              className="mt-1 w-full rounded-lg px-3 py-2 bg-slate-900 border border-white/10 text-sm"
              placeholder="Message, user, shop..."
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            />
          </div>
          <div className="text-xs text-slate-300 ml-auto">
            Showing <span className="font-semibold">{filtered.length}</span> of {tickets.length}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {loading ? (
            <div className="text-slate-300">Loading tickets...</div>
          ) : filtered.length === 0 ? (
            <div className="text-slate-300">No tickets found.</div>
          ) : (
            filtered.map((t) => (
              <div
                key={t.ticket_id}
                className="border border-white/10 rounded-2xl p-4 bg-white/5 hover:bg-white/10 transition cursor-pointer"
                onClick={() => setSelected(t)}
              >
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>#{t.ticket_id}</span>
                  <span className="px-2 py-1 rounded-full bg-slate-800">{t.ticket_type || "TICKET"}</span>
                </div>
                <div className="text-sm font-semibold mt-1 truncate">
                  {t.shop_name || "Unknown shop"} {t.branch_name ? `• ${t.branch_name}` : ""}
                </div>
                <div className="text-xs text-slate-400">
                  {t.user_name || "User"} {t.email ? `• ${t.email}` : ""} {t.phone ? `• ${t.phone}` : ""}
                </div>
                <div className="mt-2 text-sm text-slate-200 line-clamp-3 whitespace-pre-wrap">{t.message || "-"}</div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <StatusPill status={t.status} />
                  <a
                    className="text-blue-300 hover:underline"
                    href={`/api/platform/support/tickets/${t.ticket_id}/attachment`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => {
                      if (!t.attachment_path) {
                        e.preventDefault();
                        showToast("No attachment", "info");
                      }
                    }}
                  >
                    {t.attachment_path ? "Attachment" : "No attachment"}
                  </a>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {selected ? (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div
            className="w-full max-w-xl h-full bg-slate-900 text-white p-6 overflow-y-auto border-l border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-xs text-slate-400">Ticket #{selected.ticket_id}</div>
                <div className="text-xl font-semibold">Support Ticket</div>
              </div>
              <button className="text-sm text-slate-300 hover:text-white" onClick={() => setSelected(null)}>
                ✕
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="text-xs text-slate-400">Type</div>
              <div className="text-sm font-semibold">{selected.ticket_type || "-"}</div>
              <div className="text-xs text-slate-400">Customer</div>
              <div className="text-sm">
                {selected.user_name || "User"} {selected.email ? `• ${selected.email}` : ""}{" "}
                {selected.phone ? `• ${selected.phone}` : ""}
              </div>
              <div className="text-xs text-slate-400">Shop</div>
              <div className="text-sm">
                {selected.shop_name || "-"} {selected.branch_name ? `• ${selected.branch_name}` : ""}
              </div>
              <div className="text-xs text-slate-400">Message</div>
              <div className="text-sm whitespace-pre-wrap bg-white/5 rounded-lg p-3 border border-white/10">
                {selected.message || "-"}
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <div className="text-xs text-slate-400">Status</div>
              <select
                className="rounded-lg px-3 py-2 bg-slate-800 border border-white/10 text-sm"
                value={selected.status}
                disabled={busyId === selected.ticket_id}
                onChange={(e) => {
                  const next = e.target.value;
                  setSelected((s) => ({ ...s, status: next }));
                  setStatus(selected.ticket_id, next);
                }}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-4">
              <a
                className="text-blue-300 hover:underline text-sm"
                href={`/api/platform/support/tickets/${selected.ticket_id}/attachment`}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => {
                  if (!selected.attachment_path) {
                    e.preventDefault();
                    showToast("No attachment", "info");
                  }
                }}
              >
                {selected.attachment_path ? "Download attachment" : "No attachment"}
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    OPEN: "bg-amber-500/30 border-amber-500/40 text-amber-100",
    IN_PROGRESS: "bg-blue-500/30 border-blue-500/40 text-blue-100",
    RESOLVED: "bg-emerald-500/30 border-emerald-500/40 text-emerald-100",
    CLOSED: "bg-slate-500/30 border-slate-500/40 text-slate-100",
  };
  return (
    <span className={`px-3 py-1 rounded-full border text-[11px] ${map[status] || "bg-slate-600/40"}`}>
      {status || "UNKNOWN"}
    </span>
  );
}
