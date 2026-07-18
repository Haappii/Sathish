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

  // Portfolio editor state
  const BLANK_PORTFOLIO = {
    visible_sections: {
      hero: true, stats: true, tech_marquee: true, about: true,
      experience: true, projects: true, education: true, certification: true, contact: true,
    },
    hero_name: "",
    hero_badge: "Available for opportunities",
    hero_title_line1: "More Than Just",
    hero_title_line2: "Queries & Code",
    hero_subtitle: "",
    photo_url: "",
    profile_summary: "",
    profile_detail_1: "",
    profile_detail_2: "",
    phone: "",
    email: "",
    location: "",
    linkedin_url: "",
    github_url: "",
    stats: [
      { number: "3", suffix: "+", label: "Years of Experience" },
      { number: "40", suffix: "+", label: "REST API Endpoints" },
      { number: "50", suffix: "+", label: "Database Schemas" },
      { number: "30", suffix: "%", label: "Turnaround Improvement" },
    ],
    tech_stack: ["PostgreSQL", "FastAPI", "Python", "SQLAlchemy", "Oracle", "PL/SQL", "AWS EC2", "REST APIs", "MySQL", "Git", "Linux", "Pydantic"],
    skill_categories: [
      { title: "Databases", tags: ["PostgreSQL", "Oracle", "MySQL", "MS SQL Server"] },
      { title: "Programming", tags: ["SQL", "PL/SQL", "Python"] },
      { title: "Backend & APIs", tags: ["FastAPI", "SQLAlchemy", "REST APIs", "Pydantic"] },
      { title: "Data & Integration", tags: ["ETL Concepts", "Data Migration", "Data Validation"] },
      { title: "Tools & Cloud", tags: ["AWS EC2", "Linux", "Git", "pgAdmin", "SSMS"] },
    ],
    experiences: [
      {
        title: "Data Support Engineer / Backend Support Engineer",
        company: "VSoft Technologies Pvt Ltd, Hyderabad",
        projects: "Wings Core Banking Application, ECCS Application",
        date: "Nov 2022 — Present",
        points: [
          "Designed and implemented complex SQL/PLSQL functions for backend reporting",
          "Automated bulk data correction queries, improving turnaround time by 30%",
          "Performed root cause analysis and developed corrective SQL scripts",
          "Optimized database queries and improved PostgreSQL performance",
        ],
      },
    ],
    projects: [
      {
        icon: "monitor",
        type: "Full-Stack",
        title: "Shop Billing & POS Application",
        description: "A comprehensive billing and point-of-sale system with 40+ REST API endpoints.",
        features: [
          "JWT authentication with role-based access control",
          "50+ PostgreSQL schemas for invoices, stock, suppliers",
          "Complete billing workflows: GST/tax, discounts, returns",
          "Multi-tenant architecture with isolated data",
        ],
        tech: ["FastAPI", "PostgreSQL", "SQLAlchemy", "Pydantic", "REST APIs"],
      },
      {
        icon: "server",
        type: "DevOps",
        title: "AWS EC2 Hosting & Server Management",
        description: "Production-grade deployment on AWS EC2 with secure Linux configuration.",
        features: [
          "Hosted FastAPI + PostgreSQL on EC2",
          "Managed full EC2 lifecycle",
          "Server monitoring and log analysis",
          "Security: key-based SSH and port control",
        ],
        tech: ["AWS EC2", "Linux", "FastAPI", "PostgreSQL"],
      },
    ],
    education: [
      { year: "2017 — 2021", title: "B.E: Electronics and Communication Engineering", school: "Sri Krishna College of Technology, Coimbatore", score: "GPA: 7.58" },
      { year: "2015 — 2017", title: "Intermediate: MPC", school: "Sri Chaitanya Junior College, Tirupati", score: "Percentage: 80.2%" },
      { year: "2015", title: "Secondary Education", school: "Gowtham School, Tirupati", score: "GPA: 8.2" },
    ],
  };
  const [portfolio, setPortfolio] = useState(BLANK_PORTFOLIO);
  const [portfolioBusy, setPortfolioBusy] = useState(false);
  const [portfolioSection, setPortfolioSection] = useState("hero");

  const [portfolios, setPortfolios] = useState([]);
  const [activePortfolioSlug, setActivePortfolioSlug] = useState(null);
  const [portfolioListBusy, setPortfolioListBusy] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState("");
  const [newPortfolioProfileId, setNewPortfolioProfileId] = useState("");

  const pf = (field, val) => setPortfolio((p) => ({ ...p, [field]: val }));

  const openPortfolio = async (slug) => {
    setActivePortfolioSlug(slug);
    setPortfolioSection("hero");
    try {
      const res = await platformAxios.get(`/platform/portfolios/${slug}`);
      setPortfolio({ ...BLANK_PORTFOLIO, ...(res.data || {}) });
    } catch (e) {
      showToast(e?.response?.data?.detail || "Failed to load portfolio", "error");
    }
  };

  const backToPortfolioList = () => {
    setActivePortfolioSlug(null);
    setPortfolio(BLANK_PORTFOLIO);
  };

  const createPortfolio = async ({ name, profileId } = {}) => {
    const nm = name !== undefined ? name : newPortfolioName;
    const pid = profileId !== undefined ? profileId : (newPortfolioProfileId ? Number(newPortfolioProfileId) : null);
    if (!nm?.trim() && !pid) { showToast("Enter a name or pick a team profile", "error"); return; }
    setPortfolioListBusy(true);
    try {
      const res = await platformAxios.post("/platform/portfolios", {
        name: nm?.trim() || undefined,
        profile_id: pid || null,
      });
      setPortfolios((prev) => [...prev, res.data]);
      setNewPortfolioName("");
      setNewPortfolioProfileId("");
      showToast("Portfolio created", "success");
      await openPortfolio(res.data.slug);
      setTab("PORTFOLIO");
    } catch (e) {
      showToast(e?.response?.data?.detail || "Failed to create portfolio", "error");
    } finally {
      setPortfolioListBusy(false);
    }
  };

  const deletePortfolio = async (slug) => {
    if (!window.confirm(`Delete portfolio "${slug}"? This cannot be undone.`)) return;
    try {
      await platformAxios.delete(`/platform/portfolios/${slug}`);
      setPortfolios((prev) => prev.filter((p) => p.slug !== slug));
      if (activePortfolioSlug === slug) backToPortfolioList();
      setTeamProfiles((prev) => prev.map((p) => (p.portfolio_slug === slug ? { ...p, portfolio_slug: null } : p)));
      showToast("Deleted", "success");
    } catch (e) {
      showToast(e?.response?.data?.detail || "Delete failed", "error");
    }
  };

  const unlinkPortfolio = async (slug) => {
    if (!window.confirm("Remove this portfolio from the profile? The name will no longer be clickable on the About page. The portfolio itself is kept.")) return;
    try {
      const res = await platformAxios.patch(`/platform/portfolios/${slug}`, { profile_id: null });
      setPortfolios((prev) => prev.map((p) => (p.slug === slug ? res.data : p)));
      setTeamProfiles((prev) => prev.map((p) => (p.portfolio_slug === slug ? { ...p, portfolio_slug: null } : p)));
      showToast("Portfolio unlinked from profile", "success");
    } catch (e) {
      showToast(e?.response?.data?.detail || "Failed to unlink", "error");
    }
  };

  const savePortfolio = async () => {
    if (!activePortfolioSlug) return;
    setPortfolioBusy(true);
    try {
      await platformAxios.put(`/platform/portfolios/${activePortfolioSlug}`, portfolio);
      showToast("Portfolio saved", "success");
    } catch (e) {
      showToast(e?.response?.data?.detail || "Failed to save portfolio", "error");
    } finally {
      setPortfolioBusy(false);
    }
  };

  const downloadPortfolio = () => {
    const data = JSON.stringify(portfolio, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "portfolio-config.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importPortfolio = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        setPortfolio({ ...BLANK_PORTFOLIO, ...data });
        showToast("Portfolio config imported", "success");
      } catch {
        showToast("Invalid JSON file", "error");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const [pwForm, setPwForm] = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [pwBusy, setPwBusy] = useState(false);

  const [teamProfiles, setTeamProfiles] = useState([]);
  const BLANK_PROFILE = { name: "", role_title: "", bio: "", display_order: 0, is_active: true };
  const [profileForm, setProfileForm] = useState(BLANK_PROFILE);
  const [profilePhoto, setProfilePhoto] = useState(null);
  const [editingProfileId, setEditingProfileId] = useState(null);
  const [profileBusy, setProfileBusy] = useState(false);

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
      try {
        const teamRes = await platformAxios.get("/platform/team-profiles");
        setTeamProfiles(Array.isArray(teamRes.data) ? teamRes.data : []);
      } catch {
        // optional — ignore if not yet deployed
      }
      try {
        const listRes = await platformAxios.get("/platform/portfolios");
        setPortfolios(Array.isArray(listRes.data) ? listRes.data : []);
      } catch {
        // optional — use defaults if not deployed
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
      showToast(
        res?.data?.email_sent ? "Reminder email sent" : "Email not sent — SMTP not configured",
        res?.data?.email_sent ? "success" : "error"
      );
    } catch (e) {
      showToast(e?.response?.data?.detail || "Reminder failed", "error");
    } finally {
      setBusyId(null);
    }
  };

  const [enableModal, setEnableModal] = useState(null);

  const toggleShopStatus = async (shopId, currentStatus) => {
    if (busyId) return;
    if (currentStatus === "DISABLED") {
      setEnableModal({ shopId });
      return;
    }
    setBusyId(shopId);
    try {
      await platformAxios.post(`/platform/shops/${shopId}/status`, { status: "DISABLED" });
      showToast("Shop disabled", "success");
      await load();
      if (selectedShopId === shopId) await loadShopDetail(shopId);
    } catch (e) {
      showToast(e?.response?.data?.detail || "Update failed", "error");
    } finally {
      setBusyId(null);
    }
  };

  const confirmEnable = async (status) => {
    if (!enableModal) return;
    const { shopId } = enableModal;
    setEnableModal(null);
    setBusyId(shopId);
    try {
      await platformAxios.post(`/platform/shops/${shopId}/status`, { status });
      showToast(`Shop enabled as ${status}`, "success");
      await load();
      if (selectedShopId === shopId) await loadShopDetail(shopId);
    } catch (e) {
      showToast(e?.response?.data?.detail || "Update failed", "error");
    } finally {
      setBusyId(null);
    }
  };

  const downloadBackup = async (shopId, shopName, sendEmail = false) => {
    try {
      showToast("Generating backup...", "info");
      const res = await platformAxios.post(`/platform/shops/${shopId}/backup`, { send_email: sendEmail }, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup_${shopName}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(sendEmail ? "Backup downloaded & emailed" : "Backup downloaded", "success");
    } catch (e) {
      showToast("Backup failed", "error");
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
    { id: "OVERVIEW",  label: "Overview",  icon: "📊", badge: null },
    { id: "SHOPS",     label: "Shops",     icon: "🏪", badge: shops.length || null },
    { id: "CREATE",    label: "Create",    icon: "➕", badge: null },
    { id: "PLANS",     label: "Plans",     icon: "📋", badge: null },
    { id: "WEBSITE",   label: "Website",   icon: "🌐", badge: null },
    { id: "ONBOARD",   label: "Onboard",   icon: "📥", badge: pendingOnboard.length || null },
    { id: "DEMO",      label: "Demo",      icon: "🎬", badge: openDemoTickets.length || null },
    { id: "SUPPORT",   label: "Support",   icon: "🎧", badge: openSupportTickets.length || null },
    { id: "SECURITY",  label: "Security",  icon: "🔒", badge: null },
    { id: "PORTFOLIO", label: "Portfolio", icon: "🎨", badge: null },
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
                    <th className="py-3 px-3 text-left font-semibold">Last Payment</th>
                    <th className="py-3 px-3 text-left font-semibold">Next Renewal</th>
                    <th className="py-3 px-3 text-right font-semibold">Revenue</th>
                    <th className="py-3 px-3 text-center font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {shops.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">No shops found.</td>
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
                            <button
                              onClick={() => downloadBackup(s.shop_id, s.shop_name, false)}
                              disabled={busyId === s.shop_id}
                              className="px-2.5 py-1.5 bg-blue-500/60 hover:bg-blue-500 rounded-lg text-[11px] transition disabled:opacity-50"
                              title="Download backup"
                            >
                              💾
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
          <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6 space-y-6">
            <div>
              <h3 className="text-base font-semibold text-white">Contact Details</h3>
              <p className="text-xs text-slate-400 mt-0.5">Shared contact info and sliding profiles shown on the public page.</p>
            </div>

            {/* Shared contact fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-4 border-b border-white/10">
              <div>
                <label className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">Mobile / WhatsApp</label>
                <input
                  className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-900/80 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={aboutContact.mobile}
                  onChange={(e) => setAboutContact((p) => ({ ...p, mobile: e.target.value }))}
                  placeholder="+91 79042 63246"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">Email</label>
                <input
                  className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-900/80 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={aboutContact.email}
                  onChange={(e) => setAboutContact((p) => ({ ...p, email: e.target.value }))}
                  placeholder="support@haappiibilling.in"
                />
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <button
                  onClick={saveAboutContact}
                  disabled={aboutSaving}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition disabled:opacity-60"
                >
                  {aboutSaving ? "Saving..." : "Save Contact Info"}
                </button>
              </div>
            </div>

            {/* Profiles */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                  Profiles &nbsp;<span className="text-slate-500 font-normal normal-case">(auto-slide on public page)</span>
                </p>
                {editingProfileId !== null && (
                  <button
                    className="px-3 py-1.5 rounded-xl text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 transition"
                    onClick={() => { setEditingProfileId(null); setProfileForm(BLANK_PROFILE); setProfilePhoto(null); }}
                  >
                    Cancel Edit
                  </button>
                )}
              </div>

              {/* Add / Edit form */}
              <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 space-y-3">
                <p className="text-[11px] text-slate-400">{editingProfileId ? `Editing profile #${editingProfileId}` : "Add new profile"}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { label: "Full Name *", key: "name", placeholder: "Sathish Kumar" },
                    { label: "Role / Title", key: "role_title", placeholder: "Co-Founder & CEO" },
                  ].map(({ label, key, placeholder }) => (
                    <div key={key}>
                      <label className="text-[11px] text-slate-400 font-medium">{label}</label>
                      <input
                        className="mt-1 w-full rounded-xl px-3 py-2 bg-slate-800 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                        value={profileForm[key]}
                        onChange={(e) => setProfileForm((p) => ({ ...p, [key]: e.target.value }))}
                        placeholder={placeholder}
                      />
                    </div>
                  ))}
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 font-medium">Bio (optional)</label>
                  <textarea
                    className="mt-1 w-full rounded-xl px-3 py-2 bg-slate-800 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                    rows={2}
                    value={profileForm.bio}
                    onChange={(e) => setProfileForm((p) => ({ ...p, bio: e.target.value }))}
                    placeholder="Short intro..."
                  />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end">
                  <div>
                    <label className="text-[11px] text-slate-400 font-medium">Order</label>
                    <input
                      type="number"
                      className="mt-1 w-full rounded-xl px-3 py-2 bg-slate-800 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={profileForm.display_order}
                      onChange={(e) => setProfileForm((p) => ({ ...p, display_order: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-5">
                    <input type="checkbox" id="prof-active" checked={profileForm.is_active}
                      onChange={(e) => setProfileForm((p) => ({ ...p, is_active: e.target.checked }))}
                      className="w-4 h-4 accent-blue-500" />
                    <label htmlFor="prof-active" className="text-xs text-slate-300">Active</label>
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 font-medium">Photo</label>
                    <input type="file" accept="image/*"
                      className="mt-1 block w-full text-xs text-slate-300 file:mr-2 file:px-2 file:py-1.5 file:rounded-lg file:border-0 file:bg-blue-600/80 file:text-white hover:file:bg-blue-600"
                      onChange={(e) => setProfilePhoto(e.target.files?.[0] || null)} />
                  </div>
                </div>
                <button
                  disabled={profileBusy}
                  className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold transition"
                  onClick={async () => {
                    if (!profileForm.name.trim()) { showToast("Name is required", "error"); return; }
                    setProfileBusy(true);
                    try {
                      const fd = new FormData();
                      fd.append("name", profileForm.name.trim());
                      fd.append("role_title", profileForm.role_title.trim());
                      fd.append("bio", profileForm.bio.trim());
                      fd.append("display_order", String(profileForm.display_order));
                      fd.append("is_active", profileForm.is_active ? "true" : "false");
                      if (profilePhoto) fd.append("photo", profilePhoto);
                      if (editingProfileId) {
                        const res = await platformAxios.put(`/platform/team-profiles/${editingProfileId}`, fd, { headers: { "Content-Type": "multipart/form-data" } });
                        setTeamProfiles((prev) => prev.map((p) => p.profile_id === editingProfileId ? res.data : p));
                        showToast("Profile updated", "success");
                      } else {
                        const res = await platformAxios.post("/platform/team-profiles", fd, { headers: { "Content-Type": "multipart/form-data" } });
                        setTeamProfiles((prev) => [...prev, res.data]);
                        showToast("Profile added", "success");
                      }
                      setEditingProfileId(null); setProfileForm(BLANK_PROFILE); setProfilePhoto(null);
                    } catch (e) {
                      showToast(e?.response?.data?.detail || "Failed to save profile", "error");
                    } finally { setProfileBusy(false); }
                  }}
                >
                  {profileBusy ? "Saving…" : editingProfileId ? "Update Profile" : "Add Profile"}
                </button>
              </div>

              {/* Profile cards */}
              {teamProfiles.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-3">No profiles yet. Add one above.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {teamProfiles.map((p) => (
                    <div key={p.profile_id} className="rounded-2xl border border-white/10 bg-slate-900/50 p-4 space-y-2">
                      <div className="flex items-center gap-3">
                        {p.photo_url ? (
                          <img src={p.photo_url} alt={p.name} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                            {(p.name || "?").trim().charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white truncate">{p.name}</div>
                          <div className="text-[11px] text-blue-300 truncate">{p.role_title || "—"}</div>
                        </div>
                      </div>
                      {p.bio && <p className="text-[11px] text-slate-400 line-clamp-2">{p.bio}</p>}
                      <div className="flex items-center justify-between pt-1">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${p.is_active ? "text-emerald-300 bg-emerald-500/15 border-emerald-500/30" : "text-slate-400 bg-slate-500/15 border-slate-500/30"}`}>
                          {p.is_active ? "Active" : "Hidden"}
                        </span>
                        <div className="flex gap-1.5">
                          {p.portfolio_slug ? (
                            <>
                              <a
                                href={`/portfolio/${p.portfolio_slug}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2.5 py-1 rounded-lg text-[11px] bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 transition"
                              >
                                🎨 Portfolio
                              </a>
                              <button
                                title="Remove portfolio from this profile"
                                className="px-2.5 py-1 rounded-lg text-[11px] bg-white/8 hover:bg-red-500/20 text-slate-400 hover:text-red-300 transition"
                                onClick={() => unlinkPortfolio(p.portfolio_slug)}
                              >
                                Unlink
                              </button>
                            </>
                          ) : (
                            <button
                              className="px-2.5 py-1 rounded-lg text-[11px] bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 transition"
                              onClick={() => createPortfolio({ name: p.name, profileId: p.profile_id })}
                            >
                              + Portfolio
                            </button>
                          )}
                          <button className="px-2.5 py-1 rounded-lg text-[11px] bg-white/8 hover:bg-white/15 text-blue-300 transition"
                            onClick={() => { setEditingProfileId(p.profile_id); setProfileForm({ name: p.name, role_title: p.role_title, bio: p.bio || "", display_order: p.display_order, is_active: p.is_active }); setProfilePhoto(null); }}>
                            Edit
                          </button>
                          <button className="px-2.5 py-1 rounded-lg text-[11px] bg-red-500/20 hover:bg-red-500/30 text-red-300 transition"
                            onClick={async () => {
                              if (!window.confirm(`Delete "${p.name}"?`)) return;
                              try {
                                await platformAxios.delete(`/platform/team-profiles/${p.profile_id}`);
                                setTeamProfiles((prev) => prev.filter((x) => x.profile_id !== p.profile_id));
                                showToast("Deleted", "success");
                              } catch (e) { showToast(e?.response?.data?.detail || "Delete failed", "error"); }
                            }}>
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
        ) : tab === "SECURITY" ? (
          <div className="max-w-md">
            <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6 space-y-4">
              <h2 className="text-white font-semibold text-lg">Change Password</h2>
              <div className="space-y-3">
                {["current_password", "new_password", "confirm_password"].map((field) => (
                  <div key={field}>
                    <label className="block text-xs text-slate-400 mb-1 capitalize">
                      {field.replace(/_/g, " ")}
                    </label>
                    <input
                      type="password"
                      className="w-full rounded-xl px-3 py-2 bg-slate-900/80 border border-white/10 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={pwForm[field]}
                      onChange={(e) => setPwForm((p) => ({ ...p, [field]: e.target.value }))}
                      placeholder="••••••••"
                    />
                  </div>
                ))}
              </div>
              <button
                disabled={pwBusy}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold transition"
                onClick={async () => {
                  if (!pwForm.current_password || !pwForm.new_password) {
                    showToast("Fill in all fields", "error"); return;
                  }
                  if (pwForm.new_password !== pwForm.confirm_password) {
                    showToast("New passwords do not match", "error"); return;
                  }
                  if (pwForm.new_password.length < 6) {
                    showToast("New password must be at least 6 characters", "error"); return;
                  }
                  setPwBusy(true);
                  try {
                    await platformAxios.post("/platform/auth/change-password", {
                      current_password: pwForm.current_password,
                      new_password: pwForm.new_password,
                    });
                    showToast("Password updated successfully", "success");
                    setPwForm({ current_password: "", new_password: "", confirm_password: "" });
                  } catch (e) {
                    showToast(e?.response?.data?.detail || "Failed to update password", "error");
                  } finally {
                    setPwBusy(false);
                  }
                }}
              >
                {pwBusy ? "Updating…" : "Update Password"}
              </button>
            </div>
          </div>
        ) : tab === "PORTFOLIO" ? (
          <div className="space-y-6">
            {!activePortfolioSlug ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 space-y-3">
                  <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">New Portfolio</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      className="rounded-xl px-3 py-2 bg-slate-800 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                      placeholder="Slug / name (e.g. Nidra Vijay Kumar)"
                      value={newPortfolioName}
                      onChange={(e) => setNewPortfolioName(e.target.value)}
                    />
                    <select
                      className="rounded-xl px-3 py-2 bg-slate-800 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                      value={newPortfolioProfileId}
                      onChange={(e) => setNewPortfolioProfileId(e.target.value)}
                    >
                      <option value="">Link to team profile (optional)</option>
                      {teamProfiles.filter((p) => !p.portfolio_slug).map((p) => (
                        <option key={p.profile_id} value={p.profile_id}>{p.name}</option>
                      ))}
                    </select>
                    <button
                      disabled={portfolioListBusy}
                      onClick={() => createPortfolio()}
                      className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-semibold transition"
                    >
                      {portfolioListBusy ? "Creating…" : "+ Create Portfolio"}
                    </button>
                  </div>
                </div>

                {portfolios.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-3">No portfolios yet. Create one above.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {portfolios.map((p) => (
                      <div key={p.slug} className="rounded-2xl border border-white/10 bg-slate-900/50 p-4 space-y-2">
                        <div className="text-sm font-semibold text-white truncate">{p.profile_name || p.slug}</div>
                        <div className="text-[11px] text-purple-300 truncate">/portfolio/{p.slug}</div>
                        {p.profile_name && (
                          <div className="text-[11px] text-slate-500 truncate">Linked to profile: {p.profile_name}</div>
                        )}
                        <div className="flex items-center justify-between pt-1">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${p.is_active ? "text-emerald-300 bg-emerald-500/15 border-emerald-500/30" : "text-slate-400 bg-slate-500/15 border-slate-500/30"}`}>
                            {p.is_active ? "Active" : "Hidden"}
                          </span>
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <a
                              href={`/portfolio/${p.slug}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1 rounded-lg text-[11px] bg-white/8 hover:bg-white/15 text-slate-300 transition"
                            >
                              View
                            </a>
                            <button
                              className="px-2.5 py-1 rounded-lg text-[11px] bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 transition"
                              onClick={() => openPortfolio(p.slug)}
                            >
                              Edit
                            </button>
                            {p.profile_id && (
                              <button
                                title="Remove portfolio from its linked profile"
                                className="px-2.5 py-1 rounded-lg text-[11px] bg-white/8 hover:bg-amber-500/20 text-slate-400 hover:text-amber-300 transition"
                                onClick={() => unlinkPortfolio(p.slug)}
                              >
                                Unlink
                              </button>
                            )}
                            <button
                              className="px-2.5 py-1 rounded-lg text-[11px] bg-red-500/20 hover:bg-red-500/30 text-red-300 transition"
                              onClick={() => deletePortfolio(p.slug)}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
            <>
            <div className="flex items-center gap-3">
              <button
                onClick={backToPortfolioList}
                className="px-3 py-1.5 rounded-xl text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 transition"
              >
                ← All Portfolios
              </button>
              <span className="text-sm text-slate-300">
                Editing: <span className="font-semibold text-white">{activePortfolioSlug}</span>
              </span>
            </div>
            {/* Portfolio sub-nav + actions */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {[
                  { id: "sections", label: "⚙ Sections" },
                  { id: "hero", label: "Hero" },
                  { id: "stats", label: "Stats & Tech" },
                  { id: "about", label: "About & Skills" },
                  { id: "experience", label: "Experience" },
                  { id: "projects", label: "Projects" },
                  { id: "education", label: "Education" },
                  { id: "contact", label: "Contact" },
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setPortfolioSection(s.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      portfolioSection === s.id
                        ? "bg-purple-600 text-white"
                        : "bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <label className="cursor-pointer px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition">
                  Import JSON
                  <input type="file" accept=".json" className="hidden" onChange={importPortfolio} />
                </label>
                <button onClick={downloadPortfolio} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition">
                  Export JSON
                </button>
                <button
                  onClick={savePortfolio}
                  disabled={portfolioBusy}
                  className="px-5 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white transition disabled:opacity-50"
                >
                  {portfolioBusy ? "Saving…" : "💾 Save All"}
                </button>
              </div>
            </div>

            {/* Sections visibility */}
            {portfolioSection === "sections" && (
              <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6 space-y-4">
                <h3 className="text-base font-semibold text-white">Show / Hide Sections</h3>
                <p className="text-xs text-slate-400">Toggle which sections appear on your portfolio page.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[
                    { key: "hero", label: "Hero Banner", icon: "🏠" },
                    { key: "stats", label: "Statistics", icon: "📊" },
                    { key: "tech_marquee", label: "Tech Stack Marquee", icon: "🔧" },
                    { key: "about", label: "About & Skills", icon: "👤" },
                    { key: "experience", label: "Work Experience", icon: "💼" },
                    { key: "projects", label: "Projects", icon: "🚀" },
                    { key: "education", label: "Education", icon: "🎓" },
                    { key: "certification", label: "Certification", icon: "🏅" },
                    { key: "contact", label: "Contact Form", icon: "✉️" },
                  ].map((sec) => {
                    const vis = portfolio.visible_sections || {};
                    const on = vis[sec.key] !== false;
                    return (
                      <button
                        key={sec.key}
                        onClick={() => pf("visible_sections", { ...vis, [sec.key]: !on })}
                        className={`flex items-center gap-3 p-4 rounded-xl border text-left transition ${
                          on
                            ? "bg-purple-600/15 border-purple-500/30 text-white"
                            : "bg-white/3 border-white/10 text-slate-500"
                        }`}
                      >
                        <span className="text-xl">{sec.icon}</span>
                        <div className="flex-1">
                          <span className="text-sm font-medium block">{sec.label}</span>
                          <span className={`text-[10px] font-semibold uppercase tracking-wider ${on ? "text-purple-400" : "text-slate-600"}`}>
                            {on ? "Visible" : "Hidden"}
                          </span>
                        </div>
                        <div className={`w-10 h-5 rounded-full flex items-center transition-colors ${on ? "bg-purple-600 justify-end" : "bg-slate-700 justify-start"}`}>
                          <div className="w-4 h-4 rounded-full bg-white mx-0.5 shadow" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Hero section editor */}
            {portfolioSection === "hero" && (
              <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6 space-y-5">
                <h3 className="text-base font-semibold text-white">Hero Section</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">Full Name (shown above the headline)</label>
                    <input className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-900/80 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                      value={portfolio.hero_name} onChange={(e) => pf("hero_name", e.target.value)} placeholder="Nidra Vijay Kumar" />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">Badge Text</label>
                    <input className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-900/80 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                      value={portfolio.hero_badge} onChange={(e) => pf("hero_badge", e.target.value)} placeholder="Available for opportunities" />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">Profile Photo</label>
                    <div className="mt-1 flex items-center gap-3">
                      {portfolio.photo_url && (
                        <img src={portfolio.photo_url} alt="" className="w-12 h-12 rounded-full object-cover border border-white/20" />
                      )}
                      <label className="cursor-pointer px-4 py-2.5 rounded-xl bg-slate-900/80 border border-white/10 text-sm text-slate-400 hover:text-white hover:border-purple-500/50 transition">
                        {portfolio.photo_url ? "Change Photo" : "Upload Photo"}
                        <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const fd = new FormData();
                          fd.append("photo", file);
                          try {
                            const res = await platformAxios.post(`/platform/portfolios/${activePortfolioSlug}/photo`, fd);
                            if (res.data?.photo_url) pf("photo_url", res.data.photo_url);
                            showToast("Photo uploaded", "success");
                          } catch (err) {
                            showToast(err?.response?.data?.detail || "Upload failed", "error");
                          }
                          e.target.value = "";
                        }} />
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">Title Line 1</label>
                    <input className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-900/80 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                      value={portfolio.hero_title_line1} onChange={(e) => pf("hero_title_line1", e.target.value)} placeholder="More Than Just" />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">Title Line 2 (Gradient)</label>
                    <input className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-900/80 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                      value={portfolio.hero_title_line2} onChange={(e) => pf("hero_title_line2", e.target.value)} placeholder="Queries & Code" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">Subtitle / Tagline</label>
                    <textarea className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-900/80 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500 min-h-[80px]"
                      value={portfolio.hero_subtitle} onChange={(e) => pf("hero_subtitle", e.target.value)} placeholder="Data-focused Software Engineer specializing in..." />
                  </div>
                </div>
                {/* Live preview */}
                <div className="border border-white/10 rounded-xl p-6 bg-slate-950/60">
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-3">Preview</p>
                  {portfolio.hero_name && <p className="text-sm font-semibold text-slate-300 mb-1">{portfolio.hero_name}</p>}
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-full text-xs text-slate-400 mb-3">
                    <span className="w-2 h-2 bg-emerald-400 rounded-full" /> {portfolio.hero_badge || "Badge text"}
                  </div>
                  <h2 className="text-2xl font-bold text-white leading-tight">{portfolio.hero_title_line1 || "Line 1"}<br/>
                    <span className="bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">{portfolio.hero_title_line2 || "Line 2"}</span>
                  </h2>
                  <p className="text-sm text-slate-400 mt-2 max-w-lg">{portfolio.hero_subtitle || "Your subtitle here..."}</p>
                </div>
              </div>
            )}

            {/* Stats & Tech Stack editor */}
            {portfolioSection === "stats" && (
              <div className="space-y-6">
                <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6 space-y-4">
                  <h3 className="text-base font-semibold text-white">Statistics</h3>
                  <div className="space-y-3">
                    {portfolio.stats.map((stat, i) => (
                      <div key={i} className="grid grid-cols-[80px_60px_1fr_40px] gap-2 items-center">
                        <input className="rounded-lg px-2 py-2 bg-slate-900/80 border border-white/10 text-sm text-white text-center focus:outline-none focus:ring-1 focus:ring-purple-500"
                          value={stat.number} onChange={(e) => {
                            const s = [...portfolio.stats]; s[i] = { ...s[i], number: e.target.value }; pf("stats", s);
                          }} placeholder="40" />
                        <input className="rounded-lg px-2 py-2 bg-slate-900/80 border border-white/10 text-sm text-white text-center focus:outline-none focus:ring-1 focus:ring-purple-500"
                          value={stat.suffix} onChange={(e) => {
                            const s = [...portfolio.stats]; s[i] = { ...s[i], suffix: e.target.value }; pf("stats", s);
                          }} placeholder="+" />
                        <input className="rounded-lg px-2 py-2 bg-slate-900/80 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                          value={stat.label} onChange={(e) => {
                            const s = [...portfolio.stats]; s[i] = { ...s[i], label: e.target.value }; pf("stats", s);
                          }} placeholder="Label" />
                        <button onClick={() => { const s = [...portfolio.stats]; s.splice(i, 1); pf("stats", s); }}
                          className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 text-xs transition">✕</button>
                      </div>
                    ))}
                    <button onClick={() => pf("stats", [...portfolio.stats, { number: "", suffix: "+", label: "" }])}
                      className="text-xs text-purple-400 hover:text-purple-300 transition">+ Add Stat</button>
                  </div>
                </div>

                <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6 space-y-4">
                  <h3 className="text-base font-semibold text-white">Tech Stack Marquee</h3>
                  <div className="flex flex-wrap gap-2">
                    {portfolio.tech_stack.map((tech, i) => (
                      <span key={i} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/80 border border-white/10 rounded-full text-sm text-slate-300">
                        {tech}
                        <button onClick={() => { const t = [...portfolio.tech_stack]; t.splice(i, 1); pf("tech_stack", t); }}
                          className="text-red-400 hover:text-red-300 text-xs ml-1">✕</button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input id="newTech" className="flex-1 rounded-xl px-3 py-2 bg-slate-900/80 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                      placeholder="Add technology..." onKeyDown={(e) => {
                        if (e.key === "Enter" && e.target.value.trim()) {
                          pf("tech_stack", [...portfolio.tech_stack, e.target.value.trim()]); e.target.value = "";
                        }
                      }} />
                    <button onClick={() => {
                      const inp = document.getElementById("newTech");
                      if (inp?.value.trim()) { pf("tech_stack", [...portfolio.tech_stack, inp.value.trim()]); inp.value = ""; }
                    }} className="px-4 py-2 rounded-xl bg-purple-600/30 text-purple-300 text-sm hover:bg-purple-600/50 transition">Add</button>
                  </div>
                </div>
              </div>
            )}

            {/* About & Skills editor */}
            {portfolioSection === "about" && (
              <div className="space-y-6">
                <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6 space-y-4">
                  <h3 className="text-base font-semibold text-white">About Me</h3>
                  <div>
                    <label className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">Lead Paragraph</label>
                    <textarea className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-900/80 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500 min-h-[80px]"
                      value={portfolio.profile_summary} onChange={(e) => pf("profile_summary", e.target.value)} placeholder="I'm a Data-focused Software Engineer..." />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">Second Paragraph</label>
                    <textarea className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-900/80 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500 min-h-[80px]"
                      value={portfolio.profile_detail_1} onChange={(e) => pf("profile_detail_1", e.target.value)} placeholder="My expertise lies in..." />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">Third Paragraph</label>
                    <textarea className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-900/80 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500 min-h-[80px]"
                      value={portfolio.profile_detail_2} onChange={(e) => pf("profile_detail_2", e.target.value)} placeholder="Beyond my professional work..." />
                  </div>
                </div>

                <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6 space-y-5">
                  <h3 className="text-base font-semibold text-white">Skill Categories</h3>
                  {portfolio.skill_categories.map((cat, ci) => (
                    <div key={ci} className="border border-white/10 rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <input className="flex-1 rounded-lg px-3 py-2 bg-slate-900/80 border border-white/10 text-sm text-white font-semibold focus:outline-none focus:ring-1 focus:ring-purple-500"
                          value={cat.title} onChange={(e) => {
                            const c = [...portfolio.skill_categories]; c[ci] = { ...c[ci], title: e.target.value }; pf("skill_categories", c);
                          }} placeholder="Category name" />
                        <button onClick={() => { const c = [...portfolio.skill_categories]; c.splice(ci, 1); pf("skill_categories", c); }}
                          className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 text-xs transition">✕</button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {cat.tags.map((tag, ti) => (
                          <span key={ti} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 border border-white/10 rounded-full text-xs text-slate-300">
                            {tag}
                            <button onClick={() => {
                              const c = [...portfolio.skill_categories]; const tags = [...c[ci].tags]; tags.splice(ti, 1); c[ci] = { ...c[ci], tags }; pf("skill_categories", c);
                            }} className="text-red-400 hover:text-red-300 text-[10px]">✕</button>
                          </span>
                        ))}
                      </div>
                      <input className="w-full rounded-lg px-3 py-1.5 bg-slate-900/60 border border-white/5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                        placeholder="Type skill + Enter" onKeyDown={(e) => {
                          if (e.key === "Enter" && e.target.value.trim()) {
                            const c = [...portfolio.skill_categories]; c[ci] = { ...c[ci], tags: [...c[ci].tags, e.target.value.trim()] }; pf("skill_categories", c); e.target.value = "";
                          }
                        }} />
                    </div>
                  ))}
                  <button onClick={() => pf("skill_categories", [...portfolio.skill_categories, { title: "", tags: [] }])}
                    className="text-xs text-purple-400 hover:text-purple-300 transition">+ Add Category</button>
                </div>
              </div>
            )}

            {/* Experience editor */}
            {portfolioSection === "experience" && (
              <div className="space-y-4">
                {portfolio.experiences.map((exp, ei) => (
                  <div key={ei} className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6 space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-base font-semibold text-white">Experience #{ei + 1}</h3>
                      <button onClick={() => { const e = [...portfolio.experiences]; e.splice(ei, 1); pf("experiences", e); }}
                        className="px-3 py-1 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 text-xs transition">Remove</button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="sm:col-span-2">
                        <label className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">Job Title</label>
                        <input className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-900/80 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                          value={exp.title} onChange={(e) => { const x = [...portfolio.experiences]; x[ei] = { ...x[ei], title: e.target.value }; pf("experiences", x); }} />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">Company</label>
                        <input className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-900/80 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                          value={exp.company} onChange={(e) => { const x = [...portfolio.experiences]; x[ei] = { ...x[ei], company: e.target.value }; pf("experiences", x); }} />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">Date Range</label>
                        <input className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-900/80 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                          value={exp.date} onChange={(e) => { const x = [...portfolio.experiences]; x[ei] = { ...x[ei], date: e.target.value }; pf("experiences", x); }} placeholder="Nov 2022 — Present" />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">Projects Worked On</label>
                        <input className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-900/80 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                          value={exp.projects} onChange={(e) => { const x = [...portfolio.experiences]; x[ei] = { ...x[ei], projects: e.target.value }; pf("experiences", x); }} />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">Key Points (one per line)</label>
                        <textarea className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-900/80 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500 min-h-[120px]"
                          value={(exp.points || []).join("\n")} onChange={(e) => {
                            const x = [...portfolio.experiences]; x[ei] = { ...x[ei], points: e.target.value.split("\n") }; pf("experiences", x);
                          }} />
                      </div>
                    </div>
                  </div>
                ))}
                <button onClick={() => pf("experiences", [...portfolio.experiences, { title: "", company: "", projects: "", date: "", points: [""] }])}
                  className="w-full py-3 rounded-xl border border-dashed border-white/20 text-sm text-slate-400 hover:text-white hover:border-purple-500/50 transition">+ Add Experience</button>
              </div>
            )}

            {/* Projects editor */}
            {portfolioSection === "projects" && (
              <div className="space-y-4">
                {portfolio.projects.map((proj, pi) => (
                  <div key={pi} className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6 space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-base font-semibold text-white">Project #{pi + 1}</h3>
                      <button onClick={() => { const p = [...portfolio.projects]; p.splice(pi, 1); pf("projects", p); }}
                        className="px-3 py-1 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 text-xs transition">Remove</button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">Project Title</label>
                        <input className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-900/80 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                          value={proj.title} onChange={(e) => { const p = [...portfolio.projects]; p[pi] = { ...p[pi], title: e.target.value }; pf("projects", p); }} />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">Type Label</label>
                        <input className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-900/80 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                          value={proj.type} onChange={(e) => { const p = [...portfolio.projects]; p[pi] = { ...p[pi], type: e.target.value }; pf("projects", p); }} placeholder="Full-Stack / DevOps" />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">Description</label>
                        <textarea className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-900/80 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500 min-h-[60px]"
                          value={proj.description} onChange={(e) => { const p = [...portfolio.projects]; p[pi] = { ...p[pi], description: e.target.value }; pf("projects", p); }} />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">Features (one per line)</label>
                        <textarea className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-900/80 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500 min-h-[100px]"
                          value={(proj.features || []).join("\n")} onChange={(e) => {
                            const p = [...portfolio.projects]; p[pi] = { ...p[pi], features: e.target.value.split("\n") }; pf("projects", p);
                          }} />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">Tech Stack (comma separated)</label>
                        <input className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-900/80 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                          value={(proj.tech || []).join(", ")} onChange={(e) => {
                            const p = [...portfolio.projects]; p[pi] = { ...p[pi], tech: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) }; pf("projects", p);
                          }} />
                      </div>
                    </div>
                  </div>
                ))}
                <button onClick={() => pf("projects", [...portfolio.projects, { icon: "monitor", type: "", title: "", description: "", features: [""], tech: [] }])}
                  className="w-full py-3 rounded-xl border border-dashed border-white/20 text-sm text-slate-400 hover:text-white hover:border-purple-500/50 transition">+ Add Project</button>
              </div>
            )}

            {/* Education editor */}
            {portfolioSection === "education" && (
              <div className="space-y-4">
                {portfolio.education.map((edu, ei) => (
                  <div key={ei} className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-base font-semibold text-white">Education #{ei + 1}</h3>
                      <button onClick={() => { const e = [...portfolio.education]; e.splice(ei, 1); pf("education", e); }}
                        className="px-3 py-1 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 text-xs transition">Remove</button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">Year / Period</label>
                        <input className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-900/80 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                          value={edu.year} onChange={(e) => { const ed = [...portfolio.education]; ed[ei] = { ...ed[ei], year: e.target.value }; pf("education", ed); }} />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">Score / GPA</label>
                        <input className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-900/80 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                          value={edu.score} onChange={(e) => { const ed = [...portfolio.education]; ed[ei] = { ...ed[ei], score: e.target.value }; pf("education", ed); }} />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">Degree / Title</label>
                        <input className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-900/80 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                          value={edu.title} onChange={(e) => { const ed = [...portfolio.education]; ed[ei] = { ...ed[ei], title: e.target.value }; pf("education", ed); }} />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">School / College</label>
                        <input className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-900/80 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                          value={edu.school} onChange={(e) => { const ed = [...portfolio.education]; ed[ei] = { ...ed[ei], school: e.target.value }; pf("education", ed); }} />
                      </div>
                    </div>
                  </div>
                ))}
                <button onClick={() => pf("education", [...portfolio.education, { year: "", title: "", school: "", score: "" }])}
                  className="w-full py-3 rounded-xl border border-dashed border-white/20 text-sm text-slate-400 hover:text-white hover:border-purple-500/50 transition">+ Add Education</button>
              </div>
            )}

            {/* Contact editor */}
            {portfolioSection === "contact" && (
              <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6 space-y-4">
                <h3 className="text-base font-semibold text-white">Contact Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">Email</label>
                    <input className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-900/80 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                      value={portfolio.email} onChange={(e) => pf("email", e.target.value)} placeholder="you@example.com" />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">Phone</label>
                    <input className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-900/80 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                      value={portfolio.phone} onChange={(e) => pf("phone", e.target.value)} placeholder="+91 7904263246" />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">Location</label>
                    <input className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-900/80 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                      value={portfolio.location} onChange={(e) => pf("location", e.target.value)} placeholder="Tirupati, India" />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">LinkedIn URL</label>
                    <input className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-900/80 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                      value={portfolio.linkedin_url} onChange={(e) => pf("linkedin_url", e.target.value)} placeholder="https://linkedin.com/in/..." />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">GitHub URL</label>
                    <input className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-900/80 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                      value={portfolio.github_url} onChange={(e) => pf("github_url", e.target.value)} placeholder="https://github.com/..." />
                  </div>
                </div>
              </div>
            )}
            </>
            )}
          </div>
        ) : (
          <div className="bg-white/5 rounded-2xl border border-white/10 p-10 text-center text-slate-400">
            Use the tabs above to manage shops, onboarding, demos and support.
          </div>
        )}
      </div>

      {/* ── ENABLE MODAL ── */}
      {enableModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setEnableModal(null)}>
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 max-w-sm w-full mx-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white">Enable Shop</h3>
            <p className="text-sm text-slate-400">How would you like to enable this shop?</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => confirmEnable("TRIAL")}
                className="w-full py-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-200 text-sm font-semibold transition"
              >
                ⏱ Enable as Trial (30 days)
              </button>
              <button
                onClick={() => confirmEnable("ACTIVE")}
                className="w-full py-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-200 text-sm font-semibold transition"
              >
                ✅ Enable as Active
              </button>
            </div>
            <button onClick={() => setEnableModal(null)} className="w-full py-2 text-sm text-slate-500 hover:text-white transition">
              Cancel
            </button>
          </div>
        </div>
      )}

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
