import { useEffect, useState, useRef } from "react";
import api from "../../utils/apiClient";
import { useToast } from "../../components/Toast";
import { getSession } from "../../utils/auth";
import { FaCalendarAlt } from "react-icons/fa";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

import defaultLogo from "../../assets/logo.png";
import { getShopLogoUrl } from "../../utils/shopLogo";
import { isHotelShop } from "../../utils/shopType";

/* =====================================================
   REPORT DEFINITIONS
   ===================================================== */
const REPORTS = [
  // Sales
  { key: "sales/summary", label: "Sales Summary", group: "Sales" },
  { key: "gst/summary", label: "GST Summary", group: "Sales" },
  { key: "sales/invoice-details", label: "Invoice Detail Report", group: "Sales" },
  { key: "sales/customer-invoices", label: "Customer Invoice Details", group: "Sales" },
  { key: "sales/items", label: "Item-wise Sales", group: "Sales" },
  { key: "sales/category", label: "Category-wise Sales", group: "Sales" },
  { key: "sales/user", label: "User-wise Sales", group: "Sales" },

  // Profit & Expenses
  { key: "profit", label: "Profit Report", group: "Profit" },
  { key: "expenses", label: "Expense Report", group: "Profit" },

  // Purchases & Suppliers
  { key: "suppliers", label: "Supplier Report", group: "Purchases" },
  { key: "po-aging", label: "PO Aging", group: "Purchases" },
  { key: "payables-summary", label: "Payables Summary", group: "Purchases" },
  { key: "supplier-ledger/entries", label: "Supplier Ledger (Entries)", group: "Purchases" },
  { key: "supplier-ledger/balances", label: "Supplier Ledger (Balances)", group: "Purchases", requiresDateRange: false },

  // Receivables
  { key: "dues/open", label: "Dues Outstanding", group: "Receivables", requiresDateRange: false },
  { key: "dues/payments", label: "Collections / Payments", group: "Receivables" },

  // Returns
  { key: "returns/register", label: "Sales Returns (Register)", group: "Returns" },
  { key: "returns/items", label: "Sales Returns (Item-wise)", group: "Returns" },

  // Inventory
  { key: "inventory/current", label: "Current Stock", group: "Inventory", requiresDateRange: false },
  { key: "inventory/movement", label: "Stock Movement", group: "Inventory" },
  { key: "inventory/date-wise", label: "Stock Date-wise", group: "Inventory" },
  { key: "inventory/expiry-lots", label: "Expiry Lots", group: "Inventory" },

  // Stock Transfers
  { key: "stock-transfers/register", label: "Stock Transfers (Register)", group: "Stock Transfers" },
  { key: "stock-transfers/items", label: "Stock Transfers (Item-wise)", group: "Stock Transfers" },

  // Cash Drawer
  { key: "cash-drawer/shifts", label: "Cash Shifts", group: "Cash Drawer" },
  { key: "cash-drawer/movements", label: "Cash Movements", group: "Cash Drawer" },

  // Stock Audit
  { key: "stock-audit/audits", label: "Stock Audits", group: "Stock Audit" },
  { key: "stock-audit/variances", label: "Stock Audit Variances", group: "Stock Audit" },

  // Online Orders
  { key: "online-orders/list", label: "Online Orders (Register)", group: "Online Orders" },
  { key: "online-orders/summary", label: "Online Orders (Summary)", group: "Online Orders" },

  // Loyalty & Coupons
  { key: "loyalty/transactions", label: "Loyalty Transactions", group: "Loyalty" },
  { key: "loyalty/balances", label: "Loyalty Balances", group: "Loyalty", requiresDateRange: false },
  { key: "coupons/redemptions", label: "Coupon Redemptions", group: "Coupons" },
  { key: "coupons/summary", label: "Coupons Summary", group: "Coupons" },

  // Audit & Table
  { key: "audit/logs", label: "Audit Logs", group: "Audit" },
  { key: "audit/deleted-invoices", label: "Deleted Invoices", group: "Audit" },
  { key: "table/usage", label: "Table Usage", group: "Table" },
];

