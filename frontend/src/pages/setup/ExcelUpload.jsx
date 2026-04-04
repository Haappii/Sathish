import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import api from "../../utils/apiClient";
import BackButton from "../../components/BackButton";
import { FaFileExcel, FaCheckCircle, FaExclamationTriangle, FaUpload, FaDownload } from "react-icons/fa";
import { MdOutlineUploadFile } from "react-icons/md";

const BLUE = "#0B3C8C";

// ── per-type config ─────────────────────────────────────────────────────────
const IMPORT_TYPES = [
  {
    key: "categories",
    label: "Categories",
    icon: "🏷️",
    endpoint: "/category/bulk-import",
    color: { bg: "#EEF2FF", text: "#4338CA", border: "#C7D2FE" },
    columns: [
      { col: "category_name", req: true,  note: "Name of the category (will be uppercased)" },
      { col: "status",        req: false, note: "Active / Inactive  (default: Active)" },
    ],
    example: [
      { category_name: "FOOD", status: "Active" },
      { category_name: "BEVERAGES", status: "Active" },
      { category_name: "SNACKS", status: "Inactive" },
    ],
    parse: (raw) =>
      raw
        .map((r) => ({
          category_name: String(r["category_name"] || r["Category Name"] || r["name"] || "").trim().toUpperCase(),
          status: String(r["status"] || r["Status"] || "active").toLowerCase() !== "inactive",
        }))
        .filter((r) => r.category_name),
  },
  {
    key: "items",
    label: "Items",
    icon: "📦",
    endpoint: "/items/bulk-import",
    color: { bg: "#F0FDF4", text: "#15803D", border: "#BBF7D0" },
    columns: [
      { col: "item_name",     req: true,  note: "Item name" },
      { col: "category_name", req: true,  note: "Must match an existing category" },
      { col: "price",         req: true,  note: "Selling price" },
      { col: "buy_price",     req: false, note: "Purchase / cost price" },
      { col: "mrp_price",     req: false, note: "MRP (retail shops)" },
      { col: "min_stock",     req: false, note: "Reorder level (default 0)" },
    ],
    example: [
      { item_name: "Burger", category_name: "FOOD", price: 80, buy_price: 50, mrp_price: 100, min_stock: 5 },
      { item_name: "Cola",   category_name: "BEVERAGES", price: 30, buy_price: 18, mrp_price: 40, min_stock: 10 },
    ],
    parse: (raw) =>
      raw
        .map((r) => ({
          item_name:     String(r["item_name"]     || r["Item Name"]  || r["name"]          || "").trim(),
          category_name: String(r["category_name"] || r["Category"]   || r["category"]      || "").trim().toUpperCase(),
          price:         parseFloat(r["price"]     || r["Price"]      || r["selling_price"] || 0) || 0,
          buy_price:     parseFloat(r["buy_price"] || r["Buy Price"]  || r["cost"]          || 0) || 0,
          mrp_price:     parseFloat(r["mrp_price"] || r["MRP"]        || r["mrp"]           || 0) || 0,
          min_stock:     parseInt(  r["min_stock"] || r["Min Stock"]  || 0)                       || 0,
        }))
        .filter((r) => r.item_name && r.category_name),
  },
  {
    key: "users",
    label: "Users",
    icon: "👤",
    endpoint: "/users/bulk-import",
    color: { bg: "#F0F9FF", text: "#0369A1", border: "#BAE6FD" },
    columns: [
      { col: "user_name",   req: true,  note: "Login username (unique)" },
      { col: "password",    req: false, note: "Required for new users; leave blank to keep existing password" },
      { col: "full_name",   req: false, note: "Display name" },
      { col: "role_name",   req: true,  note: "Must match an existing role (e.g. Manager, Cashier)" },
      { col: "branch_name", req: false, note: "Branch name; leave blank for default branch" },
    ],
    example: [
      { user_name: "john",  full_name: "John Doe",  password: "pass@123", role_name: "Manager", branch_name: "Main Branch" },
      { user_name: "sarah", full_name: "Sarah K",   password: "pass@456", role_name: "Cashier",  branch_name: "Branch 2"   },
    ],
    parse: (raw) =>
      raw
        .map((r) => ({
          user_name:   String(r["user_name"]   || r["Username"] || r["username"] || "").trim(),
          full_name:   String(r["full_name"]   || r["Full Name"]|| r["name"]     || "").trim() || undefined,
          password:    String(r["password"]    || r["Password"] || "").trim()                  || undefined,
          role_name:   String(r["role_name"]   || r["Role"]     || r["role"]     || "").trim(),
          branch_name: String(r["branch_name"] || r["Branch"]   || r["branch"]   || "").trim() || undefined,
        }))
        .filter((r) => r.user_name && r.role_name),
  },
  {
    key: "employees",
    label: "Employees",
    icon: "🪪",
    endpoint: "/employees/bulk-import",
    color: { bg: "#FFF7ED", text: "#C2410C", border: "#FED7AA" },
    columns: [
      { col: "employee_name",  req: true,  note: "Full name of employee" },
      { col: "employee_code",  req: false, note: "Unique code (used to identify on update)" },
      { col: "mobile",         req: false, note: "Mobile number" },
      { col: "designation",    req: false, note: "Job title / role label" },
      { col: "wage_type",      req: true,  note: "DAILY, MONTHLY, or ON_DEMAND" },
      { col: "daily_wage",     req: false, note: "Required when wage_type = DAILY or ON_DEMAND" },
      { col: "monthly_wage",   req: false, note: "Required when wage_type = MONTHLY" },
      { col: "join_date",      req: false, note: "YYYY-MM-DD format" },
      { col: "branch_name",    req: false, note: "Branch name; leave blank for default branch" },
    ],
    example: [
      { employee_name: "Ravi Kumar", employee_code: "EMP001", mobile: "9876543210", designation: "Cashier",  wage_type: "DAILY",   daily_wage: 500,   monthly_wage: 0,     join_date: "2024-01-01", branch_name: "Main Branch" },
      { employee_name: "Priya S",    employee_code: "EMP002", mobile: "",            designation: "Manager", wage_type: "MONTHLY", daily_wage: 0,     monthly_wage: 25000, join_date: "2023-06-15", branch_name: "Branch 2"   },
    ],
    parse: (raw) =>
      raw
        .map((r) => ({
          employee_name:  String(r["employee_name"]  || r["Employee Name"] || r["name"]       || "").trim(),
          employee_code:  String(r["employee_code"]  || r["Code"]          || r["code"]        || "").trim() || undefined,
          mobile:         String(r["mobile"]         || r["Mobile"]        || r["phone"]       || "").trim() || undefined,
          designation:    String(r["designation"]    || r["Designation"]   || "").trim()                     || undefined,
          wage_type:      String(r["wage_type"]      || r["Wage Type"]     || "DAILY").trim().toUpperCase().replace(" ", "_") || "DAILY",
          daily_wage:     parseFloat(r["daily_wage"]   || r["Daily Wage"]   || 0) || 0,
          monthly_wage:   parseFloat(r["monthly_wage"] || r["Monthly Wage"] || 0) || 0,
          join_date:      String(r["join_date"]      || r["Join Date"]     || "").trim() || undefined,
          branch_name:    String(r["branch_name"]    || r["Branch"]        || r["branch"]      || "").trim() || undefined,
        }))
        .filter((r) => r.employee_name),
  },
];

