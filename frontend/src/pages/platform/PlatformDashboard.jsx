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
  const [revenueSeries, setRevenueSeries] = useState([]);
  const [onboardReqs, setOnboardReqs] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [plans, setPlans] = useState([]);
  const [newPlan, setNewPlan] = useState({ name: "", duration_months: 1, price: "" });
  const [planSelections, setPlanSelections] = useState({});
  const [selectedShopId, setSelectedShopId] = useState(null);
  const [selectedShopDetail, setSelectedShopDetail] = useState(null);
  const [shopDetailLoading, setShopDetailLoading] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ extend_days: "", paid_until: "", amount: "" });
  const [billingType, setBillingType] = useState("store");

  const [busyId, setBusyId] = useState(null);
  const [acceptedInfo, setAcceptedInfo] = useState(null);
  const [demoDays, setDemoDays] = useState(7);
  const [shopTypes, setShopTypes] = useState({});
  const [monthlyAmounts, setMonthlyAmounts] = useState({});

  const token = getPlatformToken();

  useEffect(() => {
    if (!token) navigate("/platform/login", { replace: true });
  }, [token, navigate]);

  const load = async () => {
    try {
      setLoading(true);
      const [shopRes, revenueRes, revSeriesRes, planRes, onboardRes, ticketRes] = await Promise.all([
        platformAxios.get("/platform/shops"),
        platformAxios.get("/platform/revenue", { params: { days: 30 } }),
        platformAxios.get("/platform/revenue/daily", { params: { days: 30 } }),
        platformAxios.get("/platform/plans", { params: { include_inactive: true } }),
        platformAxios.get("/platform/onboard/requests", { params: { limit: 200 } }),
        platformAxios.get("/platform/support/tickets", { params: { limit: 200 } }),
      ]);
      setShops(Array.isArray(shopRes.data) ? shopRes.data : []);
      setRevenue(revenueRes.data || { days: 30, total: 0 });
      setRevenueSeries(Array.isArray(revSeriesRes.data) ? revSeriesRes.data : []);
      setPlans(Array.isArray(planRes.data) ? planRes.data : []);
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

  useEffect(() => {
    const defaults = {};
    const amounts = {};
    const plans = {};
    onboardReqs.forEach((r) => {
      defaults[r.request_id] = String(r.billing_type || "store").toLowerCase();
      const amt = Number(r.monthly_amount || 0);
      amounts[r.request_id] = Number.isFinite(amt) && amt > 0 ? amt : "";
    });
    setShopTypes(defaults);
    setMonthlyAmounts(amounts);
  }, [onboardReqs]);

  useEffect(() => {
    const plans = {};
    shops.forEach((s) => {
      plans[s.shop_id] = "";
    });
    setPlanSelections(plans);
  }, [shops]);

  const loadShopDetail = async (shopId) => {
    setShopDetailLoading(true);
    try {
      const res = await platformAxios.get(`/platform/shops/${shopId}/detail`);
      setSelectedShopDetail(res.data || null);
      setBillingType(String(res.data?.billing_type || "store").toLowerCase());
    } catch (e) {
      showToast(e?.response?.data?.detail || "Failed to load shop detail", "error");
      setSelectedShopDetail(null);
    } finally {
      setShopDetailLoading(false);
    }
  };

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
  const disabledShops = useMemo(
    () => shops.filter((s) => String(s.status || "").toUpperCase() === "DISABLED").length,
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
    const billingType = String(shopTypes[id] || "store").toLowerCase();
    const rawMonthly = monthlyAmounts[id];
    let monthly_amount = null;
    if (rawMonthly !== "" && rawMonthly !== undefined) {
      const num = Number(rawMonthly);
      monthly_amount = Number.isFinite(num) && num >= 0 ? num : null;
    }
    try {
      const res = await platformAxios.post(`/platform/onboard/requests/${id}/accept`, {
        billing_type: billingType,
        monthly_amount,
      });
      setAcceptedInfo(res.data || null);
      if (res?.data?.admin_username && res?.data?.admin_password) {
        showToast(
          `Shop created. User: ${res.data.admin_username} | Pass: ${res.data.admin_password}`,
          "success"
        );
      } else {
        showToast(res?.data?.email_sent ? "Accepted (email sent)" : "Accepted (email not sent)", "success");
      }
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

  const toggleShopStatus = async (shopId, currentStatus) => {
    if (busyId) return;
    const next = currentStatus === "DISABLED" ? "ACTIVE" : "DISABLED";
    setBusyId(shopId);
    try {
      await platformAxios.post(`/platform/shops/${shopId}/status`, { status: next });
      showToast(`Shop ${next === "DISABLED" ? "disabled" : "enabled"}`, "success");
      await load();
    } catch (e) {
      showToast(e?.response?.data?.detail || "Update failed", "error");
    } finally {
      setBusyId(null);
    }
  };

  const savePlan = async (shopId) => {
    if (busyId) return;
    const plan_id_raw = planSelections[shopId];
    if (!plan_id_raw) return showToast("Select a plan", "error");
    const plan_id = Number(plan_id_raw);
    if (!Number.isFinite(plan_id)) return showToast("Invalid plan", "error");
    setBusyId(shopId);
    try {
      await platformAxios.post(`/platform/shops/${shopId}/update-payment`, { plan_id });
      showToast("Plan updated and payment applied", "success");
      await load();
    } catch (e) {
      showToast(e?.response?.data?.detail || "Plan update failed", "error");
    } finally {
      setBusyId(null);
    }
  };

  const openShopDetail = (shopId) => {
    setSelectedShopId(shopId);
    setSelectedShopDetail(null);
    setPaymentForm({ extend_days: "", paid_until: "", amount: "" });
    loadShopDetail(shopId);
  };

  const closeShopDetail = () => {
    setSelectedShopId(null);
    setSelectedShopDetail(null);
  };

  const saveBillingType = async () => {
    if (!selectedShopId) return;
    try {
      await platformAxios.post(`/platform/shops/${selectedShopId}/billing-type`, { billing_type: billingType });
      showToast("Business type updated", "success");
      await load();
      await loadShopDetail(selectedShopId);
    } catch (e) {
      showToast(e?.response?.data?.detail || "Update failed", "error");
    }
  };

  const savePaymentForm = async () => {
    if (!selectedShopId) return;
    const payload = {};
    if (paymentForm.extend_days) payload.extend_days = Number(paymentForm.extend_days);
    if (paymentForm.paid_until) payload.paid_until = paymentForm.paid_until;
    if (paymentForm.amount) payload.amount = Number(paymentForm.amount);
    if (!Object.keys(payload).length) {
      showToast("Enter extend days, paid until, or amount", "error");
      return;
    }
    setBusyId(selectedShopId);
    try {
      await platformAxios.post(`/platform/shops/${selectedShopId}/update-payment`, payload);
      showToast("Payment/renewal updated", "success");
      await load();
      await loadShopDetail(selectedShopId);
    } catch (e) {
      showToast(e?.response?.data?.detail || "Update failed", "error");
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
          <GlassCard title={`Revenue (last ${revenue?.days || 30} days)`} value={fmtMoney(revenue?.total || 0)} />
          <GlassCard title="Total Shops" value={shops.length} />
          <GlassCard title="Active Shops" value={activeShops} />
          <GlassCard title="Expired Shops" value={expiredShops} />
          <GlassCard title="Disabled" value={disabledShops} />
        </div>

        {tab === "OVERVIEW" && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 space-y-4">
            <h3 className="text-lg font-semibold">Revenue Trend (last 30 days)</h3>
            {revenueSeries.length === 0 ? (
              <div className="text-sm text-slate-300">No revenue data yet.</div>
            ) : (
              <div className="flex items-end gap-1 h-32">
                {revenueSeries.map((r) => {
                  const max = Math.max(...revenueSeries.map((x) => x.revenue || 0), 1);
                  const h = Math.max(6, Math.round((Number(r.revenue || 0) / max) * 120));
                  return (
                    <div key={r.date} className="group flex-1">
                      <div
                        className="w-full bg-blue-500/70 rounded-t-md group-hover:bg-blue-400 transition"
                        style={{ height: h }}
                        title={`${r.date}: ${fmtMoney(r.revenue)}`}
                      />
                      <div className="text-[10px] text-center text-slate-400 mt-1">
                        {new Date(r.date).getDate()}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

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
          {["OVERVIEW", "SHOPS", "PLANS", "ONBOARD", "DEMO", "SUPPORT"].map((t) => (
            <button
              key={t}
              onClick={() => {
                if (t === "SUPPORT") {
                  navigate("/platform/support");
                  return;
                }
                setTab(t);
              }}
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
                    className="border-b border-white/5 hover:bg-white/5 transition cursor-pointer"
                    onClick={() => openShopDetail(s.shop_id)}
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
                    <td className="space-y-1">
                      <select
                        className="rounded-lg px-2 py-2 text-xs bg-slate-900 border border-white/10 w-36"
                        value={planSelections[s.shop_id] ?? ""}
                        onChange={(e) =>
                          setPlanSelections((prev) => ({ ...prev, [s.shop_id]: e.target.value || "" }))
                        }
                      >
                        <option value="">Select plan</option>
                        {plans.map((p) => (
                          <option key={p.plan_id} value={p.plan_id}>
                            {p.name} • {p.duration_months}m • ₹{Number(p.price || 0).toFixed(0)}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => savePlan(s.shop_id)}
                        disabled={busyId === s.shop_id}
                        className="px-2 py-1 bg-white/10 rounded-lg text-[11px] hover:bg-white/20 disabled:opacity-60"
                      >
                        Save Plan
                      </button>
                    </td>
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
                      <button
                        onClick={() => toggleShopStatus(s.shop_id, String(s.status || "").toUpperCase())}
                        disabled={busyId === s.shop_id}
                        className="px-3 py-1 bg-white/15 rounded-lg text-xs hover:bg-white/25 disabled:opacity-60"
                      >
                        {String(s.status || "").toUpperCase() === "DISABLED" ? "Enable" : "Disable"}
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
        ) : tab === "PLANS" ? (
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 space-y-4">
              <div className="text-lg font-semibold">Create Plan</div>
              <div className="space-y-3 text-sm">
                <div>
                  <label className="text-xs text-slate-300">Name</label>
                  <input
                    className="w-full mt-1 rounded-xl px-3 py-2 bg-white/10 border border-white/20"
                    value={newPlan.name}
                    onChange={(e) => setNewPlan((p) => ({ ...p, name: e.target.value }))}
                    placeholder="e.g., 3 Month Pack"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-300">Duration (months)</label>
                    <input
                      type="number"
                      min="1"
                      max="36"
                      className="w-full mt-1 rounded-xl px-3 py-2 bg-white/10 border border-white/20"
                      value={newPlan.duration_months}
                      onChange={(e) =>
                        setNewPlan((p) => ({ ...p, duration_months: Number(e.target.value || 1) }))
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-300">Price (₹)</label>
                    <input
                      type="number"
                      min="0"
                      className="w-full mt-1 rounded-xl px-3 py-2 bg-white/10 border border-white/20"
                      value={newPlan.price}
                      onChange={(e) => setNewPlan((p) => ({ ...p, price: e.target.value }))}
                      placeholder="27000"
                    />
                  </div>
                </div>
                <button
                  onClick={async () => {
                    if (!newPlan.name.trim()) return showToast("Enter plan name", "error");
                    const duration = Number(newPlan.duration_months);
                    const price = Number(newPlan.price);
                    if (!Number.isFinite(duration) || duration < 1) return showToast("Duration invalid", "error");
                    if (!Number.isFinite(price) || price < 0) return showToast("Price invalid", "error");
                    try {
                      await platformAxios.post("/platform/plans", {
                        name: newPlan.name.trim(),
                        duration_months: duration,
                        price,
                      });
                      showToast("Plan created", "success");
                      setNewPlan({ name: "", duration_months: 1, price: "" });
                      await load();
                    } catch (e) {
                      showToast(e?.response?.data?.detail || "Create failed", "error");
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm"
                >
                  Save Plan
                </button>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 space-y-3 overflow-y-auto max-h-[420px]">
              <div className="text-lg font-semibold">Existing Plans</div>
              {plans.length === 0 ? (
                <div className="text-sm text-slate-300">No plans yet.</div>
              ) : (
                plans.map((p) => (
                  <div
                    key={p.plan_id}
                    className="border border-white/10 rounded-xl p-3 flex items-center justify-between text-sm"
                  >
                    <div className="space-y-0.5">
                      <div className="font-semibold">{p.name}</div>
                      <div className="text-xs text-slate-300">
                        {p.duration_months} month(s) • ₹{Number(p.price || 0).toFixed(0)}
                      </div>
                    </div>
                    <button
                      className={`px-3 py-1 rounded-lg text-xs ${
                        p.is_active ? "bg-emerald-600" : "bg-white/15"
                      }`}
                      onClick={async () => {
                        try {
                          await platformAxios.post(
                            `/platform/plans/${p.plan_id}/status`,
                            null,
                            { params: { is_active: !p.is_active } }
                          );
                          showToast("Plan status updated", "success");
                          await load();
                        } catch (e) {
                          showToast(e?.response?.data?.detail || "Update failed", "error");
                        }
                      }}
                    >
                      {p.is_active ? "Active" : "Inactive"}
                    </button>
                  </div>
                ))
              )}
            </div>
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
                      {r.business ? (
                        <div className="text-xs text-slate-300 mt-1">Business: {r.business}</div>
                      ) : null}
                      {r.message ? (
                        <div className="text-xs text-slate-200 mt-2 whitespace-pre-wrap">{r.message}</div>
                      ) : null}
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <div className="text-xs text-slate-200 font-semibold">Shop Type</div>
                        <select
                          className="rounded-lg px-2 py-2 text-xs bg-slate-900 border border-white/10"
                          value={shopTypes[r.request_id] || String(r.billing_type || "store").toLowerCase()}
                          onChange={(e) =>
                            setShopTypes((prev) => ({ ...prev, [r.request_id]: e.target.value.toLowerCase() }))
                          }
                        >
                          <option value="store">Store / Retail</option>
                          <option value="hotel">Hotel / Restaurant</option>
                        </select>
                        <div className="text-[11px] text-slate-400">Needed to enable the right modules.</div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <div className="text-xs text-slate-200 font-semibold">Monthly Amount</div>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="rounded-lg px-2 py-2 text-xs bg-slate-900 border border-white/10 w-28"
                          value={monthlyAmounts[r.request_id] ?? ""}
                          onChange={(e) =>
                            setMonthlyAmounts((prev) => ({
                              ...prev,
                              [r.request_id]: e.target.value === "" ? "" : e.target.value,
                            }))
                          }
                          placeholder="e.g., 999"
                        />
                        <div className="text-[11px] text-slate-400">Shared with acceptance email.</div>
                      </div>
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

      {selectedShopId ? (
        <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={closeShopDetail}>
          <div
            className="w-full max-w-xl h-full bg-slate-900 text-white p-6 overflow-y-auto border-l border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xs text-slate-400">Vendor #{selectedShopId}</div>
                <div className="text-xl font-semibold">Shop Details</div>
              </div>
              <button className="text-sm text-slate-300 hover:text-white" onClick={closeShopDetail}>
                ✕
              </button>
            </div>

            {shopDetailLoading ? (
              <div className="text-sm text-slate-300">Loading...</div>
            ) : selectedShopDetail ? (
              <div className="space-y-5">
                <div className="border border-white/10 rounded-xl p-4 space-y-1">
                  <div className="text-lg font-semibold">{selectedShopDetail.shop_name}</div>
                  <div className="text-xs text-slate-300">
                    Owner: {selectedShopDetail.owner_name || "-"} • Mobile: {selectedShopDetail.mobile || "-"} • Email:{" "}
                    {selectedShopDetail.mailid || "-"}
                  </div>
                  <div className="text-xs text-slate-400">
                    {[
                      selectedShopDetail.address_line1,
                      selectedShopDetail.address_line2,
                      selectedShopDetail.address_line3,
                      selectedShopDetail.city,
                      selectedShopDetail.state,
                      selectedShopDetail.pincode,
                    ]
                      .filter(Boolean)
                      .join(", ") || "No address"}
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    Status: <Status status={String(selectedShopDetail.status || "").toUpperCase()} />
                    <button
                      onClick={() =>
                        toggleShopStatus(selectedShopId, String(selectedShopDetail.status || "").toUpperCase())
                      }
                      disabled={busyId === selectedShopId}
                      className="px-3 py-1 rounded-lg bg-white/10 text-[11px] hover:bg-white/20 disabled:opacity-60"
                    >
                      {String(selectedShopDetail.status || "").toUpperCase() === "DISABLED" ? "Enable" : "Disable"}
                    </button>
                  </div>
                </div>

                <div className="border border-white/10 rounded-xl p-4 space-y-3">
                  <div className="text-sm font-semibold">Business Type</div>
                  <div className="flex items-center gap-4 text-sm">
                    {["store", "hotel"].map((bt) => (
                      <label key={bt} className="flex items-center gap-2">
                        <input
                          type="radio"
                          value={bt}
                          checked={billingType === bt}
                          onChange={(e) => setBillingType(e.target.value)}
                        />
                        {bt === "store" ? "Store / Retail" : "Hotel / Restaurant"}
                      </label>
                    ))}
                  </div>
                  <button
                    onClick={saveBillingType}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 text-sm"
                    disabled={busyId === selectedShopId}
                  >
                    Save Business Type
                  </button>
                </div>

                <div className="border border-white/10 rounded-xl p-4 space-y-3">
                  <div className="text-sm font-semibold">Plan & Renewal</div>
                  <div className="text-xs text-slate-300">
                    Current Plan: {selectedShopDetail.plan || "TRIAL"} • Paid until: {fmtDate(selectedShopDetail.paid_until)} • Last
                    payment: {fmtDate(selectedShopDetail.last_payment_on)} • Total paid: {fmtMoney(selectedShopDetail.total_paid)}
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-slate-300">Assign Plan</label>
                    <div className="flex flex-wrap gap-2">
                      <select
                        className="rounded-lg px-3 py-2 text-xs bg-slate-800 border border-white/10 w-48"
                        value={planSelections[selectedShopId] ?? ""}
                        onChange={(e) =>
                          setPlanSelections((prev) => ({ ...prev, [selectedShopId]: e.target.value || "" }))
                        }
                      >
                        <option value="">Select plan</option>
                        {plans.map((p) => (
                          <option key={p.plan_id} value={p.plan_id}>
                            {p.name} • {p.duration_months}m • ₹{Number(p.price || 0).toFixed(0)}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => savePlan(selectedShopId)}
                        disabled={busyId === selectedShopId}
                        className="px-3 py-2 rounded-lg bg-blue-600 text-xs disabled:opacity-60"
                      >
                        Apply Plan
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-slate-300">Extend / Payment</label>
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        className="rounded-lg px-3 py-2 text-xs bg-slate-800 border border-white/10"
                        type="number"
                        min="1"
                        placeholder="Extend days"
                        value={paymentForm.extend_days}
                        onChange={(e) => setPaymentForm((p) => ({ ...p, extend_days: e.target.value }))}
                      />
                      <input
                        className="rounded-lg px-3 py-2 text-xs bg-slate-800 border border-white/10"
                        type="date"
                        value={paymentForm.paid_until}
                        onChange={(e) => setPaymentForm((p) => ({ ...p, paid_until: e.target.value }))}
                      />
                      <input
                        className="rounded-lg px-3 py-2 text-xs bg-slate-800 border border-white/10"
                        type="number"
                        min="0"
                        placeholder="Amount"
                        value={paymentForm.amount}
                        onChange={(e) => setPaymentForm((p) => ({ ...p, amount: e.target.value }))}
                      />
                    </div>
                    <button
                      onClick={savePaymentForm}
                      disabled={busyId === selectedShopId}
                      className="px-3 py-2 rounded-lg bg-emerald-600 text-xs disabled:opacity-60"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-rose-300">Failed to load shop detail.</div>
            )}
          </div>
        </div>
      ) : null}
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
    DISABLED: "bg-gray-500",
  };

  return (
    <span className={`px-3 py-1 text-xs rounded-full ${map[status] || "bg-gray-500"}`}>
      {status || "UNKNOWN"}
    </span>
  );
}