const NO_USER_FILTER_KEYS = new Set([
  "profit",
  "expenses",
  "suppliers",
  "po-aging",
  "payables-summary",
  "gst/summary",
  "sales/customer-invoices",
  "inventory/current",
  "inventory/movement",
  "inventory/date-wise",
  "inventory/expiry-lots",
  "audit/deleted-invoices",
  "stock-audit/variances",
  "online-orders/list",
  "online-orders/summary",
  "coupons/summary",
  "loyalty/balances",
  "supplier-ledger/balances",
]);

const REPORT_GROUP_ORDER = [
  "Sales",
  "Profit",
  "Receivables",
  "Returns",
  "Inventory",
  "Purchases",
  "Stock Transfers",
  "Cash Drawer",
  "Stock Audit",
  "Online Orders",
  "Loyalty",
  "Coupons",
  "Audit",
  "Table",
];

export default function Reports() {
  const { showToast } = useToast();
  const fromPickerRef = useRef(null);
  const toPickerRef = useRef(null);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  const session = getSession() || {};
  const sessionBranchId = session.branch_id || "";
  const isAdmin = String(session?.role || "").toLowerCase() === "admin";

  const [activeReport, setActiveReport] = useState(null);

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");

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

  const isFullDate = v => /^\d{2}\/\d{2}\/\d{4}$/.test(v);

  useEffect(() => {
    if (isFullDate(fromInput)) setShowFromPicker(false);
  }, [fromInput]);

  useEffect(() => {
    if (isFullDate(toInput)) setShowToPicker(false);
  }, [toInput]);

  const [userId, setUserId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [paymentMode, setPaymentMode] = useState("");
  const [profitType, setProfitType] = useState("date");
  const [customerNumber, setCustomerNumber] = useState("");

  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);

  const [shop, setShop] = useState({});
  const [hotelShop, setHotelShop] = useState(false);
  const [branch, setBranch] = useState({});

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  const reportOptions = REPORTS.filter(
    r => hotelShop || r.key !== "table/usage"
  );

  const requiresDateRange = activeReport?.requiresDateRange !== false;

  const reportGroups = (() => {
    const grouped = reportOptions.reduce((acc, r) => {
      const g = r.group || "Other";
      (acc[g] ||= []).push(r);
      return acc;
    }, {});

    const ordered = REPORT_GROUP_ORDER
      .filter(g => Array.isArray(grouped[g]) && grouped[g].length)
      .map(g => ({ group: g, reports: grouped[g] }));

    const extras = Object.keys(grouped)
      .filter(g => !REPORT_GROUP_ORDER.includes(g))
      .sort()
      .map(g => ({ group: g, reports: grouped[g] }));

    return [...ordered, ...extras];
  })();

  const buildExportName = () => {
    const now = new Date();
    const pad = n => String(n).padStart(2, "0");
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const label = (activeReport?.label || "Report").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_");
    return `${label}_${stamp}`;
  };

  const formatRangeLabel = (forceAsOf = false) => {
    if (!forceAsOf && fromDate && toDate) {
      const a = fromDate.split("-").reverse().join("/");
      const b = toDate.split("-").reverse().join("/");
      return `${a} to ${b}`;
    }
    const now = new Date();
    const pad = n => String(n).padStart(2, "0");
    const d = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
    return `As of ${d}`;
  };

  /* =====================================================
     LOAD MASTER DATA
     ===================================================== */
  useEffect(() => {
    api.get("/shop/details").then(r => {
      const shopData = r.data || {};
      setShop(shopData);
      setHotelShop(isHotelShop(shopData));
    });
    api.get("/users/").then(r => setUsers(r.data || []));
    api.get("/branch/active").then(r => setBranches(r.data || []));
  }, []);

  /* =====================================================
     RESET DATA ON REPORT CHANGE
     ===================================================== */
  useEffect(() => {
    setData([]);
    setLoading(false);
    if (NO_USER_FILTER_KEYS.has(activeReport?.key)) {
      setUserId("");
    }
    if (activeReport?.key !== "sales/customer-invoices") {
      setCustomerNumber("");
    }
  }, [activeReport?.key]);

  /* =====================================================
     RESOLVE CURRENT BRANCH
     ===================================================== */
  useEffect(() => {
    if (sessionBranchId) {
      const b = branches.find(x => String(x.branch_id) === String(sessionBranchId));
      if (b) setBranch(b);
      else api.get(`/branch/${sessionBranchId}`).then(r => setBranch(r.data || {})).catch(() => {});
    }
  }, [branches, sessionBranchId]);

  /* =====================================================
     HEADER LINES
     ===================================================== */
  const buildHeaderLines = (branchOverride) => {
    const lines = [];
    const br =
      branchOverride ||
      branches.find(b => String(b.branch_id) === String(sessionBranchId)) ||
      branch ||
      {};
    const hasBranch = Boolean(br?.branch_name);
    const shopName = shop?.shop_name || "Shop Name";

    lines.push(
      hasBranch
        ? `${shopName} - ${br.branch_name}`
        : shopName
    );

    const hasBranchAddress =
      br?.address_line1 ||
      br?.address_line2 ||
      br?.city ||
      br?.state ||
      br?.pincode;
    const addrSrc = hasBranchAddress ? br : shop;

    const address = [
      addrSrc?.address_line1,
      addrSrc?.address_line2,
      addrSrc?.address_line3
    ].filter(Boolean).join(", ");
    if (address) lines.push(address);

    const city = [addrSrc?.city, addrSrc?.state, addrSrc?.pincode].filter(Boolean).join(" ");
    if (city) lines.push(city);

    const phone = shop.mobile;
    const gst = shop.gst_number;

    const contact = [];
    if (phone) contact.push(`Ph: ${phone}`);
    if (gst) contact.push(`GSTIN: ${gst}`);
    if (contact.length) lines.push(contact.join(" | "));

    if (!hasBranch) lines.push("Branch: All");

    return lines;
  };

  /* =====================================================
     ENSURE BRANCH
     ===================================================== */
  const ensureBranchLoaded = async () => {
    const id = sessionBranchId;
    if (!id) return null;

    const hasAddress =
      branch?.address_line1 ||
      branch?.address_line2 ||
      branch?.city ||
      branch?.state ||
      branch?.pincode;
    if (String(branch?.branch_id) === String(id) && (branch?.branch_name || hasAddress))
      return branch;

    const inList = branches.find(b => String(b.branch_id) === String(id));
    if (inList) return inList;

    try {
      const r = await api.get(`/branch/${id}`);
      return r.data || null;
    } catch {
      return null;
    }
  };

  const ensureHeaderBranchLoaded = async () => {
    if (branchId) {
      const inList = branches.find(b => String(b.branch_id) === String(branchId));
      if (inList) return inList;
      try {
        const r = await api.get(`/branch/${branchId}`);
        return r.data || null;
      } catch {
        return null;
      }
    }

    if (isAdmin) {
      return {};
    }

    return ensureBranchLoaded();
  };

  /* =====================================================
     PDF HEADER (FONT FIX APPLIED)
     ===================================================== */
  const drawPdfHeader = (doc, headerBranch, logoDataUrl) => {
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 12;
    const centerX = pageWidth / 2;

    if (logoDataUrl) {
      doc.addImage(logoDataUrl, "PNG", margin, 12, 28, 28);
    }

    let y = 18;
    buildHeaderLines(headerBranch).forEach((line, i) => {
      doc.setFontSize(i === 0 ? 13 : 10);
      doc.text(line, centerX, y, { align: "center" });
      y += 6;
    });

    y += 2;
    doc.line(margin, y, pageWidth - margin, y);

    y += 8;
    doc.setFontSize(8); // ✅ 50% smaller report title
    doc.text(
      `${activeReport.label} - ${formatRangeLabel(!requiresDateRange)}`,
      centerX,
      y,
      { align: "center" }
    );

    return y + 6;
  };

  /* =====================================================
     LOAD REPORT
     ===================================================== */
  const loadReport = async () => {
    if (requiresDateRange && (!fromDate || !toDate)) {
      showToast("Select From & To dates", "warning");
      return;
    }
    if (activeReport?.key === "sales/customer-invoices" && !customerNumber.trim()) {
      showToast("Enter customer number", "warning");
      return;
    }

    try {
      setLoading(true);
      const params = {};
      if (requiresDateRange && fromDate && toDate) {
        params.from_date = fromDate;
        params.to_date = toDate;
      }
      if (!NO_USER_FILTER_KEYS.has(activeReport?.key) && userId)
        params.user_id = userId;
      if (branchId) params.branch_id = branchId;
      if (
        (activeReport?.key === "sales/summary" ||
          activeReport?.key === "sales/invoice-details") &&
        paymentMode
      )
        params.payment_mode = paymentMode;
      if (activeReport?.key === "sales/customer-invoices") {
        params.customer_number = customerNumber.trim();
      }

      const reportKey = activeReport.key === "profit"
        ? `profit/${profitType}`
        : activeReport.key;

      const r = await api.get(`/reports/${reportKey}`, { params });
      const raw = r.data;
      const rows = Array.isArray(raw) ? raw : (raw ? [raw] : []);

      if (activeReport?.key === "gst/summary") {
        const obj = raw && !Array.isArray(raw) ? raw : {};
        const normalized = Object.entries(obj || {}).map(([k, v]) => ({
          metric: k,
          amount: Number(v || 0),
        }));
        setData(normalized);
        return;
      }
      if (activeReport?.key === "sales/summary") {
        const normalized = rows.map(row => {
          const sub = Number(row.sub_total || 0);
          const gst = Number(row.gst || 0);
          const discount = Number(row.discount || 0);
          const grand = Number((sub + gst - discount).toFixed(2));
          return { ...row, grand_total: grand };
        });
        setData(normalized);
      } else {
        setData(rows);
      }
    } catch {
      showToast("Failed to load report", "error");
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  /* =====================================================
     EXPORT PDF
     ===================================================== */
  const exportPDF = async () => {
    if (!data.length) return;
    const headerBranch = await ensureHeaderBranchLoaded();

    const blobToDataUrl = (blob) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

    const fetchAsDataUrl = async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to load image (${res.status})`);
      return blobToDataUrl(await res.blob());
    };

    const resolveLogoDataUrl = async () => {
      const shopLogo = getShopLogoUrl(shop);
      for (const candidate of [shopLogo, defaultLogo]) {
        if (!candidate) continue;
        try {
          return await fetchAsDataUrl(candidate);
        } catch {
          continue;
        }
      }
      return null;
    };

    const logoDataUrl = await resolveLogoDataUrl();

    const isInvoiceDetail =
      activeReport?.key === "sales/invoice-details" ||
      activeReport?.key === "sales/customer-invoices";
    const doc = new jsPDF(
      isInvoiceDetail ? "l" : "p",
      "mm",
      "a4"
    );
    const startY = drawPdfHeader(doc, headerBranch, logoDataUrl);

    let exportRows = data;
        if (isInvoiceDetail) {
          let lastInvoice = null;
          exportRows = data.map(row => {
            const same = row.invoice_number === lastInvoice;
            lastInvoice = row.invoice_number;
            const grand =
              Number(row.sub_total || 0) +
              Number(row.gst || 0) -
              Number(row.discount || 0);

            if (!same) {
              return { ...row, grand_total: grand };
            }

            return {
              ...row,
              invoice_date: "",
              invoice_time: "",
              invoice_number: "",
              customer: "",
              payment_mode: "",
              total_items: "",
              sub_total: "",
              gst: "",
              discount: "",
              grand_total: "",
              created_user: "",
        };
      });
    }

    autoTable(doc, {
      startY,
      head: [Object.keys(data[0]).map(h => h.replaceAll("_", " ").toUpperCase())],
      body: exportRows.map(r => Object.values(r)),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [15, 23, 42] },
    });

    doc.save(`${buildExportName()}.pdf`);
  };

  /* =====================================================
     EXPORT EXCEL
     ===================================================== */
  const exportExcel = async () => {
    if (!data.length) return;

    const headerBranch = await ensureHeaderBranchLoaded();
    const ws = XLSX.utils.json_to_sheet([]);
    const header = buildHeaderLines(headerBranch);
    const isInvoiceDetail =
      activeReport?.key === "sales/invoice-details" ||
      activeReport?.key === "sales/customer-invoices";

    header.forEach((h, i) => {
      ws[`A${i + 1}`] = { v: h };
      ws["!merges"] = ws["!merges"] || [];
      ws["!merges"].push({
        s: { r: i, c: 0 },
        e: { r: i, c: Object.keys(data[0]).length - 1 },
      });
    });

    let exportRows = data;
        if (isInvoiceDetail) {
          let lastInvoice = null;
          exportRows = data.map(row => {
            const same = row.invoice_number === lastInvoice;
            lastInvoice = row.invoice_number;
            const grand =
              Number(row.sub_total || 0) +
              Number(row.gst || 0) -
              Number(row.discount || 0);

            if (!same) {
              return { ...row, grand_total: grand };
            }

            return {
              ...row,
              invoice_date: "",
              invoice_time: "",
              invoice_number: "",
              customer: "",
              payment_mode: "",
              total_items: "",
              sub_total: "",
              gst: "",
              discount: "",
              grand_total: "",
              created_user: "",
        };
      });
    }

    XLSX.utils.sheet_add_json(ws, exportRows, {
      origin: `A${header.length + 2}`,
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, activeReport.label);

    saveAs(
      new Blob([XLSX.write(wb, { bookType: "xlsx", type: "array" })]),
      `${buildExportName()}.xlsx`
    );
  };

  /* =====================================================
     UI
     ===================================================== */
  if (!activeReport) {
    return (
      <div className="p-6 bg-slate-100 min-h-screen">
        <h2 className="text-xl font-semibold mb-4">Reports</h2>
        <div className="space-y-6">
          {reportGroups.map(g => (
            <div key={g.group}>
              <div className="text-xs font-semibold tracking-wide text-slate-600 uppercase mb-2">
                {g.group}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {g.reports.map(r => (
                  <button
                    key={r.key}
                    onClick={() => setActiveReport(r)}
                    className="bg-white border rounded-xl p-4 hover:bg-slate-50"
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-slate-100 min-h-screen space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setActiveReport(null)}
          className="px-3 py-1.5 rounded-lg border bg-white shadow-sm text-[12px]"
        >
          &larr; Back
        </button>
        <h2 className="text-xl font-semibold">{activeReport.label}</h2>
      </div>

      <div className="bg-white rounded-xl p-4 flex flex-wrap gap-4 items-center">
        {requiresDateRange ? (
          <>
            <div className="relative">
              <FaCalendarAlt
                className="absolute left-2 top-2.5 text-slate-500 cursor-pointer"
                onClick={() => setShowFromPicker(v => !v)}
              />
              <input
                value={fromInput}
                placeholder="From (DD/MM/YYYY)"
                onChange={e => {
                  const v = formatInputDate(e.target.value);
                  setFromInput(v);
                  setFromDate(toApiDate(v));
                }}
                onFocus={() => setShowFromPicker(true)}
                onBlur={() => {
                  if (isFullDate(fromInput)) setShowFromPicker(false);
                }}
                className="border rounded pl-8 pr-3 py-2 w-40"
              />
              {showFromPicker && (
                <div className="absolute left-0 top-full mt-2 z-20 bg-white border rounded-lg shadow-lg p-2">
                  <input
                    ref={fromPickerRef}
                    type="date"
                    value={fromDate || ""}
                    onChange={e => {
                      const v = e.target.value;
                      if (!v) return;
                      const [yyyy, mm, dd] = v.split("-");
                      const display = `${dd}/${mm}/${yyyy}`;
                      setFromInput(display);
                      setFromDate(v);
                      setShowFromPicker(false);
                    }}
                    className="border rounded px-2 py-1 bg-white"
                  />
                </div>
              )}
            </div>

            <div className="relative">
              <FaCalendarAlt
                className="absolute left-2 top-2.5 text-slate-500 cursor-pointer"
                onClick={() => setShowToPicker(v => !v)}
              />
              <input
                value={toInput}
                placeholder="To (DD/MM/YYYY)"
                onChange={e => {
                  const v = formatInputDate(e.target.value);
                  setToInput(v);
                  setToDate(toApiDate(v));
                }}
                onFocus={() => setShowToPicker(true)}
                onBlur={() => {
                  if (isFullDate(toInput)) setShowToPicker(false);
                }}
                className="border rounded pl-8 pr-3 py-2 w-40"
              />
              {showToPicker && (
                <div className="absolute left-0 top-full mt-2 z-20 bg-white border rounded-lg shadow-lg p-2">
                  <input
                    ref={toPickerRef}
                    type="date"
                    value={toDate || ""}
                    onChange={e => {
                      const v = e.target.value;
                      if (!v) return;
                      const [yyyy, mm, dd] = v.split("-");
                      const display = `${dd}/${mm}/${yyyy}`;
                      setToInput(display);
                      setToDate(v);
                      setShowToPicker(false);
                    }}
                    className="border rounded px-2 py-1 bg-white"
                  />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="text-sm text-slate-600">
            {formatRangeLabel(true)}
          </div>
        )}

        {!NO_USER_FILTER_KEYS.has(activeReport?.key) && (
          <select value={userId} onChange={e => setUserId(e.target.value)} className="border rounded px-3 py-2">
            <option value="">All Users</option>
            {users.map(u => <option key={u.user_id} value={u.user_id}>{u.user_name}</option>)}
          </select>
        )}

        <select
          value={branchId}
          onChange={e => {
            setBranchId(e.target.value);
          }}
          className="border rounded px-3 py-2"
        >
            <option value="">All Branches</option>
            {branches.map(b => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}
        </select>

        {(activeReport?.key === "sales/summary" ||
          activeReport?.key === "sales/invoice-details") && (
          <select
            value={paymentMode}
            onChange={e => setPaymentMode(e.target.value)}
            className="border rounded px-3 py-2"
          >
            <option value="">All Payment Modes</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="upi">UPI</option>
            <option value="split">Split</option>
          </select>
        )}

        {activeReport?.key === "sales/customer-invoices" && (
          <input
            value={customerNumber}
            onChange={e => setCustomerNumber(e.target.value)}
            placeholder="Customer Number"
            className="border rounded px-3 py-2 w-44"
          />
        )}

        {activeReport?.key === "profit" && (
          <select
            value={profitType}
            onChange={e => setProfitType(e.target.value)}
            className="border rounded px-3 py-2"
          >
            <option value="date">Date-wise</option>
            <option value="items">Item-wise</option>
            <option value="category">Category-wise</option>
          </select>
        )}

        <button onClick={loadReport} className="px-5 py-2 bg-blue-600 text-white rounded">
          View Report
        </button>
      </div>

      <div className="flex gap-2 justify-end">
        <button onClick={exportPDF} className="px-4 py-2 bg-red-600 text-white rounded">Export PDF</button>
        <button onClick={exportExcel} className="px-4 py-2 bg-emerald-600 text-white rounded">Export Excel</button>
      </div>

      <div className="bg-white rounded-xl p-4 overflow-auto">
        {loading ? "Loading..." : data.length === 0 ? "No data" : (() => {
          const isInvoiceDetail =
            activeReport?.key === "sales/invoice-details" ||
            activeReport?.key === "sales/customer-invoices";

          let displayRows = data;
          if (isInvoiceDetail) {
            const grouped = {};
            data.forEach(row => {
              const key = row.invoice_number;
              if (!grouped[key]) {
                grouped[key] = {
                  invoice_date: row.invoice_date,
                  invoice_time: row.invoice_time,
                  invoice_number: row.invoice_number,
                  customer: row.customer,
                  item_name: [],
                  quantity: [],
                  price: [],
                  total_items: row.total_items,
                  sub_total: row.sub_total,
                  gst: row.gst,
                  discount: row.discount,
                  grand_total:
                    Number(row.sub_total || 0) +
                    Number(row.gst || 0) -
                    Number(row.discount || 0),
                  payment_mode: row.payment_mode,
                  created_user: row.created_user,
                };
              }

              grouped[key].item_name.push(row.item_name);
              grouped[key].quantity.push(row.quantity);
              grouped[key].price.push(row.price);
            });

            displayRows = Object.values(grouped).map(r => ({
              ...r,
              item_name: r.item_name.join("\n"),
              quantity: r.quantity.join("\n"),
              price: r.price.join("\n"),
            }));
          }

          return (
            <table className="w-full text-sm border-collapse">
              <thead className="bg-slate-100">
                <tr>
                  {Object.keys(displayRows[0]).map(k => (
                    <th key={k} className="border px-3 py-2">
                      {k.replaceAll("_", " ").toUpperCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayRows.map((r, i) => (
                  <tr key={i}>
                    {Object.values(r).map((v, j) => (
                      <td key={j} className="border px-3 py-2 whitespace-pre-line">
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          );
        })()}
      </div>
    </div>
  );
}





