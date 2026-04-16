import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import authAxios from "../api/authAxios";
import { useToast } from "../components/Toast";
import { getSession } from "../utils/auth";
import { getBusinessDate, syncBusinessDate } from "../utils/businessDate";
import { generateFeedbackQrHtml } from "../utils/feedbackQr";
import { getReceiptAddressLines, maskMobileForPrint } from "../utils/receipt";
import { printDirectText } from "../utils/printDirect";

export default function SalesHistory() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const printTextRef = useRef(null);

  /* ================= DATE ================= */
  const pad = n => String(n).padStart(2, "0");
  const initialYMD = getBusinessDate();

  const parseToDate = v => {
    if (!v) return null;
    if (v instanceof Date) {
      if (isNaN(v.getTime())) return null;
      return v;
    }
    if (typeof v === "string") {
      let d = new Date(v);
      if (!isNaN(d.getTime())) return d;
      d = new Date(v.replace(" ", "T"));
      if (!isNaN(d.getTime())) return d;
      d = new Date(v.replace(" ", "T") + "Z");
      if (!isNaN(d.getTime())) return d;
      return null;
    }
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };

  const formatAPI = d => {
    const dateObj = parseToDate(d);
    if (!dateObj) return "";
    return new Date(dateObj.getTime() - dateObj.getTimezoneOffset() * 60000)
      .toISOString()
      .split("T")[0];
  };

  const formatDisplayDate = (v, includeSeconds = true) => {
    const d = parseToDate(v);
    if (!d) return "-";
    const datePart = d.toLocaleDateString();
    const timeOpts = includeSeconds
      ? { hour: "2-digit", minute: "2-digit", second: "2-digit" }
      : { hour: "2-digit", minute: "2-digit" };
    const timePart = d.toLocaleTimeString([], timeOpts);
    return `${datePart}, ${timePart}`;
  };

  const [fromDate, setFromDate] = useState(initialYMD);
  const [toDate, setToDate] = useState(initialYMD);
  const [appDateYMD, setAppDateYMD] = useState(initialYMD);

  const toYMD = dateValue => {
    const d = parseToDate(dateValue);
    if (!d) return "";
    // Use UTC methods: backend stores created_time with UTC date == shop app_date
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  };

  const isAppDateBill = dateValue => {
    const billYmd = toYMD(dateValue);
    return !!billYmd && billYmd === appDateYMD;
  };

  /* ================= STATE ================= */
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeBill, setActiveBill] = useState(null);
  const [items, setItems] = useState([]);
  const [shop, setShop] = useState({});
  const [branch, setBranch] = useState({});
  const [mode, setMode] = useState("view");
  const [deleteReason, setDeleteReason] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Role & permission
  const [canEdit, setCanEdit] = useState(true); // default true until role is checked

  /* ================= LOAD ROLE ================= */
  useEffect(() => {
    const session = getSession() || {};
    const role = (session.role_name || session.role || "")
      .trim()
      .toLowerCase();

    console.log("Detected role (lowercase):", role); // check this in console

    const isCashier = role === "cashier" || role.includes("cashier");
    setCanEdit(!isCashier);
  }, []);

  /* ================= LOAD APP DATE ================= */
  useEffect(() => {
    const loadAppDate = async () => {
      try {
        const res = await authAxios.get("/shop/details");
        const ymd = syncBusinessDate(res?.data?.app_date) || initialYMD;
        setAppDateYMD(ymd);
        setFromDate(ymd);
        setToDate(ymd);
      } catch {
        setAppDateYMD(initialYMD);
      }
    };
    loadAppDate();
  }, []);

  /* ================= LOAD BILLS ================= */
  const loadBills = async () => {
    try {
      setLoading(true);
      const fallbackDate = getBusinessDate();
      const from = formatAPI(fromDate) || fallbackDate;
      const to = formatAPI(toDate) || fallbackDate;
      const res = await authAxios.get("/invoice/list", {
        params: { from_date: from, to_date: to }
      });
      setBills(res.data || []);
    } catch (e) {
      if (e?.response?.status === 401) {
        showToast("Session expired. Please login again.", "error");
        localStorage.removeItem("token");
        navigate("/");
        return;
      }
      showToast("Failed to load bills", "error");
    }
    setLoading(false);
  };

  useEffect(() => {
    loadBills();
  }, [fromDate, toDate]);

  /* ================= FILTER ================= */
  const filtered = bills.filter(b =>
    `${b.invoice_number} ${b.customer_name || ""} ${b.mobile || ""}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  /* ================= OPEN BILL ================= */
  const openBill = async (bill, requestedMode = "view", options = {}) => {
    const { openDelete = false } = options;
    // Cashier → always force view mode
    const canEditAppDate = isAppDateBill(bill.created_time);
    const actualMode = canEdit && canEditAppDate ? requestedMode : "view";

    try {
      const inv = await authAxios.get(`/invoice/by-number/${bill.invoice_number}`);
      const shopRes = await authAxios.get("/shop/details");

      let branchData = {};
      try {
        const s = getSession() || {};
        if (s.branch_id) {
          const brRes = await authAxios.get(`/branch/${s.branch_id}`);
          branchData = brRes.data || {};
        }
      } catch (err) {}

      setActiveBill(inv.data);
      setItems(inv.data.items || []);
      setShop(shopRes.data || {});
      setBranch(branchData);
      setMode(actualMode);
      setDeleteReason("");
      setConfirmDelete(openDelete && actualMode === "edit");
    } catch (e) {
      if (e?.response?.status === 401) {
        showToast("Session expired. Please login again.", "error");
        localStorage.removeItem("token");
        navigate("/");
      } else {
        showToast("Failed to load invoice", "error");
      }
    }
  };

  /* ================= TOTALS ================= */
  const calculateTotals = () => {
    let sub = 0;
    let tax = 0;
    const gstPercent = Number(shop.gst_percent || 0);
    const gstMode = String(shop.gst_mode || "inclusive").toLowerCase();
    items.forEach(i => {
      const lineTotal = i.price * i.quantity;
      sub += lineTotal;
      if (shop.gst_enabled) {
        if (gstMode === "inclusive") {
          const base = lineTotal / (1 + gstPercent / 100);
          tax += lineTotal - base;
        } else {
          tax += lineTotal * (gstPercent / 100);
        }
      }
    });

    const isExclusive = !!shop.gst_enabled && gstMode === "exclusive";
    return { sub, tax, total: isExclusive ? sub + tax : sub };
  };

  const totals = calculateTotals();
  const paymentSplit = activeBill?.payment_split || {};
  const serviceChargeAmount = Number(
    paymentSplit.service_charge ?? paymentSplit.serviceCharge ?? paymentSplit.service_charge_amount ?? 0
  );
  const serviceChargeGstAmount = Number(
    paymentSplit.service_charge_gst ?? paymentSplit.serviceChargeGst ?? paymentSplit.service_charge_gst_amount ?? 0
  );
  const discountedAmt = Number(activeBill?.discounted_amt || 0);
  const billingTotal = totals.total - discountedAmt + serviceChargeAmount + serviceChargeGstAmount;
  const hasServiceCharge = serviceChargeAmount > 0 || serviceChargeGstAmount > 0;

  /* ================= UPDATE QTY ================= */
  const updateQty = (idx, qty) => {
    if (qty < 1) return;
    const clone = [...items];
    clone[idx] = {
      ...clone[idx],
      quantity: qty,
      amount: qty * clone[idx].price
    };
    setItems(clone);
  };

  /* ================= SAVE EDIT ================= */
  const saveEdit = async () => {
    try {
      await authAxios.put(`/invoice/${activeBill.invoice_id}`, {
        customer_name: activeBill.customer_name,
        mobile: activeBill.mobile,
        discounted_amt: activeBill.discounted_amt || 0,
        items: items.map(i => ({
          item_id: i.item_id,
          quantity: i.quantity,
          amount: i.price * i.quantity
        }))
      });
      showToast("Invoice updated successfully", "success");
      setActiveBill(null);
      loadBills();
    } catch {
      showToast("Update failed", "error");
    }
  };

  const removeServiceCharge = async () => {
    try {
      const resp = await authAxios.patch(`/invoice/${activeBill.invoice_id}/remove-service-charge`);
      const updatedSplit = { ...(activeBill.payment_split || {}) };
      delete updatedSplit.service_charge;
      delete updatedSplit.service_charge_gst;
      setActiveBill(prev => ({
        ...prev,
        payment_split: Object.keys(updatedSplit).length ? updatedSplit : null,
        total_amount: resp.data?.new_total ?? prev.total_amount
      }));
      showToast("Service charge removed successfully", "success");
      loadBills();
    } catch (e) {
      const message = e?.response?.data?.detail || "Could not remove service charge";
      showToast(message, "error");
    }
  };

  /* ================= DELETE ================= */
  const deleteBill = async () => {
    if (!deleteReason.trim()) {
      showToast("Delete reason required", "warning");
      return;
    }
    try {
      await authAxios.delete(`/invoice/${activeBill.invoice_id}`, {
        data: { delete_reason: deleteReason }
      });
      showToast("Invoice deleted successfully", "success");
      setConfirmDelete(false);
      setActiveBill(null);
      loadBills();
    } catch {
      showToast("Delete failed", "error");
    }
  };

  /* ================= PRINT ================= */
  const generateBillText = () => {
    const is80mm = (branch?.paper_size || "58mm") === "80mm";
    const WIDTH    = is80mm ? 48 : 32;
    const ITEM_COL = is80mm ? 22 : 14;
    const QTY_COL  = is80mm ? 5  : 4;
    const RATE_COL = is80mm ? 9  : 6;
    const TOTAL_COL = WIDTH - ITEM_COL - QTY_COL - RATE_COL;
    const line = "-".repeat(WIDTH);
    const center = txt => {
      const pad = Math.max(0, Math.floor((WIDTH - txt.length) / 2));
      return " ".repeat(pad) + txt;
    };
    const rightKV = (label, value) => {
      const text = `${label} : ${value}`;
      return " ".repeat(Math.max(0, WIDTH - text.length)) + text;
    };
    let t = "";
    const headerName = branch.branch_name
      ? `${shop.shop_name || "Shop Name"} - ${branch.branch_name}`
      : shop.shop_name || "Shop Name";
    t += center(headerName) + "\n";
    getReceiptAddressLines({ branch, shop }).forEach(l => {
      if (!l) return;
      t += center(String(l)) + "\n";
    });
    if (shop.mobile) t += center(`Ph: ${shop.mobile}`) + "\n";
    if (shop.gst_number) t += center(`GSTIN: ${shop.gst_number}`) + "\n";
    t += line + "\n";
    t += `Invoice No : ${activeBill.invoice_number}\n`;
    const phone = activeBill.mobile || "";
    const isPlaceholder = /^9{9,}$/.test(String(phone));
    t += `Date : ${formatDisplayDate(activeBill.created_time, false)}\n`;
    if (!isPlaceholder) {
      t += `Customer : ${activeBill.customer_name || "Walk-in"}\n`;
      t += `Mobile : ${maskMobileForPrint(phone)}\n`;
    }
    if (activeBill.payment_mode === "split" || activeBill.payment_split) {
      const split = activeBill.payment_split || {};
      const parts = [
        `Cash ${Number(split.cash || 0).toFixed(2)}`,
        `Card ${Number(split.card || 0).toFixed(2)}`,
        `UPI ${Number(split.upi || 0).toFixed(2)}`
      ].join(", ");
      t += `Payment : Split (${parts})\n`;
    } else {
      t += `Payment : ${String(activeBill.payment_mode || "cash").toUpperCase()}\n`;
    }
    t += line + "\n";
    t +=
      "Item".padEnd(ITEM_COL) +
      "Qty".padStart(QTY_COL) +
      "Rate".padStart(RATE_COL) +
      "Total".padStart(TOTAL_COL) +
      "\n";
    t += line + "\n";
    items.forEach(i => {
      const lineTotal = i.price * i.quantity;
      t +=
        i.item_name.slice(0, ITEM_COL).padEnd(ITEM_COL) +
        String(i.quantity).padStart(QTY_COL) +
        i.price.toFixed(2).padStart(RATE_COL) +
        lineTotal.toFixed(2).padStart(TOTAL_COL) +
        "\n";
    });
    t += line + "\n";
    const totalItems = items.reduce((s, it) => s + Number(it.quantity || 0), 0);
    const leftText = `Items: ${totalItems}`;
    const rightText = `Subtotal : ${totals.sub.toFixed(2)}`;
    const gap = Math.max(1, WIDTH - leftText.length - rightText.length);
    t += leftText + " ".repeat(gap) + rightText + "\n";
    if (shop.gst_enabled)
      t += rightKV(`GST ${shop.gst_percent}%`, totals.tax.toFixed(2)) + "\n";

    const serviceCharge = Number(activeBill.payment_split?.service_charge || 0);
    const serviceChargeGst = Number(activeBill.payment_split?.service_charge_gst || 0);
    if (serviceCharge > 0)
      t += rightKV("Service Charge", serviceCharge.toFixed(2)) + "\n";
    if (serviceChargeGst > 0)
      t += rightKV("Service Charge GST", serviceChargeGst.toFixed(2)) + "\n";

    if (activeBill.discounted_amt)
      t += rightKV("Discount", Number(activeBill.discounted_amt).toFixed(2)) + "\n";
    t += rightKV("Grand Total", billingTotal.toFixed(2)) + "\n";
    t += line + "\n";
    const fssai = String(branch?.fssai_number || shop?.fssai_number || "").trim();
    if (fssai) t += center(`FSSAI No: ${fssai}`) + "\n";
    // Footer + 4 blank lines so the final message is always on the same slip
    t += center("Thank You! Visit Again") + "\n" + "\n".repeat(4);
    return t;
  };

  const printInvoice = async () => {
    if (branch?.receipt_required === false) {
      showToast("Receipt printing disabled for this branch", "warning");
      return;
    }
    const qrHtml = await generateFeedbackQrHtml({
      shopId: shop?.shop_id,
      invoiceNo: activeBill?.invoice_number,
      enabled: branch?.feedback_qr_enabled !== false,
    });
    const ok = await printDirectText(generateBillText(), {
      fontSize: 8,
      paperSize: branch?.paper_size || "58mm",
      extraHtml: qrHtml,
    });
    if (!ok) showToast("Printing failed. Check printer/popup settings.", "error");
  };

  /* ================= UI ================= */
  const isViewOnly = !canEdit || mode === "view";

  const totalSales = filtered.reduce((s, b) => s + Number(b.total_amount || 0), 0);

  return (
    <div className="space-y-3">
      <style>{`
        #bill-print-area { display: none; }
        @media print {
          body * { visibility: hidden; }
          #bill-print-area, #bill-print-area * {
            visibility: visible;
            font-family: monospace;
          }
          #bill-print-area {
            display: block;
            position: absolute;
            top: 0;
            left: 0;
            width: 80mm;
            padding: 6px;
          }
        }
      `}</style>

      {/* ── Header bar ── */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => navigate("/home", { replace: true })}
          className="px-3 py-1.5 rounded-lg border bg-white text-[12px] hover:bg-gray-50"
        >
          ← Back
        </button>
        <h2 className="text-base font-semibold text-gray-700 mr-2">Sales History</h2>

        <div className="flex items-center gap-1.5 ml-auto flex-wrap">
          <input
            type="date"
            className="px-2.5 py-1.5 rounded-lg border bg-white text-[12px] focus:outline-none focus:ring-1 focus:ring-indigo-400"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
          />
          <span className="text-xs text-gray-400">to</span>
          <input
            type="date"
            className="px-2.5 py-1.5 rounded-lg border bg-white text-[12px] focus:outline-none focus:ring-1 focus:ring-indigo-400"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
          />
          <input
            className="px-2.5 py-1.5 rounded-lg border bg-white text-[12px] w-52 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            placeholder="Search invoice / customer / mobile"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* ── Summary strip ── */}
      {!loading && filtered.length > 0 && (
        <div className="flex items-center gap-4 px-4 py-2 bg-white border rounded-lg text-sm">
          <span className="text-gray-500">
            Bills: <span className="font-semibold text-gray-800">{filtered.length}</span>
          </span>
          <span className="text-gray-300">|</span>
          <span className="text-gray-500">
            Total: <span className="font-semibold text-emerald-600">₹ {totalSales.toFixed(2)}</span>
          </span>
        </div>
      )}

      {/* ── Bills table ── */}
      {loading ? (
        <div className="py-10 text-center text-sm text-gray-400">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-400">No bills found</div>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-2.5 text-left font-medium">Invoice</th>
                <th className="px-4 py-2.5 text-left font-medium">Customer</th>
                <th className="px-4 py-2.5 text-left font-medium hidden sm:table-cell">Date & Time</th>
                <th className="px-4 py-2.5 text-left font-medium hidden md:table-cell">Payment</th>
                <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                <th className="px-4 py-2.5 text-center font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(b => (
                <tr key={b.invoice_id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5">
                    <span className="font-semibold text-indigo-600 text-xs">{b.invoice_number}</span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-700 text-xs">
                    {b.customer_name || <span className="text-gray-400 italic">Walk-in</span>}
                    {b.mobile && <div className="text-[11px] text-gray-400">{b.mobile}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-[11px] text-gray-400 hidden sm:table-cell">
                    {formatDisplayDate(b.created_time)}
                  </td>
                  <td className="px-4 py-2.5 hidden md:table-cell">
                    <span className="px-2 py-0.5 rounded-full bg-gray-100 text-[11px] text-gray-600 capitalize">
                      {b.payment_mode === "split"
                        ? (() => {
                            const sp = b.payment_split || {};
                            const parts = [
                              Number(sp.cash || 0) > 0 && `Cash`,
                              Number(sp.card || 0) > 0 && `Card`,
                              Number(sp.upi || 0) > 0 && `UPI`,
                              Number(sp.wallet_amount || sp.wallet || 0) > 0 && `Wallet`,
                              Number(sp.gift_card_amount || sp.gift_card || 0) > 0 && `Gift Card`,
                            ].filter(Boolean);
                            return parts.length > 0 ? parts.join(" + ") : "Split";
                          })()
                        : (b.payment_mode || "cash")}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-emerald-600 text-sm">
                    ₹ {Number(b.total_amount).toFixed(2)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => openBill(b, "view")}
                        className="px-2.5 py-1 rounded border text-[11px] text-gray-600 hover:bg-gray-50"
                      >
                        View
                      </button>
                      {canEdit && isAppDateBill(b.created_time) && (
                        <>
                          <button
                            onClick={() => openBill(b, "edit")}
                            className="px-2.5 py-1 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] hover:bg-indigo-100"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => openBill(b, "edit", { openDelete: true })}
                            className="px-2.5 py-1 rounded bg-red-50 text-red-600 border border-red-200 text-[11px] hover:bg-red-100"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ================= MODAL ================= */}
      {activeBill && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-lg rounded-xl shadow-xl flex flex-col max-h-[90vh]">

            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b">
              <div>
                <div className="font-semibold text-gray-800 text-sm">{activeBill.invoice_number}</div>
                <div className="text-[11px] text-gray-400">{formatDisplayDate(activeBill.created_time)}</div>
              </div>
              <button
                onClick={() => setActiveBill(null)}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-lg leading-none"
              >
                ×
              </button>
            </div>

            {/* Modal body – scrollable */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

              {/* Customer info */}
              <div className="grid grid-cols-2 gap-3">
                {isViewOnly ? (
                  <>
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Customer</div>
                      <div className="text-sm text-gray-700">{activeBill.customer_name || "Walk-in"}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Mobile</div>
                      <div className="text-sm text-gray-700">{activeBill.mobile || "—"}</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="text-[10px] text-gray-400 uppercase tracking-wide">Customer</label>
                      <input
                        className="mt-0.5 w-full border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                        value={activeBill.customer_name || ""}
                        onChange={e => setActiveBill(p => ({ ...p, customer_name: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400 uppercase tracking-wide">Mobile</label>
                      <input
                        className="mt-0.5 w-full border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                        value={activeBill.mobile || ""}
                        onChange={e => setActiveBill(p => ({ ...p, mobile: e.target.value }))}
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Items */}
              <div>
                <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1.5">Items</div>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-[11px] text-gray-500 border-b">
                        <th className="px-3 py-2 text-left font-medium">Item</th>
                        <th className="px-3 py-2 text-center font-medium w-20">Qty</th>
                        <th className="px-3 py-2 text-right font-medium w-24">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {items.map((i, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2 font-medium text-gray-800 truncate max-w-[160px]">{i.item_name}</td>
                          <td className="px-3 py-2 text-center">
                            {isViewOnly ? (
                              <span className="font-semibold">{i.quantity}</span>
                            ) : (
                              <input
                                type="number"
                                min="1"
                                value={i.quantity}
                                onChange={e => updateQty(idx, Number(e.target.value))}
                                className="w-14 border rounded-lg text-center py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                              />
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-700">
                            ₹ {(i.price * i.quantity).toFixed(2)}
                            {!isViewOnly && (
                              <button
                                onClick={() => { const clone = [...items]; clone.splice(idx, 1); setItems(clone); }}
                                className="ml-2 text-red-400 hover:text-red-600 text-xs"
                              >✕</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals */}
              <div className="bg-slate-50 rounded-lg px-4 py-3 space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-500">
                  <span>Subtotal</span>
                  <span className="text-gray-700">₹ {totals.sub.toFixed(2)}</span>
                </div>
                {shop.gst_enabled && (
                  <div className="flex justify-between text-gray-500">
                    <span>GST {shop.gst_percent}%</span>
                    <span className="text-gray-700">₹ {totals.tax.toFixed(2)}</span>
                  </div>
                )}
                {serviceChargeAmount > 0 && (
                  <div className="flex justify-between text-gray-500">
                    <span>Service Charge</span>
                    <span className="text-gray-700">₹ {serviceChargeAmount.toFixed(2)}</span>
                  </div>
                )}
                {serviceChargeGstAmount > 0 && (
                  <div className="flex justify-between text-gray-500">
                    <span>Service Charge GST</span>
                    <span className="text-gray-700">₹ {serviceChargeGstAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-500">
                  <span>Discount</span>
                  <span className="text-gray-700">₹ {Number(activeBill.discounted_amt || 0).toFixed(2)}</span>
                </div>
                <div className="border-t pt-2 flex justify-between font-bold text-base">
                  <span>Total</span>
                  <span className="text-emerald-600">₹ {billingTotal.toFixed(2)}</span>
                </div>
              </div>

              {/* Delete reason textarea */}
              {!isViewOnly && confirmDelete && (
                <textarea
                  className="w-full border rounded-lg p-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-red-400"
                  rows={2}
                  placeholder="Reason for delete (required)"
                  value={deleteReason}
                  onChange={e => setDeleteReason(e.target.value)}
                />
              )}

              {isViewOnly && (
                <p className="text-center text-xs text-gray-400">View & Print mode only</p>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-xl">
              <button
                onClick={printInvoice}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium"
              >
                Print
              </button>

              {!isViewOnly && isAppDateBill(activeBill?.created_time) && (
                <>
                  <button
                    onClick={saveEdit}
                    className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium"
                  >
                    Save
                  </button>

                  {!confirmDelete ? (
                    <button
                      onClick={() => setConfirmDelete(true)}
                      className="px-4 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-sm font-medium"
                    >
                      Delete
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={deleteBill}
                        className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium"
                      >
                        Confirm Delete
                      </button>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="px-4 py-1.5 rounded-lg border bg-white text-sm text-gray-600 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </>
              )}
              {hasServiceCharge && canEdit && isAppDateBill(activeBill?.created_time) && (
                <button
                  onClick={removeServiceCharge}
                  className="px-4 py-1.5 rounded-lg bg-yellow-100 hover:bg-yellow-200 text-yellow-800 border border-yellow-200 text-sm font-medium"
                >
                  Remove Service Charge
                </button>
              )}

              <button
                onClick={() => setActiveBill(null)}
                className="px-4 py-1.5 rounded-lg border bg-white text-sm text-gray-600 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div id="bill-print-area">
        <pre ref={printTextRef} style={{ fontSize: "12px" }} />
      </div>
    </div>
  );
}



