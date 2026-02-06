import { useEffect, useState } from "react";
import api from "../../utils/apiClient";
import { getSession } from "../../utils/auth";
import ReportTable from "./ReportTable";
import ReportFilters from "./ReportFilters";
import { useToast } from "../../components/Toast";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

export default function SalesReport() {
  const { showToast } = useToast();
  const session = getSession();

  const role =
    session?.role_name ||
    session?.role_ref?.role_name ||
    session?.role ||
    "";

  const isAdmin = String(role).toLowerCase() === "admin";
  const userBranchId = session?.branch_id;

  /* ================= STATE ================= */
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [branchFilter, setBranchFilter] = useState(
    isAdmin ? "all" : userBranchId
  );
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const [shop, setShop] = useState({});
  const [branch, setBranch] = useState({});

  /* ================= LOAD SHOP & BRANCH ================= */
  useEffect(() => {
    const loadHeaderInfo = async () => {
      try {
        const shopRes = await api.get("/shop/details");
        setShop(shopRes.data || {});
      } catch {}

      try {
        if (userBranchId) {
          const brRes = await api.get(`/branch/${userBranchId}`);
          setBranch(brRes.data || {});
        }
      } catch {}
    };

    loadHeaderInfo();
  }, [userBranchId]);

  /* ================= LOAD REPORT ================= */
  const loadReport = async () => {
    if (!start || !end) {
      showToast("Please select start and end date", "warning");
      return;
    }

    try {
      setLoading(true);

      const params = {
        from_date: start,
        to_date: end,
      };

      if (isAdmin && branchFilter !== "all") params.branch_id = branchFilter;
      if (!isAdmin) params.branch_id = userBranchId;

      const res = await api.get("/reports/sales/items", { params });
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Sales report error", err);
      showToast("Failed to load sales report", "error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  /* ================= GROUP DATA PER INVOICE ================= */
  const groupedInvoices = Object.values(
    rows.reduce((acc, row) => {
      const key = row.invoice_number;
      if (!acc[key]) {
        acc[key] = {
          invoice_date: row.invoice_date,
          invoice_time: row.invoice_time,
          invoice_number: row.invoice_number,
          customer: row.customer,
          created_user: row.created_user,
          sub_total: row.sub_total,
          gst: row.gst,
          discount: row.discount,
          grand_total: row.grand_total,
          items: [],
        };
      }

      acc[key].items.push({
        item_name: row.item_name,
        quantity: row.quantity,
        price: row.price,
      });

      return acc;
    }, {})
  );

  /* ================= HEADER BUILDER ================= */
  const buildHeaderLines = (shopOverride = shop, branchOverride = branch) => {
    const lines = [];

    const headerName = branchOverride.branch_name
      ? `${shopOverride.shop_name || "Shop Name"} - ${branchOverride.branch_name}`
      : shopOverride.shop_name || "Shop Name";
    lines.push(headerName);

    const hasBranchAddress =
      branchOverride?.address_line1 ||
      branchOverride?.address_line2 ||
      branchOverride?.city ||
      branchOverride?.state ||
      branchOverride?.pincode;
    const addrSrc = hasBranchAddress ? branchOverride : shopOverride;

    const addressLine = [
      addrSrc?.address_line1,
      addrSrc?.address_line2,
      addrSrc?.address_line3
    ]
      .filter(Boolean)
      .join(", ");
    if (addressLine) lines.push(addressLine);

    const cityStatePin = [addrSrc?.city, addrSrc?.state, addrSrc?.pincode]
      .filter(Boolean)
      .join(" ");
    if (cityStatePin) lines.push(cityStatePin);

    if (shopOverride.mobile) lines.push(`Ph: ${shopOverride.mobile}`);
    if (shopOverride.gst_number) lines.push(`GSTIN: ${shopOverride.gst_number}`);

    return lines;
  };

  /* ================= EXPORT PDF ================= */
  const ensureHeaderLoaded = async () => {
    let resolvedShop = shop;
    if (!resolvedShop?.shop_name) {
      try {
        const shopRes = await api.get("/shop/details");
        resolvedShop = shopRes.data || {};
        setShop(resolvedShop);
      } catch {}
    }

    let resolvedBranch = branch;
    const hasAddress =
      resolvedBranch?.address_line1 ||
      resolvedBranch?.address_line2 ||
      resolvedBranch?.city ||
      resolvedBranch?.state ||
      resolvedBranch?.pincode;

    if (userBranchId && (String(resolvedBranch?.branch_id) !== String(userBranchId) || !hasAddress)) {
      try {
        const brRes = await api.get(`/branch/${userBranchId}`);
        resolvedBranch = brRes.data || {};
        setBranch(resolvedBranch);
      } catch {}
    }

    return { resolvedShop, resolvedBranch };
  };

  const exportPDF = async () => {
    if (!groupedInvoices.length) {
      showToast("No data available to export", "warning");
      return;
    }

    const { resolvedShop, resolvedBranch } = await ensureHeaderLoaded();

    const doc = new jsPDF("p", "mm", "a4");
    let y = 10;

    buildHeaderLines(resolvedShop, resolvedBranch).forEach(line => {
      doc.setFontSize(11);
      doc.text(line, 105, y, { align: "center" });
      y += 6;
    });

    y += 4;

    autoTable(doc, {
      startY: y,
      head: [[
        "Invoice No",
        "Date",
        "Customer",
        "Subtotal",
        "GST",
        "Discount",
        "Grand Total",
      ]],
      body: groupedInvoices.map(inv => [
        inv.invoice_number,
        `${inv.invoice_date} ${inv.invoice_time}`,
        inv.customer,
        inv.sub_total.toFixed(2),
        inv.gst.toFixed(2),
        inv.discount.toFixed(2),
        inv.grand_total.toFixed(2),
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [15, 23, 42] },
    });

    doc.save(`Sales_Report_${start}_to_${end}.pdf`);
    showToast("PDF exported successfully", "success");
  };

  /* ================= EXPORT EXCEL ================= */
  const exportExcel = async () => {
    if (!groupedInvoices.length) {
      showToast("No data available to export", "warning");
      return;
    }

    const { resolvedShop, resolvedBranch } = await ensureHeaderLoaded();
    const headerLines = buildHeaderLines(resolvedShop, resolvedBranch);

    const data = groupedInvoices.map(inv => ({
      "Invoice No": inv.invoice_number,
      "Date": `${inv.invoice_date} ${inv.invoice_time}`,
      "Customer": inv.customer,
      "Sub Total": inv.sub_total,
      "GST": inv.gst,
      "Discount": inv.discount,
      "Grand Total": inv.grand_total,
      "Created User": inv.created_user,
    }));

    const ws = XLSX.utils.json_to_sheet([]);

    // Center header across columns (A → G)
    headerLines.forEach((text, i) => {
      const row = i + 1;
      ws[`A${row}`] = { v: text, t: "s" };
      ws["!merges"] = ws["!merges"] || [];
      ws["!merges"].push({
        s: { r: row - 1, c: 0 },
        e: { r: row - 1, c: 6 },
      });
    });

    XLSX.utils.sheet_add_aoa(ws, [[]], {
      origin: `A${headerLines.length + 1}`,
    });

    XLSX.utils.sheet_add_json(ws, data, {
      origin: `A${headerLines.length + 2}`,
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sales Report");

    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(
      new Blob([buf], { type: "application/octet-stream" }),
      `Sales_Report_${start}_to_${end}.xlsx`
    );

    showToast("Excel exported successfully", "success");
  };

  /* ================= UI ================= */
  return (
    <div className="p-6 bg-slate-100 min-h-screen">
      <div className="bg-white rounded-xl shadow-md border border-slate-200">

        {/* HEADER */}
        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-semibold text-slate-800">
              Sales Report
            </h2>
            <p className="text-sm text-slate-500">
              Invoice-wise item sales report
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={exportPDF}
              className="px-4 py-2 bg-red-600 text-white rounded-lg"
            >
              Export PDF
            </button>
            <button
              onClick={exportExcel}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg"
            >
              Export Excel
            </button>
          </div>
        </div>

        {/* FILTERS */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
          <ReportFilters
            start={start}
            end={end}
            setStart={setStart}
            setEnd={setEnd}
            branch={branchFilter}
            setBranch={setBranchFilter}
            showBranchFilter={isAdmin}
            onSearch={loadReport}
          />
        </div>

        {/* TABLE */}
        <div className="p-6">
          {loading ? (
            <div className="text-center py-10 text-slate-500">
              Loading report...
            </div>
          ) : groupedInvoices.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              No data found
            </div>
          ) : (
            <ReportTable data={groupedInvoices} />
          )}
        </div>
      </div>
    </div>
  );
}

