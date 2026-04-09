import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "../utils/apiClient";
import { useToast } from "../components/Toast";
import { getSession } from "../utils/auth";
import { getReceiptAddressLines, maskMobileForPrint } from "../utils/receipt";
import { printDirectText } from "../utils/printDirect";
import { isHotelShop } from "../utils/shopType";

const DEFAULT_MOBILE = "9999999999";
const PAYMENT_MODES = ["cash", "card", "upi"];
const toAmount = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/* =====================================================
   TIME HELPERS — ONLY FROM table_start_time
   ===================================================== */

const parseTableStartTime = (value) => {
  if (!value) return null;

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  if (typeof value === "string") {
    const fallback = new Date(value.replace(" ", "T"));
    if (!Number.isNaN(fallback.getTime())) return fallback;
  }

  return null;
};

const getTableStartTime = (table) =>
  table?.table_start_time || table?.opened_at || null;

// returns minutes since start
const runningMinutes = (tableStartTime) => {
  const start = parseTableStartTime(tableStartTime);
  if (!start) return null;

  return Math.max(0, Math.floor((Date.now() - start.getTime()) / 60000));
};

// format start time as HH:MM
const formatStartTime = (tableStartTime) => {
  const d = parseTableStartTime(tableStartTime);
  if (!d) return "";
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
};

