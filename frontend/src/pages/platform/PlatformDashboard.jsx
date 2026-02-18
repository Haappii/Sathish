import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import platformAxios from "../../api/platformAxios";
import { clearPlatformToken, getPlatformToken } from "../../utils/platformAuth";
import { useToast } from "../../components/Toast";

const BLUE = "#0B3C8C";

const fmt = (v) => (v ? new Date(v).toLocaleString() : "-");

export default function PlatformDashboard() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [tab, setTab] = useState("ONBOARD"); // ONBOARD | SUPPORT
  const [loading, setLoading] = useState(true);

  const [reqs, setReqs] = useState([]);
  const [tickets, setTickets] = useState([]);

  const [busyReqId, setBusyReqId] = useState(null);
  const [busyTicketId, setBusyTicketId] = useState(null);
  const [acceptedInfo, setAcceptedInfo] = useState(null);
  const [demoDays, setDemoDays] = useState(7);

  const token = getPlatformToken();

  useEffect(() => {
    if (!token) navigate("/platform/login", { replace: true });
  }, [token, navigate]);

  const load = async () => {
    try {
      setLoading(true);
      const [r1, r2] = await Promise.all([
        platformAxios.get("/platform/onboard/requests", { params: { limit: 200 } }),
        platformAxios.get("/platform/support/tickets", { params: { limit: 200 } }),
      ]);
      setReqs(Array.isArray(r1.data) ? r1.data : []);
      setTickets(Array.isArray(r2.data) ? r2.data : []);
    } catch (e) {
      showToast(e?.response?.data?.detail || "Failed to load platform data", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const pendingReqs = useMemo(() => reqs.filter((r) => r.status === "PENDING"), [reqs]);
  const openTickets = useMemo(() => tickets.filter((t) => t.status === "OPEN"), [tickets]);

  const logout = () => {
    clearPlatformToken();
    navigate("/platform/login", { replace: true });
  };

  const acceptReq = async (id) => {
    if (busyReqId) return;
    setBusyReqId(id);
    setAcceptedInfo(null);
    try {
      const res = await platformAxios.post(`/platform/onboard/requests/${id}/accept`);
      setAcceptedInfo(res.data || null);
      showToast("Request accepted (shop created)", "success");
      await load();
    } catch (e) {
      showToast(e?.response?.data?.detail || "Accept failed", "error");
    } finally {
      setBusyReqId(null);
    }
  };

  const rejectReq = async (id) => {
    if (busyReqId) return;
    const ok = window.confirm("Reject this onboarding request?");
    if (!ok) return;
    setBusyReqId(id);
    try {
      await platformAxios.post(`/platform/onboard/requests/${id}/reject`);
      showToast("Request rejected", "success");
      await load();
    } catch (e) {
      showToast(e?.response?.data?.detail || "Reject failed", "error");
    } finally {
      setBusyReqId(null);
    }
  };

  const setTicketStatus = async (id, next) => {
    if (busyTicketId) return;
    setBusyTicketId(id);
    try {
      await platformAxios.post(`/platform/support/tickets/${id}/status`, null, {
        params: { new_status: next },
      });
      showToast("Ticket updated", "success");
      await load();
    } catch (e) {
      showToast(e?.response?.data?.detail || "Update failed", "error");
    } finally {
      setBusyTicketId(null);
    }
  };

  const acceptDemo = async (ticketId) => {
    if (busyTicketId) return;
    setBusyTicketId(ticketId);
    setAcceptedInfo(null);
    try {
      const res = await platformAxios.post(`/platform/demo/tickets/${ticketId}/accept`, null, {
        params: { days: demoDays },
      });
      setAcceptedInfo(res.data || null);
      showToast("Demo accepted (shop created)", "success");
      await load();
    } catch (e) {
      showToast(e?.response?.data?.detail || "Accept demo failed", "error");
    } finally {
      setBusyTicketId(null);
    }
  };

  const rejectDemo = async (ticketId) => {
    if (busyTicketId) return;
    const ok = window.confirm("Reject this demo request?");
    if (!ok) return;
    setBusyTicketId(ticketId);
    try {
      await platformAxios.post(`/platform/demo/tickets/${ticketId}/reject`);
      showToast("Demo rejected", "success");
      await load();
    } catch (e) {
      showToast(e?.response?.data?.detail || "Reject demo failed", "error");
    } finally {
      setBusyTicketId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
        <div className="bg-white border rounded-2xl shadow p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-lg font-extrabold text-slate-900">Platform Dashboard</div>
            <div className="text-[12px] text-slate-500">
              Pending onboard: <span className="font-semibold">{pendingReqs.length}</span> • Open tickets:{" "}
              <span className="font-semibold">{openTickets.length}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={load}
              className="px-3 py-2 rounded-lg border text-[12px] hover:bg-slate-50"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={logout}
              className="px-3 py-2 rounded-lg text-white text-[12px]"
              style={{ background: BLUE }}
            >
              Logout
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {[
            { k: "ONBOARD", label: "Onboarding" },
            { k: "SUPPORT", label: "Support Tickets" },
          ].map((x) => (
            <button
              key={x.k}
              type="button"
              onClick={() => setTab(x.k)}
              className={`px-3 py-2 rounded-lg border text-[12px] ${
                tab === x.k ? "bg-white shadow" : "bg-slate-50 hover:bg-white"
              }`}
            >
              {x.label}
            </button>
          ))}
        </div>

        {acceptedInfo?.admin_password && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
            <div className="text-sm font-semibold text-emerald-800">Created Credentials (copy now)</div>
            <div className="text-[12px] text-emerald-800 mt-1">
              Shop ID: <span className="font-semibold">{acceptedInfo.shop_id}</span> • Admin:{" "}
              <span className="font-semibold">{acceptedInfo.admin_username}</span> • Password:{" "}
              <span className="font-semibold">{acceptedInfo.admin_password}</span>
              {acceptedInfo.expires_on ? (
                <>
                  {" "}
                  • Expires on: <span className="font-semibold">{acceptedInfo.expires_on}</span>
                </>
              ) : null}
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-sm text-slate-500">Loading...</div>
        ) : tab === "ONBOARD" ? (
          <div className="space-y-3">
            {pendingReqs.length === 0 ? (
              <div className="bg-white border rounded-2xl shadow p-4 text-sm text-slate-600">
                No pending onboarding requests.
              </div>
            ) : (
              pendingReqs.map((r) => (
                <div key={r.request_id} className="bg-white border rounded-2xl shadow p-4 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">
                        #{r.request_id} • {r.shop_name}
                      </div>
                      <div className="text-[12px] text-slate-500">
                        Branch: {r.branch_name} • Requested: {fmt(r.created_at)}
                      </div>
                      <div className="text-[12px] text-slate-600 mt-1">
                        {r.requester_name || "Requester"} {r.requester_phone ? `• ${r.requester_phone}` : ""}{" "}
                        {r.requester_email ? `• ${r.requester_email}` : ""}
                      </div>
                      {r.message ? (
                        <div className="text-[12px] text-slate-700 mt-2 whitespace-pre-wrap">{r.message}</div>
                      ) : null}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => rejectReq(r.request_id)}
                        disabled={busyReqId === r.request_id}
                        className="px-3 py-2 rounded-lg border text-[12px] hover:bg-slate-50 disabled:opacity-60"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => acceptReq(r.request_id)}
                        disabled={busyReqId === r.request_id}
                        className="px-3 py-2 rounded-lg text-white text-[12px] disabled:opacity-60"
                        style={{ background: BLUE }}
                      >
                        Accept + Create Shop
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {tickets.length === 0 ? (
              <div className="bg-white border rounded-2xl shadow p-4 text-sm text-slate-600">No tickets.</div>
            ) : (
              tickets.map((t) => (
                <div key={t.ticket_id} className="bg-white border rounded-2xl shadow p-4 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">
                        #{t.ticket_id} • {t.ticket_type} • {t.status}
                      </div>
                      <div className="text-[12px] text-slate-500">
                        {t.user_name || "User"} {t.email ? `• ${t.email}` : ""} {t.phone ? `• ${t.phone}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {String(t.ticket_type || "").toUpperCase() === "DEMO" && String(t.status || "").toUpperCase() === "OPEN" ? (
                        <>
                          <select
                            className="border rounded-lg px-2 py-2 text-[12px]"
                            value={demoDays}
                            onChange={(e) => setDemoDays(Number(e.target.value))}
                            title="Demo expiry days"
                          >
                            {[7, 14, 30, 60].map((d) => (
                              <option key={d} value={d}>
                                {d} days
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => rejectDemo(t.ticket_id)}
                            disabled={busyTicketId === t.ticket_id}
                            className="px-3 py-2 rounded-lg border text-[12px] hover:bg-slate-50 disabled:opacity-60"
                          >
                            Reject
                          </button>
                          <button
                            type="button"
                            onClick={() => acceptDemo(t.ticket_id)}
                            disabled={busyTicketId === t.ticket_id}
                            className="px-3 py-2 rounded-lg text-white text-[12px] disabled:opacity-60"
                            style={{ background: BLUE }}
                          >
                            Accept Demo
                          </button>
                        </>
                      ) : null}
                      {t.attachment_path ? (
                        <a
                          className="px-3 py-2 rounded-lg border text-[12px] hover:bg-slate-50"
                          href={`/api/platform/support/tickets/${t.ticket_id}/attachment`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Attachment
                        </a>
                      ) : null}
                      <select
                        className="border rounded-lg px-2 py-2 text-[12px]"
                        value={t.status}
                        disabled={busyTicketId === t.ticket_id}
                        onChange={(e) => setTicketStatus(t.ticket_id, e.target.value)}
                      >
                        {["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="text-[12px] text-slate-700 whitespace-pre-wrap">{t.message}</div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
