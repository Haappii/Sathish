import { useParams, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useState, useRef } from "react";
import api from "../utils/apiClient";
import { API_BASE } from "../config/api";
import { useToast } from "../components/Toast";
import { getSession } from "../utils/auth";
import { getReceiptAddressLines, maskMobileForPrint } from "../utils/receipt";
import { isHotelShop } from "../utils/shopType";


const DEFAULT_MOBILE = "9999999999";
const PAYMENT_MODES = ["cash", "card", "upi"];
const toAmount = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export default function TableOrder() {
  const { orderId: tableId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const printTextRef = useRef(null);
  const kotPrintRef = useRef(null);

  const [orderId, setOrderId] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);

  const [activeCat, setActiveCat] = useState("ALL");
  const [search, setSearch] = useState("");
  const [categorySearch, setCategorySearch] = useState("");

  const [customer, setCustomer] = useState({
    mobile: DEFAULT_MOBILE,
    name: "NA",
    gst_number: "",
  });
  const [loading, setLoading] = useState(true);
  const [hotelAllowed, setHotelAllowed] = useState(null);
  const [shop, setShop] = useState({});
  const [branch, setBranch] = useState({});
  const [tableName, setTableName] = useState("");
  const [completing, setCompleting] = useState(false);
  const [paymentMode, setPaymentMode] = useState("cash");
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [split, setSplit] = useState({ cash: "", card: "", upi: "" });
  const [serviceCharge, setServiceCharge] = useState("");
  const [showTotals, setShowTotals] = useState(false);

  const errorDetail = (err, fallback) =>
    err?.response?.data?.detail || fallback;

  /* ================= LOAD ================= */
  const loadOrder = useCallback(async () => {
    const res = await api.get(`/table-billing/order/by-table/${tableId}`);
    setOrderId(res.data.order_id);
    setOrderItems(res.data.items || []);
    setTableName(res.data.table_name || res.data.table?.table_name || "");
  }, [tableId]);

  const loadData = useCallback(async (shopData = null) => {
    const [c, i] = await Promise.all([
      api.get("/category/"),
      api.get("/items/"),
    ]);
    setCategories(c.data || []);
    setItems(i.data || []);
    setShop(shopData || {});
    const session = getSession() || {};
    if (session.branch_id) {
      try {
        const br = await api.get(`/branch/${session.branch_id}`);
        setBranch(br.data || {});
      } catch {
        setBranch({});
      }
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const shopRes = await api.get("/shop/details");
        const shopData = shopRes.data || {};
        const allowed = isHotelShop(shopData);
        if (mounted) {
          setShop(shopData);
          setHotelAllowed(allowed);
        }
        if (!allowed) return;

        await Promise.all([loadOrder(), loadData(shopData)]);
      } catch (err) {
        if (mounted) setHotelAllowed(false);
        showToast(errorDetail(err, "Failed to load table order"), "error");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [loadOrder, loadData, showToast]);

  /* ================= CUSTOMER AUTO FILL ================= */
  const fetchCustomerByMobile = async mobile => {
    if (!mobile || mobile.length < 10) return;

    try {
      const res = await api.get(
        `/table-billing/latest-by-mobile/${mobile}`
      );
      setCustomer({
        mobile: res.data.mobile,
        name: res.data.customer_name
      });
      showToast("Customer found", "success");
    } catch {
      setCustomer(p => ({ ...p, name: "" }));
    }
  };

  /* ---------------- DATE HELPERS ---------------- */
  const parseToDate = v => {
    if (!v) return null;
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
    const d2 = new Date(String(v).replace(" ", "T"));
    if (!isNaN(d2.getTime())) return d2;
    return null;
  };

  const formatDisplayDate = (v, includeSeconds = false) => {
    const d = parseToDate(v || new Date());
    if (!d) return "";
    const datePart = d.toLocaleDateString();
    const timeOpts = includeSeconds
      ? { hour: "2-digit", minute: "2-digit", second: "2-digit" }
      : { hour: "2-digit", minute: "2-digit" };
    return `${datePart}, ${d.toLocaleTimeString([], timeOpts)}`;
  }; 

  /* ================= FILTER ================= */
  const filteredItems = items.filter(i =>
    i.item_name.toLowerCase().includes(search.toLowerCase()) &&
    (activeCat === "ALL" || i.category_id === activeCat)
  );
  const filteredCategories = categories.filter(c =>
    String(c.category_name || "").toLowerCase().includes(categorySearch.toLowerCase())
  );

  /* ================= ACTIONS ================= */
  const addItem = async id => {
    await api.post("/table-billing/order/item/add", null, {
      params: { order_id: orderId, item_id: id, qty: 1 }
    });
    await loadOrder();
  };

  const changeQty = async (id, delta) => {
    await api.post("/table-billing/order/item/add", null, {
      params: { order_id: orderId, item_id: id, qty: delta }
    });
    await loadOrder();
  };

  /* ================= PRINT ================= */
  const generateBillText = ({
    invoiceNumber,
    invoiceCreatedAt,
    invoiceItems,
    invoiceTax,
    invoiceServiceCharge,
    invoiceDiscount,
    invoiceTotal,
  }) => {
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
    t += `Invoice No : ${invoiceNumber}\n`;
    t += `Date       : ${formatDisplayDate(invoiceCreatedAt || new Date(), false)}\n`;
    const isPlaceholder = /^9{9,}$/.test(String(customer.mobile || ""));
    if (!isPlaceholder) {
      t += `Customer   : ${customer.name || "Walk-in"}\n`;
      t += `Mobile     : ${maskMobileForPrint(customer.mobile || "")}\n`;
    }
    if (splitEnabled) {
      const parts = [
        `Cash ${Number(split.cash || 0).toFixed(2)}`,
        `Card ${Number(split.card || 0).toFixed(2)}`,
        `UPI ${Number(split.upi || 0).toFixed(2)}`
      ].join(", ");
      t += `Payment   : Split (${parts})\n`;
    } else {
      t += `Payment   : ${String(paymentMode || "cash").toUpperCase()}\n`;
    }
    t += line + "\n";

    t +=
      "Item".padEnd(22) +
      "Qty".padStart(4) +
      "Rate".padStart(10) +
      "Total".padStart(12) +
      "\n";

    t += line + "\n";

    const rows = Array.isArray(invoiceItems) ? invoiceItems : [];
    rows.forEach(i => {
      const name = i.item_name.slice(0, 22).padEnd(22);
      const qty = String(i.quantity).padStart(4);
      const rate = Number(i.price || 0).toFixed(2).padStart(10);
      const total = (Number(i.quantity || 0) * Number(i.price || 0)).toFixed(2).padStart(12);
      t += name + qty + rate + total + "\n";
    });

    t += line + "\n";

    const subtotal = rows.reduce(
      (s, it) =>
        s +
        (it.amount != null
          ? Number(it.amount || 0)
          : Number(it.price || 0) * Number(it.quantity || 0)),
      0
    );
    const totalItems = rows.reduce((s, it) => s + Number(it.quantity || 0), 0);
    const leftText = `Items: ${totalItems}`;
    const rightText = `Subtotal : ${subtotal.toFixed(2)}`;
    const gap = Math.max(1, WIDTH - leftText.length - rightText.length);
    t += leftText + " ".repeat(gap) + rightText + "\n";

    if (shop?.gst_enabled)
      t += rightKV(`GST ${shop.gst_percent}%`, Number(invoiceTax || 0).toFixed(2)) + "\n";

    if (Number(invoiceServiceCharge || 0) > 0)
      t += rightKV("Service Charge", Number(invoiceServiceCharge || 0).toFixed(2)) + "\n";

    if (invoiceDiscount)
      t += rightKV("Discount", Number(invoiceDiscount || 0).toFixed(2)) + "\n";

    t += rightKV(
      "Grand Total",
      Number(invoiceTotal != null ? invoiceTotal : subtotal).toFixed(2)
    ) + "\n";
    t += line + "\n";
    t += center("Thank You! Visit Again") + "\n";

    return t;
  }; 

  const printInvoice = async invoiceNo => {
    if (!printTextRef.current || !invoiceNo) return;
    const res = await api.get(`/invoice/by-number/${invoiceNo}`);
    const invoice = res.data || {};
    printTextRef.current.textContent = generateBillText({
      invoiceNumber: invoice.invoice_number || invoiceNo,
      invoiceCreatedAt: invoice.created_time,
      invoiceItems: invoice.items || orderItems,
      invoiceTax: invoice.tax_amt,
      invoiceServiceCharge: invoice?.payment_split?.service_charge ?? toAmount(serviceCharge || 0),
      invoiceDiscount: invoice.discounted_amt,
      invoiceTotal: invoice.total_amount,
    });
    setTimeout(() => window.print(), 300);
  };

  const generateKOTText = kotItems => {
    const WIDTH = 32;
    const NAME_COL = 22;
    const COUNT_COL = 8;
    const line = "-".repeat(WIDTH);
    const center = txt =>
      " ".repeat(Math.max(0, Math.floor((WIDTH - txt.length) / 2))) + txt;
    const rightCol = (txt, width) =>
      " ".repeat(Math.max(0, width - txt.length)) + txt;
    const headerName = branch.branch_name
      ? `${shop.shop_name || "Shop Name"} - ${branch.branch_name}`
      : shop.shop_name || "Shop Name";
    let t = "";
    t += center(headerName) + "\n";
    t += center("Date & Time") + "\n";
    t += center(new Date().toLocaleString()) + "\n";
    t += center(tableName ? `Table ${tableName}` : "Table Billing") + "\n";
    t += line + "\n";
    t += "Item Name".padEnd(NAME_COL) + rightCol("Item Count", COUNT_COL) + "\n";
    t += line + "\n";
    const rows = Array.isArray(kotItems) ? kotItems : [];
    rows.forEach(it => {
      const name = String(it.item_name || "").slice(0, NAME_COL).padEnd(NAME_COL);
      const count = String(Number(it.quantity || 0));
      t += name + rightCol(count, COUNT_COL) + "\n";
    });
    t += line + "\n";
    const totalCount = rows.reduce((sum, it) => sum + Number(it.quantity || 0), 0);
    t += center(`Total Count - ${totalCount}`) + "\n";
    t += line + "\n";
    return t;
  };

  const printKOT = kotItems => {
    const rows = (Array.isArray(kotItems) ? kotItems : []).filter(
      it => Number(it.quantity || 0) > 0
    );
    if (!rows.length) {
      showToast("Add items before printing KOT", "warning");
      return;
    }
    if (!kotPrintRef.current) return;
    kotPrintRef.current.textContent = generateKOTText(rows);
    const w = window.open("", "KOT_PRINT");
    if (!w) {
      showToast("Popup blocked. Allow popups to print KOT.", "warning");
      return;
    }
    w.document.write("<pre style='font-family: monospace; font-size: 12px;'>" + kotPrintRef.current.textContent + "</pre>");
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.print();
      w.close();
    }, 200);
  };

  const confirmOrderAndPrintKOT = async () => {
    try {
      const kotRequired = branch?.kot_required !== false;
      const confirmPrint = window.confirm(kotRequired ? "Confirm order and print KOT?" : "Confirm order?");
      if (!confirmPrint) return;
      const res = await api.get(`/table-billing/order/by-table/${tableId}`);
      const latestItems = Array.isArray(res.data?.items) ? res.data.items : [];
      setOrderItems(latestItems);
      if (!latestItems.length) {
        showToast("Add items before confirming order", "warning");
        return;
      }
      if (kotRequired) {
        printKOT(latestItems);
        showToast("Order confirmed and KOT printed", "success");
      } else {
        showToast("Order confirmed", "success");
      }
    } catch (err) {
      showToast(errorDetail(err, "Failed to confirm order"), "error");
    }
  };

  /* ================= COMPLETE ORDER ================= */
  const completeOrder = async (print = true) => {
    setCompleting(true);
    try {
      const mobile = String(customer.mobile || "").replace(/\D/g, "");
      if (mobile.length !== 10) {
        showToast("Enter a valid 10-digit mobile number", "error");
        setCompleting(false);
        return;
      }
      if (!String(customer.name || "").trim()) {
        showToast("Customer name is required", "error");
        setCompleting(false);
        return;
      }

      const splitSum =
        Number(split.cash || 0) +
        Number(split.card || 0) +
        Number(split.upi || 0);
      const serviceChargeValue = toAmount(serviceCharge || 0);
      if (serviceChargeValue < 0) {
        showToast("Service charge cannot be negative", "error");
        setCompleting(false);
        return;
      }
      const payableTotal = total + serviceChargeValue;

      if (splitEnabled) {
        if (Math.abs(splitSum - payableTotal) > 0.01) {
          showToast("Split total must match payable amount", "error");
          setCompleting(false);
          return;
        }
      } else if (!paymentMode) {
        showToast("Select a payment mode", "error");
        setCompleting(false);
        return;
      }

      const res = await api.post(
        `/table-billing/order/checkout/${orderId}`,
        {
          customer_name: String(customer.name || "").trim(),
          mobile: mobile,
          service_charge: serviceChargeValue,
          payment_mode: splitEnabled ? "split" : paymentMode,
          payment_split: splitEnabled
            ? {
                cash: Number(split.cash || 0),
                card: Number(split.card || 0),
                upi: Number(split.upi || 0)
              }
            : null
        }
      );

      const receiptRequired = branch?.receipt_required !== false;
      if (print && receiptRequired) {
        // AUTO PRINT AFTER COMPLETION
        await printInvoice(res.data.invoice_number);
        showToast("Order completed and invoice printed", "success");
      } else if (print && !receiptRequired) {
        showToast("Order completed", "success");
      } else {
        showToast("Order completed", "success");
      }

      setTimeout(() => {
        navigate("/table-billing");
      }, 500);
    } catch (err) {
      showToast(errorDetail(err, "Checkout failed"), "error");
    }

    setCompleting(false);
  };

  const cancelTable = async () => {
    try {
      await api.post(`/table-billing/order/cancel/${orderId}`);
      showToast("Table cancelled", "success");
      navigate("/table-billing");
    } catch (err) {
      showToast(errorDetail(err, "Failed to cancel table"), "error");
    }
  };

  const total = orderItems.reduce(
    (t, i) => t + Number(i.price) * i.quantity,
    0
  );
  const serviceChargeAmount = toAmount(serviceCharge || 0);
  const payableTotal = total + serviceChargeAmount;
  const splitTotal =
    Number(split.cash || 0) +
    Number(split.card || 0) +
    Number(split.upi || 0);

  if (hotelAllowed === false) {
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

  if (loading) {
    return (
      <div className="mt-10 text-center text-sm font-medium text-gray-600">
        Loading table order...
      </div>
    );
  }

  /* ================= UI ================= */
  return (
    <>
      <style>{`
        html, body, #root {
          height: 100%;
          margin: 0;
          padding: 0;
        }
        @media (min-width: 1280px) {
          html, body, #root {
            overflow: hidden;
          }
        }
        .no-scroll::-webkit-scrollbar {
          display: none;
        }
        .no-scroll {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        #bill-print-area {
          display: none;
        }
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

      <div className="px-2 sm:px-4 pt-2 pb-1">
        <button
          onClick={() => navigate("/table-billing", { replace: true })}
          className="px-3 py-1.5 rounded-lg border bg-white shadow-sm text-[12px]"
        >
          &larr; Back
        </button>
      </div>
      <div
        className="grid grid-cols-1 xl:grid-cols-[200px_3fr_2fr] gap-4 xl:gap-6 px-2 sm:px-4 pb-4 h-auto xl:h-[calc(100vh-110px)]"
      >

        {/* ================= CATEGORIES (LEFT) ================= */}
        <aside className="rounded-2xl border shadow-xl p-3 bg-white text-[11px] flex flex-col xl:overflow-hidden">
          <h2 className="text-sm font-bold text-center mb-2">CATEGORIES</h2>

          <input
            className="border rounded-lg px-2 py-1 mb-2 text-[11px] w-full"
            placeholder="Search category..."
            value={categorySearch}
            onChange={e => setCategorySearch(e.target.value)}
          />

          <div className="max-h-52 xl:max-h-none xl:flex-1 overflow-y-auto no-scroll">
            <button
              onClick={() => setActiveCat("ALL")}
              className={`w-full text-left px-3 py-2 rounded mb-1 ${
                activeCat === "ALL" ? "bg-blue-600 text-white" : "hover:bg-gray-100"
              }`}
            >
              All
            </button>
            {filteredCategories.map(c => (
              <button
                key={c.category_id}
                onClick={() => setActiveCat(c.category_id)}
                className={`w-full text-left px-3 py-2 rounded mb-1 ${
                  activeCat === c.category_id ? "bg-blue-600 text-white" : "hover:bg-gray-100"
                }`}
              >
                {c.category_name}
              </button>
            ))}
          </div>
        </aside>

        {/* ================= ITEMS ================= */}
        <section className="rounded-2xl border shadow-xl p-3 bg-white flex flex-col xl:overflow-hidden text-[11px]">
          <h2 className="text-sm font-bold text-center mb-2">ITEMS</h2>

          <div className="flex gap-2 mb-2">
            <input
              className="flex-1 border rounded-lg px-2 py-1 shadow-sm text-[11px]"
              placeholder="Search item..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="max-h-[65vh] xl:max-h-none xl:flex-1 overflow-y-auto no-scroll pr-1">
            <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
              {filteredItems.map(item => {
                const out = false;
                const imgUrl = item.image_filename
                  ? `${API_BASE}/item-images/${item.image_filename}`
                  : "";

                return (
                  <button
                    key={item.item_id}
                    disabled={out}
                    onClick={() => addItem(item.item_id)}
                    className={`
                      text-left rounded-lg border shadow-sm bg-white
                      px-2 py-2 text-[11px] sm:text-[12px] leading-tight
                      hover:bg-blue-50
                      ${out ? "bg-red-50 border-red-300 opacity-70" : ""}
                    `}
                  >
                    <div className="flex items-start gap-2">
                      <div className="w-10 h-10 rounded-md border bg-gray-50 overflow-hidden flex-shrink-0">
                        {imgUrl ? (
                          <img
                            src={imgUrl}
                            alt={item.item_name}
                            className="w-full h-full object-cover"
                            onError={e => { e.currentTarget.style.display = "none"; }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[9px] text-gray-400">
                            IMG
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-[13px] whitespace-normal break-words leading-snug">
                          {item.item_name}
                        </div>
                        <div className="text-[12px] mt-1 font-medium">RS.{Number(item.price).toFixed(0)}</div>
                      </div>
                    </div>

                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* ================= BILL (right) ================= */}
        <section className="rounded-2xl border shadow-xl p-3 bg-white flex flex-col xl:overflow-hidden text-[11px]">
          <h2 className="text-sm font-bold text-center mb-2">ITEMS BILLING</h2>

          <div className="p-3 space-y-2">
            <div className="mt-2 rounded-xl border bg-white shadow px-3 py-2 text-[11px] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Payment Mode</span>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={splitEnabled}
                    onChange={e => setSplitEnabled(e.target.checked)}
                  />
                  Split
                </label>
              </div>

              {!splitEnabled && (
                <div className="flex flex-wrap gap-3">
                  {PAYMENT_MODES.map(mode => (
                    <label
                      key={mode}
                      className="flex items-center gap-2 text-[11px] cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="paymentMode"
                        value={mode}
                        checked={paymentMode === mode}
                        onChange={() => setPaymentMode(mode)}
                      />
                      <span>{mode.toUpperCase()}</span>
                    </label>
                  ))}
                </div>
              )}

              {splitEnabled && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {PAYMENT_MODES.map(mode => (
                    <div key={mode}>
                      <label className="text-[10px] text-gray-600">{mode.toUpperCase()}</label>
                      <input
                        inputMode="decimal"
                        className="border rounded-lg px-2 py-1 w-full text-[11px]"
                        value={split[mode]}
                        onChange={e => setSplit(s => ({ ...s, [mode]: e.target.value }))}
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>
              )}

              {splitEnabled && (
                <div className="text-[10px] text-gray-600">
                  Split Total: Rs. {splitTotal.toFixed(2)} / Payable: Rs. {payableTotal.toFixed(2)}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] text-gray-600">Mobile *</label>
                <input
                  inputMode="numeric"
                  maxLength={10}
                  className="border rounded-lg px-2 py-1 w-full text-[11px]"
                  value={customer.mobile}
                  onFocus={() => { if (customer.mobile === DEFAULT_MOBILE) setCustomer(p => ({ ...p, mobile: "" })); }}
                  onChange={e => {
                    let val = e.target.value.replace(/\D/g, "");
                    if (val.length > 10) val = val.slice(0, 10);
                    setCustomer(p => ({ ...p, mobile: val }));
                    if (val.length === 10) fetchCustomerByMobile(val);
                  }}
                  onBlur={() => {
                    const v = (customer.mobile || "").replace(/\D/g, "");
                    if (!v) setCustomer(p => ({ ...p, mobile: DEFAULT_MOBILE }));
                    else if (v.length === 10) fetchCustomerByMobile(v);
                  }}
                />
              </div>

              <div>
                <label className="text-[9px] text-gray-600">Customer Name *</label>
                <input
                  className="border rounded-lg px-2 py-1 w-full text-[11px]"
                  value={customer.name}
                  onChange={e => setCustomer(p => ({ ...p, name: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <label className="text-[9px] text-gray-600">Customer GST</label>
              <input
                className="border rounded-lg px-2 py-1 w-full text-[11px]"
                value={customer.gst_number || ""}
                onChange={e => setCustomer(p => ({ ...p, gst_number: e.target.value }))}
              />
            </div>

            <div>
              <label className="text-[9px] text-gray-600">Service Charge</label>
              <input
                inputMode="decimal"
                className="border rounded-lg px-2 py-1 w-full text-[11px]"
                value={serviceCharge}
                onChange={e => setServiceCharge(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="rounded-xl border bg-white p-2 shadow-inner min-h-[220px] xl:min-h-0 flex-1 overflow-y-auto no-scroll text-[11px]">
            {!orderItems.length && (
              <p className="text-center text-slate-400 py-3 text-[10px]">Cart empty - add items</p>
            )}

            {orderItems.map(it => (
              <div key={it.order_item_id} className="flex justify-between border-b py-1 last:border-b-0">
                <span className="font-medium truncate pr-2">{it.item_name}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => changeQty(it.item_id, -1)}
                    className="px-2 rounded-lg border text-[11px]"
                  >
                    -
                  </button>

                  <div className="w-8 text-center text-[11px] font-semibold">
                    {it.quantity}
                  </div>

                  <button
                    onClick={() => changeQty(it.item_id, 1)}
                    className="px-2 rounded-lg border text-[11px]"
                  >
                    +
                  </button>

                  <span className="text-[10px] text-slate-600">
                    Rs.{Number(it.price || 0).toFixed(0)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-2 rounded-xl border bg-white shadow overflow-hidden">
            <button
              onClick={() => setShowTotals(v => !v)}
              className="w-full flex items-center justify-between px-3 py-2"
              type="button"
            >
              <span className="text-[12px] font-bold text-emerald-700">
                Payable: Rs. {payableTotal.toFixed(2)}
              </span>
              <span className="text-[10px] text-gray-600">
                {showTotals ? "Hide Details" : "Show Details"}
              </span>
            </button>

            {showTotals && (
              <div className="px-3 pb-3 pt-1 text-[11px] space-y-1">
                <p>Subtotal: Rs. {total.toFixed(2)}</p>
                <p>Service Charge: Rs. {serviceChargeAmount.toFixed(2)}</p>
                <p className="font-semibold">Payable Total: Rs. {payableTotal.toFixed(2)}</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
            <button
              onClick={confirmOrderAndPrintKOT}
              disabled={!orderItems.length || completing}
              className="bg-amber-500 text-white py-1.5 rounded-lg shadow text-[11px] disabled:opacity-60"
            >
              {branch?.kot_required !== false ? "Confirm KOT" : "Confirm Order"}
            </button>
            <button
              onClick={() => completeOrder(false)}
              disabled={!orderItems.length || completing}
              className="bg-blue-600 text-white py-1.5 rounded-lg shadow text-[11px] disabled:opacity-60"
            >
              {completing ? "Processing..." : "Complete"}
            </button>
            <button
              onClick={() => completeOrder(branch?.receipt_required !== false)}
              disabled={!orderItems.length || completing}
              className="bg-emerald-600 text-white py-1.5 rounded-lg shadow text-[11px] disabled:opacity-60"
            >
              {completing ? "Processing..." : (branch?.receipt_required !== false ? "Complete & Print" : "Complete")}
            </button>
          </div>

          <button
            onClick={cancelTable}
            className="w-full mt-2 bg-gray-600 text-white py-1.5 rounded-lg shadow text-[11px]"
          >
            Cancel Table
          </button>
        </section>
      </div>



      {/* PRINT AREA */}
      <div id="bill-print-area">
        <pre ref={printTextRef} style={{ fontSize: "12px" }} />
      </div>

      <div style={{ display: "none" }}>
        <pre ref={kotPrintRef} />
      </div>
    </>
  );
}



