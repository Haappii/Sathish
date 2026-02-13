import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import authAxios from "../api/authAxios";
import { useToast } from "../components/Toast";
import { getSession } from "../utils/auth";
import { getReceiptAddressLines, maskMobileForPrint } from "../utils/receipt";

export default function SalesHistory() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const printTextRef = useRef(null);

  /* ================= DATE ================= */
  const today = new Date();
  const pad = n => String(n).padStart(2, "0");
  const initialYMD = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

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

  const isTodayBill = (dateValue) => {
    const d = parseToDate(dateValue);
    if (!d) return false;
    return d.toDateString() === today.toDateString();
  };

  const isDefaultRange =
    fromDate === initialYMD && toDate === initialYMD;

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

  /* ================= LOAD BILLS ================= */
  const loadBills = async () => {
    try {
      setLoading(true);
      const from = formatAPI(fromDate) || formatAPI(new Date());
      const to = formatAPI(toDate) || formatAPI(new Date());
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
    (!isDefaultRange || isTodayBill(b.created_time)) &&
    `${b.invoice_number} ${b.customer_name || ""} ${b.mobile || ""}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  /* ================= OPEN BILL ================= */
  const openBill = async (bill, requestedMode = "view", options = {}) => {
    const { openDelete = false } = options;
    // Cashier → always force view mode
    const canEditToday = isTodayBill(bill.created_time);
    const actualMode = canEdit && canEditToday ? requestedMode : "view";

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
    const WIDTH = 48;
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
      "Item".padEnd(22) +
      "Qty".padStart(4) +
      "Rate".padStart(10) +
      "Total".padStart(12) +
      "\n";
    t += line + "\n";
    items.forEach(i => {
      const lineTotal = i.price * i.quantity;
      t +=
        i.item_name.slice(0, 22).padEnd(22) +
        String(i.quantity).padStart(4) +
        i.price.toFixed(2).padStart(10) +
        lineTotal.toFixed(2).padStart(12) +
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
    if (activeBill.discounted_amt)
      t += rightKV("Discount", Number(activeBill.discounted_amt).toFixed(2)) + "\n";
    t += rightKV("Grand Total", totals.total.toFixed(2)) + "\n";
    t += line + "\n";
    t += center("Thank You! Visit Again") + "\n";
    return t;
  };

  const printInvoice = () => {
    if (!printTextRef.current) return;
    printTextRef.current.textContent = generateBillText();
    setTimeout(() => window.print(), 300);
  };

  /* ================= UI ================= */
  const isViewOnly = !canEdit || mode === "view";

  return (
    <div className="min-h-screen bg-slate-100 p-5 space-y-5">
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

      <h2 className="text-xl font-semibold">Sales History</h2>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <button
          onClick={() => navigate("/home", { replace: true })}
          className="px-3 py-1.5 rounded-lg border bg-white shadow-sm text-[12px]"
        >
          &larr; Back
        </button>
        <div className="flex gap-2">
          <input
            type="date"
            className="px-3 py-1.5 rounded-lg border bg-white shadow-sm text-[12px]"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
          />
          <input
            type="date"
            className="px-3 py-1.5 rounded-lg border bg-white shadow-sm text-[12px]"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
          />
        </div>
      </div>

      <input
        className="w-full px-4 py-2 border rounded-xl"
        placeholder="Search invoice / customer / mobile"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {loading ? (
        <p>Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-400">No bills found</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {filtered.map(b => (
            <div key={b.invoice_id} className="bg-white rounded-2xl border p-4">
              <p className="text-xs text-gray-400">Invoice</p>
              <p className="font-semibold">{b.invoice_number}</p>
              <p className="text-xs text-gray-400">{formatDisplayDate(b.created_time)}</p>
              <p className="text-sm text-gray-600">
                {b.customer_name || "Walk-in Customer"}
              </p>
              <p className="font-bold text-emerald-600 mt-2">
                ₹ {Number(b.total_amount).toFixed(2)}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => openBill(b, "view")}
                  className="px-3 py-1.5 rounded-lg border bg-white shadow-sm text-[12px]"
                >
                  View
                </button>
                {canEdit && isTodayBill(b.created_time) && (
                  <>
                    <button
                      onClick={() => openBill(b, "edit")}
                      className="px-3 py-1 rounded bg-blue-600 text-white"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => openBill(b, "edit", { openDelete: true })}
                      className="px-3 py-1 rounded bg-red-600 text-white"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ================= MODAL ================= */}
      {activeBill && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white max-w-md w-full rounded-2xl p-6">
            <div className="flex justify-between mb-4">
              <h3 className="text-xl font-semibold">
                {activeBill.invoice_number}
              </h3>
              <button onClick={() => setActiveBill(null)}>✕</button>
            </div>

            {/* CUSTOMER */}
            {isViewOnly ? (
              <>
                <p className="text-sm text-gray-600">
                  Customer: {activeBill.customer_name || "Walk-in"}
                </p>
                <p className="text-sm text-gray-600">
                  Mobile: {activeBill.mobile || "-"}
                </p>
              </>
            ) : (
              <>
                <input
                  className="w-full border rounded px-2 py-1 mb-1"
                  value={activeBill.customer_name || ""}
                  onChange={e =>
                    setActiveBill(p => ({
                      ...p,
                      customer_name: e.target.value
                    }))
                  }
                />
                <input
                  className="w-full border rounded px-2 py-1"
                  value={activeBill.mobile || ""}
                  onChange={e =>
                    setActiveBill(p => ({ ...p, mobile: e.target.value }))
                  }
                />
              </>
            )}

            {/* ITEMS */}
            <div className="divide-y">
              {items.map((i, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-[1fr_80px_100px] items-center py-2 text-sm"
                >
                  <div className="font-medium truncate">{i.item_name}</div>
                  <div className="text-center">
                    {isViewOnly ? (
                      <span className="font-semibold">{i.quantity}</span>
                    ) : (
                      <input
                        type="number"
                        min="1"
                        value={i.quantity}
                        onChange={e =>
                          updateQty(idx, Number(e.target.value))
                        }
                        className="w-14 border rounded-md text-center"
                      />
                    )}
                  </div>
                  <div className="text-right font-semibold">
                    ₹ {(i.price * i.quantity).toFixed(2)}
                    {!isViewOnly && (
                      <button
                        onClick={() => {
                          const clone = [...items];
                          clone.splice(idx, 1);
                          setItems(clone);
                        }}
                        className="ml-2 text-red-600"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* TOTAL BREAKDOWN */}
            <div className="mt-4 bg-slate-100 rounded-xl px-4 py-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Subtotal</span>
                <span>₹ {totals.sub.toFixed(2)}</span>
              </div>
              {shop.gst_enabled && (
                <div className="flex justify-between">
                  <span className="text-gray-600">
                    GST {shop.gst_percent}%
                  </span>
                  <span>₹ {totals.tax.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600">Discount</span>
                <span>
                  ₹ {Number(activeBill.discounted_amt || 0).toFixed(2)}
                </span>
              </div>
              <div className="border-t pt-2 mt-2 flex justify-between font-bold">
                <span>Payable</span>
                <span className="text-emerald-700">
                  ₹ {totals.total.toFixed(2)}
                </span>
              </div>
            </div>

            {/* ACTIONS - Print always visible, others only for editors */}
            <div className="mt-6 flex justify-end gap-4 flex-wrap">
              <button
                onClick={printInvoice}
                className="px-4 py-2 bg-emerald-600 text-white rounded"
              >
                Print
              </button>

              {!isViewOnly && isTodayBill(activeBill?.created_time) && (
                <>
                  <button
                    onClick={saveEdit}
                    className="px-4 py-2 bg-blue-600 text-white rounded"
                  >
                    Save
                  </button>

                  {!confirmDelete ? (
                    <button
                      onClick={() => setConfirmDelete(true)}
                      className="px-4 py-2 bg-red-600 text-white rounded"
                    >
                      Delete
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={deleteBill}
                        className="px-4 py-2 bg-red-700 text-white rounded"
                      >
                        Confirm Delete
                      </button>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="px-4 py-2 bg-gray-300 rounded"
                      >
                        Cancel
                      </button>
                    </>
                  )}

                  {confirmDelete && (
                    <textarea
                      className="w-full border rounded mt-4 p-2"
                      placeholder="Reason for delete (required)"
                      value={deleteReason}
                      onChange={e => setDeleteReason(e.target.value)}
                    />
                  )}
                </>
              )}
            </div>

            {isViewOnly && (
              <p className="text-center text-sm text-gray-500 mt-4">
                View & Print mode only
              </p>
            )}
          </div>
        </div>
      )}

      <div id="bill-print-area">
        <pre ref={printTextRef} style={{ fontSize: "12px" }} />
      </div>
    </div>
  );
}