// ── download sample template ────────────────────────────────────────────────
function downloadTemplate(type) {
  const ws = XLSX.utils.json_to_sheet(type.example);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, type.label);
  XLSX.writeFile(wb, `template_${type.key}.xlsx`);
}

// ── single import card ───────────────────────────────────────────────────────
function ImportCard({ type }) {
  const fileRef = useRef(null);
  const [state, setState] = useState({ loading: false, result: null });

  const handleFile = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setState({ loading: true, result: null });
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { defval: "" });
      const rows = type.parse(raw);
      if (!rows.length) {
        setState({ loading: false, result: { error: "No valid rows found. Check the column names match the format below." } });
        return;
      }
      const res = await api.post(type.endpoint, rows);
      setState({ loading: false, result: { ...res.data, total: rows.length } });
    } catch (err) {
      setState({ loading: false, result: { error: err?.response?.data?.detail || "Import failed" } });
    }
  };

  const result = state.result;
  const success = result && !result.error;
  const errCount = result?.errors?.length || 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      {/* Card header */}
      <div
        className="px-5 py-4 flex items-center gap-3"
        style={{ background: type.color.bg, borderBottom: `1px solid ${type.color.border}` }}
      >
        <span className="text-2xl">{type.icon}</span>
        <div>
          <h3 className="font-bold text-sm" style={{ color: type.color.text }}>{type.label}</h3>
          <p className="text-[11px] opacity-70" style={{ color: type.color.text }}>
            {type.columns.filter(c => c.req).length} required · {type.columns.filter(c => !c.req).length} optional columns
          </p>
        </div>
        <button
          onClick={() => downloadTemplate(type)}
          title="Download sample template"
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition hover:opacity-80"
          style={{ borderColor: type.color.border, color: type.color.text, background: "white" }}
        >
          <FaDownload size={10} /> Template
        </button>
      </div>

      {/* Column guide */}
      <div className="px-5 py-3 border-b border-slate-100">
        <p className="text-[10px] font-semibold text-slate-500 mb-2 uppercase tracking-wide">Column Reference</p>
        <div className="space-y-1">
          {type.columns.map((c) => (
            <div key={c.col} className="flex items-start gap-2">
              <code className="text-[10px] font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded shrink-0">{c.col}</code>
              {c.req
                ? <span className="text-[10px] font-semibold text-red-500 shrink-0">required</span>
                : <span className="text-[10px] text-slate-400 shrink-0">optional</span>
              }
              <span className="text-[10px] text-slate-500 leading-snug">{c.note}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Result area */}
      <div className="px-5 py-3 flex-1">
        {!result && (
          <p className="text-[11px] text-slate-400 text-center py-2">No file uploaded yet</p>
        )}
        {success && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 space-y-1">
            <div className="flex items-center gap-2">
              <FaCheckCircle size={13} className="text-emerald-600 shrink-0" />
              <span className="text-sm font-semibold text-emerald-700">Import Successful</span>
            </div>
            <div className="flex gap-4 text-[11px] text-emerald-700 pl-5">
              <span><strong>{result.inserted}</strong> inserted</span>
              <span><strong>{result.updated}</strong> updated</span>
              {errCount > 0 && <span className="text-amber-600"><strong>{errCount}</strong> skipped</span>}
            </div>
            {errCount > 0 && (
              <p className="text-[10px] text-amber-600 pl-5">
                {result.errors.slice(0, 3).map(e => `Row ${e.row}: ${e.error}`).join(" · ")}
                {result.errors.length > 3 && ` … +${result.errors.length - 3} more`}
              </p>
            )}
          </div>
        )}
        {result?.error && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 flex items-start gap-2">
            <FaExclamationTriangle size={13} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-red-600">{result.error}</p>
          </div>
        )}
      </div>

      {/* Upload button */}
      <div className="px-5 py-4 border-t border-slate-100">
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
        <button
          onClick={() => { setState({ loading: false, result: null }); fileRef.current?.click(); }}
          disabled={state.loading}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm hover:opacity-90 transition disabled:opacity-60"
          style={{ background: BLUE }}
        >
          <FaUpload size={12} />
          {state.loading ? "Importing…" : `Upload ${type.label} File`}
        </button>
      </div>
    </div>
  );
}

// ── main page ────────────────────────────────────────────────────────────────
export default function ExcelUpload() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-4">
          <BackButton />
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${BLUE}15` }}>
              <MdOutlineUploadFile size={20} style={{ color: BLUE }} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">Excel Bulk Upload</h1>
              <p className="text-xs text-slate-500">Import categories, items, users and employees from spreadsheet</p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-5 max-w-7xl mx-auto">
        {/* Info banner */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl px-5 py-4 flex items-start gap-3">
          <FaFileExcel size={18} className="text-blue-500 shrink-0 mt-0.5" />
          <p className="text-[12px] text-blue-700">
            Download a sample template, fill it in, and upload it back.
            If a record with the same name/code already exists it will be <strong>updated</strong>, otherwise it will be <strong>inserted</strong>.
            Accepts <strong>.xlsx</strong>, <strong>.xls</strong>, and <strong>.csv</strong> files.
          </p>
        </div>

        {/* Cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          {IMPORT_TYPES.map((type) => (
            <ImportCard key={type.key} type={type} />
          ))}
        </div>
      </div>
    </div>
  );
}
