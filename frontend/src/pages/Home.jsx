import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

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
  { key: "billing", title: "Billing", paths: ["/sales/create", "/sales/history", "/online-orders", "/drafts", "/deleted-invoices"] },
  { key: "customers", title: "Customers & Receivables", paths: ["/customers", "/dues"] },
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
  { key: "tables", title: "Table Billing", paths: ["/table-billing"] },
  { key: "admin", title: "Admin & Setup", paths: ["/setup"] },
];

export default function Home() {
  const { showToast } = useToast();
  const session = getSession() || {};
  const roleLower = (session?.role || "").toString().toLowerCase();
  const branchId = session?.branch_id ?? null;
  const isAdmin = roleLower === "admin";

  const [openGroups, setOpenGroups] = useState({});

  const [shop, setShop] = useState(null);
  const [shopType, setShopType] = useState("");
  const [permMap, setPermMap] = useState(null);
  const [permsEnabled, setPermsEnabled] = useState(false);

  const [statsLoading, setStatsLoading] = useState(false);
  const [stats, setStats] = useState(null);

  const [catsLoading, setCatsLoading] = useState(false);
  const [categorySales, setCategorySales] = useState([]);

  const [branchSalesLoading, setBranchSalesLoading] = useState(false);
  const [branchSales, setBranchSales] = useState([]);

  const [expenseSaving, setExpenseSaving] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    amount: "",
    category: "",
    payment_mode: "cash",
    note: "",
  });

  useEffect(() => {
    api.get("/shop/details")
      .then((r) => {
        const s = r?.data || {};
        setShop(s);
        setShopType((s.shop_type || s.billing_type || "").toLowerCase());
      })
      .catch(() => {});
  }, []);

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

  const canExpenseWrite = useMemo(() => {
    if (permsEnabled && permMap) {
      return canAccess(permMap, { module: "expenses", action: "write" });
    }
    return roleLower === "admin" || roleLower === "manager";
  }, [permsEnabled, permMap, roleLower]);

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const res = await api.get("/dashboard/stats");
      setStats(res?.data || null);
    } catch {
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
  };

  const loadCategorySales = async () => {
    setCatsLoading(true);
    try {
      const res = await api.get("/reports/category-sales", {
        params: { mode: "today", branch_id: branchId ?? undefined },
      });
      setCategorySales(res?.data || []);
    } catch {
      setCategorySales([]);
    } finally {
      setCatsLoading(false);
    }
  };

  const loadBranchSales = async () => {
    if (!isAdmin) {
      setBranchSales([]);
      return;
    }
    setBranchSalesLoading(true);
    try {
      const res = await api.get("/reports/branch-sales", {
        params: { mode: "today" },
      });
      const rows = (res?.data || []).slice().sort((a, b) => Number(b?.total_sales || 0) - Number(a?.total_sales || 0));
      setBranchSales(rows);
    } catch {
      setBranchSales([]);
    } finally {
      setBranchSalesLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
    loadCategorySales();
    loadBranchSales();
  }, [branchId, isAdmin]);

  const showTableBilling = shopType === "hotel";
  const isHeadOfficeClosed =
    Number(branchId) === 1 &&
    String(session?.branch_close || "N").toUpperCase() === "Y";

  const menus = useMemo(() => {
    const fallback = buildRoleMenu({ roleLower, showTableBilling, isHeadOfficeClosed });
    if (!permsEnabled || !permMap) return fallback;

    const rbac = buildRbacMenu({ permMap, showTableBilling, isHeadOfficeClosed });
    return rbac?.length ? rbac : fallback;
  }, [permsEnabled, permMap, roleLower, showTableBilling, isHeadOfficeClosed]);

  const menuCards = useMemo(
    () => menus.filter((m) => m?.path && m.path !== "/home"),
    [menus]
  );

  const groupedMenus = useMemo(() => {
    const pathToGroup = new Map();
    for (const g of MENU_GROUPS) {
      for (const p of g.paths) {
        pathToGroup.set(p, g.key);
      }
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
      .map((g) => ({ key: g.key, title: g.title, items: bucket.get(g.key) || [] }))
      .filter((g) => g.items.length > 0);

    if (other.length) out.push({ key: "other", title: "Other", items: other });
    return out;
  }, [menuCards]);

  const saveQuickExpense = async () => {
    if (expenseSaving) return;
    if (!expenseForm.amount || !expenseForm.category) {
      showToast("Amount and category are required", "error");
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
      showToast(err?.response?.data?.detail || "Failed to save expense", "error");
    } finally {
      setExpenseSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-sky-50 to-purple-100 p-6 relative overflow-hidden">
      
      {/* Glow background */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-purple-300 opacity-30 blur-3xl rounded-full"></div>
      <div className="absolute top-40 -right-40 w-96 h-96 bg-blue-300 opacity-30 blur-3xl rounded-full"></div>

      <div className="relative grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* MENUS */}
        <div className="lg:col-span-3 space-y-6">
          {groupedMenus.map((g) => (
            <div key={g.key} className="space-y-3">
              <button
                type="button"
                onClick={() => setOpenGroups((prev) => ({ ...prev, [g.key]: !prev?.[g.key] }))}
                aria-expanded={Boolean(openGroups?.[g.key])}
                className="
                  w-full flex items-center justify-between
                  rounded-3xl
                  bg-white/30 backdrop-blur-2xl
                  border border-white/30
                  px-6 py-4
                  shadow-lg
                  hover:shadow-2xl
                  transition-all duration-500
                "
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-800">
                    {g.title}
                  </span>
                  <span className="text-xs text-gray-500">
                    ({g.items.length})
                  </span>
                </div>

                <svg
                  className={`h-5 w-5 text-gray-600 transition-transform duration-300 ${openGroups?.[g.key] ? "rotate-180" : ""}`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>

              {openGroups?.[g.key] && (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {g.items.map((m) => (
                    <Link
                      key={m.path}
                      to={m.path}
                      className="
                        group relative overflow-hidden
                        rounded-3xl
                        bg-white/30 backdrop-blur-2xl
                        border border-white/30
                        p-6
                        shadow-lg
                        hover:shadow-2xl
                        hover:-translate-y-2
                        hover:scale-[1.02]
                        transition-all duration-500
                      "
                    >
                      <div className="flex items-center gap-4">
                        <div className="
                          w-16 h-16 rounded-2xl
                          bg-gradient-to-br from-indigo-500 via-blue-500 to-purple-600
                          text-white flex items-center justify-center text-xl
                          shadow-lg group-hover:rotate-6 transition-all duration-500
                        ">
                          {m.icon}
                        </div>
                        <div className="text-lg font-semibold text-gray-800 group-hover:text-indigo-600 transition">
                          {m.name}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* DASHBOARD */}
        <aside className="lg:col-span-1 space-y-6">

          {/* Today Summary */}
          <div className="rounded-3xl bg-white/30 backdrop-blur-2xl border border-white/30 p-5 shadow-lg">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-semibold text-gray-700">Today Summary</h3>
              <button
                onClick={() => { loadStats(); loadCategorySales(); loadBranchSales(); }}
                className="px-3 py-1.5 text-xs rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-md hover:scale-105 transition"
              >
                Refresh
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white p-4 shadow-lg">
                <div className="text-xs opacity-80">Sales</div>
                <div className="text-xl font-bold">
                  Rs. {Number(stats?.today_sales || 0).toFixed(2)}
                </div>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white p-4 shadow-lg">
                <div className="text-xs opacity-80">Bills</div>
                <div className="text-xl font-bold">
                  {Number(stats?.today_bills || 0)}
                </div>
              </div>
            </div>
          </div>

          {/* Category Sales */}
          <div className="rounded-3xl bg-white/30 backdrop-blur-2xl border border-white/30 p-5 shadow-lg">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Category Sales</h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categorySales} dataKey="total_sales" nameKey="category_name" innerRadius={40} outerRadius={80}>
                    {categorySales.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => `Rs. ${v}`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Branch Sales (Admin) */}
          {isAdmin && (
            <div className="rounded-3xl bg-white/30 backdrop-blur-2xl border border-white/30 p-5 shadow-lg">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Branch Sales</h3>
              <div className="h-56">
                {branchSalesLoading ? (
                  <div className="text-sm text-gray-600">Loading...</div>
                ) : branchSales.length === 0 ? (
                  <div className="text-sm text-gray-600">No data</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={branchSales} dataKey="total_sales" nameKey="branch_name" innerRadius={40} outerRadius={80}>
                        {branchSales.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => `Rs. ${v}`} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>

              {branchSales.length > 0 && (
                <div className="mt-3 space-y-1 text-xs">
                  {branchSales.slice(0, 6).map((b, i) => (
                    <div key={b.branch_id || i} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: COLORS[i % COLORS.length] }}
                        />
                        <span className="truncate text-gray-700">
                          {b.branch_name}
                        </span>
                      </div>
                      <span className="text-gray-600">
                        {Number(b.total_sales || 0).toFixed(0)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Quick Expense */}
          {canExpenseWrite && (
            <div className="rounded-3xl bg-white/30 backdrop-blur-2xl border border-white/30 p-5 shadow-lg space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">Quick Expense</h3>

              <input
                type="number"
                placeholder="Amount"
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                className="w-full rounded-xl border border-white/40 bg-white/40 backdrop-blur-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />

              <input
                placeholder="Category"
                value={expenseForm.category}
                onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                className="w-full rounded-xl border border-white/40 bg-white/40 backdrop-blur-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />

              <button
                onClick={saveQuickExpense}
                disabled={expenseSaving}
                className="w-full py-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm shadow-lg hover:scale-105 transition disabled:opacity-60"
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
