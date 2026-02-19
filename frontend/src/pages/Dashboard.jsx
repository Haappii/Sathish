import { useNavigate } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import { getSession } from "../utils/auth";
import authAxios from "../api/authAxios";

import {
  FaFileInvoiceDollar,
  FaHistory,
  FaBoxes,
  FaCalendarAlt,
  FaMoneyBillWave
} from "react-icons/fa";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";

export default function Dashboard() {
  const navigate = useNavigate();
  const session = getSession();
  const userRole = session?.role || "User";
  const isHeadOfficeClosed =
    Number(session?.branch_id) === 1 &&
    String(session?.branch_close || "N").toUpperCase() === "Y";

  const [stats, setStats] = useState({});
  const [inventoryEnabled, setInventoryEnabled] = useState(false);
  const [lowStockItems, setLowStockItems] = useState([]);

  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState("all");

  const [branchSales, setBranchSales] = useState([]);
  const [categorySales, setCategorySales] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [itemDetails, setItemDetails] = useState([]);
  const [mode, setMode] = useState("today");

  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const fromPickerRef = useRef(null);
  const toPickerRef = useRef(null);

  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expense, setExpense] = useState({
    expense_date: "",
    amount: "",
    category: "",
    payment_mode: "cash",
    note: ""
  });

  const COLORS = [
    "#2563eb",
    "#16a34a",
    "#f59e0b",
    "#db2777",
    "#7c3aed",
    "#0284c7"
  ];

  /* ================= DATE HELPERS ================= */

  const formatInputDate = v => {
    const d = v.replace(/\D/g, "").slice(0, 8);
    if (d.length <= 2) return d;
    if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
    return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
  };

  const toApiDate = v => {
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(v)) return "";
    const [dd, mm, yyyy] = v.split("/");
    return `${yyyy}-${mm}-${dd}`;
  };

  const handlePickerChange = (e, type) => {
    const [yyyy, mm, dd] = e.target.value.split("-");
    const display = `${dd}/${mm}/${yyyy}`;

    if (type === "from") {
      setFromInput(display);
      setFromDate(e.target.value);
    } else {
      setToInput(display);
      setToDate(e.target.value);
    }
  };

  /* ================= LOADERS ================= */

  const loadStats = async () => {
    const r = await authAxios.get("/dashboard/stats");
    setStats(r.data || {});
  };

  const loadInventoryStatus = async () => {
    const r = await authAxios.get("/shop/details");
    setInventoryEnabled(r.data?.inventory_enabled || false);
  };

  const loadLowStock = async () => {
    if (!inventoryEnabled || !session?.branch_id) return;
    const r = await authAxios.get("/inventory/list", {
      params: { branch_id: session.branch_id }
    });
    setLowStockItems(r.data.filter(i => i.quantity <= i.min_stock));
  };

  const loadBranches = async () => {
    const r = await authAxios.get("/branch/active");
    setBranches(r.data || []);
  };

  const openExpense = () => {
    const today = new Date().toISOString().slice(0, 10);
    setExpense({
      expense_date: today,
      amount: "",
      category: "",
      payment_mode: "cash",
      note: ""
    });
    setExpenseOpen(true);
  };

  const saveExpense = async () => {
    try {
      if (!expense.expense_date || !expense.amount || !expense.category) {
        return;
      }
      await authAxios.post("/expenses", {
        expense_date: expense.expense_date,
        amount: Number(expense.amount),
        category: expense.category,
        payment_mode: expense.payment_mode,
        note: expense.note
      });
      setExpenseOpen(false);
    } catch {}
  };

  const loadBranchSales = async () => {
    const r = await authAxios.get("/reports/branch-sales", {
      params: {
        mode,
        from_date: mode === "custom" ? fromDate : undefined,
        to_date: mode === "custom" ? toDate : undefined
      }
    });
    setBranchSales(r.data || []);
  };

  const loadCategorySales = async () => {
    const params = {
      mode,
      from_date: mode === "custom" ? fromDate : undefined,
      to_date: mode === "custom" ? toDate : undefined
    };

    if (selectedBranch !== "all") params.branch_id = selectedBranch;

    const r = await authAxios.get("/reports/category-sales", { params });
    setCategorySales(r.data || []);
    setSelectedCategory(null);
    setItemDetails([]);
  };

  /* ================= CATEGORY HANDLER ================= */

  const handleCategorySelect = async (cat) => {
    if (!cat) return;

    setSelectedCategory(cat);
    setItemDetails([]);

    const r = await authAxios.get(
      "/reports/category-item-details",
      {
        params: {
          branch_id:
            selectedBranch === "all" ? undefined : selectedBranch,
          category_id: cat.category_id,
          mode,
          from_date: mode === "custom" ? fromDate : undefined,
          to_date: mode === "custom" ? toDate : undefined
        }
      }
    );

    setItemDetails(r.data || []);
  };

  /* ================= EFFECTS ================= */

  useEffect(() => {
    loadStats();
    loadInventoryStatus();

    if (userRole === "Admin") {
      loadBranches();
      loadBranchSales();
    }
  }, []);

  useEffect(() => {
    loadLowStock();
  }, [inventoryEnabled]);

  useEffect(() => {
    if (mode === "custom" && (!fromDate || !toDate)) return;
    loadCategorySales();
    if (userRole === "Admin") loadBranchSales();
  }, [mode, selectedBranch, fromDate, toDate]);

  /* ================= UI ================= */

  return (
    <div className="space-y-8 rounded-2xl bg-gradient-to-br from-slate-50 via-white to-emerald-50 p-6 text-[15px]">

      {/* HERO */}
      <div className="rounded-3xl border bg-white/70 p-6 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            
            <h1 className="text-3xl font-semibold text-slate-900">
              Dashboard
            </h1>
            
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-slate-900 text-white p-4 shadow">
              <p className="text-xs opacity-70">Today Sales</p>
              <p className="text-3xl font-bold">
                Rs. {stats.today_sales?.toFixed(2) || "0.00"}
              </p>
            </div>
            <div className="rounded-2xl bg-emerald-600 text-white p-4 shadow">
              <p className="text-xs opacity-80">Today Bills</p>
              <p className="text-3xl font-bold">
                {stats.today_bills || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          {!isHeadOfficeClosed && (
            <button
              onClick={() => navigate("/sales/create")}
              className="flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2 text-white shadow hover:shadow-lg transition"
            >
              <FaFileInvoiceDollar /> Create Bill
            </button>
          )}

          <button
            onClick={() => navigate("/sales/history")}
            className="flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-2 text-white shadow hover:shadow-lg transition"
          >
            <FaHistory /> Billing History
          </button>

          {(userRole === "Manager" || userRole === "Admin") && !isHeadOfficeClosed && (
            <button
              onClick={openExpense}
              className="flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2 text-white shadow hover:shadow-lg transition"
            >
              <FaMoneyBillWave /> Add Expense
            </button>
          )}
        </div>
      </div>

      {/* FILTERS */}
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-semibold text-slate-700">Report Range</p>
          {["today", "month", "custom"].map(v => (
            <button
              key={v}
              onClick={() => setMode(v)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition
                ${mode === v
                  ? "bg-slate-900 text-white shadow"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
            >
              {v.toUpperCase()}
            </button>
          ))}
        </div>

        {mode === "custom" && (
          <div className="mt-4 flex flex-wrap items-start gap-5 text-xs">
            <div className="flex flex-col">
              <div className="relative">
                <FaCalendarAlt
                  className="absolute left-2 top-2.5 text-slate-500 cursor-pointer"
                  onClick={() => fromPickerRef.current?.showPicker?.()}
                />
                <input
                  value={fromInput}
                  placeholder="From (DD/MM/YYYY)"
                  onChange={e => {
                    const v = formatInputDate(e.target.value);
                    setFromInput(v);
                    setFromDate(toApiDate(v));
                  }}
                  className="pl-8 pr-2 py-1.5 w-44 rounded-lg border focus:ring-2 focus:ring-emerald-400 outline-none"
                />
              </div>
              <input
                ref={fromPickerRef}
                type="date"
                className="mt-1 w-44 rounded-lg border bg-white px-2 py-1.5 text-xs"
                style={{ colorScheme: "light" }}
                onChange={e => handlePickerChange(e, "from")}
              />
            </div>

            <div className="flex flex-col">
              <div className="relative">
                <FaCalendarAlt
                  className="absolute left-2 top-2.5 text-slate-500 cursor-pointer"
                  onClick={() => toPickerRef.current?.showPicker?.()}
                />
                <input
                  value={toInput}
                  placeholder="To (DD/MM/YYYY)"
                  onChange={e => {
                    const v = formatInputDate(e.target.value);
                    setToInput(v);
                    setToDate(toApiDate(v));
                  }}
                  className="pl-8 pr-2 py-1.5 w-44 rounded-lg border focus:ring-2 focus:ring-emerald-400 outline-none"
                />
              </div>
              <input
                ref={toPickerRef}
                type="date"
                className="mt-1 w-44 rounded-lg border bg-white px-2 py-1.5 text-xs"
                style={{ colorScheme: "light" }}
                onChange={e => handlePickerChange(e, "to")}
              />
            </div>
          </div>
        )}
      </div>

      {/* GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* CATEGORY SALES */}
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-slate-700">Category Wise Sales</p>
            <span className="text-xs text-slate-400">Tap slice for details</span>
          </div>

          <div className="relative h-72">
            <div className="flex h-full gap-4">

              <div className="flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categorySales}
                      dataKey="total_sales"
                      nameKey="category_name"
                      innerRadius={40}
                      outerRadius={85}
                      paddingAngle={3}
                      onClick={(_, i) =>
                        handleCategorySelect(categorySales[i])
                      }
                    >
                      {categorySales.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={v => `Rs. ${v}`} />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      onClick={e => {
                        const cat = categorySales.find(
                          c => c.category_name === e.value
                        );
                        handleCategorySelect(cat);
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {selectedCategory && (
                <div className="w-48 shrink-0 bg-slate-50 rounded-xl p-3 text-xs shadow-inner relative">
                  <button
                    onClick={() => {
                      setSelectedCategory(null);
                      setItemDetails([]);
                    }}
                    className="absolute top-2 right-2 text-red-500"
                  >
                    x
                  </button>

                  <p className="font-semibold">{selectedCategory.category_name}</p>
                  <p className="text-slate-500">
                    Rs. {selectedCategory.total_sales}
                  </p>

                  <hr className="my-2" />

                  <div className="max-h-28 overflow-auto space-y-1">
                    {itemDetails.map((i, idx) => (
                      <div key={idx} className="flex justify-between border-b">
                        <span className="truncate">{i.item_name}</span>
                        <span className="font-medium">{i.total_qty}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* BRANCH SALES */}
        {userRole === "Admin" && (
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-slate-700 mb-2">Branch Wise Sales</p>

            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={branchSales}
                    dataKey="total_sales"
                    nameKey="branch_name"
                    innerRadius={40}
                    outerRadius={85}
                    paddingAngle={3}
                  >
                    {branchSales.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={v => `Rs. ${v}`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* LOW STOCK */}
        {inventoryEnabled && (
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <FaBoxes className="text-red-500" />
              <p className="text-sm font-semibold text-slate-700">Low Stock Alerts</p>
            </div>

            <div className="text-xs space-y-1 max-h-44 overflow-auto">
              {lowStockItems.length === 0
                ? <p className="text-slate-400">All items sufficient</p>
                : lowStockItems.map((i, idx) => (
                    <div key={idx} className="flex justify-between">
                      <span>{i.item_name}</span>
                      <span className="text-red-600">
                        {i.quantity}/{i.min_stock}
                      </span>
                    </div>
                  ))
              }
            </div>
          </div>
        )}
      </div>

      {expenseOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <div className="flex justify-between mb-4">
              <h3 className="text-lg font-semibold">Add Daily Expense</h3>
              <button onClick={() => setExpenseOpen(false)}>x</button>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <label className="text-gray-600">Date</label>
                <input
                  type="date"
                  className="w-full border rounded px-2 py-1 mt-1"
                  value={expense.expense_date}
                  onChange={e => setExpense({ ...expense, expense_date: e.target.value })}
                />
              </div>

              <div>
                <label className="text-gray-600">Amount</label>
                <input
                  type="number"
                  className="w-full border rounded px-2 py-1 mt-1"
                  value={expense.amount}
                  onChange={e => setExpense({ ...expense, amount: e.target.value })}
                />
              </div>

              <div>
                <label className="text-gray-600">Category</label>
                <input
                  className="w-full border rounded px-2 py-1 mt-1"
                  value={expense.category}
                  onChange={e => setExpense({ ...expense, category: e.target.value })}
                  placeholder="Fuel / Salary / Rent"
                />
              </div>

              <div>
                <label className="text-gray-600">Payment Mode</label>
                <select
                  className="w-full border rounded px-2 py-1 mt-1"
                  value={expense.payment_mode}
                  onChange={e => setExpense({ ...expense, payment_mode: e.target.value })}
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="upi">UPI</option>
                  <option value="bank">Bank</option>
                </select>
              </div>

              <div>
                <label className="text-gray-600">Note</label>
                <textarea
                  className="w-full border rounded px-2 py-1 mt-1"
                  value={expense.note}
                  onChange={e => setExpense({ ...expense, note: e.target.value })}
                  rows={2}
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setExpenseOpen(false)}
                className="px-4 py-2 rounded bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={saveExpense}
                className="px-4 py-2 rounded bg-emerald-600 text-white"
              >
                Save Expense
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
