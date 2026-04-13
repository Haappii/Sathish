import { useEffect, useState, useRef } from "react";
import api from "../../utils/apiClient";
import { useToast } from "../../components/Toast";
import BackButton from "../../components/BackButton";
import { getSession } from "../../utils/auth";
import { FaCalendarAlt } from "react-icons/fa";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

import defaultLogo from "../../assets/logo.png";
import { getShopLogoUrl } from "../../utils/shopLogo";
import { isHotelShop } from "../../utils/shopType";
import { getBusinessDate, syncBusinessDate } from "../../utils/businessDate";
import {
  FaChartBar,
  FaMoneyBillWave,
  FaUndo,
  FaBoxes,
  FaTruckLoading,
  FaCashRegister,
  FaClipboardCheck,
  FaMotorcycle,
  FaGift,
  FaTags,
  FaShieldAlt,
  FaTable,
} from "react-icons/fa";

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

  // GST & Tax
  { key: "gst/gstr1", label: "GSTR-1 (Monthly)", group: "GST" },
  { key: "gst/gstr3b", label: "GSTR-3B (Monthly)", group: "GST" },
  { key: "gst/hsn-summary", label: "HSN/SAC Summary", group: "GST" },
  { key: "gst/itc-register", label: "ITC Register (Purchases)", group: "GST" },

  // Accounting
  { key: "accounting/cash-bank-book", label: "Cash / Bank Book", group: "Accounting" },
  { key: "accounting/day-book", label: "Day Book", group: "Accounting" },
  { key: "day-close/report", label: "Day Closing Report", group: "Accounting" },
  { key: "accounting/trial-balance", label: "Trial Balance", group: "Accounting", requiresDateRange: false },
  { key: "accounting/balance-sheet", label: "Balance Sheet", group: "Accounting", requiresDateRange: false },

  // Reconciliation
  { key: "recon/payments-gateway", label: "Payment Gateway Reco", group: "Reconciliation" },
  { key: "recon/stock-valuation", label: "Stock Valuation (FIFO/Avg)", group: "Reconciliation" },

  // Compliance
  { key: "compliance/e-invoice-status", label: "E-Invoice Status", group: "Compliance", requiresDateRange: false },
  { key: "compliance/e-waybill-status", label: "E-Waybill Status", group: "Compliance" },
  { key: "compliance/tds-vendor-payments", label: "TDS on Vendor Payments", group: "Compliance" },
  { key: "compliance/tcs-sales", label: "TCS on Sales", group: "Compliance" },

  // Audit & Table
  { key: "audit/logs", label: "Audit Logs", group: "Audit" },
  { key: "audit/deleted-invoices", label: "Deleted Invoices", group: "Audit" },
  { key: "bulk-import/history", label: "Bulk Upload History", group: "Audit", requiresDateRange: true },
  { key: "table/usage", label: "Table Usage", group: "Table" },

  // Employees / HR
  { key: "employees/wages-summary", label: "Employee Wages Summary", group: "Employees", requiresDateRange: false },
  { key: "employees/due-list", label: "Employee Due List", group: "Employees", requiresDateRange: false },
  { key: "employees/attendance-summary", label: "Employee Attendance Summary", group: "Employees" },

  // Reservations
  { key: "reservations/list", label: "Reservations Report", group: "Reservations" },
];

const NO_USER_FILTER_KEYS = new Set([
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
  "employees/wages-summary",
  "employees/due-list",
  "employees/attendance-summary",
  "reservations/list",
  "bulk-import/history",
  "gst/gstr1",
  "gst/gstr3b",
  "gst/hsn-summary",
  "gst/itc-register",
  "accounting/cash-bank-book",
  "accounting/day-book",
  "day-close/report",
  "accounting/trial-balance",
  "accounting/balance-sheet",
  "recon/payments-gateway",
  "recon/stock-valuation",
  "compliance/e-invoice-status",
  "compliance/e-waybill-status",
  "compliance/tds-vendor-payments",
  "compliance/tcs-sales",
]);

