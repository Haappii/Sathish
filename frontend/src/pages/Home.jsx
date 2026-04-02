import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import api from "../utils/apiClient";
import { useToast } from "../components/Toast";
import { getSession } from "../utils/auth";

import {
  canAccess,
  buildRbacMenu,
  buildRoleMenu,
  modulesToPermMap,
} from "../utils/navigationMenu";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  FaShoppingCart,
  FaUsers,
  FaUserTie,
  FaUndo,
  FaMoneyBillWave,
  FaBoxes,
  FaTruck,
  FaCashRegister,
  FaGift,
  FaChartBar,
  FaFileInvoice,
  FaBell,
  FaLifeRing,
  FaCloudUploadAlt,
  FaTools,
  FaStar,
  FaChevronDown,
} from "react-icons/fa";

const COLORS = [
  "#6366f1",
  "#22c55e",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#0ea5e9",
];

const isoToday = () => new Date().toISOString().slice(0, 10);

const MENU_GROUPS = [
  { key: "billing", title: "Billing", paths: ["/sales/create", "/sales/history", "/table-billing", "/online-orders", "/drafts", "/deleted-invoices"] },
  { key: "customers", title: "Customers & Receivables", paths: ["/customers", "/dues"] },
  { key: "employees", title: "Employees", paths: ["/employees", "/employees/attendance"] },
  { key: "returns", title: "Returns", paths: ["/returns"] },
  { key: "expenses", title: "Expenses", paths: ["/expenses"] },
  { key: "inventory", title: "Inventory", paths: ["/inventory", "/reorder-alerts", "/stock-transfers", "/item-lots", "/labels", "/stock-audit"] },
  { key: "suppliers", title: "Purchase & Suppliers", paths: ["/supplier-ledger"] },
  { key: "cash_drawer", title: "Cash Drawer / Shift", paths: ["/cash-drawer"] },
  { key: "loyalty", title: "Loyalty & Coupons", paths: ["/loyalty", "/gift-cards", "/coupons"] },
  { key: "analytics", title: "Analytics & Trends", paths: ["/analytics", "/trends"] },
  { key: "reports", title: "Reports", paths: ["/reports"] },
  { key: "alerts", title: "Alerts", paths: ["/alerts"] },
  { key: "support", title: "Support", paths: ["/support-tickets"] },
  { key: "offline", title: "Offline / Sync", paths: ["/offline-sync"] },
  { key: "admin", title: "Admin & Setup", paths: ["/setup"] },
];

const GROUP_EMOJI = {
  billing: FaShoppingCart,
  customers: FaUsers,
  employees: FaUserTie,
  returns: FaUndo,
  expenses: FaMoneyBillWave,
  inventory: FaBoxes,
  suppliers: FaTruck,
  cash_drawer: FaCashRegister,
  loyalty: FaGift,
  analytics: FaChartBar,
  reports: FaFileInvoice,
  alerts: FaBell,
  support: FaLifeRing,
  offline: FaCloudUploadAlt,
  admin: FaTools,
  other: FaStar,
};

const SHORTCUT_PATHS = [
  "/sales/create",
  "/sales/history",
  "/customers",
  "/inventory",
  "/expenses",
  "/reports",
  "/cash-drawer",
  "/setup",
];

