import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import platformAxios from "../../api/platformAxios";
import { clearPlatformToken, getPlatformToken } from "../../utils/platformAuth";
import { useToast } from "../../components/Toast";

const PRIMARY = "#2563eb";

const fmtDate = (v) => (v ? String(v) : "—");
const fmtMoney = (v) => `₹ ${Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SHOP_STATUS_CFG = {
  ACTIVE:   { pill: "bg-emerald-500/20 text-emerald-200 border-emerald-500/30", dot: "bg-emerald-400" },
  EXPIRED:  { pill: "bg-red-500/20 text-red-200 border-red-500/30",           dot: "bg-red-400" },
  TRIAL:    { pill: "bg-amber-500/20 text-amber-200 border-amber-500/30",     dot: "bg-amber-400" },
  DISABLED: { pill: "bg-slate-500/20 text-slate-300 border-slate-500/30",    dot: "bg-slate-400" },
};

export default function PlatformDashboard() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [tab, setTab] = useState("OVERVIEW");
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
  const [limitsForm, setLimitsForm] = useState({ max_branches: "", max_users: "" });
  const [billingType, setBillingType] = useState("store");

  const [busyId, setBusyId] = useState(null);
  const [acceptedInfo, setAcceptedInfo] = useState(null);

  // Module management for shop detail panel
  const [shopModules, setShopModules] = useState(null);   // null = loading
  const [modulesConfigured, setModulesConfigured] = useState(false);
  const [modulesSaving, setModulesSaving] = useState(false);

  // Direct shop creation
  const [directCreate, setDirectCreate] = useState({
    shop_name: "", owner_name: "", mobile: "", mailid: "",
    billing_type: "store", branch_name: "Head Office",
    admin_username: "admin", admin_name: "",
    address_line1: "", city: "", state: "", pincode: "",
  });
  const [directCreateBusy, setDirectCreateBusy] = useState(false);
  const [directCreatedInfo, setDirectCreatedInfo] = useState(null);
  const [demoDays, setDemoDays] = useState(7);
  const [shopTypes, setShopTypes] = useState({});
  const [monthlyAmounts, setMonthlyAmounts] = useState({});
  const [aboutContact, setAboutContact] = useState({
    name: "",
    mobile: "",
    email: "",
    insta: "",
    photo_url: "",
  });
  const [aboutPhotoFile, setAboutPhotoFile] = useState(null);
  const [aboutSaving, setAboutSaving] = useState(false);

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

      // Keep dashboard functional even when this newer endpoint is not deployed yet.
      try {
        const aboutRes = await platformAxios.get(`/platform/about-contact?_=${Date.now()}`);
        setAboutContact({
          name: aboutRes?.data?.name || "",
          mobile: aboutRes?.data?.mobile || "",
          email: aboutRes?.data?.email || "",
          insta: aboutRes?.data?.insta || "",
          photo_url: aboutRes?.data?.photo_url || "",
        });
      } catch {
        // Ignore optional endpoint failure (404/old backend) and keep defaults.
      }
    } catch (e) {
      showToast(e?.response?.data?.detail || "Failed to load platform data", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const defaults = {};
    const amounts = {};
    onboardReqs.forEach((r) => {
      defaults[r.request_id] = String(r.billing_type || "store").toLowerCase();
      const amt = Number(r.monthly_amount || 0);
      amounts[r.request_id] = Number.isFinite(amt) && amt > 0 ? amt : "";
    });
    setShopTypes(defaults);
    setMonthlyAmounts(amounts);
  }, [onboardReqs]);

  useEffect(() => {
    const p = {};
    shops.forEach((s) => { p[s.shop_id] = ""; });
    setPlanSelections(p);
  }, [shops]);

  const loadShopDetail = async (shopId) => {
    setShopDetailLoading(true);
    try {
      const res = await platformAxios.get(`/platform/shops/${shopId}/detail`);
      setSelectedShopDetail(res.data || null);
      setBillingType(String(res.data?.billing_type || "store").toLowerCase());
      setLimitsForm({
        max_branches: res.data?.max_branches != null ? String(res.data.max_branches) : "",
        max_users: res.data?.max_users != null ? String(res.data.max_users) : "",
      });
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
  const openSupportTickets = useMemo(
    () => supportTickets.filter((t) => String(t.status || "").toUpperCase() === "OPEN"),
    [supportTickets]
  );
  const activeShops = useMemo(
    () => shops.filter((s) => String(s.status || "").toUpperCase() === "ACTIVE").length, [shops]
  );
  const expiredShops = useMemo(
    () => shops.filter((s) => String(s.status || "").toUpperCase() === "EXPIRED").length, [shops]
  );
  const disabledShops = useMemo(
    () => shops.filter((s) => String(s.status || "").toUpperCase() === "DISABLED").length, [shops]
  );

  const logout = () => {
    clearPlatformToken();
    navigate("/platform/login", { replace: true });
  };

  const acceptOnboard = async (id) => {
    if (busyId) return;
    setBusyId(id);
    setAcceptedInfo(null);
    const bt = String(shopTypes[id] || "store").toLowerCase();
    const rawMonthly = monthlyAmounts[id];
    let monthly_amount = null;
    if (rawMonthly !== "" && rawMonthly !== undefined) {
      const num = Number(rawMonthly);
      monthly_amount = Number.isFinite(num) && num >= 0 ? num : null;
    }
    try {
      const res = await platformAxios.post(`/platform/onboard/requests/${id}/accept`, {
        billing_type: bt, monthly_amount,
      });
      setAcceptedInfo(res.data || null);
      if (res?.data?.admin_username && res?.data?.admin_password) {
        showToast(`Shop created. User: ${res.data.admin_username} | Pass: ${res.data.admin_password}`, "success");
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
    if (!window.confirm("Reject this onboarding request?")) return;
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
    if (!window.confirm("Reject this demo request?")) return;
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
      await platformAxios.post(`/platform/shops/${shopId}/update-payment`, { extend_days: Number(days || 30) });
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
      if (selectedShopId === shopId) await loadShopDetail(shopId);
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

  const saveLimits = async () => {
    if (!selectedShopId) return;
    const maxBranches = limitsForm.max_branches !== "" ? Number(limitsForm.max_branches) : null;
    const maxUsers = limitsForm.max_users !== "" ? Number(limitsForm.max_users) : null;
    if (
      (maxBranches !== null && (!Number.isFinite(maxBranches) || maxBranches < 1)) ||
      (maxUsers !== null && (!Number.isFinite(maxUsers) || maxUsers < 1))
    ) {
      showToast("Limits must be 1 or greater, or left blank for unlimited", "error");
      return;
    }
    const payload = {
      max_branches: maxBranches,
      max_users: maxUsers,
    };
    setBusyId(selectedShopId);
    try {
      try {
        await platformAxios.post(`/platform/shops/${selectedShopId}/update-limits`, payload);
      } catch (postError) {
        if (postError?.response?.status !== 405) throw postError;
        await platformAxios.put(`/platform/shops/${selectedShopId}/update-limits`, payload);
      }
      showToast("Limits updated", "success");
      await loadShopDetail(selectedShopId);
    } catch (e) {
      if (e?.response?.status === 404 || e?.response?.status === 405) {
        showToast("Restart the backend server, then try saving limits again", "error");
      } else {
        showToast(e?.response?.data?.detail || "Update failed", "error");
      }
    } finally {
      setBusyId(null);
    }
  };

  const loadShopModules = async (shopId) => {
    setShopModules(null);
    try {
      const res = await platformAxios.get(`/platform/shops/${shopId}/modules`);
      setModulesConfigured(Boolean(res?.data?.configured));
      setShopModules(res?.data?.modules || {});
    } catch {
      setShopModules({});
    }
  };

  const saveModules = async () => {
    if (!selectedShopId || !shopModules) return;
    setModulesSaving(true);
    try {
      await platformAxios.post(`/platform/shops/${selectedShopId}/modules`, { modules: shopModules });
      showToast("Modules updated", "success");
      setModulesConfigured(true);
    } catch (e) {
      showToast(e?.response?.data?.detail || "Failed to save modules", "error");
    } finally {
      setModulesSaving(false);
    }
  };

  const createShopDirect = async () => {
    if (!directCreate.shop_name.trim()) return showToast("Shop name required", "error");
    if (!directCreate.mailid.trim()) return showToast("Email required to send credentials", "error");
    setDirectCreateBusy(true);
    setDirectCreatedInfo(null);
    try {
      const res = await platformAxios.post("/platform/shops/create", {
        ...directCreate,
        shop_name: directCreate.shop_name.trim(),
        admin_username: (directCreate.admin_username || "admin").trim(),
      });
      setDirectCreatedInfo(res.data || null);
      showToast(res?.data?.email_sent ? "Shop created & credentials emailed" : "Shop created (email not sent)", "success");
      setDirectCreate({
        shop_name: "", owner_name: "", mobile: "", mailid: "",
        billing_type: "store", branch_name: "Head Office",
        admin_username: "admin", admin_name: "",
        address_line1: "", city: "", state: "", pincode: "",
      });
      await load();
    } catch (e) {
      showToast(e?.response?.data?.detail || "Creation failed", "error");
    } finally {
      setDirectCreateBusy(false);
    }
  };

  const openShopDetail = (shopId) => {
    setSelectedShopId(shopId);
    setSelectedShopDetail(null);
    setPaymentForm({ extend_days: "", paid_until: "", amount: "" });
    loadShopDetail(shopId);
    loadShopModules(shopId);
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

  const saveAboutContact = async () => {
    setAboutSaving(true);
    try {
      const payload = new FormData();
      payload.append("name", aboutContact.name || "");
      payload.append("mobile", aboutContact.mobile || "");
      payload.append("email", aboutContact.email || "");
      payload.append("insta", aboutContact.insta || "");
      if (aboutPhotoFile) payload.append("photo", aboutPhotoFile);

      let res;
      try {
        res = await platformAxios.post("/platform/about-contact", payload);
      } catch (postError) {
        if (postError?.response?.status !== 405) throw postError;
        // Some deployments/proxies may expose this endpoint with PUT.
        try {
          res = await platformAxios.put("/platform/about-contact", payload);
        } catch (putError) {
          if (putError?.response?.status !== 405) throw putError;
          // Legacy fallback: some runtimes allow only GET on this route.
          res = await platformAxios.get("/platform/about-contact", {
            params: {
              name: aboutContact.name || "",
              mobile: aboutContact.mobile || "",
              email: aboutContact.email || "",
              insta: aboutContact.insta || "",
            },
          });
          if (aboutPhotoFile) {
            showToast("Text fields saved. Photo upload needs POST/PUT support on backend.", "info");
          }
        }
      }
      setAboutContact({
        name: res?.data?.name || "",
        mobile: res?.data?.mobile || "",
        email: res?.data?.email || "",
        insta: res?.data?.insta || "",
        photo_url: res?.data?.photo_url || "",
      });
      setAboutPhotoFile(null);
      showToast("Website contact details updated", "success");
    } catch (e) {
      if (e?.response?.status === 404 || e?.response?.status === 405) {
        showToast("About-contact API not active on backend. Restart/redeploy backend and hard refresh browser.", "error");
      } else {
        showToast(e?.response?.data?.detail || "Failed to update website contact", "error");
      }
    } finally {
      setAboutSaving(false);
    }
  };

  const TABS = [
    { id: "OVERVIEW", label: "Overview",  icon: "📊", badge: null },
    { id: "SHOPS",    label: "Shops",     icon: "🏪", badge: shops.length || null },
    { id: "CREATE",   label: "Create",    icon: "➕", badge: null },
    { id: "PLANS",    label: "Plans",     icon: "📋", badge: null },
    { id: "WEBSITE",  label: "Website",   icon: "🌐", badge: null },
    { id: "ONBOARD",  label: "Onboard",   icon: "📥", badge: pendingOnboard.length || null },
    { id: "DEMO",     label: "Demo",      icon: "🎬", badge: openDemoTickets.length || null },
    { id: "SUPPORT",  label: "Support",   icon: "🎧", badge: openSupportTickets.length || null },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">

        {/* ── HEADER ── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-500/30 flex items-center justify-center text-lg">
              🛠️
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-widest font-medium">Haappii</p>
              <h1 className="text-2xl font-bold text-white">Platform Admin</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/8 hover:bg-white/15 border border-white/10 text-sm transition disabled:opacity-50"
            >
              {loading ? (
                <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : "↻"} Refresh
            </button>
            <button
              onClick={logout}
              className="px-4 py-2 rounded-xl bg-red-500/80 hover:bg-red-500 border border-red-400/20 text-sm transition"
            >
              Logout
            </button>
          </div>
        </div>

        {/* ── STAT CARDS ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard icon="💰" label={`Revenue (${revenue?.days || 30}d)`} value={fmtMoney(revenue?.total || 0)} accent="from-blue-600/20 to-blue-700/10" />
          <StatCard icon="🏪" label="Total Shops"   value={shops.length}    accent="from-slate-600/20 to-slate-700/10" />
          <StatCard icon="✅" label="Active"         value={activeShops}    accent="from-emerald-600/20 to-emerald-700/10" highlight />
          <StatCard icon="⏰" label="Expired"        value={expiredShops}   accent="from-red-600/20 to-red-700/10" />
          <StatCard icon="🚫" label="Disabled"       value={disabledShops}  accent="from-slate-600/20 to-slate-700/10" />
        </div>

        {/* ── CREDENTIALS BANNER ── */}
        {acceptedInfo?.admin_password && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 flex items-start gap-3">
            <span className="text-xl flex-shrink-0">🔑</span>
            <div>
              <div className="text-sm font-semibold text-emerald-200 mb-1">Shop Created — Copy Credentials Now</div>
              <div className="text-xs text-emerald-100 font-mono space-x-3">
                <span>Shop ID: <strong>{acceptedInfo.shop_id}</strong></span>
                <span>·</span>
                <span>Username: <strong>{acceptedInfo.admin_username}</strong></span>
                <span>·</span>
                <span>Password: <strong>{acceptedInfo.admin_password}</strong></span>
                {acceptedInfo.expires_on && (
                  <><span>·</span><span>Expires: <strong>{acceptedInfo.expires_on}</strong></span></>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB NAV ── */}
        <div className="flex flex-wrap gap-2 border-b border-white/10 pb-0">
          {TABS.map((t) => {
            const isActive = tab === t.id;
            const isSupport = t.id === "SUPPORT";
            return (
              <button
                key={t.id}
                onClick={() => {
                  if (isSupport) { navigate("/platform/support"); return; }
                  setTab(t.id);
                }}
                className={`relative flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-sm font-medium transition border-b-2 -mb-px ${
                  isActive
                    ? "border-blue-500 text-white bg-blue-600/20"
                    : "border-transparent text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <span>{t.icon}</span>
                <span>{t.label}</span>
                {t.badge > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center ${
                    isActive ? "bg-blue-500 text-white" : "bg-white/15 text-slate-300"
                  }`}>
                    {t.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── TAB CONTENT ── */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-blue-500/30 border-t-blue-500 animate-spin" />
            <p className="text-slate-400 text-sm">Loading platform data…</p>
          </div>
        ) : tab === "OVERVIEW" ? (
          <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Revenue Trend — last 30 days</h3>
              <span className="text-xs text-slate-400">Hover bar for details</span>
            </div>
            {revenueSeries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-400">
                <span className="text-3xl opacity-30">📉</span>
                <p className="text-sm">No revenue data yet.</p>
              </div>
            ) : (
              <div>
                <div className="flex items-end gap-1 h-40 relative">
                  {/* grid lines */}
                  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="border-t border-white/5 w-full" />
                    ))}
                  </div>
                  {revenueSeries.map((r) => {
                    const max = Math.max(...revenueSeries.map((x) => x.revenue || 0), 1);
                    const h = Math.max(4, Math.round((Number(r.revenue || 0) / max) * 152));
                    const hasRev = Number(r.revenue || 0) > 0;
                    return (
                      <div key={r.date} className="group flex-1 flex flex-col items-center">
                        <div
                          className={`w-full rounded-t-md transition group-hover:opacity-90 ${
                            hasRev ? "bg-blue-500" : "bg-white/10"
                          }`}
                          style={{ height: h }}
                          title={`${r.date}: ${fmtMoney(r.revenue)}`}
                        />
                        <div className="text-[9px] text-center text-slate-500 mt-1">
                          {new Date(r.date).getDate()}
                        </div>
                        {/* tooltip */}
                        {hasRev && (
                          <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block bg-slate-800 text-white text-[10px] px-2 py-1 rounded-lg whitespace-nowrap pointer-events-none shadow-lg z-10">
                            {fmtMoney(r.revenue)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 text-right text-sm font-semibold text-blue-300">
                  Total: {fmtMoney(revenue?.total || 0)}
                </div>
              </div>
            )}
          </div>
        ) : tab === "SHOPS" ? (
          <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-base font-semibold">All Shops</h3>
              <span className="text-xs text-slate-400">{shops.length} total</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-slate-400 uppercase tracking-wider border-b border-white/10 bg-white/3">
                    <th className="py-3 px-5 text-left font-semibold">Shop</th>
                    <th className="py-3 px-3 text-center font-semibold">Status</th>
                    <th className="py-3 px-3 text-left font-semibold">Plan</th>
                    <th className="py-3 px-3 text-left font-semibold">Last Payment</th>
                    <th className="py-3 px-3 text-left font-semibold">Next Renewal</th>
                    <th className="py-3 px-3 text-right font-semibold">Revenue</th>
                    <th className="py-3 px-3 text-center font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {shops.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">No shops found.</td>
                    </tr>
                  ) : shops.map((s) => {
                    const statusKey = String(s.status || "").toUpperCase();
                    const statusCfg = SHOP_STATUS_CFG[statusKey] || SHOP_STATUS_CFG.DISABLED;
                    return (
                      <tr
                        key={s.shop_id}
                        className="hover:bg-white/5 transition cursor-pointer"
                        onClick={() => openShopDetail(s.shop_id)}
                      >
                        <td className="py-3 px-5">
                          <div className="font-semibold text-white">{s.shop_name || `Shop #${s.shop_id}`}</div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            #{s.shop_id}{s.mailid ? ` · ${s.mailid}` : ""}{s.mobile ? ` · ${s.mobile}` : ""}
                          </div>
                          {s.is_demo && (
                            <div className="text-[10px] text-amber-400 mt-0.5">Demo · expires {fmtDate(s.expires_on)}</div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-semibold ${statusCfg.pill}`}>
                            <span className={`w-1 h-1 rounded-full ${statusCfg.dot}`} />
                            {statusKey || "UNKNOWN"}
                          </span>
                        </td>
                        <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-2">
                            <select
                              className="rounded-lg px-2 py-1.5 text-xs bg-slate-900/80 border border-white/10 text-white max-w-[140px]"
                              value={planSelections[s.shop_id] ?? ""}
                              onChange={(e) =>
                                setPlanSelections((prev) => ({ ...prev, [s.shop_id]: e.target.value || "" }))
                              }
                            >
                              <option value="">Select plan</option>
                              {plans.map((p) => (
                                <option key={p.plan_id} value={p.plan_id}>
                                  {p.name} · {p.duration_months}m · ₹{Number(p.price || 0).toFixed(0)}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => savePlan(s.shop_id)}
                              disabled={busyId === s.shop_id}
                              className="px-2 py-1.5 bg-blue-600/70 hover:bg-blue-600 rounded-lg text-[11px] transition disabled:opacity-50"
                            >
                              Save
                            </button>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-xs text-slate-300">{fmtDate(s.last_payment_on)}</td>
                        <td className="py-3 px-3 text-xs text-slate-300">{fmtDate(s.next_renewal)}</td>
                        <td className="py-3 px-3 text-right text-xs font-semibold text-emerald-300">{fmtMoney(s.revenue || 0)}</td>
                        <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1.5 justify-center">
                            <button
                              onClick={() => extendPayment(s.shop_id, 30)}
                              disabled={busyId === s.shop_id}
                              className="px-2.5 py-1.5 bg-emerald-500/70 hover:bg-emerald-500 rounded-lg text-[11px] transition disabled:opacity-50 whitespace-nowrap"
                            >
                              +30d
                            </button>
                            <button
                              onClick={() => sendReminder(s.shop_id)}
                              disabled={busyId === s.shop_id}
                              className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-[11px] transition disabled:opacity-50"
                            >
                              📧
                            </button>
                            <button
                              onClick={() => toggleShopStatus(s.shop_id, statusKey)}
                              disabled={busyId === s.shop_id}
                              className={`px-2.5 py-1.5 rounded-lg text-[11px] transition disabled:opacity-50 ${
                                statusKey === "DISABLED"
                                  ? "bg-emerald-500/60 hover:bg-emerald-500"
                                  : "bg-red-500/60 hover:bg-red-500"
                              }`}
                            >
                              {statusKey === "DISABLED" ? "Enable" : "Disable"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : tab === "PLANS" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6 space-y-4">
              <h3 className="text-base font-semibold">Create New Plan</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-slate-400 font-medium">Plan Name</label>
                  <input
                    className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-900/80 border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={newPlan.name}
                    onChange={(e) => setNewPlan((p) => ({ ...p, name: e.target.value }))}
                    placeholder="e.g., 3 Month Pack"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 font-medium">Duration (months)</label>
                    <input
                      type="number" min="1" max="36"
                      className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-900/80 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={newPlan.duration_months}
                      onChange={(e) => setNewPlan((p) => ({ ...p, duration_months: Number(e.target.value || 1) }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 font-medium">Price (₹)</label>
                    <input
                      type="number" min="0"
                      className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-900/80 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                        name: newPlan.name.trim(), duration_months: duration, price,
                      });
                      showToast("Plan created", "success");
                      setNewPlan({ name: "", duration_months: 1, price: "" });
                      await load();
                    } catch (e) {
                      showToast(e?.response?.data?.detail || "Create failed", "error");
                    }
                  }}
                  className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition"
                >
                  Create Plan
                </button>
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6 space-y-3 overflow-y-auto max-h-[420px]">
              <h3 className="text-base font-semibold">Existing Plans</h3>
              {plans.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center">No plans yet.</p>
              ) : plans.map((p) => (
                <div key={p.plan_id} className="flex items-center justify-between border border-white/10 rounded-xl p-3 bg-white/3">
                  <div>
                    <div className="font-semibold text-sm">{p.name}</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {p.duration_months} month{p.duration_months !== 1 ? "s" : ""} · ₹{Number(p.price || 0).toLocaleString("en-IN")}
                    </div>
                  </div>
                  <button
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      p.is_active
                        ? "bg-emerald-500/20 text-emerald-200 border border-emerald-500/30 hover:bg-emerald-500/30"
                        : "bg-white/8 text-slate-400 border border-white/10 hover:bg-white/15"
                    }`}
                    onClick={async () => {
                      try {
                        await platformAxios.post(`/platform/plans/${p.plan_id}/status`, null, {
                          params: { is_active: !p.is_active },
                        });
                        showToast("Plan status updated", "success");
                        await load();
                      } catch (e) {
                        showToast(e?.response?.data?.detail || "Update failed", "error");
                      }
                    }}
                  >
                    {p.is_active ? "✓ Active" : "Inactive"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : tab === "WEBSITE" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6 space-y-4">
              <h3 className="text-base font-semibold">About Page Contact</h3>
              <p className="text-xs text-slate-400">Edit details shown in the public About page.</p>

              <div>
                <label className="text-xs text-slate-400 font-medium">Name</label>
                <input
                  className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-900/80 border border-white/10 text-sm text-white"
                  value={aboutContact.name}
                  onChange={(e) => setAboutContact((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Support name"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 font-medium">Mobile / WhatsApp</label>
                <input
                  className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-900/80 border border-white/10 text-sm text-white"
                  value={aboutContact.mobile}
                  onChange={(e) => setAboutContact((p) => ({ ...p, mobile: e.target.value }))}
                  placeholder="+91 ..."
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 font-medium">Email</label>
                <input
                  className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-900/80 border border-white/10 text-sm text-white"
                  value={aboutContact.email}
                  onChange={(e) => setAboutContact((p) => ({ ...p, email: e.target.value }))}
                  placeholder="support@example.com"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 font-medium">Instagram ID</label>
                <input
                  className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-900/80 border border-white/10 text-sm text-white"
                  value={aboutContact.insta}
                  onChange={(e) => setAboutContact((p) => ({ ...p, insta: e.target.value }))}
                  placeholder="@haappiibilling"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 font-medium">Photo</label>
                <input
                  type="file"
                  accept="image/*"
                  className="mt-1 block w-full text-xs text-slate-300 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-blue-600/80 file:text-white hover:file:bg-blue-600"
                  onChange={(e) => setAboutPhotoFile(e.target.files?.[0] || null)}
                />
                <p className="mt-1 text-[11px] text-slate-500">Upload to replace current About photo.</p>
              </div>

              <button
                onClick={saveAboutContact}
                disabled={aboutSaving}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition disabled:opacity-60"
              >
                {aboutSaving ? "Saving..." : "Save Contact Details"}
              </button>
            </div>

            <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6 space-y-4">
              <h3 className="text-base font-semibold">Preview</h3>
              <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 space-y-3">
                <div className="flex items-center gap-3">
                  {aboutPhotoFile ? (
                    <img
                      src={URL.createObjectURL(aboutPhotoFile)}
                      alt="Contact preview"
                      className="w-16 h-16 rounded-xl object-cover"
                    />
                  ) : aboutContact.photo_url ? (
                    <img
                      src={aboutContact.photo_url}
                      alt="Contact"
                      className="w-16 h-16 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-blue-600/60 flex items-center justify-center font-bold text-xl">
                      {(aboutContact.name || "H").trim().charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-semibold text-white">{aboutContact.name || "Name"}</div>
                    <div className="text-xs text-slate-400">{aboutContact.mobile || "Mobile / WhatsApp"}</div>
                  </div>
                </div>
                <div className="text-xs text-slate-300">Email: {aboutContact.email || "-"}</div>
                <div className="text-xs text-slate-300">Instagram: {aboutContact.insta || "-"}</div>
              </div>
            </div>
          </div>
        ) : tab === "ONBOARD" ? (
          <div className="space-y-4">
            {pendingOnboard.length === 0 ? (
              <EmptyState icon="📥" title="No pending onboarding requests" />
            ) : pendingOnboard.map((r) => (
              <div key={r.request_id} className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-3">
                    <div>
                      <div className="font-semibold text-white">
                        #{r.request_id} · {r.shop_name}{r.branch_name ? ` · ${r.branch_name}` : ""}
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        {r.requester_name || "Requester"}
                        {r.requester_email ? ` · ${r.requester_email}` : ""}
                        {r.requester_phone ? ` · ${r.requester_phone}` : ""}
                      </div>
                      {r.business && <div className="text-xs text-slate-400">Business: {r.business}</div>}
                    </div>
                    {r.message && (
                      <p className="text-sm text-slate-200 bg-white/5 rounded-xl p-3 border border-white/8 whitespace-pre-wrap leading-relaxed">
                        {r.message}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-4">
                      <div>
                        <label className="text-xs text-slate-400 font-medium block mb-1">Shop Type</label>
                        <select
                          className="rounded-xl px-3 py-2 text-xs bg-slate-900/80 border border-white/10 text-white"
                          value={shopTypes[r.request_id] || String(r.billing_type || "store").toLowerCase()}
                          onChange={(e) => setShopTypes((prev) => ({ ...prev, [r.request_id]: e.target.value.toLowerCase() }))}
                        >
                          <option value="store">🏪 Store / Retail</option>
                          <option value="hotel">🍽️ Hotel / Restaurant</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-slate-400 font-medium block mb-1">Monthly Amount (₹)</label>
                        <input
                          type="number" min="0" step="0.01"
                          className="rounded-xl px-3 py-2 text-xs bg-slate-900/80 border border-white/10 text-white w-32"
                          value={monthlyAmounts[r.request_id] ?? ""}
                          onChange={(e) =>
                            setMonthlyAmounts((prev) => ({ ...prev, [r.request_id]: e.target.value === "" ? "" : e.target.value }))
                          }
                          placeholder="e.g., 999"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <button
                      onClick={() => acceptOnboard(r.request_id)}
                      disabled={busyId === r.request_id}
                      className="px-4 py-2 rounded-xl text-white text-sm font-medium transition disabled:opacity-60"
                      style={{ background: PRIMARY }}
                    >
                      ✓ Accept & Create
                    </button>
                    <button
                      onClick={() => rejectOnboard(r.request_id)}
                      disabled={busyId === r.request_id}
                      className="px-4 py-2 rounded-xl bg-white/8 hover:bg-red-500/20 border border-white/10 text-sm transition disabled:opacity-60 text-slate-300"
                    >
                      ✕ Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : tab === "DEMO" ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-4 py-3">
              <label className="text-sm text-slate-300 font-medium">Demo Duration:</label>
              <div className="flex gap-2">
                {[7, 14, 30, 60].map((d) => (
                  <button
                    key={d}
                    onClick={() => setDemoDays(d)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                      demoDays === d
                        ? "bg-blue-600 text-white"
                        : "bg-white/8 text-slate-300 hover:bg-white/15 border border-white/10"
                    }`}
                  >
                    {d} days
                  </button>
                ))}
              </div>
            </div>
            {openDemoTickets.length === 0 ? (
              <EmptyState icon="🎬" title="No open demo requests" />
            ) : openDemoTickets.map((t) => (
              <div key={t.ticket_id} className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-white">
                      #{t.ticket_id} · {t.user_name || "User"}
                      {t.email ? ` · ${t.email}` : ""}
                      {t.phone ? ` · ${t.phone}` : ""}
                    </div>
                    {t.business && <div className="text-xs text-slate-400 mt-1">{t.business}</div>}
                    {t.message && (
                      <p className="text-sm text-slate-200 mt-3 bg-white/5 rounded-xl p-3 border border-white/8 whitespace-pre-wrap leading-relaxed">
                        {t.message}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <button
                      onClick={() => acceptDemo(t.ticket_id)}
                      disabled={busyId === t.ticket_id}
                      className="px-4 py-2 rounded-xl text-white text-sm font-medium transition disabled:opacity-60"
                      style={{ background: PRIMARY }}
                    >
                      ✓ Accept ({demoDays}d)
                    </button>
                    <button
                      onClick={() => rejectDemo(t.ticket_id)}
                      disabled={busyId === t.ticket_id}
                      className="px-4 py-2 rounded-xl bg-white/8 hover:bg-red-500/20 border border-white/10 text-sm transition disabled:opacity-60 text-slate-300"
                    >
                      ✕ Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : tab === "CREATE" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {/* ── Direct Create Form ── */}
            <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6 space-y-4">
              <h3 className="text-base font-semibold">Create Shop Directly</h3>
              <p className="text-xs text-slate-400">Creates the shop, admin user, and emails credentials instantly — no approval step.</p>

              {[
                { label: "Shop Name *", key: "shop_name", placeholder: "e.g. Raj Stores" },
                { label: "Owner Name", key: "owner_name", placeholder: "e.g. Rajan K" },
                { label: "Mobile", key: "mobile", placeholder: "+91 9876543210" },
                { label: "Email (for credentials) *", key: "mailid", placeholder: "owner@example.com" },
                { label: "Branch Name", key: "branch_name", placeholder: "Head Office" },
                { label: "Admin Username", key: "admin_username", placeholder: "admin" },
                { label: "Admin Display Name", key: "admin_name", placeholder: "Admin" },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="text-xs text-slate-400 font-medium">{label}</label>
                  <input
                    className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-900/80 border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={directCreate[key]}
                    onChange={(e) => setDirectCreate((p) => ({ ...p, [key]: e.target.value }))}
                    placeholder={placeholder}
                  />
                </div>
              ))}

              <div>
                <label className="text-xs text-slate-400 font-medium block mb-1">Business Type</label>
                <div className="flex gap-3">
                  {[{ val: "store", label: "🏪 Store / Retail" }, { val: "hotel", label: "🍽️ Hotel / Restaurant" }].map(({ val, label }) => (
                    <label key={val} className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border cursor-pointer text-sm transition ${directCreate.billing_type === val ? "border-blue-500/50 bg-blue-500/15 text-white" : "border-white/10 bg-white/3 text-slate-400 hover:bg-white/8"}`}>
                      <input type="radio" value={val} checked={directCreate.billing_type === val} onChange={(e) => setDirectCreate((p) => ({ ...p, billing_type: e.target.value }))} className="sr-only" />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              <button
                onClick={createShopDirect}
                disabled={directCreateBusy}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition disabled:opacity-60"
              >
                {directCreateBusy ? "Creating…" : "Create Shop & Send Credentials"}
              </button>
            </div>

            {/* ── Credentials Banner ── */}
            <div className="space-y-4">
              {directCreatedInfo?.admin_password ? (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🔑</span>
                    <p className="text-sm font-semibold text-emerald-200">Shop Created — Save Credentials</p>
                  </div>
                  {[
                    { label: "Shop ID", val: directCreatedInfo.shop_id },
                    { label: "Username", val: directCreatedInfo.admin_username },
                    { label: "Password", val: directCreatedInfo.admin_password },
                  ].map(({ label, val }) => (
                    <div key={label} className="flex justify-between text-xs bg-white/5 rounded-lg px-3 py-2">
                      <span className="text-slate-400">{label}</span>
                      <span className="font-mono font-bold text-white">{val}</span>
                    </div>
                  ))}
                  <div className={`text-xs mt-1 ${directCreatedInfo.email_sent ? "text-emerald-300" : "text-amber-300"}`}>
                    {directCreatedInfo.email_sent ? "✓ Credentials emailed to owner" : "⚠ Email not sent — SMTP not configured"}
                  </div>
                  <p className="text-[11px] text-slate-500">This shop starts with Sales Billing + Item Management only. Enable more modules from the shop detail panel.</p>
                </div>
              ) : (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-10 flex flex-col items-center gap-3 text-center text-slate-400">
                  <span className="text-3xl opacity-30">➕</span>
                  <p className="text-sm">Fill the form and create a shop. Credentials will appear here.</p>
                </div>
              )}
            </div>
          </div>
        ) : tab === "SUPPORT" ? (
          <div className="space-y-3">
            {supportTickets.length === 0 ? (
              <EmptyState icon="🎧" title="No support tickets" />
            ) : supportTickets.map((t) => {
              const statusKey = String(t.status || "").toUpperCase();
              const statusColors = {
                OPEN: "text-amber-300 bg-amber-500/15 border-amber-500/30",
                IN_PROGRESS: "text-blue-300 bg-blue-500/15 border-blue-500/30",
                RESOLVED: "text-emerald-300 bg-emerald-500/15 border-emerald-500/30",
                CLOSED: "text-slate-300 bg-slate-500/15 border-slate-500/30",
              };
              return (
                <div key={t.ticket_id} className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-semibold text-white text-sm">#{t.ticket_id}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${statusColors[statusKey] || statusColors.OPEN}`}>
                          {statusKey}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/10 text-slate-300">{t.ticket_type}</span>
                      </div>
                      <div className="text-xs text-slate-400">
                        {t.user_name || "User"}{t.shop_name ? ` · ${t.shop_name}` : ""}{t.branch_name ? ` · ${t.branch_name}` : ""}
                      </div>
                      {t.message && (
                        <p className="text-xs text-slate-300 mt-2 line-clamp-2 whitespace-pre-wrap">{t.message}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {t.attachment_path && (
                        <a
                          className="px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/15 text-xs text-blue-300 transition"
                          href={`/api/platform/support/tickets/${t.ticket_id}/attachment`}
                          target="_blank" rel="noreferrer"
                        >
                          📎
                        </a>
                      )}
                      <select
                        className="rounded-xl px-2.5 py-1.5 text-xs bg-slate-900/80 border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                        value={t.status}
                        disabled={busyId === t.ticket_id}
                        onChange={(e) => updateTicketStatus(t.ticket_id, e.target.value)}
                      >
                        {["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white/5 rounded-2xl border border-white/10 p-10 text-center text-slate-400">
            Use the tabs above to manage shops, onboarding, demos and support.
          </div>
        )}
      </div>

      {/* ── SHOP DETAIL PANEL ── */}
      {selectedShopId && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-end"
          onClick={closeShopDetail}
        >
          <div
            className="w-full max-w-lg h-full bg-slate-900 border-l border-white/10 overflow-y-auto flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 sticky top-0 bg-slate-900 z-10">
              <div>
                <p className="text-xs text-slate-500 font-mono">Shop #{selectedShopId}</p>
                <h2 className="text-lg font-bold text-white">Shop Details</h2>
              </div>
              <button
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/8 hover:bg-white/15 text-slate-400 hover:text-white transition text-sm"
                onClick={closeShopDetail}
              >
                ✕
              </button>
            </div>

            <div className="flex-1 p-6 space-y-5">
              {shopDetailLoading ? (
                <div className="flex flex-col gap-4 animate-pulse">
                  <div className="h-20 bg-white/5 rounded-xl" />
                  <div className="h-24 bg-white/5 rounded-xl" />
                  <div className="h-40 bg-white/5 rounded-xl" />
                </div>
              ) : selectedShopDetail ? (
                <>
                  {/* shop info */}
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
                    <div className="text-lg font-bold text-white">{selectedShopDetail.shop_name}</div>
                    <div className="text-xs text-slate-400 space-y-0.5">
                      <div>Owner: {selectedShopDetail.owner_name || "—"} · Mobile: {selectedShopDetail.mobile || "—"}</div>
                      <div>Email: {selectedShopDetail.mailid || "—"}</div>
                      <div>{[selectedShopDetail.address_line1, selectedShopDetail.address_line2, selectedShopDetail.city, selectedShopDetail.state, selectedShopDetail.pincode].filter(Boolean).join(", ") || "No address"}</div>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      {(() => {
                        const sk = String(selectedShopDetail.status || "").toUpperCase();
                        const cfg = SHOP_STATUS_CFG[sk] || SHOP_STATUS_CFG.DISABLED;
                        return (
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-semibold ${cfg.pill}`}>
                            <span className={`w-1 h-1 rounded-full ${cfg.dot}`} />
                            {sk}
                          </span>
                        );
                      })()}
                      <button
                        onClick={() => toggleShopStatus(selectedShopId, String(selectedShopDetail.status || "").toUpperCase())}
                        disabled={busyId === selectedShopId}
                        className={`px-3 py-1 rounded-lg text-[11px] transition disabled:opacity-60 ${
                          String(selectedShopDetail.status || "").toUpperCase() === "DISABLED"
                            ? "bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30"
                            : "bg-red-500/20 text-red-200 hover:bg-red-500/30"
                        }`}
                      >
                        {String(selectedShopDetail.status || "").toUpperCase() === "DISABLED" ? "Enable Shop" : "Disable Shop"}
                      </button>
                    </div>
                  </div>

                  {/* business type */}
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                    <p className="text-sm font-semibold">Business Type</p>
                    <div className="flex gap-3">
                      {[{ val: "store", label: "🏪 Store / Retail" }, { val: "hotel", label: "🍽️ Hotel / Restaurant" }].map(({ val, label }) => (
                        <label key={val} className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border cursor-pointer transition text-sm ${
                          billingType === val
                            ? "border-blue-500/50 bg-blue-500/15 text-white"
                            : "border-white/10 bg-white/3 text-slate-400 hover:bg-white/8"
                        }`}>
                          <input type="radio" value={val} checked={billingType === val} onChange={(e) => setBillingType(e.target.value)} className="sr-only" />
                          {label}
                        </label>
                      ))}
                    </div>
                    <button
                      onClick={saveBillingType}
                      disabled={busyId === selectedShopId}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-medium transition disabled:opacity-60"
                    >
                      Save Business Type
                    </button>
                  </div>

                  {/* limits */}
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                    <p className="text-sm font-semibold">Branch & User Limits</p>
                    <p className="text-xs text-slate-400">Leave blank to allow unlimited. Shop will get an error when the limit is reached.</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-slate-400 font-medium block mb-1">Max Branches</label>
                        <input
                          type="number" min="1" max="500"
                          className="w-full rounded-xl px-3 py-2 text-xs bg-slate-900/80 border border-white/10 text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          value={limitsForm.max_branches}
                          onChange={(e) => setLimitsForm((f) => ({ ...f, max_branches: e.target.value }))}
                          placeholder="Unlimited"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-400 font-medium block mb-1">Max Users</label>
                        <input
                          type="number" min="1" max="500"
                          className="w-full rounded-xl px-3 py-2 text-xs bg-slate-900/80 border border-white/10 text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          value={limitsForm.max_users}
                          onChange={(e) => setLimitsForm((f) => ({ ...f, max_users: e.target.value }))}
                          placeholder="Unlimited"
                        />
                      </div>
                    </div>
                    <button
                      onClick={saveLimits}
                      disabled={busyId === selectedShopId}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-medium transition disabled:opacity-60"
                    >
                      Save Limits
                    </button>
                  </div>

                  {/* modules */}
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold">Feature Modules</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {modulesConfigured ? "Custom access configured." : "Currently unrestricted (all modules visible)."}
                        </p>
                      </div>
                      <button
                        onClick={saveModules}
                        disabled={modulesSaving || !shopModules}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium transition disabled:opacity-50"
                      >
                        {modulesSaving ? "Saving…" : "Save Modules"}
                      </button>
                    </div>

                    {shopModules === null ? (
                      <div className="text-xs text-slate-400 py-2 text-center">Loading modules…</div>
                    ) : (() => {
                      const GROUPS = [
                        { label: "Always On (Core)", keys: ["sales_billing", "inventory"], core: true },
                        { label: "Main", keys: ["cash_drawer", "trends", "analytics"] },
                        { label: "Billing", keys: ["billing_history", "table_billing", "qr_orders", "order_live", "kot_management", "reservations", "delivery", "recipes", "online_orders", "advance_orders", "offline_sync"] },
                        { label: "Operations", keys: ["drafts", "returns", "dues", "expenses", "customers"] },
                        { label: "HR", keys: ["employees", "employee_attendance", "employee_onboarding"] },
                        { label: "Promotions", keys: ["loyalty", "gift_cards", "coupons"] },
                        { label: "Inventory", keys: ["supplier_ledger", "stock_audit", "item_lots", "labels", "transfers"] },
                        { label: "Reports", keys: ["reports", "feedback_review", "deleted_invoices"] },
                        { label: "System", keys: ["alerts", "support_tickets", "admin"] },
                      ];
                      const fmt = (k) => k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
                      return (
                        <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                          {GROUPS.map(({ label, keys, core }) => (
                            <div key={label}>
                              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">{label}</p>
                              <div className="grid grid-cols-2 gap-1.5">
                                {keys.map((k) => {
                                  const on = core ? true : Boolean(shopModules[k]);
                                  return (
                                    <button
                                      key={k}
                                      disabled={core}
                                      onClick={() => !core && setShopModules((p) => ({ ...p, [k]: !p[k] }))}
                                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-[11px] transition ${
                                        on
                                          ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-200"
                                          : "bg-white/3 border-white/10 text-slate-500 hover:bg-white/8"
                                      } ${core ? "opacity-60 cursor-default" : "cursor-pointer"}`}
                                    >
                                      <span>{fmt(k)}</span>
                                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${on ? "bg-emerald-400" : "bg-slate-600"}`} />
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                  {/* plan & renewal */}
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-4">
                    <p className="text-sm font-semibold">Plan & Renewal</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-white/5 rounded-lg p-2.5">
                        <p className="text-slate-500 mb-0.5">Current Plan</p>
                        <p className="text-white font-medium">{selectedShopDetail.plan || "TRIAL"}</p>
                      </div>
                      <div className="bg-white/5 rounded-lg p-2.5">
                        <p className="text-slate-500 mb-0.5">Paid Until</p>
                        <p className="text-white font-medium">{fmtDate(selectedShopDetail.paid_until)}</p>
                      </div>
                      <div className="bg-white/5 rounded-lg p-2.5">
                        <p className="text-slate-500 mb-0.5">Last Payment</p>
                        <p className="text-white font-medium">{fmtDate(selectedShopDetail.last_payment_on)}</p>
                      </div>
                      <div className="bg-white/5 rounded-lg p-2.5">
                        <p className="text-slate-500 mb-0.5">Total Paid</p>
                        <p className="text-emerald-300 font-medium">{fmtMoney(selectedShopDetail.total_paid)}</p>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-slate-400 font-medium block mb-1">Assign Plan</label>
                      <div className="flex gap-2">
                        <select
                          className="flex-1 rounded-xl px-3 py-2 text-xs bg-slate-900/80 border border-white/10 text-white"
                          value={planSelections[selectedShopId] ?? ""}
                          onChange={(e) =>
                            setPlanSelections((prev) => ({ ...prev, [selectedShopId]: e.target.value || "" }))
                          }
                        >
                          <option value="">Select plan</option>
                          {plans.map((p) => (
                            <option key={p.plan_id} value={p.plan_id}>
                              {p.name} · {p.duration_months}m · ₹{Number(p.price || 0).toFixed(0)}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => savePlan(selectedShopId)}
                          disabled={busyId === selectedShopId}
                          className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs transition disabled:opacity-60"
                        >
                          Apply
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-slate-400 font-medium block mb-1">Extend / Payment Override</label>
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          className="rounded-xl px-3 py-2 text-xs bg-slate-900/80 border border-white/10 text-white placeholder-slate-600"
                          type="number" min="1" placeholder="Days"
                          value={paymentForm.extend_days}
                          onChange={(e) => setPaymentForm((p) => ({ ...p, extend_days: e.target.value }))}
                        />
                        <input
                          className="rounded-xl px-3 py-2 text-xs bg-slate-900/80 border border-white/10 text-white"
                          type="date"
                          value={paymentForm.paid_until}
                          onChange={(e) => setPaymentForm((p) => ({ ...p, paid_until: e.target.value }))}
                        />
                        <input
                          className="rounded-xl px-3 py-2 text-xs bg-slate-900/80 border border-white/10 text-white placeholder-slate-600"
                          type="number" min="0" placeholder="₹ Amount"
                          value={paymentForm.amount}
                          onChange={(e) => setPaymentForm((p) => ({ ...p, amount: e.target.value }))}
                        />
                      </div>
                      <button
                        onClick={savePaymentForm}
                        disabled={busyId === selectedShopId}
                        className="mt-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-medium transition disabled:opacity-60"
                      >
                        Apply Changes
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-sm text-rose-300 text-center py-8">Failed to load shop detail.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, accent }) {
  return (
    <div className={`bg-gradient-to-br ${accent} border border-white/10 backdrop-blur-xl p-4 rounded-2xl space-y-2`}>
      <div className="flex items-center justify-between">
        <span className="text-xl">{icon}</span>
      </div>
      <div className="text-xs text-slate-400 font-medium leading-tight">{label}</div>
      <div className="text-xl font-bold text-white truncate">{value}</div>
    </div>
  );
}

function EmptyState({ icon, title }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-12 flex flex-col items-center gap-3 text-center">
      <span className="text-4xl opacity-30">{icon}</span>
      <p className="text-slate-400">{title}</p>
    </div>
  );
}