const REPORT_GROUP_ORDER = [
  "Sales",
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
  "GST",
  "Accounting",
  "Reconciliation",
  "Compliance",
  "Audit",
  "Table",
  "Employees",
  "Reservations",
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
  const [customerNumber, setCustomerNumber] = useState("");

  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);

  const [shop, setShop] = useState({});
  const [hotelShop, setHotelShop] = useState(false);
  const [branch, setBranch] = useState({});

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState(null);
  const [bulkLogs, setBulkLogs] = useState([]);
  const [selectedBulkLogId, setSelectedBulkLogId] = useState(null);

  const isAdminOrManager = String(session?.role || "").toLowerCase() === "admin" || String(session?.role || "").toLowerCase() === "manager";

  const reportOptions = REPORTS.filter(
    r => (hotelShop || r.key !== "table/usage") && (!r.adminOnly || isAdminOrManager)
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
    const d = getBusinessDate().split("-").reverse().join("/");
    return `As of ${d}`;
  };

  /* =====================================================
     LOAD MASTER DATA
     ===================================================== */
  useEffect(() => {
    api.get("/shop/details").then(r => {
      const shopData = r.data || {};
      if (shopData?.app_date) syncBusinessDate(shopData.app_date);
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
    setBulkLogs([]);
    setSelectedBulkLogId(null);
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
      const mimeMatch = logoDataUrl.match(/^data:(image\/[^;]+)/);
      const imgFormat = mimeMatch ? mimeMatch[1].split("/")[1].toUpperCase() : "PNG";
      doc.addImage(logoDataUrl, imgFormat, margin, 12, 28, 28);
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
    if (requiresDateRange && (!fromDate || !toDate) && activeReport?.key !== "bulk-import/history") {
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

      const reportKey = activeReport.key;

      let rows = [];

      if (reportKey === "employees/wages-summary" || reportKey === "employees/due-list") {
        const asOf = toDate || fromDate || getBusinessDate();
        const r = await api.get("/employees/wages/summary", {
          params: { branch_id: params.branch_id, as_of_date: asOf },
        });
        const raw = r?.data || {};
        const wageRows = Array.isArray(raw.rows) ? raw.rows : [];
        rows = reportKey === "employees/due-list"
          ? wageRows.filter(r => Number(r.due_till_as_of || 0) > 0)
          : wageRows;
      } else if (reportKey === "bulk-import/history") {
        const apiParams = {};
        if (fromDate) apiParams.from_date = fromDate;
        if (toDate)   apiParams.to_date   = toDate;
        const r = await api.get("/bulk-import-logs/", { params: apiParams });
        const rawLogs = r.data || [];
        setBulkLogs(rawLogs);
        const fmt = (iso) => {
          if (!iso) return "";
          const d = new Date(iso);
          return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
        };
        // Summary rows used for PDF/Excel export (one per log entry)
        rows = rawLogs.map(l => ({
          upload_type:  l.upload_type,
          filename:     l.filename || "",
          uploaded_by:  l.uploaded_by_name || "",
          total_rows:   l.total_rows,
          inserted:     l.inserted,
          updated:      l.updated,
          errors:       l.error_count,
          date_time:    fmt(l.created_at),
        }));
      } else {
        const r = await api.get(`/reports/${reportKey}`, { params });
        const raw = r.data;
        rows = Array.isArray(raw) ? raw : (raw ? [raw] : []);
      }

      if (activeReport?.key === "gst/summary") {
        const obj = data && !Array.isArray(data) ? data : {};
        const normalized = Object.entries(obj || {}).map(([k, v]) => ({
          metric: k,
          amount: Number(v || 0),
        }));
        setData(normalized);
        return;
      }
      if (activeReport?.key === "cash-drawer/shifts") {
        let normalized = rows.map((row) => {
          const actualCashEntered =
            row.actual_cash !== null &&
            row.actual_cash !== undefined &&
            row.actual_cash !== "";

          if (!actualCashEntered) return row;
          return { ...row, expected_cash: "" };
        });

        const hasVisibleExpectedCash = normalized.some(
          (row) =>
            row.expected_cash !== null &&
            row.expected_cash !== undefined &&
            row.expected_cash !== "",
        );

        if (!hasVisibleExpectedCash) {
          normalized = normalized.map((row) =>
            Object.fromEntries(Object.entries(row).filter(([key]) => key !== "expected_cash")),
          );
        }

        setData(normalized);
      } else if (activeReport?.key === "sales/summary") {
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
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`Failed to load image (${res.status})`);
        return blobToDataUrl(await res.blob());
      } finally {
        clearTimeout(timer);
      }
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

    try {
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
    } catch (err) {
      console.error("PDF export failed:", err);
      showToast("PDF export failed. Please try again.", "error");
    }
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
    const GROUP_META = {
      Sales:            { icon: <FaChartBar />,       color: "bg-blue-600" },
      Receivables:      { icon: <FaMoneyBillWave />,  color: "bg-amber-500" },
      Returns:          { icon: <FaUndo />,            color: "bg-rose-500" },
      Inventory:        { icon: <FaBoxes />,           color: "bg-violet-600" },
      Purchases:        { icon: <FaTruckLoading />,   color: "bg-orange-500" },
      "Stock Transfers":{ icon: <FaTruckLoading />,   color: "bg-cyan-600" },
      "Cash Drawer":    { icon: <FaCashRegister />,   color: "bg-teal-600" },
      "Stock Audit":    { icon: <FaClipboardCheck />, color: "bg-indigo-600" },
      "Online Orders":  { icon: <FaMotorcycle />,     color: "bg-pink-600" },
      Loyalty:          { icon: <FaGift />,            color: "bg-purple-600" },
      Coupons:          { icon: <FaTags />,            color: "bg-yellow-500" },
      GST:              { icon: <FaShieldAlt />,      color: "bg-red-600" },
      Accounting:       { icon: <FaMoneyBillWave />,  color: "bg-blue-700" },
      Reconciliation:   { icon: <FaClipboardCheck />, color: "bg-slate-600" },
      Compliance:       { icon: <FaShieldAlt />,      color: "bg-gray-700" },
      Audit:            { icon: <FaShieldAlt />,      color: "bg-zinc-600" },
      Table:            { icon: <FaTable />,           color: "bg-sky-600" },
      Employees:        { icon: <FaClipboardCheck />, color: "bg-lime-600" },
    };
    const DEFAULT_META = { icon: <FaClipboardCheck />, color: "bg-slate-500" };

    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b px-4 sm:px-6 py-3 flex items-center gap-3">
          <BackButton />
          <div className="flex-1">
            <h1 className="text-base font-bold text-gray-800">Reports</h1>
            <p className="text-[11px] text-gray-400">{reportGroups.length} categories · {reportOptions.length} reports</p>
          </div>
        </div>

        <div className="px-4 sm:px-6 py-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {reportGroups.map(g => {
            const hasMany = g.reports.length > 1;
            const isOpen = expandedGroup === g.group;
            const meta = GROUP_META[g.group] || DEFAULT_META;
            const primary = g.reports[0];

            return (
              <div
                key={g.group}
                className="bg-white border rounded-2xl shadow-sm overflow-hidden"
              >
                {/* Card header row */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition"
                  onClick={() =>
                    hasMany
                      ? setExpandedGroup(isOpen ? null : g.group)
                      : setActiveReport(primary)
                  }
                >
                  <div className={`w-9 h-9 rounded-xl ${meta.color} text-white flex items-center justify-center text-[15px] flex-shrink-0 shadow-sm`}>
                    {meta.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-gray-800 truncate">{g.group}</div>
                    <div className="text-[10px] text-gray-400">{g.reports.length} report{g.reports.length !== 1 ? "s" : ""}</div>
                  </div>
                  <span className="text-[11px] text-gray-400 flex-shrink-0">
                    {hasMany ? (isOpen ? "▲" : "▼") : "→"}
                  </span>
                </div>

                {/* Sub-reports (expanded) */}
                {hasMany && isOpen && (
                  <div className="border-t bg-gray-50 px-4 py-3 flex flex-wrap gap-2">
                    {g.reports.map(r => (
                      <button
                        key={r.key}
                        type="button"
                        onClick={() => setActiveReport(r)}
                        className="px-3 py-1.5 rounded-xl border border-gray-200 text-[11px] font-medium text-gray-700 bg-white hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition shadow-sm"
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ── Active report view ── */
  const inputCls = "border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] bg-gray-50 focus:outline-none focus:border-blue-400 focus:bg-white transition";

  const buildDisplayRows = () => {
    const isCashShiftReport = activeReport?.key === "cash-drawer/shifts";
    const isInvoiceDetail =
      activeReport?.key === "sales/invoice-details" ||
      activeReport?.key === "sales/customer-invoices";

    let rows = data;

    if (isCashShiftReport) {
      rows = data.map((row) => {
        const actualCashEntered =
          row.actual_cash !== null &&
          row.actual_cash !== undefined &&
          row.actual_cash !== "";

        if (!actualCashEntered) return row;
        return { ...row, expected_cash: "" };
      });

      const hasVisibleExpectedCash = rows.some(
        (row) =>
          row.expected_cash !== null &&
          row.expected_cash !== undefined &&
          row.expected_cash !== "",
      );

      if (!hasVisibleExpectedCash) {
        rows = rows.map((row) =>
          Object.fromEntries(Object.entries(row).filter(([key]) => key !== "expected_cash")),
        );
      }
    }

    if (!isInvoiceDetail) return rows;

    const grouped = {};
    rows.forEach(row => {
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

    return Object.values(grouped).map(r => ({
      ...r,
      item_name: r.item_name.join("\n"),
      quantity: r.quantity.join("\n"),
      price: r.price.join("\n"),
    }));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 sm:px-6 py-3 flex items-center gap-3">
        <button
          onClick={() => setActiveReport(null)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
        >
          ← Back
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-gray-800 truncate">{activeReport.label}</h1>
          {data.length > 0 && (
            <p className="text-[11px] text-gray-400">{data.length} rows</p>
          )}
        </div>
        {data.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={exportPDF}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-semibold text-rose-600 border-rose-200 bg-rose-50 hover:bg-rose-100 transition"
            >
              ↓ PDF
            </button>
            <button
              onClick={exportExcel}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-semibold text-emerald-600 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition"
            >
              ↓ Excel
            </button>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {loading && (
        <div className="h-0.5 bg-blue-100">
          <div className="h-full bg-blue-500 animate-pulse w-full" />
        </div>
      )}

      {/* Filters */}
      <div className="px-4 sm:px-6 py-3 bg-white border-b flex flex-wrap gap-3 items-end">
        {requiresDateRange ? (
          <>
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] text-gray-500 font-medium">From Date</label>
              <div className="relative">
                <FaCalendarAlt
                  className="absolute left-2.5 top-2 text-gray-400 text-[11px] cursor-pointer"
                  onClick={() => setShowFromPicker(v => !v)}
                />
                <input
                  value={fromInput}
                  placeholder="DD/MM/YYYY"
                  onChange={e => {
                    const v = formatInputDate(e.target.value);
                    setFromInput(v);
                    setFromDate(toApiDate(v));
                  }}
                  onFocus={() => setShowFromPicker(true)}
                  onBlur={() => { if (isFullDate(fromInput)) setShowFromPicker(false); }}
                  className={`${inputCls} pl-7 w-36`}
                />
                {showFromPicker && (
                  <div className="absolute left-0 top-full mt-1 z-20 bg-white border rounded-xl shadow-lg p-2">
                    <input
                      ref={fromPickerRef}
                      type="date"
                      value={fromDate || ""}
                      onChange={e => {
                        const v = e.target.value;
                        if (!v) return;
                        const [yyyy, mm, dd] = v.split("-");
                        setFromInput(`${dd}/${mm}/${yyyy}`);
                        setFromDate(v);
                        setShowFromPicker(false);
                      }}
                      className="border rounded-lg px-2 py-1 text-sm bg-white"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] text-gray-500 font-medium">To Date</label>
              <div className="relative">
                <FaCalendarAlt
                  className="absolute left-2.5 top-2 text-gray-400 text-[11px] cursor-pointer"
                  onClick={() => setShowToPicker(v => !v)}
                />
                <input
                  value={toInput}
                  placeholder="DD/MM/YYYY"
                  onChange={e => {
                    const v = formatInputDate(e.target.value);
                    setToInput(v);
                    setToDate(toApiDate(v));
                  }}
                  onFocus={() => setShowToPicker(true)}
                  onBlur={() => { if (isFullDate(toInput)) setShowToPicker(false); }}
                  className={`${inputCls} pl-7 w-36`}
                />
                {showToPicker && (
                  <div className="absolute left-0 top-full mt-1 z-20 bg-white border rounded-xl shadow-lg p-2">
                    <input
                      ref={toPickerRef}
                      type="date"
                      value={toDate || ""}
                      onChange={e => {
                        const v = e.target.value;
                        if (!v) return;
                        const [yyyy, mm, dd] = v.split("-");
                        setToInput(`${dd}/${mm}/${yyyy}`);
                        setToDate(v);
                        setShowToPicker(false);
                      }}
                      className="border rounded-lg px-2 py-1 text-sm bg-white"
                    />
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] text-gray-500 font-medium">Period</label>
            <div className="px-3 py-1.5 rounded-xl bg-gray-50 border border-gray-200 text-[12px] text-gray-600">{formatRangeLabel(true)}</div>
          </div>
        )}

        {!NO_USER_FILTER_KEYS.has(activeReport?.key) && (
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] text-gray-500 font-medium">User</label>
            <select value={userId} onChange={e => setUserId(e.target.value)} className={inputCls}>
              <option value="">All Users</option>
              {users.map(u => <option key={u.user_id} value={u.user_id}>{u.user_name}</option>)}
            </select>
          </div>
        )}

        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] text-gray-500 font-medium">Branch</label>
          <select value={branchId} onChange={e => setBranchId(e.target.value)} className={inputCls}>
            <option value="">All Branches</option>
            {branches.map(b => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}
          </select>
        </div>

        {(activeReport?.key === "sales/summary" || activeReport?.key === "sales/invoice-details") && (
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] text-gray-500 font-medium">Payment Mode</label>
            <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)} className={inputCls}>
              <option value="">All Modes</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="upi">UPI</option>
              <option value="split">Split</option>
            </select>
          </div>
        )}

        {activeReport?.key === "sales/customer-invoices" && (
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] text-gray-500 font-medium">Customer No.</label>
            <input
              value={customerNumber}
              onChange={e => setCustomerNumber(e.target.value)}
              placeholder="Customer number"
              className={`${inputCls} w-40`}
            />
          </div>
        )}

        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] text-transparent select-none">.</label>
          <button
            onClick={loadReport}
            disabled={loading}
            className="px-5 py-1.5 rounded-xl text-[12px] font-semibold text-white shadow-sm transition disabled:opacity-60"
            style={{ backgroundColor: "#0B3C8C" }}
          >
            {loading ? "Loading..." : "View Report"}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="px-4 sm:px-6 py-4">
        {loading ? (
          <div className="bg-white border rounded-2xl shadow-sm flex items-center justify-center h-48 text-sm text-gray-400">
            Loading report data...
          </div>
        ) : data.length === 0 ? (
          <div className="bg-white border rounded-2xl shadow-sm flex flex-col items-center justify-center h-48 gap-2">
            <div className="text-3xl">📊</div>
            <div className="text-sm text-gray-400">Set your filters and click View Report</div>
          </div>
        ) : activeReport?.key === "bulk-import/history" ? (() => {
          const TYPE_BADGE = {
            categories: { bg: "#EEF2FF", text: "#4338CA" },
            items:       { bg: "#F0FDF4", text: "#15803D" },
            users:       { bg: "#F0F9FF", text: "#0369A1" },
            employees:   { bg: "#FFF7ED", text: "#C2410C" },
          };
          const TYPE_ICON = { categories: "🏷️", items: "📦", users: "👤", employees: "🪪" };
          const fmt = (iso) => {
            if (!iso) return "";
            const d = new Date(iso);
            return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
          };
          return (
            <div className="space-y-2">
              <div className="bg-white border rounded-2xl shadow-sm overflow-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      {["Type","Filename","Uploaded By","Total","Inserted","Updated","Errors","Date & Time"].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide text-[10px] whitespace-nowrap border-r last:border-r-0">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {bulkLogs.map((log) => {
                      const badge = TYPE_BADGE[log.upload_type] || { bg: "#F1F5F9", text: "#475569" };
                      const isOpen = selectedBulkLogId === log.log_id;
                      const hasRows = Array.isArray(log.rows_json) && log.rows_json.length > 0;
                      const errorMap = {};
                      (log.errors_json || []).forEach(e => { errorMap[e.row] = e.error; });
                      const colKeys = hasRows ? Object.keys(log.rows_json[0]) : [];
                      return (
                        <>
                          {/* Summary row */}
                          <tr key={log.log_id} className="hover:bg-gray-50 transition">
                            <td className="px-3 py-2.5 border-r">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold" style={{ background: badge.bg, color: badge.text }}>
                                {TYPE_ICON[log.upload_type]} {log.upload_type}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 border-r">
                              <button
                                onClick={() => setSelectedBulkLogId(isOpen ? null : log.log_id)}
                                className="text-blue-600 hover:underline font-medium text-[11px] text-left"
                                title={hasRows ? "Click to view file content" : "No row data stored"}
                              >
                                {log.filename || "—"}
                              </button>
                              {hasRows && (
                                <span className="ml-1.5 text-[9px] text-gray-400">{isOpen ? "▲ hide" : "▼ details"}</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 border-r text-gray-700">{log.uploaded_by_name || "—"}</td>
                            <td className="px-3 py-2.5 border-r text-center font-medium text-gray-700">{log.total_rows}</td>
                            <td className="px-3 py-2.5 border-r text-center font-semibold text-emerald-600">{log.inserted}</td>
                            <td className="px-3 py-2.5 border-r text-center font-semibold text-blue-600">{log.updated}</td>
                            <td className="px-3 py-2.5 border-r text-center">
                              {log.error_count > 0
                                ? <span className="font-semibold text-red-500">{log.error_count}</span>
                                : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{fmt(log.created_at)}</td>
                          </tr>

                          {/* Expanded file content */}
                          {isOpen && (
                            <tr key={`${log.log_id}-detail`}>
                              <td colSpan={8} className="px-0 py-0 bg-slate-50 border-b">
                                <div className="px-5 py-3">
                                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                    File Content — {log.filename} ({log.rows_json.length} rows)
                                  </p>
                                  {hasRows ? (
                                    <div className="overflow-auto rounded-xl border border-slate-200">
                                      <table className="w-full text-[10px]">
                                        <thead>
                                          <tr className="bg-slate-100 border-b border-slate-200">
                                            <th className="px-2.5 py-1.5 text-left font-semibold text-slate-500 uppercase border-r border-slate-200">#</th>
                                            {colKeys.map(k => (
                                              <th key={k} className="px-2.5 py-1.5 text-left font-semibold text-slate-500 uppercase border-r border-slate-200 whitespace-nowrap">
                                                {k.replace(/_/g, " ")}
                                              </th>
                                            ))}
                                            <th className="px-2.5 py-1.5 text-left font-semibold text-slate-500 uppercase">Status</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                          {log.rows_json.map((row, idx) => {
                                            const rowNo = idx + 1;
                                            const errMsg = errorMap[rowNo];
                                            return (
                                              <tr key={idx} className={errMsg ? "bg-red-50" : idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                                                <td className="px-2.5 py-1.5 text-slate-400 border-r border-slate-100">{rowNo}</td>
                                                {colKeys.map(k => (
                                                  <td key={k} className="px-2.5 py-1.5 text-slate-700 border-r border-slate-100 whitespace-nowrap">
                                                    {row[k] === null || row[k] === undefined || row[k] === "" ? <span className="text-slate-300">—</span> : String(row[k])}
                                                  </td>
                                                ))}
                                                <td className="px-2.5 py-1.5">
                                                  {errMsg
                                                    ? <span className="text-red-500 font-medium">✗ {errMsg}</span>
                                                    : <span className="text-emerald-600 font-medium">✓ OK</span>}
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  ) : (
                                    <p className="text-[11px] text-gray-400 italic">No row data stored for this upload.</p>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })() : (() => {
          const displayRows = buildDisplayRows();
          return (
            <div className="bg-white border rounded-2xl shadow-sm overflow-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    {Object.keys(displayRows[0]).map(k => (
                      <th
                        key={k}
                        className="px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide text-[10px] whitespace-nowrap border-r last:border-r-0"
                      >
                        {k.replaceAll("_", " ")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {displayRows.map((r, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                      {Object.values(r).map((v, j) => (
                        <td
                          key={j}
                          className="px-3 py-2 text-gray-700 whitespace-pre-line border-r last:border-r-0"
                        >
                          {v}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
