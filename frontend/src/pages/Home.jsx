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
  { key: "inventory", title: "Inventory", paths: ["/inventory", "/reorder-alerts", "/stock-transfers", "/item-lots", "/stock-audit"] },
  { key: "suppliers", title: "Purchase & Suppliers", paths: ["/supplier-ledger"] },
  { key: "cash_drawer", title: "Cash Drawer / Shift", paths: ["/cash-drawer"] },
  { key: "loyalty", title: "Loyalty & Coupons", paths: ["/loyalty", "/coupons"] },
  { key: "pricing", title: "Pricing", paths: ["/pricing"] },
  { key: "analytics", title: "Analytics & Trends", paths: ["/analytics", "/trends"] },
  { key: "reports", title: "Reports", paths: ["/reports"] },
  { key: "alerts", title: "Alerts", paths: ["/alerts"] },
  { key: "support", title: "Support", paths: ["/support-tickets"] },
  { key: "offline", title: "Offline / Sync", paths: ["/offline-sync"] },
  { key: "admin", title: "Admin & Setup", paths: ["/setup"] },
];

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
  const [selectedCategoryBranchId, setSelectedCategoryBranchId] = useState(
    branchId ?? null
  );
  const [selectedCategoryBranchName, setSelectedCategoryBranchName] = useState(() => {
    if (session?.branch_name) return session.branch_name;
    if (branchId != null) return `Branch ${branchId}`;
    return "All Branches";
  });

  const [expenseSaving, setExpenseSaving] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    amount: "",
    category: "",
    payment_mode: "cash",
    note: "",
  });

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

  const loadCategorySales = useCallback(async (targetBranchId = branchId) => {
    try {
      const res = await api.get("/reports/category-sales", {
        params: { mode: "today", branch_id: targetBranchId ?? undefined },
      });
      setCategorySales(res?.data || []);
    } catch {
      setCategorySales([]);
    }
  }, [branchId]);

  const loadBranchSales = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await api.get("/reports/branch-sales", {
        params: { mode: "today" },
      });
      const rows = (res?.data || []).slice().sort(
        (a, b) => Number(b?.total_sales || 0) - Number(a?.total_sales || 0)
      );
      setBranchSales(rows);
    } catch {
      setBranchSales([]);
    }
  }, [isAdmin]);

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

  useEffect(() => {
    loadStats();
    loadCategorySales();
    loadBranchSales();
  }, [loadStats, loadCategorySales, loadBranchSales]);

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
  }, [permsEnabled, permMap, roleLower, showTableBilling, isHeadOfficeClosed]);

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
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* MENUS */}
        <div className="lg:col-span-3 space-y-6">
          {quickShortcuts.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800">
                  Quick Shortcuts
                </h2>
                <span className="text-sm text-gray-500">
                  Use Alt + 1..{quickShortcuts.length}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {quickShortcuts.map((m, idx) => (
                  <Link
                    key={`shortcut-${m.path}`}
                    to={m.path}
                    className="group rounded-xl border bg-indigo-50 hover:bg-indigo-100 p-4 transition-all hover:shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-base">
                          {m.icon}
                        </div>
                        <div className="text-sm font-medium text-gray-700 group-hover:text-indigo-700">
                          {m.name}
                        </div>
                      </div>
                      <span className="text-[11px] font-semibold text-indigo-700 bg-white border border-indigo-200 rounded px-2 py-1">
                        Alt+{idx + 1}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {groupedMenus.map((g) => (
            <div
              key={g.key}
              className="bg-white rounded-2xl shadow-sm border p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800">
                  {g.title}
                </h2>
                <span className="text-sm text-gray-500">
                  {g.items.length} Modules
                </span>
              </div>

              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((m) => (
                  <Link
                    key={m.path}
                    to={m.path}
                    className="group rounded-xl border bg-gray-50 hover:bg-indigo-50 p-5 transition-all hover:shadow-md"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-lg shadow-sm">
                        {m.icon}
                      </div>

                      <div className="text-sm font-medium text-gray-700 group-hover:text-indigo-600">
                        {m.name}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
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
                  loadCategorySales(selectedCategoryBranchId);
                  loadBranchSales();
                }}
                className="px-3 py-1 text-xs rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
              >
                Refresh
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="bg-indigo-600 text-white rounded-xl p-4">
                <div className="text-xs opacity-80">Sales</div>
                <div className="text-lg font-bold">
                  Rs. {Number(stats?.today_sales || 0).toFixed(2)}
                </div>
              </div>

              <div className="bg-emerald-600 text-white rounded-xl p-4">
                <div className="text-xs opacity-80">Bills</div>
                <div className="text-lg font-bold">
                  {Number(stats?.today_bills || 0)}
                </div>
              </div>
            </div>
          </div>

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
                    {categorySales.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => `Rs. ${v}`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Branch Sales */}
          {isAdmin && branchSales.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">
                Branch Sales
              </h3>

              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={branchSales}
                      dataKey="total_sales"
                      nameKey="branch_name"
                      innerRadius={40}
                      outerRadius={80}
                      onClick={handleBranchSalesClick}
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
            </div>
          )}

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
