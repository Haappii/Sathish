import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "../utils/apiClient";
import { useToast } from "../components/Toast";
import { getSession } from "../utils/auth";
import { getReceiptAddressLines, maskMobileForPrint } from "../utils/receipt";
import { isHotelShop } from "../utils/shopType";

const BLUE = "#0B3C8C";
const DEFAULT_MOBILE = "9999999999";
const PAYMENT_MODES = ["cash", "card", "upi"];
const toAmount = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/* =====================================================
   TIME HELPERS — ONLY FROM table_start_time
   ===================================================== */

// returns minutes since start
const runningMinutes = (tableStartTime) => {
  if (!tableStartTime) return null;

  const start = new Date(tableStartTime).getTime();
  if (isNaN(start)) return null;

  return Math.floor((Date.now() - start) / 60000);
};

// format start time as HH:MM
const formatStartTime = (tableStartTime) => {
  if (!tableStartTime) return "";
  const d = new Date(tableStartTime);
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
  const [tab, setTab] = useState("IDLE");
  const [confirming, setConfirming] = useState(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [hotelAllowed, setHotelAllowed] = useState(null);

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

    return () => {
      mounted = false;
    };
  }, []);

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

    t += "Item".padEnd(22) + "Qty".padStart(4) + "Rate".padStart(10) + "Total".padStart(12) + "\n";
    t += line + "\n";

    items.forEach(i => {
      const name = i.item_name.slice(0, 22).padEnd(22);
      const qty = String(i.quantity).padStart(4);
      const rate = i.price.toFixed(2).padStart(10);
      const total = (i.quantity * i.price).toFixed(2).padStart(12);
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
    t += center("Thank You! Visit Again") + "\n";

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

        if (receiptRequired && printTextRef.current) {
          printTextRef.current.textContent = generateBillText(invoice, shopRes.data || {}, branchData, items);
          setTimeout(() => window.print(), 300);
          showToast("Order completed and invoice printed", "success");
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
  const list = tables.filter(t =>
    tab === "IDLE"
      ? t.status === "FREE"
      : t.status === "OCCUPIED"
  );

  return (
    <div className="w-full h-full flex flex-col">

      <style>{`
        /* Hide print area on screen, show only during print */
        #bill-print-area { display: none; }

        @media print {
          body * { visibility: hidden; }
          #bill-print-area, #bill-print-area * {
            visibility: visible;
            font-family: monospace;
          }
          #bill-print-area {
            display: block !important;
            position: absolute;
            top: 0;
            left: 0;
            width: 80mm;
            padding: 6px;
          }
        }
      `}</style>

      {/* ================= HEADER ================= */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: BLUE }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/home", { replace: true })}
            className="px-3 py-1.5 rounded-lg border bg-white shadow-sm text-[12px]"
          >
            &larr; Back
          </button>
          <h1 className="text-lg font-extrabold" style={{ color: BLUE }}>
            TABLE BILLING
          </h1>
        </div>

        <div className="flex border rounded-md overflow-hidden">
          {["IDLE", "RUNNING"].map(x => (
            <button
              key={x}
              onClick={() => setTab(x)}
              className="px-4 py-1.5 text-xs font-bold"
              style={{
                background: tab === x ? BLUE : "white",
                color: tab === x ? "white" : "black"
              }}
            >
              {x}
            </button>
          ))}
        </div>
      </div>

      {/* ================= TABLE GRID ================= */}
      <div className="flex-1 p-4 overflow-auto">
        <div className="grid grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {list.map(t => {
            const mins = runningMinutes(t.opened_at);

            return (
              <div
                key={t.table_id}
                onClick={() => navigate(`/table-order/${t.table_id}`)}
                className="rounded-lg border px-3 py-2 text-left transition active:scale-[0.97] cursor-pointer"
                style={{
                  borderColor: BLUE,
                  background: t.status === "FREE" ? "white" : "#E8F0FF"
                }}
              >
                {/* HEADER */}
                <div className="flex justify-between items-center">
                  <span
                    className="text-sm font-extrabold"
                    style={{ color: BLUE }}
                  >
                    {t.table_name}
                  </span>

                  <span className="text-[11px] font-semibold">
                    👥 {t.capacity}
                  </span>
                </div>

                {/* BODY */}
                {t.status === "OCCUPIED" ? (
                  <div className="mt-2 space-y-2">
                    <div className="text-[11px] text-black">
                      Started: {formatStartTime(t.opened_at)}
                    </div>

                    <div className="text-[12px] font-semibold text-black">
                      ⏱ {mins ?? 0} min running
                    </div>

                    <div
                      className="text-lg font-extrabold leading-tight"
                      style={{ color: BLUE }}
                    >
                      ₹ {Number(t.running_total || 0).toFixed(0)}
                    </div>

                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          if (!t.order_id) {
                            showToast("No active order for this table", "error");
                            return;
                          }
                          setConfirming({
                            order_id: t.order_id,
                            table: t,
                            customer_name: t.customer_name || "NA",
                            mobile: t.mobile || DEFAULT_MOBILE,
                            service_charge: "",
                            payment_mode: "cash",
                            split_enabled: false,
                            split: { cash: "", card: "", upi: "" }
                          });
                        }}
                        className="px-3 py-1 rounded bg-emerald-600 text-white text-sm"
                      >
                        Complete
                      </button>

                      <button
                        onClick={e => { e.stopPropagation(); navigate(`/table-order/${t.table_id}`); }}
                        className="px-3 py-1.5 rounded-lg border bg-white shadow-sm text-[12px]"
                      >
                        Open
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 text-[11px] text-black">
                    Tap to start
                  </div>
                )}
              </div>
            );
          })}

          {!list.length && (
            <div className="col-span-full text-center text-sm text-black">
              No tables available
            </div>
          )}
        </div>
      </div>

      {/* CONFIRMATION MODAL */}
      {confirming && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold mb-2">Complete Order</h3>
            <p className="text-sm text-gray-600 mb-4">Complete this order and print invoice for table <strong>{confirming.table?.table_name}</strong>?</p>

            <div className="space-y-3 mb-3">
              <div>
                <label className="text-sm text-gray-600">Mobile</label>
                <input
                  inputMode="numeric"
                  maxLength={10}
                  className="w-full border rounded px-2 py-1 mt-1"
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
                <label className="text-sm text-gray-600">Customer Name</label>
                <input
                  className="w-full border rounded px-2 py-1 mt-1"
                  value={confirming.customer_name}
                  onChange={e => setConfirming(c => ({ ...c, customer_name: e.target.value }))}
                  placeholder="Customer name"
                />
              </div>

              <div>
                <label className="text-sm text-gray-600">Service Charge</label>
                <input
                  inputMode="decimal"
                  className="w-full border rounded px-2 py-1 mt-1"
                  value={confirming.service_charge ?? ""}
                  onChange={e => setConfirming(c => ({ ...c, service_charge: e.target.value }))}
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="text-sm text-gray-600">Payment Mode</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {PAYMENT_MODES.map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setConfirming(c => ({ ...c, payment_mode: mode, split_enabled: false }))}
                      className={`px-3 py-1 rounded border text-sm ${
                        confirming.payment_mode === mode && !confirming.split_enabled
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white"
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
                    className={`px-3 py-1 rounded border text-sm ${
                      confirming.split_enabled ? "bg-emerald-600 text-white border-emerald-600" : "bg-white"
                    }`}
                  >
                    SPLIT
                  </button>
                </div>

                {confirming.split_enabled && (
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <input
                      inputMode="decimal"
                      placeholder="Cash"
                      className="border rounded px-2 py-1 text-sm"
                      value={confirming.split?.cash ?? ""}
                      onChange={e =>
                        setConfirming(c => ({
                          ...c,
                          split: { ...c.split, cash: e.target.value }
                        }))
                      }
                    />
                    <input
                      inputMode="decimal"
                      placeholder="Card"
                      className="border rounded px-2 py-1 text-sm"
                      value={confirming.split?.card ?? ""}
                      onChange={e =>
                        setConfirming(c => ({
                          ...c,
                          split: { ...c.split, card: e.target.value }
                        }))
                      }
                    />
                    <input
                      inputMode="decimal"
                      placeholder="UPI"
                      className="border rounded px-2 py-1 text-sm"
                      value={confirming.split?.upi ?? ""}
                      onChange={e =>
                        setConfirming(c => ({
                          ...c,
                          split: { ...c.split, upi: e.target.value }
                        }))
                      }
                    />
                  </div>
                )}
              </div>

              <div className="text-sm text-gray-700 rounded border bg-gray-50 px-2 py-2">
                Base: ₹ {toAmount(confirming.table?.running_total || 0).toFixed(2)}{" "}
                | Service: ₹ {toAmount(confirming.service_charge || 0).toFixed(2)}{" "}
                | Payable: ₹ {(toAmount(confirming.table?.running_total || 0) + toAmount(confirming.service_charge || 0)).toFixed(2)}
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setConfirming(null)}
                  className="px-4 py-2 rounded bg-gray-200"
                >
                  Cancel
                </button>

                <button
                  onClick={() => completeOrder(false)}
                  disabled={checkoutLoading}
                  className="px-4 py-2 rounded bg-blue-600 text-white"
                >
                  {checkoutLoading ? "Processing…" : "Complete"}
                </button>

                <button
                  onClick={() => completeOrder(true)}
                  disabled={checkoutLoading}
                  className="px-4 py-2 rounded bg-emerald-600 text-white"
                >
                  {checkoutLoading ? "Processing…" : "Confirm & Print"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PRINT AREA */}
      <div id="bill-print-area">
        <pre ref={printTextRef} style={{ fontSize: "12px" }} />
      </div>
    </div>
  );
}