export default function TableGrid() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const session = getSession() || {};
  const branchId = session.branch_id;

  const [tables, setTables] = useState([]);
  const [confirming, setConfirming] = useState(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [hotelAllowed, setHotelAllowed] = useState(
    () => localStorage.getItem("billing_type") === "hotel"
  );
  const [branchInfo, setBranchInfo] = useState({});
  const orderLiveTrackingEnabled = branchInfo?.order_live_tracking_enabled !== false;

  // print ref & helpers
  const printTextRef = useRef(null);

  // 🔥 forces re-render every minute for live timer
  const [, setTick] = useState(0);

  /* ================= LOAD TABLES ================= */
  const loadTables = async () => {
    try {
      const res = await api.get("/table-billing/tables");
      setTables(res.data || []);
    } catch {
      setTables([]);
    }
  };

  useEffect(() => {
    let mounted = true;
    api
      .get("/shop/details")
      .then((res) => {
        if (!mounted) return;
        setHotelAllowed(isHotelShop(res.data || {}));
      })
      .catch(() => {
        if (!mounted) return;
        setHotelAllowed(false);
      });

    if (branchId) {
      api
        .get(`/branch/${branchId}`)
        .then((res) => {
          if (!mounted) return;
          setBranchInfo(res.data || {});
        })
        .catch(() => {
          if (!mounted) return;
          setBranchInfo({});
        });
    }

    return () => {
      mounted = false;
    };
  }, [branchId]);

  useEffect(() => {
    if (!hotelAllowed) return;
    loadTables();

    // refresh data every 8s (amounts, status)
    const apiTimer = setInterval(loadTables, 8000);

    // tick every minute (time display)
    const minuteTimer = setInterval(
      () => setTick(t => t + 1),
      60000
    );

    return () => {
      clearInterval(apiTimer);
      clearInterval(minuteTimer);
    };
  }, [hotelAllowed]);

  if (hotelAllowed === null) {
    return (
      <div className="mt-10 text-center text-sm font-medium text-gray-600">
        Loading table billing...
      </div>
    );
  }

  if (!hotelAllowed) {
    return (
      <div className="mt-10 text-center space-y-3">
        <p className="text-sm font-medium text-red-600">
          Table billing is available only for hotel billing type.
        </p>
        <button
          onClick={() => navigate("/home", { replace: true })}
          className="px-3 py-1.5 rounded-lg border bg-white text-[12px] hover:bg-gray-100"
        >
          Back to Home
        </button>
      </div>
    );
  }

  /* ---------------- PRINT HELPERS ---------------- */
  const parseToDate = v => {
    if (!v) return null;
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
    const d2 = new Date(String(v).replace(" ", "T"));
    if (!isNaN(d2.getTime())) return d2;
    return null;
  };

  const formatDisplayDate = (v, includeSeconds = false) => {
    const d = parseToDate(v);
    if (!d) return "";
    const datePart = d.toLocaleDateString();
    const timeOpts = includeSeconds
      ? { hour: "2-digit", minute: "2-digit", second: "2-digit" }
      : { hour: "2-digit", minute: "2-digit" };
    return `${datePart}, ${d.toLocaleTimeString([], timeOpts)}`;
  };

  // Autofill customer name if mobile found in past invoices
  const fetchCustomerByMobile = async mobile => {
    if (!mobile || mobile.length !== 10) return;
    try {
      const res = await api.get(`/invoice/customer/by-mobile/${mobile}`);
      if (res.data?.customer_name) {
        setConfirming(c => ({
          ...c,
          customer_name: !c.customer_name || c.customer_name === "NA" ? res.data.customer_name : c.customer_name
        }));
        showToast("Customer loaded from previous bill", "success");
      }
    } catch {
      setConfirming(c => ({ ...c }));
    }
  }; 

  const generateBillText = (invoice, shop, branch, items) => {
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

    const headerName = branch?.branch_name
      ? `${shop?.shop_name || "Shop Name"} - ${branch.branch_name}`
      : shop?.shop_name || "Shop Name";
    t += center(headerName) + "\n";
    getReceiptAddressLines({ branch, shop }).forEach(l => {
      if (!l) return;
      t += center(String(l)) + "\n";
    });
    if (shop?.mobile) t += center(`Ph: ${shop.mobile}`) + "\n";
    if (shop?.gst_number) t += center(`GSTIN: ${shop.gst_number}`) + "\n";

    t += line + "\n";
    t += `Invoice No : ${invoice.invoice_number}\n`;
    t += `Date       : ${formatDisplayDate(invoice.created_time, false)}\n`;

    const phone = invoice.mobile || "";
    const isPlaceholder = /^9{9,}$/.test(String(phone));
    if (!isPlaceholder) {
      t += `Customer   : ${invoice.customer_name || "Walk-in"}\n`;
      t += `Mobile     : ${maskMobileForPrint(phone)}\n`;
    }
    if (invoice.payment_mode === "split" || invoice.payment_split) {
      const split = invoice.payment_split || {};
      const parts = [
        `Cash ${Number(split.cash || 0).toFixed(2)}`,
        `Card ${Number(split.card || 0).toFixed(2)}`,
        `UPI ${Number(split.upi || 0).toFixed(2)}`
      ].join(", ");
      t += `Payment   : Split (${parts})\n`;
    } else {
      t += `Payment   : ${String(invoice.payment_mode || "cash").toUpperCase()}\n`;
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
      const name = i.item_name.slice(0, ITEM_COL).padEnd(ITEM_COL);
      const qty = String(i.quantity).padStart(QTY_COL);
      const rate = i.price.toFixed(2).padStart(RATE_COL);
      const total = (i.quantity * i.price).toFixed(2).padStart(TOTAL_COL);
      t += name + qty + rate + total + "\n";
    });

    t += line + "\n";

    const subtotal = items.reduce((s, it) => s + Number(it.amount || 0), 0);
    const totalItems = items.reduce((s, it) => s + Number(it.quantity || 0), 0);
    const leftText = `Items: ${totalItems}`;
    const rightText = `Subtotal : ${subtotal.toFixed(2)}`;
    const gap = Math.max(1, WIDTH - leftText.length - rightText.length);
    t += leftText + " ".repeat(gap) + rightText + "\n";

    if (shop?.gst_enabled)
      t += rightKV(`GST ${shop.gst_percent}%`, (invoice.tax_amt || 0).toFixed(2)) + "\n";

    const serviceCharge = Number(invoice?.payment_split?.service_charge || 0);
    if (serviceCharge > 0) {
      t += rightKV("Service Charge", serviceCharge.toFixed(2)) + "\n";
    }

    if (invoice.discounted_amt)
      t += rightKV("Discount", Number(invoice.discounted_amt).toFixed(2)) + "\n";

    t += rightKV("Grand Total", (invoice.total_amount || 0).toFixed(2)) + "\n";
    t += line + "\n";
    const fssai = String(branch?.fssai_number || shop?.fssai_number || "").trim();
    if (fssai) t += center(`FSSAI No: ${fssai}`) + "\n";
    // Footer + 4 blank lines to keep the message with the same receipt
    t += center("Thank You! Visit Again") + "\n" + "\n".repeat(4);

    return t;
  };


  /* ---------------- COMPLETE ORDER HANDLER ---------------- */
  const completeOrder = async (print = true) => {
    if (!confirming) return;
    if (!confirming.order_id) {
      showToast("No active order found for this table", "error");
      setConfirming(null);
      return;
    }

    // validate mobile
    const mobile = String(confirming.mobile || "").replace(/\D/g, "");
    if (!mobile || mobile.length !== 10) {
      showToast("Enter a valid 10-digit mobile number", "error");
      return;
    }

    const totalAmount = Number(confirming?.table?.running_total || 0);
    const serviceCharge = toAmount(confirming?.service_charge || 0);
    if (serviceCharge < 0) {
      showToast("Service charge cannot be negative", "error");
      return;
    }
    const payableAmount = totalAmount + serviceCharge;
    if (confirming.split_enabled) {
      const splitSum =
        Number(confirming.split?.cash || 0) +
        Number(confirming.split?.card || 0) +
        Number(confirming.split?.upi || 0);
      if (payableAmount > 0 && Math.abs(splitSum - payableAmount) > 0.01) {
        showToast("Split total must match payable amount", "error");
        return;
      }
    } else if (!confirming.payment_mode) {
      showToast("Select a payment mode", "error");
      return;
    }

    setCheckoutLoading(true);

    try {
      const res = await api.post(`/table-billing/order/checkout/${confirming.order_id}`, {
        customer_name: confirming.customer_name || null,
        mobile: mobile,
        service_charge: serviceCharge,
        payment_mode: confirming.split_enabled ? "split" : confirming.payment_mode,
        payment_split: confirming.split_enabled
          ? {
              cash: Number(confirming.split?.cash || 0),
              card: Number(confirming.split?.card || 0),
              upi: Number(confirming.split?.upi || 0)
            }
          : null
      });
      if (!res?.data?.invoice_number) throw new Error("No invoice returned");

      if (print) {
        const invRes = await api.get(`/invoice/by-number/${res.data.invoice_number}`);
        const shopRes = await api.get(`/shop/details`);
        let branchData = {};
        try {
          if (branchId) {
            const br = await api.get(`/branch/${branchId}`);
            branchData = br.data || {};
          }
        } catch {
          branchData = {};
        }

        const invoice = invRes.data || {};
        const items = invoice.items || [];

        const receiptRequired = branchData?.receipt_required !== false;

        if (receiptRequired) {
          const ok = await printDirectText(
            generateBillText(invoice, shopRes.data || {}, branchData, items),
            { fontSize: 6, paperSize: branchData?.paper_size || "58mm" }
          );
          if (ok) {
            showToast("Order completed and invoice printed", "success");
          } else {
            showToast("Order completed but printing failed", "warning");
          }
        } else {
          showToast("Order completed", "success");
        }
      } else {
        showToast("Order completed", "success");
      }

      setConfirming(null);
      await loadTables();
    } catch (err) {
      showToast(err?.response?.data?.detail || "Checkout failed", "error");
    }

    setCheckoutLoading(false);
  };


  /* ================= FILTER ================= */
  const list = tables;

  const freeCount = tables.filter(t => t.status === "FREE").length;
  const occupiedCount = tables.filter(t => t.status === "OCCUPIED").length;
  const paidCount = tables.filter(t => t.status === "PAID").length;

  return (
    <div className="space-y-3">

      <style>{`
        #bill-print-area { display: none; }
        @media print {
          body * { visibility: hidden; }
          #bill-print-area, #bill-print-area * { visibility: visible; font-family: monospace; }
          #bill-print-area { display: block !important; position: absolute; top: 0; left: 0; width: 80mm; padding: 6px; }
        }
      `}</style>

      {/* ── Header ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => navigate("/home", { replace: true })}
          className="px-3 py-1.5 rounded-lg border bg-white text-[12px] hover:bg-gray-50"
        >
          ← Back
        </button>
        <h1 className="text-base font-semibold text-gray-700">Table Billing</h1>

        <div className="ml-auto flex items-center gap-3 text-xs text-gray-600">
          {orderLiveTrackingEnabled && (
            <>
              <button
                type="button"
                onClick={() => navigate("/order-live")}
                className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 font-semibold text-blue-700 hover:bg-blue-100 transition"
              >
                Order Live
              </button>
              <button
                type="button"
                onClick={() => navigate("/kot")}
                className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-semibold text-amber-700 hover:bg-amber-100 transition"
              >
                Manage Status
              </button>
            </>
          )}
          <div className="rounded-full border border-gray-200 bg-white px-3 py-1">
            Free: <span className="font-semibold text-gray-900">{freeCount}</span>
          </div>
          <div className="rounded-full border border-gray-200 bg-white px-3 py-1">
            Occupied: <span className="font-semibold text-gray-900">{occupiedCount}</span>
          </div>
          <div className="rounded-full border border-gray-200 bg-white px-3 py-1">
            Paid: <span className="font-semibold text-gray-900">{paidCount}</span>
          </div>
          <div className="rounded-full border border-gray-200 bg-white px-3 py-1">
            Total: <span className="font-semibold text-gray-900">{tables.length}</span>
          </div>
        </div>
      </div>

      {/* ── Table grid ── */}
      {list.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400">No tables available</div>
      ) : (
        (() => {
          // Group tables by category
          const grouped = {};
          list.forEach(t => {
            const cat = t.category_name || "Uncategorized";
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(t);
          });

          return Object.keys(grouped).map(catName => (
            <div key={catName} className="space-y-2">
              <h2 className="text-sm font-semibold text-gray-700 border-b pb-1">{catName}</h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {grouped[catName].map(t => {
                  const tableStartTime = getTableStartTime(t);
                  const mins = runningMinutes(tableStartTime);
                  const isOccupied = t.status === "OCCUPIED";
                  const isPaid = t.status === "PAID";

                  return (
                    <div
                      key={t.table_id}
                      onClick={async () => {
                        if (isPaid) {
                          try {
                            await api.patch(`/tables/${t.table_id}/status`, { status: "FREE" });
                            await loadTables();
                            showToast("Table cleared", "success");
                          } catch (err) {
                            showToast("Failed to clear table", "error");
                          }
                        } else {
                          navigate(`/table-order/${t.table_id}`);
                        }
                      }}
                      className={`rounded-xl border cursor-pointer transition active:scale-[0.97] overflow-hidden ${
                        isOccupied
                          ? "border-orange-200 bg-orange-50"
                          : isPaid
                          ? "border-green-200 bg-green-50"
                          : "border-gray-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/30"
                      }`}
                    >
                      {/* Card header */}
                      <div className={`px-3 py-2 flex items-start justify-between gap-3 ${
                        isOccupied ? "bg-orange-100" : isPaid ? "bg-green-100" : "bg-gray-50"
                      }`}>
                        <div className="min-w-0">
                          <div className={`text-sm font-bold truncate ${
                            isOccupied ? "text-orange-700" : isPaid ? "text-green-700" : "text-indigo-700"
                          }`}>
                            {t.table_name}
                          </div>
                          <div className="text-[10px] text-gray-500">
                            {t.capacity} seats
                          </div>
                        </div>
                        <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${
                          isOccupied ? "bg-orange-100 text-orange-700" : isPaid ? "bg-green-100 text-green-700" : "bg-indigo-100 text-indigo-700"
                        }`}>
                          {isOccupied ? "Occupied" : isPaid ? "Paid" : "Free"}
                        </span>
                      </div>

                      {/* Card body */}
                      <div className="px-3 py-2.5">
                        {isOccupied ? (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-gray-500">{formatStartTime(tableStartTime)}</span>
                              <span className="text-[10px] text-orange-600 font-medium">{mins ?? 0}m</span>
                            </div>
                            <div className="text-lg font-bold text-gray-800 leading-none">
                              ₹{Number(t.running_total || 0).toFixed(0)}
                            </div>
                            <div className="flex gap-1.5 pt-1" onClick={e => e.stopPropagation()}>
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  if (!t.order_id) { showToast("No active order for this table", "error"); return; }
                                  setConfirming({
                                    order_id: t.order_id,
                                    table: t,
                                    customer_name: t.customer_name || "NA",
                                    mobile: t.mobile || DEFAULT_MOBILE,
                                    service_charge: branchInfo?.service_charge_required
                                      ? toAmount(branchInfo?.service_charge_amount || 0)
                                      : 0,
                                    payment_mode: "cash",
                                    split_enabled: false,
                                    split: { cash: "", card: "", upi: "" }
                                  });
                                }}
                                className="flex-1 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold"
                              >
                                Complete
                              </button>
                              <button
                                onClick={e => { e.stopPropagation(); navigate(`/table-order/${t.table_id}`); }}
                                className="flex-1 py-1 rounded-lg border bg-white hover:bg-gray-50 text-[11px] text-gray-600"
                              >
                                Open
                              </button>
                            </div>
                          </div>
                        ) : isPaid ? (
                          <div className="py-2 text-center text-[11px] text-green-600 font-medium">
                            Tap to clear
                          </div>
                        ) : (
                          <div className="py-2 text-center text-[11px] text-gray-400">
                            Tap to start
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ));
        })()
      )}

      {/* ── Checkout modal ── */}
      {confirming && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-xl shadow-xl flex flex-col max-h-[90vh]">

            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b">
              <div>
                <div className="font-semibold text-gray-800 text-sm">Complete Order</div>
                <div className="text-[11px] text-gray-400">Table: {confirming.table?.table_name}</div>
              </div>
              <button
                onClick={() => setConfirming(null)}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-lg leading-none"
              >×</button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">

              <div>
                <label className="text-[10px] text-gray-400 uppercase tracking-wide">Mobile</label>
                <input
                  inputMode="numeric"
                  maxLength={10}
                  className="mt-0.5 w-full border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  value={confirming.mobile}
                  onFocus={() => { if (confirming.mobile === DEFAULT_MOBILE) setConfirming(c => ({ ...c, mobile: "" })); }}
                  onChange={e => {
                    const v = e.target.value.replace(/\D/g, "");
                    setConfirming(c => ({ ...c, mobile: v }));
                    if (v.length === 10) fetchCustomerByMobile(v);
                  }}
                  onBlur={e => {
                    const v = (e.target.value || "").replace(/\D/g, "");
                    if (v.length === 10) fetchCustomerByMobile(v);
                    if (!v) setConfirming(c => ({ ...c, mobile: DEFAULT_MOBILE }));
                  }}
                  placeholder="10-digit mobile"
                />
              </div>

              <div>
                <label className="text-[10px] text-gray-400 uppercase tracking-wide">Customer Name</label>
                <input
                  className="mt-0.5 w-full border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  value={confirming.customer_name}
                  onChange={e => setConfirming(c => ({ ...c, customer_name: e.target.value }))}
                  placeholder="Customer name"
                />
              </div>

              <div>
                <label className="text-[10px] text-gray-400 uppercase tracking-wide mb-1.5 block">Payment Mode</label>
                <div className="flex flex-wrap gap-2">
                  {PAYMENT_MODES.map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setConfirming(c => ({ ...c, payment_mode: mode, split_enabled: false }))}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${
                        confirming.payment_mode === mode && !confirming.split_enabled
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-white text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {mode.toUpperCase()}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setConfirming(c => ({
                      ...c,
                      split_enabled: !c.split_enabled,
                      payment_mode: !c.split_enabled ? "" : c.payment_mode
                    }))}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${
                      confirming.split_enabled
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    SPLIT
                  </button>
                </div>

                {confirming.split_enabled && (
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {["cash", "card", "upi"].map(field => (
                      <input
                        key={field}
                        inputMode="decimal"
                        placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
                        className="border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                        value={confirming.split?.[field] ?? ""}
                        onChange={e => setConfirming(c => ({ ...c, split: { ...c.split, [field]: e.target.value } }))}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Payable summary */}
              <div className="bg-slate-50 rounded-lg px-3.5 py-2.5 text-sm space-y-1">
                <div className="flex justify-between text-gray-500">
                  <span>Base</span>
                  <span>₹ {toAmount(confirming.table?.running_total || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Service Charge</span>
                  <span>₹ {toAmount(confirming.service_charge || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold border-t pt-1.5 text-base">
                  <span>Payable</span>
                  <span className="text-emerald-600">
                    ₹ {(toAmount(confirming.table?.running_total || 0) + toAmount(confirming.service_charge || 0)).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-xl">
              <button
                onClick={() => setConfirming(null)}
                className="px-4 py-1.5 rounded-lg border bg-white text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => completeOrder(false)}
                disabled={checkoutLoading}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium disabled:opacity-60"
              >
                {checkoutLoading ? "Processing…" : "Complete"}
              </button>
              <button
                onClick={() => completeOrder(true)}
                disabled={checkoutLoading}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium disabled:opacity-60"
              >
                {checkoutLoading ? "Processing…" : "Complete & Print"}
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

