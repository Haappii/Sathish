import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import platformAxios from "../../api/platformAxios";
import { clearPlatformToken, getPlatformToken } from "../../utils/platformAuth";
import { useToast } from "../../components/Toast";

const PRIMARY = "#2563eb";

const fmtDate = (v) => (v ? String(v) : "-");
const fmtMoney = (v) => `₹ ${Number(v || 0).toFixed(2)}`;

export default function PlatformDashboard() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [tab, setTab] = useState("OVERVIEW"); // OVERVIEW | SHOPS | ONBOARD | DEMO | SUPPORT
  const [loading, setLoading] = useState(true);

  const [shops, setShops] = useState([]);
  const [revenue, setRevenue] = useState({ days: 30, total: 0 });
  const [onboardReqs, setOnboardReqs] = useState([]);
  const [tickets, setTickets] = useState([]);

  const [busyId, setBusyId] = useState(null);
  const [acceptedInfo, setAcceptedInfo] = useState(null);
  const [demoDays, setDemoDays] = useState(7);

  const token = getPlatformToken();

  useEffect(() => {
    if (!token) navigate("/platform/login", { replace: true });
  }, [token, navigate]);

  const load = async () => {
    try {
      setLoading(true);
      const [shopRes, revenueRes, onboardRes, ticketRes] = await Promise.all([
        platformAxios.get("/platform/shops"),
        platformAxios.get("/platform/revenue", { params: { days: 30 } }),
        platformAxios.get("/platform/onboard/requests", { params: { limit: 200 } }),
        platformAxios.get("/platform/support/tickets", { params: { limit: 200 } }),
      ]);
      setShops(Array.isArray(shopRes.data) ? shopRes.data : []);
      setRevenue(revenueRes.data || { days: 30, total: 0 });
      setOnboardReqs(Array.isArray(onboardRes.data) ? onboardRes.data : []);
      setTickets(Array.isArray(ticketRes.data) ? ticketRes.data : []);
    } catch (e) {
      showToast(e?.response?.data?.detail || "Failed to load platform data", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pendingOnboard = useMemo(
    () => onboardReqs.filter((r) => String(r.status || "").toUpperCase() === "PENDING"),
    [onboardReqs]
  );

  const demoTickets = useMemo(
    () => tickets.filter((t) => String(t.ticket_type || "").toUpperCase() === "DEMO"),
    [tickets]
  );
  const openDemoTickets = useMemo(
    () => demoTickets.filter((t) => String(t.status || "").toUpperCase() === "OPEN"),
    [demoTickets]
  );
  const supportTickets = useMemo(
    () => tickets.filter((t) => String(t.ticket_type || "").toUpperCase() !== "DEMO"),
    [tickets]
  );

  const activeShops = useMemo(
    () => shops.filter((s) => String(s.status || "").toUpperCase() === "ACTIVE").length,
    [shops]
  );
  const expiredShops = useMemo(
    () => shops.filter((s) => String(s.status || "").toUpperCase() === "EXPIRED").length,
    [shops]
  );

  const logout = () => {
    clearPlatformToken();
    navigate("/platform/login", { replace: true });
  };

  const acceptOnboard = async (id) => {
    if (busyId) return;
    setBusyId(id);
    setAcceptedInfo(null);
    try {
      const res = await platformAxios.post(`/platform/onboard/requests/${id}/accept`);
      setAcceptedInfo(res.data || null);
      showToast(res?.data?.email_sent ? "Accepted (email sent)" : "Accepted (email not sent)", "success");
      await load();
    } catch (e) {
      showToast(e?.response?.data?.detail || "Accept failed", "error");
    } finally {
      setBusyId(null);
    }
  };

  const rejectOnboard = async (id) => {
    if (busyId) return;
    const ok = window.confirm("Reject this onboarding request?");
    if (!ok) return;
    setBusyId(id);
    try {
      await platformAxios.post(`/platform/onboard/requests/${id}/reject`);
      showToast("Rejected", "success");
      await load();
    } catch (e) {
      showToast(e?.response?.data?.detail || "Reject failed", "error");
    } finally {
      setBusyId(null);
    }
  };

  const acceptDemo = async (ticketId) => {
    if (busyId) return;
    setBusyId(ticketId);
    setAcceptedInfo(null);
    try {
      const res = await platformAxios.post(`/platform/demo/tickets/${ticketId}/accept`, null, {
        params: { days: demoDays },
      });
      setAcceptedInfo(res.data || null);
      showToast(res?.data?.email_sent ? "Demo accepted (email sent)" : "Demo accepted (email not sent)", "success");
      await load();
    } catch (e) {
      showToast(e?.response?.data?.detail || "Accept demo failed", "error");
    } finally {
      setBusyId(null);
    }
  };

  const rejectDemo = async (ticketId) => {
    if (busyId) return;
    const ok = window.confirm("Reject this demo request?");
    if (!ok) return;
    setBusyId(ticketId);
    try {
      await platformAxios.post(`/platform/demo/tickets/${ticketId}/reject`);
      showToast("Demo rejected", "success");
      await load();
    } catch (e) {
      showToast(e?.response?.data?.detail || "Reject demo failed", "error");
    } finally {
      setBusyId(null);
    }
  };

  const updateTicketStatus = async (ticketId, next) => {
    if (busyId) return;
    setBusyId(ticketId);
    try {
      await platformAxios.post(`/platform/support/tickets/${ticketId}/status`, null, {
        params: { new_status: next },
      });
      showToast("Ticket updated", "success");
      await load();
    } catch (e) {
      showToast(e?.response?.data?.detail || "Update failed", "error");
    } finally {
      setBusyId(null);
    }
  };

  const extendPayment = async (shopId, days) => {
    if (busyId) return;
    setBusyId(shopId);
    try {
      await platformAxios.post(`/platform/shops/${shopId}/update-payment`, {
        extend_days: Number(days || 30),
      });
      showToast("Renewal extended", "success");
      await load();
    } catch (e) {
      showToast(e?.response?.data?.detail || "Update payment failed", "error");
    } finally {
      setBusyId(null);
    }
  };

  const sendReminder = async (shopId) => {
    if (busyId) return;
    setBusyId(shopId);
    try {
      const res = await platformAxios.post(`/platform/shops/${shopId}/reminder`);
      showToast(res?.data?.email_sent ? "Reminder email sent" : "Email not sent (SMTP not configured)", "success");
    } catch (e) {
      showToast(e?.response?.data?.detail || "Reminder failed", "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-7xl mx-auto p-6 sm:p-8 space-y-8">
        <div className="flex justify-between items-center gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-wide truncate">Platform Admin Dashboard</h1>
            <div className="text-xs text-slate-300 mt-1">
              Pending onboard: <span className="font-semibold">{pendingOnboard.length}</span> • Open demos:{" "}
              <span className="font-semibold">{openDemoTickets.length}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={load}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 transition"
            >
              Refresh
            </button>
            <button
              onClick={logout}
              className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 transition"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <GlassCard title={`Revenue (last ${revenue?.days || 30} days)`} value={fmtMoney(revenue?.total || 0)} />
          <GlassCard title="Total Shops" value={shops.length} />
          <GlassCard title="Active Shops" value={activeShops} />
          <GlassCard title="Expired Shops" value={expiredShops} />
        </div>

        {acceptedInfo?.admin_password ? (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4">
            <div className="text-sm font-semibold text-emerald-200">Created Credentials (copy now)</div>
            <div className="text-xs text-emerald-100 mt-1">
              Shop ID: <span className="font-semibold">{acceptedInfo.shop_id}</span> • Username:{" "}
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
        ) : null}

        <div className="flex flex-wrap gap-3">
          {["OVERVIEW", "SHOPS", "ONBOARD", "DEMO", "SUPPORT"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2 rounded-xl transition ${
                tab === t ? "bg-blue-600 shadow-lg" : "bg-white/10 hover:bg-white/20"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-16 text-slate-300">Loading data...</div>
        ) : tab === "SHOPS" ? (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-300 border-b border-white/10">
                  <th className="py-3 text-left">Shop</th>
                  <th>Status</th>
                  <th>Plan</th>
                  <th>Last Payment</th>
                  <th>Next Renewal</th>
                  <th>Sales Revenue</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {shops.map((s) => (
                  <tr
                    key={s.shop_id}
                    className="border-b border-white/5 hover:bg-white/5 transition"
                  >
                    <td className="py-3">
                      <div className="font-semibold">{s.shop_name || `Shop #${s.shop_id}`}</div>
                      <div className="text-xs text-slate-300">
                        ID: {s.shop_id} {s.mailid ? `• ${s.mailid}` : ""} {s.mobile ? `• ${s.mobile}` : ""}
                      </div>
                      {s.is_demo ? (
                        <div className="text-xs text-slate-300">
                          Demo expiry: <span className="font-semibold">{fmtDate(s.expires_on)}</span>
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <Status status={String(s.status || "").toUpperCase()} />
                    </td>
                    <td>{s.plan || "TRIAL"}</td>
                    <td>{fmtDate(s.last_payment_on)}</td>
                    <td>{fmtDate(s.next_renewal)}</td>
                    <td>{fmtMoney(s.revenue || 0)}</td>
                    <td className="space-x-2">
                      <button
                        onClick={() => extendPayment(s.shop_id, 30)}
                        disabled={busyId === s.shop_id}
                        className="px-3 py-1 bg-green-500 rounded-lg text-xs hover:bg-green-600 disabled:opacity-60"
                      >
                        Extend 30d
                      </button>
                      <button
                        onClick={() => sendReminder(s.shop_id)}
                        disabled={busyId === s.shop_id}
                        className="px-3 py-1 bg-white/15 rounded-lg text-xs hover:bg-white/25 disabled:opacity-60"
                      >
                        Send Reminder
                      </button>
                    </td>
                  </tr>
                ))}
                {shops.length === 0 ? (
                  <tr>
                    <td className="py-6 text-slate-300" colSpan={7}>
                      No shops found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : tab === "ONBOARD" ? (
          <div className="space-y-4">
            {pendingOnboard.length === 0 ? (
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 text-slate-300">
                No pending onboarding requests.
              </div>
            ) : (
              pendingOnboard.map((r) => (
                <div key={r.request_id} className="bg-white/10 backdrop-blur-lg rounded-2xl p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">
                        #{r.request_id} • {r.shop_name} • {r.branch_name}
                      </div>
                      <div className="text-xs text-slate-300 mt-1">
                        {r.requester_name || "Requester"} {r.requester_email ? `• ${r.requester_email}` : ""}{" "}
                        {r.requester_phone ? `• ${r.requester_phone}` : ""}
                      </div>
                      {r.message ? (
                        <div className="text-xs text-slate-200 mt-2 whitespace-pre-wrap">{r.message}</div>
                      ) : null}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => rejectOnboard(r.request_id)}
                        disabled={busyId === r.request_id}
                        className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 transition disabled:opacity-60"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => acceptOnboard(r.request_id)}
                        disabled={busyId === r.request_id}
                        className="px-4 py-2 rounded-xl text-white transition disabled:opacity-60"
                        style={{ background: PRIMARY }}
                      >
                        Accept + Create Shop
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : tab === "DEMO" ? (
          <div className="space-y-4">
            {openDemoTickets.length === 0 ? (
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 text-slate-300">
                No open demo requests.
              </div>
            ) : (
              openDemoTickets.map((t) => (
                <div key={t.ticket_id} className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">
                        #{t.ticket_id} • {t.user_name || "User"} {t.email ? `• ${t.email}` : ""}{" "}
                        {t.phone ? `• ${t.phone}` : ""}
                      </div>
                      {t.business ? <div className="text-xs text-slate-300 mt-1">{t.business}</div> : null}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <select
                        className="rounded-lg px-2 py-2 text-xs bg-slate-900 border border-white/10"
                        value={demoDays}
                        onChange={(e) => setDemoDays(Number(e.target.value))}
                      >
                        {[7, 14, 30, 60].map((d) => (
                          <option key={d} value={d}>
                            {d} days
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => rejectDemo(t.ticket_id)}
                        disabled={busyId === t.ticket_id}
                        className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 transition disabled:opacity-60"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => acceptDemo(t.ticket_id)}
                        disabled={busyId === t.ticket_id}
                        className="px-4 py-2 rounded-xl text-white transition disabled:opacity-60"
                        style={{ background: PRIMARY }}
                      >
                        Accept + Create Demo
                      </button>
                    </div>
                  </div>
                  {t.message ? (
                    <div className="text-xs text-slate-200 whitespace-pre-wrap">{t.message}</div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        ) : tab === "SUPPORT" ? (
          <div className="space-y-4">
            {supportTickets.length === 0 ? (
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 text-slate-300">No support tickets.</div>
            ) : (
              supportTickets.map((t) => (
                <div key={t.ticket_id} className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">
                        #{t.ticket_id} • {t.ticket_type} • {t.status}
                      </div>
                      <div className="text-xs text-slate-300 mt-1">
                        {t.user_name || "User"} {t.shop_name ? `• ${t.shop_name}` : ""}{" "}
                        {t.branch_name ? `• ${t.branch_name}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {t.attachment_path ? (
                        <a
                          className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition text-xs"
                          href={`/api/platform/support/tickets/${t.ticket_id}/attachment`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Attachment
                        </a>
                      ) : null}
                      <select
                        className="rounded-lg px-2 py-2 text-xs bg-slate-900 border border-white/10"
                        value={t.status}
                        disabled={busyId === t.ticket_id}
                        onChange={(e) => updateTicketStatus(t.ticket_id, e.target.value)}
                      >
                        {["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {t.message ? <div className="text-xs text-slate-200 whitespace-pre-wrap">{t.message}</div> : null}
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-10 text-center text-slate-300">
            Overview: use tabs to manage shops, onboarding, demos and support.
          </div>
        )}
      </div>
    </div>
  );
}

function GlassCard({ title, value }) {
  return (
    <div className="bg-white/10 backdrop-blur-xl p-6 rounded-2xl shadow-lg border border-white/10">
      <div className="text-slate-300 text-sm">{title}</div>
      <div className="text-2xl font-bold mt-2">{value}</div>
    </div>
  );
}

function Status({ status }) {
  const map = {
    ACTIVE: "bg-green-500",
    EXPIRED: "bg-red-500",
    TRIAL: "bg-yellow-500",
  };

  return (
    <span className={`px-3 py-1 text-xs rounded-full ${map[status] || "bg-gray-500"}`}>
      {status || "UNKNOWN"}
    </span>
  );
}

