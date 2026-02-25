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

// Keep menu and shortcut tiles compact but equal height
// Keep shortcut and menu tiles aligned; fixed height when collapsed
const MENU_TILE_HEIGHT = "h-[74px]";

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
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-2 items-start">

        {/* MENUS */}
        <div className="lg:col-span-3 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3 self-start mt-8">
          {quickShortcuts.length > 0 && (
            <div className="sm:col-span-2 xl:col-span-3 bg-[#f5f7ff] rounded-2xl shadow-sm border border-indigo-100 p-2.5 pb-2 self-start">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-semibold text-gray-800">
                  Quick Shortcuts
                </h2>
              </div>

              <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {quickShortcuts.map((m, idx) => (
                  <Link
                    key={`shortcut-${m.path}`}
                    to={m.path}
                    className={`group rounded-2xl bg-white border border-indigo-100 hover:border-indigo-200 hover:shadow-md p-2 transition-all flex items-center justify-between gap-3 ${MENU_TILE_HEIGHT}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-lg shadow-sm">
                        {m.icon}
                      </div>
                      <div className="text-base font-medium text-gray-800 group-hover:text-indigo-700 truncate">
                        {m.name}
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-2 py-1">
                      Alt+{idx + 1}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Spacer between shortcuts and main menus */}
          {quickShortcuts.length > 0 && (
            <div className="sm:col-span-2 xl:col-span-3 h-6" />
          )}

          {groupedMenus.map((g) => {
            const hasTabs = g.items.length > 1;
            const expanded = expandedGroup === g.key;
            const primary = g.items[0];
            const Icon = GROUP_EMOJI[g.key] || GROUP_EMOJI.other;

            const handleCardClick = () => {
              if (!hasTabs && primary) {
                navigate(primary.path);
              } else {
                setExpandedGroup(expanded ? null : g.key);
              }
            };

            const collapsed = !hasTabs || !expanded;
            return (
              <div
                key={g.key}
                className={
                  `group rounded-2xl bg-white border border-indigo-100 hover:border-indigo-200 hover:shadow-md p-2 cursor-pointer transition `
                  + (collapsed
                    ? `flex items-center justify-between ${MENU_TILE_HEIGHT}`
                    : `flex flex-col gap-2 min-h-[90px] pb-2`)
                }
                onClick={handleCardClick}
              >
                <div className={`flex items-center justify-between gap-3 w-full ${collapsed ? "" : "pb-1"}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-lg shadow-sm">
                      <Icon />
                    </div>
                    <div className="text-base font-medium text-gray-800 group-hover:text-indigo-700 truncate">
                      {g.title}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      hasTabs
                        ? setExpandedGroup(expanded ? null : g.key)
                        : handleCardClick();
                    }}
                    className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-2 py-1 hover:bg-indigo-100"
                  >
                    {hasTabs ? (expanded ? "Close" : "Open") : "Open"}
                  </button>
                </div>

                {hasTabs && expanded && (
                  <div className="mt-2 grid w/full grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
                    {g.items.map((m) => (
                      <button
                        key={m.path}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(m.path);
                        }}
                        className="px-3 py-2 min-h-[36px] rounded-full border border-indigo-100 text-sm font-medium text-indigo-800 bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-200 transition-shadow shadow-[0_6px_16px_rgba(79,70,229,0.12)] text-center"
                      >
                        {m.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* SIDEBAR DASHBOARD */}
        <aside className="lg:col-span-1 space-y-6">

          {/* Today Summary */}
          <div className="bg-white rounded-2xl shadow-sm border p-5">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-semibold text-gray-700">
                Today Summary
              </h3>
              <button
                onClick={() => {
                  loadStats();
                  if (!hasValidCustomRange) return;
                  loadCategorySales(selectedCategoryBranchId);
                  loadBranchSales();
                }}
                className="px-3 py-1 text-xs rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
              >
                Refresh
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="bg-emerald-600 text-white rounded-xl p-4">
                <div className="text-xs opacity-80">Total Bills</div>
                <div className="text-lg font-bold">
                  {Number(stats?.today_bills || 0)}
                </div>
              </div>

              <div className="bg-indigo-600 text-white rounded-xl p-4">
                <div className="text-xs opacity-80">Total Amount</div>
                <div className="text-lg font-bold">
                  Rs. {Number(stats?.today_sales || 0).toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          {/* Sales Filter */}
          <div className="bg-white rounded-2xl shadow-sm border p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              Sales Filter
            </h3>

            <div className="flex flex-wrap gap-2">
              {["today", "month", "custom"].map((mode) => (
                <button
                  key={mode}
                  onClick={() => setReportMode(mode)}
                  className={`px-3 py-1 text-xs rounded-lg border transition ${
                    reportMode === mode
                      ? "bg-indigo-600 border-indigo-600 text-white"
                      : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {mode.toUpperCase()}
                </button>
              ))}
            </div>

            {reportMode === "custom" && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            )}
            {!hasValidCustomRange && (
              <p className="mt-2 text-[11px] text-amber-700">
                Select both From and To dates for custom range.
              </p>
            )}
          </div>

          {/* Branch Sales */}
          {isAdmin && (
            <div className="bg-white rounded-2xl shadow-sm border p-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-700">
                  Branch Sales
                </h3>
                <button
                  onClick={handleAllBranchesClick}
                  className={`px-2 py-1 text-[11px] rounded border transition ${
                    selectedCategoryBranchId == null
                      ? "bg-indigo-600 border-indigo-600 text-white"
                      : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  All Branches
                </button>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Category filter: {selectedCategoryBranchName}
              </p>

              {branchSales.length === 0 ? (
                <p className="text-xs text-gray-500">
                  No branch sales for selected range.
                </p>
              ) : (
                <>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={branchSales}
                          dataKey="total_sales"
                          nameKey="branch_name"
                          innerRadius={40}
                          outerRadius={80}
                        >
                          {branchSales.map((row, i) => (
                            <Cell
                              key={i}
                              fill={COLORS[i % COLORS.length]}
                              style={{ cursor: "pointer" }}
                              onClick={() => handleBranchSalesClick(row, i)}
                              stroke={
                                String(row?.branch_id ?? "") ===
                                String(selectedCategoryBranchId ?? "")
                                  ? "#111827"
                                  : "#ffffff"
                              }
                              strokeWidth={
                                String(row?.branch_id ?? "") ===
                                String(selectedCategoryBranchId ?? "")
                                  ? 2
                                  : 1
                              }
                            />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v) => `Rs. ${v}`} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="mt-3 border-t pt-2">
                    <div className="text-xs font-semibold text-gray-600 mb-2">
                      Branch Names
                    </div>
                    <div className="max-h-32 overflow-auto space-y-1">
                      {branchSales.map((row, i) => {
                        const isSelected =
                          String(row?.branch_id ?? "") ===
                          String(selectedCategoryBranchId ?? "");

                        return (
                          <button
                            key={`branch-name-${row?.branch_id ?? i}`}
                            onClick={() => handleBranchSalesClick(row, i)}
                            className={`w-full text-left text-xs rounded-md border px-2 py-1.5 flex items-center justify-between gap-2 ${
                              isSelected
                                ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                            }`}
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <span
                                className="w-2.5 h-2.5 rounded-full flex-none"
                                style={{
                                  backgroundColor: COLORS[i % COLORS.length],
                                }}
                              />
                              <span className="truncate">
                                {row?.branch_name ||
                                  (row?.branch_id != null
                                    ? `Branch ${row.branch_id}`
                                    : "-")}
                              </span>
                            </span>
                            <span className="font-medium flex-none">
                              Rs. {Number(row?.total_sales || 0).toFixed(2)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Category Sales */}
          <div className="bg-white rounded-2xl shadow-sm border p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">
              Category Sales
            </h3>
            {isAdmin && (
              <p className="text-xs text-gray-500 -mt-2 mb-3">
                Filtered by: {selectedCategoryBranchName}
              </p>
            )}

            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categorySales}
                    dataKey="total_sales"
                    nameKey="category_name"
                    innerRadius={40}
                    outerRadius={80}
                  >
                    {categorySales.map((row, i) => (
                      <Cell
                        key={i}
                        fill={COLORS[i % COLORS.length]}
                        style={{ cursor: "pointer" }}
                        onClick={() => handleCategorySalesClick(row, i)}
                        stroke={
                          String(row?.category_id ?? "") ===
                          String(selectedCategory?.category_id ?? "")
                            ? "#111827"
                            : "#ffffff"
                        }
                        strokeWidth={
                          String(row?.category_id ?? "") ===
                          String(selectedCategory?.category_id ?? "")
                            ? 2
                            : 1
                        }
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => `Rs. ${v}`} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-3 border-t pt-2">
              <div className="text-xs font-semibold text-gray-600 mb-2">
                Category Names
              </div>
              {categorySales.length === 0 ? (
                <p className="text-xs text-gray-500">
                  No category sales for selected range.
                </p>
              ) : (
                <div className="max-h-32 overflow-auto space-y-1">
                  {categorySales.map((row, i) => {
                    const isSelected =
                      String(row?.category_id ?? "") ===
                      String(selectedCategory?.category_id ?? "");

                    return (
                      <button
                        key={`cat-name-${row?.category_id ?? i}`}
                        onClick={() => handleCategorySalesClick(row, i)}
                        className={`w-full text-left text-xs rounded-md border px-2 py-1.5 flex items-center justify-between gap-2 ${
                          isSelected
                            ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                            : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-none"
                            style={{
                              backgroundColor: COLORS[i % COLORS.length],
                            }}
                          />
                          <span className="truncate">
                            {row?.category_name || "-"}
                          </span>
                        </span>
                        <span className="font-medium flex-none">
                          Rs. {Number(row?.total_sales || 0).toFixed(2)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {selectedCategory && (
              <div className="mt-4 rounded-xl border bg-gray-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-gray-500">
                      Selected Category
                    </div>
                    <div className="text-sm font-semibold text-gray-800">
                      {selectedCategory.category_name}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      Sales: Rs.{" "}
                      {Number(selectedCategory?.total_sales || 0).toFixed(2)}
                    </div>
                    <div className="text-xs text-gray-600">
                      Total Items Sold: {selectedCategoryItemsSold}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setSelectedCategory(null);
                      setCategoryItemDetails([]);
                    }}
                    className="text-[11px] text-red-600 hover:text-red-700"
                  >
                    Clear
                  </button>
                </div>

                <div className="mt-3 border-t pt-2">
                  <div className="text-xs font-semibold text-gray-600 mb-2">
                    Item-wise Quantity
                  </div>

                  {categoryItemsLoading ? (
                    <p className="text-xs text-gray-500">Loading...</p>
                  ) : categoryItemDetails.length === 0 ? (
                    <p className="text-xs text-gray-500">
                      No item sales found for this category.
                    </p>
                  ) : (
                    <div className="max-h-36 overflow-auto divide-y">
                      {categoryItemDetails.map((item, idx) => {
                        const rawAmount =
                          item?.total_sales ??
                          item?.total_amount ??
                          item?.total_amt ??
                          item?.amount ??
                          item?.total_price ??
                          item?.total_value ??
                          null;

                        const amountNumber =
                          rawAmount == null || rawAmount === ""
                            ? null
                            : Number(rawAmount);

                        return (
                          <div
                            key={`${item?.item_name || "item"}-${idx}`}
                            className="py-1.5 flex items-start justify-between gap-2 text-xs"
                          >
                            <span className="truncate pr-2">
                              {item?.item_name || "-"}
                            </span>

                            <span className="flex flex-col items-end flex-none leading-tight">
                              <span className="font-semibold">
                                {Number(item?.total_qty || 0)}
                              </span>
                              <span className="text-[11px] text-gray-600">
                                {amountNumber == null || Number.isNaN(amountNumber)
                                  ? "Rs. -"
                                  : `Rs. ${amountNumber.toFixed(2)}`}
                              </span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Quick Expense */}
          {canExpenseWrite && (
            <div className="bg-white rounded-2xl shadow-sm border p-5 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">
                Quick Expense
              </h3>

              <input
                type="number"
                placeholder="Amount"
                value={expenseForm.amount}
                onChange={(e) =>
                  setExpenseForm({ ...expenseForm, amount: e.target.value })
                }
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />

              <input
                placeholder="Category"
                value={expenseForm.category}
                onChange={(e) =>
                  setExpenseForm({ ...expenseForm, category: e.target.value })
                }
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />

              <button
                onClick={saveQuickExpense}
                disabled={expenseSaving}
                className="w-full py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-60"
              >
                {expenseSaving ? "Saving..." : "Save Expense"}
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
