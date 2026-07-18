import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import * as FileSystem from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as XLSX from "xlsx";

import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { getReceiptLogoUrl } from "../utils/printInvoice";

/* =====================================================
   REPORT DEFINITIONS — mirrors frontend/src/pages/reports/Reports.jsx
   so the mobile app surfaces the exact same report catalog.
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
  { key: "upi-payments", label: "UPI QR Payments", group: "Sales" },

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
  { key: "table/usage", label: "Table Usage", group: "Table", hotelOnly: true },

  // Employees / HR
  { key: "employees/wages-summary", label: "Employee Wages Summary", group: "Employees", requiresDateRange: false },
  { key: "employees/due-list", label: "Employee Due List", group: "Employees", requiresDateRange: false },
  { key: "employees/attendance-summary", label: "Employee Attendance Summary", group: "Employees" },

  // Reservations
  { key: "reservations/list", label: "Reservations Report", group: "Reservations" },
];

const REPORT_GROUP_ORDER = [
  "Sales", "Receivables", "Returns", "Inventory", "Purchases", "Stock Transfers",
  "Cash Drawer", "Stock Audit", "Online Orders", "Loyalty", "Coupons", "GST",
  "Accounting", "Reconciliation", "Compliance", "Audit", "Table", "Employees", "Reservations",
];

const NO_USER_FILTER_KEYS = new Set([
  "suppliers", "po-aging", "payables-summary", "gst/summary", "sales/customer-invoices",
  "inventory/current", "inventory/movement", "inventory/date-wise", "inventory/expiry-lots",
  "audit/deleted-invoices", "stock-audit/variances", "online-orders/list", "online-orders/summary",
  "coupons/summary", "loyalty/balances", "supplier-ledger/balances", "employees/wages-summary",
  "employees/due-list", "employees/attendance-summary", "reservations/list", "bulk-import/history",
  "upi-payments", "gst/gstr1", "gst/gstr3b", "gst/hsn-summary", "gst/itc-register",
  "accounting/cash-bank-book", "accounting/day-book", "day-close/report",
  "accounting/trial-balance", "accounting/balance-sheet", "recon/payments-gateway",
  "recon/stock-valuation", "compliance/e-invoice-status", "compliance/e-waybill-status",
  "compliance/tds-vendor-payments", "compliance/tcs-sales",
]);

const PAYMENT_MODE_KEYS = new Set(["sales/summary", "sales/invoice-details"]);
const PAYMENT_MODES = ["cash", "card", "upi", "credit"];

const todayStr = () => new Date().toISOString().split("T")[0];
const daysAgoStr = (n, from) => {
  const d = new Date(from || todayStr());
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
};
const fmtDateTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
const titleCase = (s) => String(s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const cellText = (v) => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") return String(v);
  return String(v);
};
const escapeHtml = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const safeFilename = (s) => String(s || "Report").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") || "Report";

// Mirrors buildHeaderLines() in frontend/src/pages/reports/Reports.jsx so
// exported reports carry the same shop/branch header as web and desktop.
const buildReportHeaderLines = ({ shop = {}, branch = {} } = {}) => {
  const lines = [];
  const hasBranch = Boolean(branch?.branch_name);
  const shopName = shop?.shop_name || "Shop Name";
  lines.push(hasBranch ? `${shopName} - ${branch.branch_name}` : shopName);

  const hasBranchAddress = [
    branch?.address_line1, branch?.address_line2, branch?.city, branch?.state, branch?.pincode,
  ].some((v) => String(v || "").trim());
  const addrSrc = hasBranchAddress ? branch : shop;

  const address = [addrSrc?.address_line1, addrSrc?.address_line2, addrSrc?.address_line3]
    .filter(Boolean).join(", ");
  if (address) lines.push(address);

  const city = [addrSrc?.city, addrSrc?.state, addrSrc?.pincode].filter(Boolean).join(" ");
  if (city) lines.push(city);

  const contact = [];
  if (shop?.mobile) contact.push(`Ph: ${shop.mobile}`);
  if (shop?.gst_number) contact.push(`GSTIN: ${shop.gst_number}`);
  if (contact.length) lines.push(contact.join(" | "));

  if (!hasBranch) lines.push("Branch: All");
  return lines;
};

export default function ReportsScreen() {
  const { session } = useAuth();
  const bizDate = session?.app_date || todayStr();

  const [isHotel, setIsHotel] = useState(false);
  const [shop, setShop] = useState({});
  const [branch, setBranch] = useState({});
  const [users, setUsers] = useState([]);
  const [activeReport, setActiveReport] = useState(null);
  const [expandedGroup, setExpandedGroup] = useState(null);

  const [fromDate, setFromDate] = useState(() => daysAgoStr(30, bizDate));
  const [toDate, setToDate] = useState(bizDate);
  const [userId, setUserId] = useState("");
  const [userPickerOpen, setUserPickerOpen] = useState(false);
  const [paymentMode, setPaymentMode] = useState("");
  const [customerNumber, setCustomerNumber] = useState("");

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    api.get("/shop/details").then((r) => {
      if (!alive) return;
      const sd = r?.data || {};
      setShop(sd);
      setIsHotel(String(sd.billing_type || sd.shop_type || "").toLowerCase() === "hotel");
    }).catch(() => {});
    api.get("/users/").then((r) => {
      if (!alive) return;
      setUsers(Array.isArray(r.data) ? r.data : []);
    }).catch(() => {});
    if (session?.branch_id) {
      api.get(`/branch/${session.branch_id}`).then((r) => {
        if (!alive) return;
        setBranch(r?.data || {});
      }).catch(() => {});
    }
    return () => { alive = false; };
  }, [session?.branch_id]);

  const reportOptions = useMemo(
    () => REPORTS.filter((r) => isHotel || !r.hotelOnly),
    [isHotel]
  );

  const reportGroups = useMemo(() => {
    const grouped = reportOptions.reduce((acc, r) => {
      (acc[r.group || "Other"] ||= []).push(r);
      return acc;
    }, {});
    const ordered = REPORT_GROUP_ORDER
      .filter((g) => Array.isArray(grouped[g]) && grouped[g].length)
      .map((g) => ({ group: g, reports: grouped[g] }));
    const extras = Object.keys(grouped)
      .filter((g) => !REPORT_GROUP_ORDER.includes(g))
      .sort()
      .map((g) => ({ group: g, reports: grouped[g] }));
    return [...ordered, ...extras];
  }, [reportOptions]);

  const requiresDateRange = activeReport?.requiresDateRange !== false;
  const showUserFilter = activeReport && !NO_USER_FILTER_KEYS.has(activeReport.key) && users.length > 0;
  const showPaymentMode = activeReport && PAYMENT_MODE_KEYS.has(activeReport.key);
  const showCustomerNumber = activeReport?.key === "sales/customer-invoices";
  const selectedUserName = users.find((u) => String(u.user_id ?? u.id) === String(userId))?.user_name
    || users.find((u) => String(u.user_id ?? u.id) === String(userId))?.name
    || "All Users";

  const selectReport = (r) => {
    setActiveReport(r);
    setData([]);
    setLoaded(false);
    setUserId("");
    setPaymentMode("");
    setCustomerNumber("");
  };

  const backToList = () => {
    setActiveReport(null);
    setData([]);
    setLoaded(false);
  };

  const loadReport = async () => {
    if (!activeReport) return;
    const key = activeReport.key;
    if (requiresDateRange && (!fromDate || !toDate) && key !== "bulk-import/history") {
      Alert.alert("Validation", "Select From & To dates");
      return;
    }
    if (key === "sales/customer-invoices" && !customerNumber.trim()) {
      Alert.alert("Validation", "Enter customer number");
      return;
    }

    setLoading(true);
    setLoaded(false);
    try {
      const params = {};
      if (requiresDateRange && fromDate && toDate) {
        params.from_date = fromDate;
        params.to_date = toDate;
      }
      if (showUserFilter && userId) params.user_id = userId;
      if (showPaymentMode && paymentMode) params.payment_mode = paymentMode;
      if (showCustomerNumber) params.customer_number = customerNumber.trim();

      let rows = [];

      if (key === "employees/wages-summary" || key === "employees/due-list") {
        const asOf = toDate || fromDate || bizDate;
        const r = await api.get("/employees/wages/summary", { params: { as_of_date: asOf } });
        const wageRows = Array.isArray(r?.data?.rows) ? r.data.rows : [];
        rows = key === "employees/due-list"
          ? wageRows.filter((row) => Number(row.due_till_as_of || 0) > 0)
          : wageRows;
      } else if (key === "bulk-import/history") {
        const apiParams = {};
        if (fromDate) apiParams.from_date = fromDate;
        if (toDate) apiParams.to_date = toDate;
        const r = await api.get("/bulk-import-logs/", { params: apiParams });
        const rawLogs = Array.isArray(r.data) ? r.data : [];
        rows = rawLogs.map((l) => ({
          Type: l.upload_type,
          Filename: l.filename || "",
          "Uploaded By": l.uploaded_by_name || "",
          Total: l.total_rows,
          Inserted: l.inserted,
          Updated: l.updated,
          Errors: l.error_count,
          "Date & Time": fmtDateTime(l.created_at),
        }));
      } else {
        const r = await api.get(`/reports/${key}`, { params });
        const raw = r.data;
        rows = Array.isArray(raw) ? raw : (raw ? [raw] : []);
      }

      if (key === "gst/summary") {
        const obj = rows[0] && typeof rows[0] === "object" ? rows[0] : {};
        rows = Object.entries(obj).map(([k, v]) => ({ Metric: titleCase(k), Amount: Number(v || 0).toFixed(2) }));
      } else if (key === "cash-drawer/shifts") {
        let normalized = rows.map((row) => {
          const actualCashEntered = row.actual_cash !== null && row.actual_cash !== undefined && row.actual_cash !== "";
          return actualCashEntered ? { ...row, expected_cash: "" } : row;
        });
        const hasVisibleExpectedCash = normalized.some(
          (row) => row.expected_cash !== null && row.expected_cash !== undefined && row.expected_cash !== ""
        );
        if (!hasVisibleExpectedCash) {
          normalized = normalized.map((row) => Object.fromEntries(Object.entries(row).filter(([k2]) => k2 !== "expected_cash")));
        }
        rows = normalized;
      } else if (key === "sales/summary") {
        rows = rows.map((row) => {
          const sub = Number(row.sub_total || 0);
          const gst = Number(row.gst || 0);
          const discount = Number(row.discount || 0);
          return { ...row, grand_total: Number((sub + gst - discount).toFixed(2)) };
        });
      } else if (key === "upi-payments") {
        rows = rows.map((row) => ({
          Date: row.date,
          Time: row.time,
          "Invoice #": row.invoice_number,
          Customer: row.customer_name || "—",
          Mobile: row.mobile || "—",
          Amount: Number(row.amount || 0).toFixed(2),
          "UTR Last 5": row.utr_last_5 || "—",
        }));
      }

      setData(rows);
      setLoaded(true);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load report");
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const columns = data.length > 0 ? Object.keys(data[0]) : [];

  const rangeLabel = requiresDateRange && fromDate && toDate
    ? `${fromDate} to ${toDate}`
    : `As of ${toDate || bizDate}`;

  const [exporting, setExporting] = useState(null);

  const shareFile = async (uri, mimeType, dialogTitle) => {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType, dialogTitle });
    } else {
      Alert.alert("Saved", `File saved to:\n${uri}`);
    }
  };

  const exportPDF = async () => {
    if (!data.length || !activeReport) return;
    setExporting("pdf");
    try {
      const headerLines = buildReportHeaderLines({ shop, branch });
      const logoDataUri = await getReceiptLogoUrl({ shop, branch });
      const cols = Object.keys(data[0]);
      const headHtml = cols.map((c) =>
        `<th style="padding:6px 8px;border:1px solid #ddd;background:#f3f4f6;font-size:10px;text-transform:uppercase;text-align:left;">${escapeHtml(titleCase(c))}</th>`
      ).join("");
      const rowsHtml = data.map((row) =>
        `<tr>${cols.map((c) => `<td style="padding:5px 8px;border:1px solid #ddd;font-size:11px;">${escapeHtml(cellText(row[c]))}</td>`).join("")}</tr>`
      ).join("");
      const headerLinesHtml = headerLines.map((line, i) =>
        `<div style="font-size:${i === 0 ? 14 : 10}px;font-weight:${i === 0 ? 700 : 400};margin:${i === 0 ? "0 0 2px" : "0 0 1px"};">${escapeHtml(line)}</div>`
      ).join("");
      const html = `
        <html><head><meta charset="utf-8" /></head>
        <body style="font-family:-apple-system,Roboto,sans-serif;padding:16px;">
          <div style="display:flex;align-items:center;justify-content:center;gap:10px;text-align:center;flex-direction:column;">
            ${logoDataUri ? `<img src="${logoDataUri}" style="width:44px;height:44px;object-fit:contain;" />` : ""}
            <div>${headerLinesHtml}</div>
          </div>
          <hr style="border:none;border-top:1px solid #ccc;margin:10px 0;" />
          <h3 style="margin:0 0 4px;text-align:center;">${escapeHtml(activeReport.label)}</h3>
          <p style="margin:0 0 14px;color:#6b7280;font-size:11px;text-align:center;">${escapeHtml(rangeLabel)}</p>
          <table style="border-collapse:collapse;width:100%;">
            <thead><tr>${headHtml}</tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </body></html>`;
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      await shareFile(uri, "application/pdf", `${activeReport.label} PDF`);
    } catch (err) {
      Alert.alert("Export failed", err?.message || "Could not generate PDF");
    } finally {
      setExporting(null);
    }
  };

  const exportExcel = async () => {
    if (!data.length || !activeReport) return;
    setExporting("excel");
    try {
      const headerLines = buildReportHeaderLines({ shop, branch });
      const cols = Object.keys(data[0]);
      const ws = XLSX.utils.json_to_sheet([]);
      ws["!merges"] = ws["!merges"] || [];
      headerLines.forEach((line, i) => {
        ws[`A${i + 1}`] = { v: line };
        ws["!merges"].push({ s: { r: i, c: 0 }, e: { r: i, c: cols.length - 1 } });
      });
      XLSX.utils.sheet_add_json(ws, data, { origin: `A${headerLines.length + 2}` });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Report");
      const base64 = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
      const fileUri = `${FileSystem.cacheDirectory}${safeFilename(activeReport.label)}.xlsx`;
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
      await shareFile(fileUri, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `${activeReport.label} Excel`);
    } catch (err) {
      Alert.alert("Export failed", err?.message || "Could not generate Excel file");
    } finally {
      setExporting(null);
    }
  };

  /* ============= PICKER (report catalog) ============= */
  if (!activeReport) {
    return (
      <SafeAreaView style={st.safe}>
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 32 }}>
          {reportGroups.map(({ group, reports }) => {
            const open = expandedGroup === group;
            return (
              <View key={group} style={st.groupCard}>
                <Pressable style={st.groupHeader} onPress={() => setExpandedGroup(open ? null : group)}>
                  <Text style={st.groupTitle}>{group}</Text>
                  <Text style={st.groupChevron}>{open ? "▲" : "▼"}</Text>
                </Pressable>
                {open && (
                  <View style={st.groupBody}>
                    {reports.map((r) => (
                      <Pressable key={r.key} style={st.reportRow} onPress={() => selectReport(r)}>
                        <Text style={st.reportRowText}>{r.label}</Text>
                        <Text style={st.reportRowArrow}>›</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    );
  }

  /* ============= DETAIL (filters + table) ============= */
  return (
    <SafeAreaView style={st.safe}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={st.detailHeader}>
          <Pressable onPress={backToList} style={st.backBtn}>
            <Text style={st.backBtnText}>‹ All Reports</Text>
          </Pressable>
          <Text style={st.detailTitle}>{activeReport.label}</Text>
        </View>

        <View style={st.filterCard}>
          {requiresDateRange && (
            <View style={st.dateRow}>
              <View style={{ flex: 1 }}>
                <Text style={st.label}>From</Text>
                <TextInput style={st.dateInput} value={fromDate} onChangeText={setFromDate} placeholder="YYYY-MM-DD" placeholderTextColor="#94a3b8" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.label}>To</Text>
                <TextInput style={st.dateInput} value={toDate} onChangeText={setToDate} placeholder="YYYY-MM-DD" placeholderTextColor="#94a3b8" />
              </View>
            </View>
          )}

          {showUserFilter && (
            <View>
              <Text style={st.label}>User</Text>
              <Pressable style={st.pickerBtn} onPress={() => setUserPickerOpen(true)}>
                <Text style={st.pickerBtnText}>{selectedUserName}</Text>
              </Pressable>
            </View>
          )}

          {showPaymentMode && (
            <View>
              <Text style={st.label}>Payment Mode</Text>
              <View style={st.modeRow}>
                {["", ...PAYMENT_MODES].map((m) => (
                  <Pressable key={m || "all"} style={[st.chip, paymentMode === m && st.chipActive]} onPress={() => setPaymentMode(m)}>
                    <Text style={[st.chipText, paymentMode === m && st.chipTextActive]}>{m ? m.toUpperCase() : "ALL"}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {showCustomerNumber && (
            <View>
              <Text style={st.label}>Customer Number</Text>
              <TextInput
                style={st.dateInput}
                value={customerNumber}
                onChangeText={setCustomerNumber}
                placeholder="Enter customer mobile number"
                placeholderTextColor="#94a3b8"
                keyboardType="phone-pad"
              />
            </View>
          )}

          <Pressable style={[st.runBtn, loading && st.btnDisabled]} disabled={loading} onPress={loadReport}>
            {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.runBtnText}>View Report</Text>}
          </Pressable>
        </View>

        {loaded && (
          data.length === 0 ? (
            <View style={st.emptyWrap}>
              <Text style={st.emptyIcon}>📊</Text>
              <Text style={st.emptyTitle}>No data for this selection</Text>
            </View>
          ) : (
            <>
              <View style={st.exportRow}>
                <Pressable
                  style={[st.exportBtn, exporting && st.btnDisabled]}
                  disabled={!!exporting}
                  onPress={exportPDF}
                >
                  {exporting === "pdf"
                    ? <ActivityIndicator color="#dc2626" size="small" />
                    : <Text style={st.exportBtnText}>⬇ PDF</Text>}
                </Pressable>
                <Pressable
                  style={[st.exportBtn, st.exportBtnExcel, exporting && st.btnDisabled]}
                  disabled={!!exporting}
                  onPress={exportExcel}
                >
                  {exporting === "excel"
                    ? <ActivityIndicator color="#059669" size="small" />
                    : <Text style={[st.exportBtnText, st.exportBtnTextExcel]}>⬇ Excel</Text>}
                </Pressable>
              </View>
              <View style={st.tableCard}>
                <ScrollView horizontal showsHorizontalScrollIndicator>
                  <View>
                    <View style={st.tRowHeader}>
                      {columns.map((c) => (
                        <Text key={c} style={st.tHeadCell}>{titleCase(c)}</Text>
                      ))}
                    </View>
                    {data.map((row, i) => (
                      <View key={i} style={[st.tRow, i % 2 === 1 && st.tRowAlt]}>
                        {columns.map((c) => (
                          <Text key={c} style={st.tCell}>{cellText(row[c])}</Text>
                        ))}
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </View>
            </>
          )
        )}
      </ScrollView>

      <Modal visible={userPickerOpen} transparent animationType="fade" onRequestClose={() => setUserPickerOpen(false)}>
        <Pressable style={st.modalBackdrop} onPress={() => setUserPickerOpen(false)}>
          <View style={st.modalSheet}>
            <Text style={st.modalTitle}>Select User</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              <Pressable style={st.modalRow} onPress={() => { setUserId(""); setUserPickerOpen(false); }}>
                <Text style={st.modalRowText}>All Users</Text>
              </Pressable>
              {users.map((u) => {
                const id = u.user_id ?? u.id;
                return (
                  <Pressable key={id} style={st.modalRow} onPress={() => { setUserId(String(id)); setUserPickerOpen(false); }}>
                    <Text style={st.modalRowText}>{u.user_name || u.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f6fb" },

  groupCard: {
    backgroundColor: "#ffffff", marginBottom: 10, borderRadius: 16,
    borderWidth: 1.5, borderColor: "#e4e9f2", overflow: "hidden",
  },
  groupHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14 },
  groupTitle: { fontSize: 14, fontWeight: "800", color: "#0a0f1e" },
  groupChevron: { fontSize: 11, color: "#9ca3af" },
  groupBody: { borderTopWidth: 1, borderTopColor: "#eef1f7" },
  reportRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: "#f4f6fb",
  },
  reportRowText: { fontSize: 13, color: "#374151", fontWeight: "600", flex: 1 },
  reportRowArrow: { fontSize: 16, color: "#9ca3af" },

  detailHeader: { padding: 14, paddingBottom: 6, gap: 6 },
  backBtn: { alignSelf: "flex-start" },
  backBtnText: { color: "#6366f1", fontWeight: "700", fontSize: 13 },
  detailTitle: { fontSize: 18, fontWeight: "900", color: "#0a0f1e" },

  filterCard: {
    backgroundColor: "#ffffff", marginHorizontal: 14, marginTop: 8, borderRadius: 18,
    borderWidth: 1.5, borderColor: "#e4e9f2", padding: 14, gap: 12,
  },
  dateRow: { flexDirection: "row", gap: 10 },
  label: { fontSize: 11, fontWeight: "700", color: "#9ca3af", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 },
  dateInput: {
    borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12,
    backgroundColor: "#f8f9fd", paddingHorizontal: 12, paddingVertical: 10, color: "#0a0f1e", fontSize: 14,
  },
  pickerBtn: {
    borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12,
    backgroundColor: "#f8f9fd", paddingHorizontal: 12, paddingVertical: 10,
  },
  pickerBtnText: { color: "#0a0f1e", fontSize: 14, fontWeight: "600" },
  modeRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: {
    borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#f8f9fd",
  },
  chipActive: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  chipText: { fontSize: 11, fontWeight: "700", color: "#4b5563" },
  chipTextActive: { color: "#fff" },
  runBtn: {
    backgroundColor: "#6366f1", borderRadius: 14, paddingVertical: 13,
    alignItems: "center", justifyContent: "center", minHeight: 44,
  },
  runBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  btnDisabled: { opacity: 0.5 },

  emptyWrap: { alignItems: "center", paddingTop: 50, gap: 10 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { color: "#9ca3af", fontSize: 15, fontWeight: "700" },

  exportRow: { flexDirection: "row", gap: 10, marginHorizontal: 14, marginTop: 14 },
  exportBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    borderRadius: 12, paddingVertical: 10, borderWidth: 1.5,
    borderColor: "#fecaca", backgroundColor: "#fef2f2",
  },
  exportBtnExcel: { borderColor: "#a7f3d0", backgroundColor: "#ecfdf5" },
  exportBtnText: { color: "#dc2626", fontWeight: "800", fontSize: 13 },
  exportBtnTextExcel: { color: "#059669" },

  tableCard: {
    backgroundColor: "#ffffff", marginHorizontal: 14, marginTop: 14, borderRadius: 16,
    borderWidth: 1.5, borderColor: "#e4e9f2", overflow: "hidden",
  },
  tRowHeader: { flexDirection: "row", backgroundColor: "#f8f9fd", borderBottomWidth: 1, borderBottomColor: "#e4e9f2" },
  tHeadCell: {
    minWidth: 120, paddingHorizontal: 10, paddingVertical: 9, fontSize: 10,
    fontWeight: "800", color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.3,
  },
  tRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#f4f6fb" },
  tRowAlt: { backgroundColor: "#fafbfe" },
  tCell: { minWidth: 120, paddingHorizontal: 10, paddingVertical: 9, fontSize: 12, color: "#374151" },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(10,15,30,0.45)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, maxHeight: "70%" },
  modalTitle: { fontSize: 15, fontWeight: "800", color: "#0a0f1e", marginBottom: 8 },
  modalRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f4f6fb" },
  modalRowText: { fontSize: 14, color: "#374151", fontWeight: "600" },
});
