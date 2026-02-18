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

  const [tab, setTab] = useState("ONBOARD");
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
  const demoTickets = useMemo(
    () => tickets.filter((t) => String(t.ticket_type || "").toUpperCase() === "DEMO"),
    [tickets]
  );
  const supportTickets = useMemo(
    () => tickets.filter((t) => String(t.ticket_type || "").toUpperCase() !== "DEMO"),
    [tickets]
  );
  const openDemoTickets = useMemo(
    () => demoTickets.filter((t) => String(t.status || "").toUpperCase() === "OPEN"),
    [demoTickets]
  );

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
    if (!window.confirm("Reject this onboarding request?")) return;
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
    if (!window.confirm("Reject this demo request?")) return;
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-7xl mx-auto p-6 space-y-6">

        {/* HEADER */}
        <div className="bg-white rounded-3xl shadow-lg p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              Platform Control Center
            </h1>
            <p className="text-sm text-slate-500">
              Manage onboarding, demo requests & support tickets
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={load}
              className="px-4 py-2 rounded-xl border text-sm hover:bg-slate-50 transition"
            >
              Refresh
            </button>

            <button
              onClick={logout}
              className="px-4 py-2 rounded-xl text-white text-sm shadow-md hover:opacity-90 transition"
              style={{ background: BLUE }}
            >
              Logout
            </button>
          </div>
        </div>

        {/* STATS */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard title="Pending Onboard" value={pendingReqs.length} />
          <StatCard title="Open Tickets" value={openTickets.length} />
          <StatCard title="Demo Requests" value={openDemoTickets.length} />
        </div>

        {/* TABS */}
        <div className="bg-white p-2 rounded-2xl shadow flex gap-2 w-fit">
          {[
            { k: "ONBOARD", label: "Onboarding" },
            { k: "DEMO", label: "Demo Requests" },
            { k: "SUPPORT", label: "Support Tickets" },
          ].map((x) => (
            <button
              key={x.k}
              onClick={() => setTab(x.k)}
              className={`px-4 py-2 text-sm rounded-xl transition ${
                tab === x.k
                  ? "bg-blue-600 text-white shadow"
                  : "hover:bg-slate-100 text-slate-600"
              }`}
            >
              {x.label}
            </button>
          ))}
        </div>

        {/* CONTENT */}
        {loading ? (
          <div className="text-center py-10 text-slate-500">Loading data...</div>
        ) : (
          <div className="space-y-4">
            {/* ONBOARD */}
            {tab === "ONBOARD" &&
              pendingReqs.map((r) => (
                <Card key={r.request_id}>
                  <div className="flex justify-between flex-wrap gap-4">
                    <div>
                      <h3 className="font-semibold text-slate-800">
                        #{r.request_id} — {r.shop_name}
                      </h3>
                      <p className="text-xs text-slate-500">
                        Branch: {r.branch_name}
                      </p>
                      <p className="text-xs text-slate-600 mt-1">
                        {r.requester_name} • {r.requester_phone}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Requested: {fmt(r.created_at)}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => rejectReq(r.request_id)}
                        className="px-3 py-2 text-xs rounded-lg border hover:bg-slate-100"
                      >
                        Reject
                      </button>

                      <button
                        onClick={() => acceptReq(r.request_id)}
                        className="px-3 py-2 text-xs rounded-lg text-white shadow hover:opacity-90"
                        style={{ background: BLUE }}
                      >
                        Accept
                      </button>
                    </div>
                  </div>
                </Card>
              ))}

            {/* DEMO */}
            {tab === "DEMO" &&
              openDemoTickets.map((t) => (
                <Card key={t.ticket_id}>
                  <div className="flex justify-between flex-wrap gap-4">
                    <div>
                      <h3 className="font-semibold text-slate-800">
                        #{t.ticket_id} — DEMO
                      </h3>
                      <p className="text-xs text-slate-500">
                        {t.user_name} • {t.email}
                      </p>
                    </div>

                    <div className="flex gap-2 items-center">
                      <select
                        className="border rounded-lg px-2 py-1 text-xs"
                        value={demoDays}
                        onChange={(e) => setDemoDays(Number(e.target.value))}
                      >
                        {[7, 14, 30].map((d) => (
                          <option key={d} value={d}>
                            {d} days
                          </option>
                        ))}
                      </select>

                      <button
                        onClick={() => rejectDemo(t.ticket_id)}
                        className="px-3 py-2 text-xs rounded-lg border"
                      >
                        Reject
                      </button>

                      <button
                        onClick={() => acceptDemo(t.ticket_id)}
                        className="px-3 py-2 text-xs rounded-lg text-white"
                        style={{ background: BLUE }}
                      >
                        Approve
                      </button>
                    </div>
                  </div>
                </Card>
              ))}

            {/* SUPPORT */}
            {tab === "SUPPORT" &&
              supportTickets.map((t) => (
                <Card key={t.ticket_id}>
                  <div className="flex justify-between flex-wrap gap-4">
                    <div>
                      <h3 className="font-semibold text-slate-800">
                        #{t.ticket_id} — {t.ticket_type}
                      </h3>
                      <StatusBadge status={t.status} />
                    </div>

                    <select
                      className="border rounded-lg px-2 py-1 text-xs"
                      value={t.status}
                      onChange={(e) =>
                        setTicketStatus(t.ticket_id, e.target.value)
                      }
                    >
                      {["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <p className="text-xs text-slate-600 mt-2">{t.message}</p>
                </Card>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- UI COMPONENTS ---------- */

function Card({ children }) {
  return (
    <div className="bg-white rounded-2xl shadow-md p-5 hover:shadow-lg transition">
      {children}
    </div>
  );
}

function StatCard({ title, value }) {
  return (
    <div className="bg-white rounded-2xl shadow-md p-5">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="text-2xl font-bold text-slate-800 mt-1">{value}</div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    OPEN: "bg-yellow-100 text-yellow-700",
    IN_PROGRESS: "bg-blue-100 text-blue-700",
    RESOLVED: "bg-green-100 text-green-700",
    CLOSED: "bg-gray-200 text-gray-700",
  };

  return (
    <span
      className={`inline-block px-3 py-1 text-xs rounded-full mt-1 ${
        map[status] || "bg-slate-100 text-slate-600"
      }`}
    >
      {status}
    </span>
  );
}