export default function Home() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const session = getSession() || {};
  const roleLower = (session?.role || "").toString().toLowerCase();
  const branchId = session?.branch_id ?? null;
  const isAdmin = roleLower === "admin";

  const [shop, setShop] = useState(null);
  const [shopType, setShopType] = useState("");
  const [permMap, setPermMap] = useState(null);
  const [permsEnabled, setPermsEnabled] = useState(false);

  const [stats, setStats] = useState(null);
  const [categorySales, setCategorySales] = useState([]);
  const [branchSales, setBranchSales] = useState([]);
  const [reportMode, setReportMode] = useState("today");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedCategoryBranchId, setSelectedCategoryBranchId] = useState(
    isAdmin ? null : branchId ?? null
  );
  const [selectedCategoryBranchName, setSelectedCategoryBranchName] = useState(() => {
    if (isAdmin) return "All Branches";
    if (session?.branch_name) return session.branch_name;
    if (branchId != null) return `Branch ${branchId}`;
    return "All Branches";
  });
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [categoryItemDetails, setCategoryItemDetails] = useState([]);
  const [categoryItemsLoading, setCategoryItemsLoading] = useState(false);

  const [expenseSaving, setExpenseSaving] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    amount: "",
    category: "",
    payment_mode: "cash",
    note: "",
  });
  const [expandedGroup, setExpandedGroup] = useState(null);
  const [branchSalesOpen, setBranchSalesOpen] = useState(true);
  const [categorySalesOpen, setCategorySalesOpen] = useState(true);

  const hasValidCustomRange =
    reportMode !== "custom" || Boolean(fromDate && toDate);

  const selectedCategoryItemsSold = useMemo(() => {
    if (!selectedCategory) return 0;
    const totalFromCategory = Number(selectedCategory?.total_items || 0);
    if (totalFromCategory > 0) return totalFromCategory;
    return categoryItemDetails.reduce(
      (sum, row) => sum + Number(row?.total_qty || 0),
      0
    );
  }, [selectedCategory, categoryItemDetails]);

  /* ------------------ LOAD SHOP ------------------ */
  useEffect(() => {
    api.get("/shop/details")
      .then((r) => {
        const s = r?.data || {};
        setShop(s);
        setShopType((s.shop_type || s.billing_type || "").toLowerCase());
      })
      .catch(() => {});
  }, []);

  /* ------------------ LOAD PERMISSIONS ------------------ */
  useEffect(() => {
    api.get("/permissions/my")
      .then((r) => {
        setPermsEnabled(Boolean(r?.data?.enabled));
        setPermMap(modulesToPermMap(r?.data?.modules));
      })
      .catch(() => {
        setPermsEnabled(false);
        setPermMap(null);
      });
  }, []);

  /* ------------------ ACCESS CONTROL ------------------ */
  const canExpenseWrite = useMemo(() => {
    if (permsEnabled && permMap) {
      return canAccess(permMap, { module: "expenses", action: "write" });
    }
    return roleLower === "admin" || roleLower === "manager";
  }, [permsEnabled, permMap, roleLower]);

  /* ------------------ LOAD DASHBOARD DATA ------------------ */
  const loadStats = useCallback(async () => {
    try {
      const res = await api.get("/dashboard/stats");
      setStats(res?.data || null);
    } catch {
      setStats(null);
    }
  }, []);

  const loadCategorySales = useCallback(async (targetBranchId = selectedCategoryBranchId) => {
    if (!hasValidCustomRange) return;
    try {
      const res = await api.get("/reports/category-sales", {
        params: {
          mode: reportMode,
          from_date: reportMode === "custom" ? fromDate || undefined : undefined,
          to_date: reportMode === "custom" ? toDate || undefined : undefined,
          branch_id: targetBranchId ?? undefined,
        },
      });
      setCategorySales(res?.data || []);
      setSelectedCategory(null);
      setCategoryItemDetails([]);
    } catch {
      setCategorySales([]);
      setSelectedCategory(null);
      setCategoryItemDetails([]);
    }
  }, [selectedCategoryBranchId, hasValidCustomRange, reportMode, fromDate, toDate]);

  const loadBranchSales = useCallback(async () => {
    if (!isAdmin || !hasValidCustomRange) return;
    try {
      const res = await api.get("/reports/branch-sales", {
        params: {
          mode: reportMode,
          from_date: reportMode === "custom" ? fromDate || undefined : undefined,
          to_date: reportMode === "custom" ? toDate || undefined : undefined,
        },
      });
      const rows = (res?.data || []).slice().sort(
        (a, b) => Number(b?.total_sales || 0) - Number(a?.total_sales || 0)
      );
      setBranchSales(rows);
    } catch {
      setBranchSales([]);
    }
  }, [isAdmin, hasValidCustomRange, reportMode, fromDate, toDate]);

  const handleBranchSalesClick = useCallback(
    (entry, index) => {
      const fromIndex =
        Number.isInteger(index) && index >= 0 ? branchSales[index] : null;
      const payload = fromIndex || entry?.payload || entry;
      const nextBranchId = payload?.branch_id;
      if (nextBranchId == null) return;

      setSelectedCategoryBranchId(nextBranchId);
      setSelectedCategoryBranchName(
        payload?.branch_name || `Branch ${nextBranchId}`
      );
      loadCategorySales(nextBranchId);
    },
    [branchSales, loadCategorySales]
  );

  const handleAllBranchesClick = useCallback(() => {
    setSelectedCategoryBranchId(null);
    setSelectedCategoryBranchName("All Branches");
    loadCategorySales(null);
  }, [loadCategorySales]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const handleCategorySalesClick = useCallback(
    async (entry, index) => {
      if (!hasValidCustomRange) {
        showToast("Select both From and To date for custom range", "error");
        return;
      }

      const fromIndex =
        Number.isInteger(index) && index >= 0 ? categorySales[index] : null;
      const payload = fromIndex || entry?.payload || entry;
      const categoryId = payload?.category_id;
      if (categoryId == null) return;

      setSelectedCategory(payload);
      setCategoryItemDetails([]);
      setCategoryItemsLoading(true);

      try {
        const res = await api.get("/reports/category-item-details", {
          params: {
            category_id: categoryId,
            branch_id: selectedCategoryBranchId ?? undefined,
            mode: reportMode,
            from_date: reportMode === "custom" ? fromDate || undefined : undefined,
            to_date: reportMode === "custom" ? toDate || undefined : undefined,
          },
        });
        setCategoryItemDetails(res?.data || []);
      } catch {
        setCategoryItemDetails([]);
      } finally {
        setCategoryItemsLoading(false);
      }
    },
    [
      hasValidCustomRange,
      categorySales,
      selectedCategoryBranchId,
      reportMode,
      fromDate,
      toDate,
      showToast,
    ]
  );

  useEffect(() => {
    if (!hasValidCustomRange) return;
    loadCategorySales(selectedCategoryBranchId);
    loadBranchSales();
  }, [
    hasValidCustomRange,
    selectedCategoryBranchId,
    loadCategorySales,
    loadBranchSales,
  ]);

  /* ------------------ MENU BUILD ------------------ */
  const showTableBilling = shopType === "hotel";
  const isHeadOfficeClosed =
    Number(branchId) === 1 &&
    String(session?.branch_close || "N").toUpperCase() === "Y";

  const menus = useMemo(() => {
    const fallback = buildRoleMenu({
      roleLower,
      showTableBilling,
      isHeadOfficeClosed,
    });

    if (!permsEnabled || !permMap) return fallback;

    const rbac = buildRbacMenu({
      permMap,
      showTableBilling,
      isHeadOfficeClosed,
    });

    return rbac?.length ? rbac : fallback;
  }, [
    permsEnabled,
    permMap,
    roleLower,
    showTableBilling,
    isHeadOfficeClosed,
  ]);

  const menuCards = useMemo(
    () => menus.filter((m) => m?.path && m.path !== "/home"),
    [menus]
  );

  const quickShortcuts = useMemo(() => {
    const byPath = new Map(menuCards.map((m) => [m.path, m]));
    return SHORTCUT_PATHS
      .map((path) => byPath.get(path))
      .filter(Boolean)
      .slice(0, 6);
  }, [menuCards]);

  useEffect(() => {
    if (!quickShortcuts.length) return;

    const hotkeyMap = new Map(
      quickShortcuts.map((item, idx) => [String(idx + 1), item.path])
    );

    const onKeyDown = (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const tagName = e.target?.tagName?.toLowerCase();
      if (tagName === "input" || tagName === "textarea" || tagName === "select") {
        return;
      }
      if (e.target?.isContentEditable) return;

      const path = hotkeyMap.get(String(e.key));
      if (!path) return;

      e.preventDefault();
      navigate(path);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, quickShortcuts]);

  const groupedMenus = useMemo(() => {
    const pathToGroup = new Map();
    for (const g of MENU_GROUPS) {
      for (const p of g.paths) pathToGroup.set(p, g.key);
    }

    const bucket = new Map();
    for (const g of MENU_GROUPS) bucket.set(g.key, []);

    const other = [];

    for (const m of menuCards) {
      const k = pathToGroup.get(m.path);
      if (k && bucket.has(k)) bucket.get(k).push(m);
      else other.push(m);
    }

    const out = MENU_GROUPS
      .map((g) => ({
        key: g.key,
        title: g.title,
        items: bucket.get(g.key) || [],
      }))
      .filter((g) => g.items.length > 0);

    if (other.length)
      out.push({ key: "other", title: "Other", items: other });

    return out;
  }, [menuCards]);

  /* ------------------ QUICK EXPENSE ------------------ */
  const saveQuickExpense = async () => {
    if (expenseSaving) return;
    if (!expenseForm.amount || !expenseForm.category) {
      showToast("Amount and category required", "error");
      return;
    }

    setExpenseSaving(true);

    try {
      await api.post("/expenses/", {
        expense_date: (shop?.app_date || isoToday()).slice(0, 10),
        amount: Number(expenseForm.amount),
        category: expenseForm.category.trim(),
        payment_mode: expenseForm.payment_mode,
        note: expenseForm.note.trim() || null,
        branch_id: branchId ?? null,
      });

      showToast("Expense saved", "success");
      setExpenseForm({ amount: "", category: "", payment_mode: "cash", note: "" });
      loadStats();
    } catch (err) {
      showToast(
        err?.response?.data?.detail || "Failed to save expense",
        "error"
      );
    } finally {
      setExpenseSaving(false);
    }
  };

  /* ================== UI ================== */
  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Today stats bar ── */}
      <div className="px-5 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Today Bills",   value: Number(stats?.today_bills  || 0),                     fmt: v => v,             color: "bg-indigo-600" },
          { label: "Today Sales",   value: Number(stats?.today_sales  || 0),                     fmt: v => `₹${v.toFixed(2)}`, color: "bg-emerald-600" },
          { label: "Today Returns", value: Number(stats?.today_returns|| 0),                     fmt: v => v,             color: "bg-rose-500" },
          { label: "Pending Dues",  value: Number(stats?.pending_dues || stats?.total_dues || 0),fmt: v => `₹${v.toFixed(2)}`, color: "bg-amber-500" },
        ].map(s => (
          <div key={s.label} className={`${s.color} text-white rounded-2xl px-4 py-3 shadow-sm`}>
            <div className="text-[11px] opacity-75 font-medium">{s.label}</div>
            <div className="text-xl font-bold mt-0.5 leading-tight">{s.fmt(s.value)}</div>
          </div>
        ))}
      </div>

      <div className="px-5 pb-6 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">

        {/* ── LEFT: shortcuts + menus ── */}
        <div className="space-y-5">

          {/* Quick shortcuts */}
          {quickShortcuts.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">Quick Access</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {quickShortcuts.map((m, idx) => (
                  <Link
                    key={`shortcut-${m.path}`}
                    to={m.path}
                    className="group flex items-center gap-3 bg-white border border-gray-100 hover:border-indigo-200 hover:shadow-md rounded-2xl px-3 py-3 transition-all"
                  >
                    <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-base shadow-sm shrink-0">
                      {m.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-gray-800 group-hover:text-indigo-700 truncate">{m.name}</div>
                      <div className="text-[10px] text-gray-400">Alt+{idx + 1}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Module groups */}
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">All Modules</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
              {groupedMenus.map((g) => {
                const hasTabs = g.items.length > 1;
                const expanded = expandedGroup === g.key;
                const primary = g.items[0];
                const Icon = GROUP_EMOJI[g.key] || GROUP_EMOJI.other;

                const handleCardClick = () => {
                  if (!hasTabs && primary) navigate(primary.path);
                  else setExpandedGroup(expanded ? null : g.key);
                };

                return (
                  <div
                    key={g.key}
                    className={`bg-white border rounded-2xl cursor-pointer transition-all ${
                      expanded ? "border-indigo-200 shadow-md" : "border-gray-100 hover:border-indigo-200 hover:shadow-sm"
                    }`}
                    onClick={handleCardClick}
                  >
                    <div className="flex items-center gap-3 px-3 py-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-base shadow-sm shrink-0 ${
                        expanded ? "bg-indigo-700" : "bg-indigo-600"
                      } text-white`}>
                        <Icon />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold text-gray-800 truncate">{g.title}</div>
                        {hasTabs && (
                          <div className="text-[10px] text-gray-400">{g.items.length} options</div>
                        )}
                      </div>
                      {hasTabs && (
                        <FaChevronDown className={`text-gray-400 text-xs transition-transform shrink-0 ${expanded ? "rotate-180" : ""}`} />
                      )}
                    </div>

                    {hasTabs && expanded && (
                      <div className="px-3 pb-3 pt-0 border-t border-gray-50">
                        <div className="grid grid-cols-2 gap-1.5 mt-2">
                          {g.items.map((m) => (
                            <button
                              key={m.path}
                              type="button"
                              onClick={(e) => { e.stopPropagation(); navigate(m.path); }}
                              className="text-left px-3 py-2 rounded-xl border border-indigo-100 text-[12px] font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition"
                            >
                              {m.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── RIGHT: sidebar ── */}
        <aside className="space-y-4">

          {/* Sales filter */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Sales Filter</p>
            <div className="flex gap-1.5">
              {["today", "month", "custom"].map((mode) => (
                <button
                  key={mode}
                  onClick={() => setReportMode(mode)}
                  className={`flex-1 py-1.5 rounded-xl text-[11px] font-bold border transition ${
                    reportMode === mode
                      ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                      : "bg-white border-gray-200 text-gray-600 hover:border-indigo-300"
                  }`}
                >
                  {mode === "today" ? "Today" : mode === "month" ? "Month" : "Custom"}
                </button>
              ))}
            </div>
            {reportMode === "custom" && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-400" />
                <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-400" />
              </div>
            )}
            {!hasValidCustomRange && (
              <p className="mt-2 text-[10px] text-amber-600 font-medium">Select both From and To dates.</p>
            )}
          </div>

          {/* Branch Sales */}
          {isAdmin && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <button type="button" onClick={() => setBranchSalesOpen(v => !v)}
                  className="flex items-center gap-1.5">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Branch Sales</p>
                  <FaChevronDown className={`text-gray-400 text-[10px] transition-transform ${branchSalesOpen ? "rotate-180" : ""}`} />
                </button>
                <button onClick={handleAllBranchesClick}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition ${
                    selectedCategoryBranchId == null
                      ? "bg-indigo-600 border-indigo-600 text-white"
                      : "bg-white border-gray-200 text-gray-600 hover:border-indigo-300"
                  }`}>
                  All
                </button>
              </div>

              {branchSalesOpen && (
                branchSales.length === 0
                  ? <p className="text-xs text-gray-400 py-2 text-center">No data for selected range.</p>
                  : <>
                    <div className="h-44">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={branchSales} dataKey="total_sales" nameKey="branch_name" innerRadius={35} outerRadius={65}>
                            {branchSales.map((row, i) => (
                              <Cell key={i} fill={COLORS[i % COLORS.length]} style={{ cursor: "pointer" }}
                                onClick={() => handleBranchSalesClick(row, i)}
                                stroke={String(row?.branch_id ?? "") === String(selectedCategoryBranchId ?? "") ? "#1e1b4b" : "#fff"}
                                strokeWidth={String(row?.branch_id ?? "") === String(selectedCategoryBranchId ?? "") ? 2 : 1}
                              />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v) => `Rs. ${v}`} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-2 space-y-1 max-h-28 overflow-auto">
                      {branchSales.map((row, i) => {
                        const sel = String(row?.branch_id ?? "") === String(selectedCategoryBranchId ?? "");
                        return (
                          <button key={`b-${row?.branch_id ?? i}`} onClick={() => handleBranchSalesClick(row, i)}
                            className={`w-full flex items-center justify-between gap-2 text-xs px-2 py-1.5 rounded-xl border transition ${
                              sel ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-gray-100 hover:border-gray-200 text-gray-700"
                            }`}>
                            <span className="flex items-center gap-1.5 min-w-0">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                              <span className="truncate">{row?.branch_name || `Branch ${row?.branch_id}`}</span>
                            </span>
                            <span className="font-semibold shrink-0">₹{Number(row?.total_sales || 0).toFixed(0)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </>
              )}
            </div>
          )}

          {/* Category Sales */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <button type="button" onClick={() => setCategorySalesOpen(v => !v)} className="flex items-center gap-1.5">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Category Sales</p>
                <FaChevronDown className={`text-gray-400 text-[10px] transition-transform ${categorySalesOpen ? "rotate-180" : ""}`} />
              </button>
              {isAdmin && (
                <span className="text-[10px] text-gray-400 truncate max-w-[100px]">{selectedCategoryBranchName}</span>
              )}
            </div>

            {categorySalesOpen && (
              categorySales.length === 0
                ? <p className="text-xs text-gray-400 py-2 text-center">No data for selected range.</p>
                : <>
                  <div className="h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={categorySales} dataKey="total_sales" nameKey="category_name" innerRadius={35} outerRadius={65}>
                          {categorySales.map((row, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} style={{ cursor: "pointer" }}
                              onClick={() => handleCategorySalesClick(row, i)}
                              stroke={String(row?.category_id ?? "") === String(selectedCategory?.category_id ?? "") ? "#1e1b4b" : "#fff"}
                              strokeWidth={String(row?.category_id ?? "") === String(selectedCategory?.category_id ?? "") ? 2 : 1}
                            />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v) => `Rs. ${v}`} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 space-y-1 max-h-28 overflow-auto">
                    {categorySales.map((row, i) => {
                      const sel = String(row?.category_id ?? "") === String(selectedCategory?.category_id ?? "");
                      return (
                        <button key={`c-${row?.category_id ?? i}`} onClick={() => handleCategorySalesClick(row, i)}
                          className={`w-full flex items-center justify-between gap-2 text-xs px-2 py-1.5 rounded-xl border transition ${
                            sel ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-gray-100 hover:border-gray-200 text-gray-700"
                          }`}>
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                            <span className="truncate">{row?.category_name || "-"}</span>
                          </span>
                          <span className="font-semibold shrink-0">₹{Number(row?.total_sales || 0).toFixed(0)}</span>
                        </button>
                      );
                    })}
                  </div>

                  {selectedCategory && (
                    <div className="mt-3 border-t pt-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-gray-700">{selectedCategory.category_name}</p>
                          <p className="text-[11px] text-gray-400">₹{Number(selectedCategory?.total_sales || 0).toFixed(2)} · {selectedCategoryItemsSold} sold</p>
                        </div>
                        <button onClick={() => { setSelectedCategory(null); setCategoryItemDetails([]); }}
                          className="text-[10px] text-red-500 hover:text-red-600 border border-red-100 px-2 py-0.5 rounded-lg">
                          Clear
                        </button>
                      </div>
                      {categoryItemsLoading
                        ? <p className="text-xs text-gray-400">Loading…</p>
                        : categoryItemDetails.length === 0
                          ? <p className="text-xs text-gray-400">No items found.</p>
                          : <div className="max-h-32 overflow-auto divide-y divide-gray-50">
                            {categoryItemDetails.map((item, idx) => {
                              const rawAmount = item?.total_sales ?? item?.total_amount ?? item?.total_amt ?? item?.amount ?? null;
                              const amt = rawAmount == null || rawAmount === "" ? null : Number(rawAmount);
                              return (
                                <div key={`${item?.item_name || "item"}-${idx}`}
                                  className="py-1.5 flex items-center justify-between gap-2 text-xs">
                                  <span className="truncate text-gray-700">{item?.item_name || "-"}</span>
                                  <span className="flex flex-col items-end shrink-0 text-[11px]">
                                    <span className="font-bold text-gray-800">{Number(item?.total_qty || 0)}</span>
                                    <span className="text-gray-400">{amt == null || Number.isNaN(amt) ? "-" : `₹${amt.toFixed(0)}`}</span>
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                      }
                    </div>
                  )}
                </>
            )}
          </div>

          {/* Quick Expense */}
          {canExpenseWrite && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Quick Expense</p>
              <input type="number" placeholder="Amount"
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
              />
              <input placeholder="Category"
                value={expenseForm.category}
                onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
              />
              <button onClick={saveQuickExpense} disabled={expenseSaving}
                className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold transition">
                {expenseSaving ? "Saving…" : "Save Expense"}
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
