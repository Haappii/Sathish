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
  "#2563eb",
  "#16a34a",
  "#f59e0b",
  "#db2777",
  "#7c3aed",
  "#0284c7",
];

const isoToday = () => new Date().toISOString().slice(0, 10);

export default function Home() {
  const { showToast } = useToast();
  const session = getSession() || {};
  const roleLower = (session?.role || "").toString().toLowerCase();
  const branchId = session?.branch_id ?? null;

  const [shop, setShop] = useState(null);
  const [shopType, setShopType] = useState("");
  const [permMap, setPermMap] = useState(null);
  const [permsEnabled, setPermsEnabled] = useState(false);

  const [statsLoading, setStatsLoading] = useState(false);
  const [stats, setStats] = useState(null);

  const [catsLoading, setCatsLoading] = useState(false);
  const [categorySales, setCategorySales] = useState([]);

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
        setShopType((s.shop_type || s.billing_type || "").toString().toLowerCase());
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
    } catch (err) {
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
  };

  const loadCategorySales = async () => {
    setCatsLoading(true);
    try {
      const res = await api.get("/reports/category-sales", {
        params: {
          mode: "today",
          branch_id: branchId ?? undefined,
        },
      });
      setCategorySales(res?.data || []);
    } catch (err) {
      setCategorySales([]);
    } finally {
      setCatsLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
    loadCategorySales();
  }, [branchId]);

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

    return rbac && rbac.length ? rbac : fallback;
  }, [permsEnabled, permMap, roleLower, showTableBilling, isHeadOfficeClosed]);

  const menuCards = useMemo(
    () => menus.filter((m) => m?.path && m.path !== "/home"),
    [menus]
  );

  const saveQuickExpense = async () => {
    if (expenseSaving) return;
    if (!expenseForm.amount || !expenseForm.category) {
      showToast("Amount and category are required", "error");
      return;
    }

    setExpenseSaving(true);
    try {
      await api.post("/expenses/", {
        expense_date: (shop?.app_date || isoToday()).toString().slice(0, 10),
        amount: Number(expenseForm.amount),
        category: String(expenseForm.category || "").trim(),
        payment_mode: expenseForm.payment_mode,
        note: String(expenseForm.note || "").trim() || null,
        branch_id: branchId ?? null,
      });
      showToast("Expense saved", "success");
      setExpenseForm({ amount: "", category: "", payment_mode: "cash", note: "" });
      await loadStats();
    } catch (err) {
      const msg = err?.response?.data?.detail || "Failed to save expense";
      showToast(msg, "error");
    } finally {
      setExpenseSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 p-6">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* MENUS (75%) */}
        <div className="lg:col-span-3">
          {menuCards.length ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {menuCards.map((m) => (
                <Link
                  key={m.path}
                  to={m.path}
                  className="
                    group relative overflow-hidden
                    rounded-2xl
                    bg-white/70 backdrop-blur-lg
                    border border-gray-200
                    p-5
                    shadow-sm
                    hover:shadow-xl
                    hover:-translate-y-1
                    transition-all duration-300
                  "
                >
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition duration-500 bg-gradient-to-r from-blue-100 to-indigo-100 blur-xl" />

                  <div className="relative z-10 flex items-center gap-4">
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-xl shadow-md group-hover:scale-110 transition-transform duration-300">
                      {m.icon}
                    </div>

                    <div className="min-w-0">
                      <div className="text-base font-semibold text-gray-800 group-hover:text-blue-600 transition truncate">
                        {m.name}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border bg-white p-6 text-sm text-gray-600">
              No menus available for this account.
            </div>
          )}
        </div>

        {/* DASHBOARD WIDGETS (25%) */}
        <aside className="lg:col-span-1 space-y-4">
          <div className="rounded-2xl border bg-white/70 backdrop-blur-lg p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-700">Today Summary</div>
              <button
                onClick={() => {
                  loadStats();
                  loadCategorySales();
                }}
                className="text-[12px] px-2 py-1 rounded border bg-white hover:bg-slate-50"
                type="button"
              >
                Refresh
              </button>
            </div>

            {statsLoading ? (
              <div className="mt-3 text-sm text-gray-500">Loading...</div>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-slate-900 text-white p-3">
                  <div className="text-[11px] opacity-70">Sales</div>
                  <div className="text-lg font-bold">
                    Rs. {Number(stats?.today_sales || 0).toFixed(2)}
                  </div>
                </div>
                <div className="rounded-xl bg-emerald-600 text-white p-3">
                  <div className="text-[11px] opacity-80">Bills</div>
                  <div className="text-lg font-bold">{Number(stats?.today_bills || 0)}</div>
                </div>
              </div>
            )}

            <div className="mt-3 flex flex-col gap-2">
              <Link
                to="/sales/history"
                className="text-[12px] px-3 py-2 rounded-lg border bg-white hover:bg-slate-50 text-slate-700 font-semibold"
              >
                Billing History
              </Link>
              <Link
                to="/expenses"
                className="text-[12px] px-3 py-2 rounded-lg border bg-white hover:bg-slate-50 text-slate-700 font-semibold"
              >
                Expenses
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border bg-white/70 backdrop-blur-lg p-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-700">Category Sales</div>
            <div className="mt-3 h-56">
              {catsLoading ? (
                <div className="text-sm text-gray-500">Loading...</div>
              ) : categorySales.length === 0 ? (
                <div className="text-sm text-gray-500">No sales data</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categorySales}
                      dataKey="total_sales"
                      nameKey="category_name"
                      innerRadius={40}
                      outerRadius={80}
                      paddingAngle={3}
                    >
                      {categorySales.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => `Rs. ${v}`} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            {categorySales.length > 0 && (
              <div className="mt-2 space-y-1 text-[12px]">
                {categorySales.slice(0, 5).map((c, i) => (
                  <div key={c.category_id || c.category_name || i} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: COLORS[i % COLORS.length] }}
                      />
                      <span className="truncate text-slate-700">{c.category_name}</span>
                    </div>
                    <span className="text-slate-600">
                      {Number(c.total_sales || 0).toFixed(0)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {canExpenseWrite && (
            <div className="rounded-2xl border bg-white/70 backdrop-blur-lg p-4 shadow-sm">
              <div className="text-sm font-semibold text-slate-700">Quick Expense</div>
              <div className="mt-3 grid grid-cols-1 gap-2 text-[12px]">
                <input
                  type="number"
                  className="border rounded-lg px-2 py-2 bg-white"
                  placeholder="Amount"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                />
                <input
                  className="border rounded-lg px-2 py-2 bg-white"
                  placeholder="Category (e.g. Tea)"
                  value={expenseForm.category}
                  onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                />
                <select
                  className="border rounded-lg px-2 py-2 bg-white"
                  value={expenseForm.payment_mode}
                  onChange={(e) => setExpenseForm({ ...expenseForm, payment_mode: e.target.value })}
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="bank">Bank</option>
                </select>
                <input
                  className="border rounded-lg px-2 py-2 bg-white"
                  placeholder="Note (optional)"
                  value={expenseForm.note}
                  onChange={(e) => setExpenseForm({ ...expenseForm, note: e.target.value })}
                />
                <button
                  onClick={saveQuickExpense}
                  disabled={expenseSaving}
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-[12px] disabled:opacity-60"
                  type="button"
                >
                  {expenseSaving ? "Saving..." : "Save Expense"}
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
