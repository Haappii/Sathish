import { useParams, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useState, useRef } from "react";
import api from "../utils/apiClient";
import { API_BASE } from "../config/api";
import { useToast } from "../components/Toast";
import { getSession } from "../utils/auth";
import { buildBusinessDateTimeLabel, getBusinessDate } from "../utils/businessDate";
import { getReceiptAddressLines, maskMobileForPrint } from "../utils/receipt";
import { printDirectText } from "../utils/printDirect";
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
  const [showTotals, setShowTotals] = useState(false);
  const [cartBusy, setCartBusy] = useState(false);

  // Ref to always have the latest orderId without closure staleness
  const orderIdRef = useRef(null);

  const errorDetail = (err, fallback) =>
    err?.response?.data?.detail || fallback;

  /* ================= LOAD ================= */
  const loadOrder = useCallback(async () => {
    const res = await api.get(`/table-billing/order/by-table/${tableId}`);
    orderIdRef.current = res.data.order_id;
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
    setItems((i.data || []).filter((it) => !it?.is_raw_material));
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

  /* Reload order when user switches back to this tab (stale session fix) */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && hotelAllowed) {
        loadOrder().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadOrder, hotelAllowed]);

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
  const updateOrderItem = async ({
    itemId,
    qty,
    fallbackMessage,
    successMessage = "",
  }) => {
    setCartBusy(true);
    try {
      let currentOrderId = orderIdRef.current;
      try {
        await api.post("/table-billing/order/item/add", null, {
          params: { order_id: currentOrderId, item_id: itemId, qty }
        });
      } catch (err) {
        // If order is stale/invalid, reload and retry once
        if (err?.response?.status === 400) {
          await loadOrder();
          currentOrderId = orderIdRef.current;
          await api.post("/table-billing/order/item/add", null, {
            params: { order_id: currentOrderId, item_id: itemId, qty }
          });
        } else {
          throw err;
        }
      }
      await loadOrder();
      if (successMessage) showToast(successMessage, "success");
    } catch (err) {
      showToast(errorDetail(err, fallbackMessage), "error");
    } finally {
      setCartBusy(false);
    }
  };

  const addItem = async id => {
    await updateOrderItem({
      itemId: id,
      qty: 1,
      fallbackMessage: "Failed to add item",
    });
  };

  const changeQty = async (id, delta) => {
    await updateOrderItem({
      itemId: id,
      qty: delta,
      fallbackMessage: "Failed to update item",
    });
  };

  const removeItem = async item => {
    await updateOrderItem({
      itemId: item.item_id,
      qty: -Number(item.quantity || 0),
      fallbackMessage: "Failed to remove item",
      successMessage: `${item.item_name} removed`,
    });
  };

  const clearOrder = async () => {
    if (!orderId || !orderItems.length) return;
    const confirmed = window.confirm(
      `Clear all ${orderItems.length} item${orderItems.length > 1 ? "s" : ""} from ${tableName || "this table"}?`
    );
    if (!confirmed) return;

    setCartBusy(true);
    try {
      await api.post(`/table-billing/order/clear/${orderId}`);
      await loadOrder();
      showToast("Order cleared", "success");
    } catch (err) {
      showToast(errorDetail(err, "Failed to clear order"), "error");
    } finally {
      setCartBusy(false);
    }
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
    t += `Date       : ${
      invoiceCreatedAt
        ? formatDisplayDate(invoiceCreatedAt, false)
        : buildBusinessDateTimeLabel(getBusinessDate(shop?.app_date), {
            timeOptions: { hour: "2-digit", minute: "2-digit" },
          })
    }\n`;
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
      "Item".padEnd(ITEM_COL) +
      "Qty".padStart(QTY_COL) +
      "Rate".padStart(RATE_COL) +
      "Total".padStart(TOTAL_COL) +
      "\n";

    t += line + "\n";

    const rows = Array.isArray(invoiceItems) ? invoiceItems : [];
    rows.forEach(i => {
      const name = i.item_name.slice(0, ITEM_COL).padEnd(ITEM_COL);
      const qty = String(i.quantity).padStart(QTY_COL);
      const rate = Number(i.price || 0).toFixed(2).padStart(RATE_COL);
      const total = (Number(i.quantity || 0) * Number(i.price || 0)).toFixed(2).padStart(TOTAL_COL);
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
    const fssai = String(branch?.fssai_number || shop?.fssai_number || "").trim();
    if (fssai) t += center(`FSSAI No: ${fssai}`) + "\n";
    // Footer + 4 blank lines so footer always prints with the bill
    t += center("Thank You! Visit Again") + "\n" + "\n".repeat(4);

    return t;
  }; 

  const printInvoice = async invoiceNo => {
    if (!invoiceNo) return;
    const res = await api.get(`/invoice/by-number/${invoiceNo}`);
    const invoice = res.data || {};
    const ok = await printDirectText(
      generateBillText({
        invoiceNumber: invoice.invoice_number || invoiceNo,
        invoiceCreatedAt: invoice.created_time,
        invoiceItems: invoice.items || orderItems,
        invoiceTax: invoice.tax_amt,
        invoiceServiceCharge:
          invoice?.payment_split?.service_charge ??
          (branch?.service_charge_required ? toAmount(branch?.service_charge_amount || 0) : 0),
        invoiceDiscount: invoice.discounted_amt,
        invoiceTotal: invoice.total_amount,
      }),
      { fontSize: 6, paperSize: branch?.paper_size || "58mm" }
    );
    if (!ok) showToast("Printing failed. Check printer/popup settings.", "error");
  };

  const generateKOTText = (kotItems, categoryLabel = null) => {
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
    t += center(buildBusinessDateTimeLabel(getBusinessDate(shop?.app_date))) + "\n";
    t += center(tableName ? `Table ${tableName}` : "Table Billing") + "\n";
    t += line + "\n";
    if (categoryLabel) {
      t += `Category: ${categoryLabel.slice(0, 22)}`.padEnd(WIDTH) + "\n";
      t += line + "\n";
    }
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

  const printKOT = async kotItems => {
    const rows = (Array.isArray(kotItems) ? kotItems : []).filter(
      it => Number(it.quantity || 0) > 0
    );
    if (!rows.length) {
      showToast("Add items before printing KOT", "warning");
      return;
    }

    // Build lookup: item_id → category_id from items list
    const itemCatMap = {};
    items.forEach(it => { itemCatMap[String(it.item_id)] = it.category_id; });
    const catNameMap = {};
    categories.forEach(c => { catNameMap[String(c.category_id)] = c.category_name; });

    // Group rows by category — one KOT ticket per category
    const grouped = {};
    rows.forEach(it => {
      const catId = String(itemCatMap[String(it.item_id)] || "other");
      if (!grouped[catId]) grouped[catId] = [];
      grouped[catId].push(it);
    });

    const catIds = Object.keys(grouped);
    const multiCat = catIds.length > 1;

    for (const catId of catIds) {
      const label = multiCat ? (catNameMap[catId] || catId) : null;
      const ok = await printDirectText(generateKOTText(grouped[catId], label));
      if (!ok) {
        showToast("Printing failed. Check printer/popup settings.", "error");
        break;
      }
    }
  };

  const confirmOrderAndPrintKOT = async () => {
    try {
      const kotRequired = branch?.kot_required !== false;
      const confirmPrint = window.confirm(kotRequired ? "Confirm order and print KOT?" : "Confirm order?");
      if (!confirmPrint) return;
      const currentOrderId = orderIdRef.current || orderId;
      if (!currentOrderId) {
        showToast("Order not found", "error");
        return;
      }

      const res = await api.get(`/table-billing/order/by-table/${tableId}`);
      const latestItems = Array.isArray(res.data?.items) ? res.data.items : [];
      setOrderItems(latestItems);
      if (!latestItems.length) {
        showToast("Add items before confirming order", "warning");
        return;
      }

      if (kotRequired) {
        const kotRes = await api.post(`/kot/create/${currentOrderId}`);
        const kotItems = Array.isArray(kotRes.data?.items) ? kotRes.data.items : [];
        if (!kotItems.length) {
          showToast("No new items to send to kitchen", "warning");
          return;
        }
        await printKOT(kotItems);
        showToast("Order confirmed and live tracking started", "success");
        await loadOrder();
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
      const serviceChargeValue =
        branch?.service_charge_required ? toAmount(branch?.service_charge_amount || 0) : 0;
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
  const serviceChargeAmount =
    branch?.service_charge_required ? toAmount(branch?.service_charge_amount || 0) : 0;
  const payableTotal = Math.round(total + serviceChargeAmount);
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
        html, body, #root { height: 100%; margin: 0; padding: 0; }
        @media (min-width: 1280px) { html, body, #root { overflow: hidden; } }
        .no-scroll::-webkit-scrollbar { display: none; }
        .no-scroll { -ms-overflow-style: none; scrollbar-width: none; }
        #bill-print-area { display: none; }
        @media print {
          body * { visibility: hidden; }
          #bill-print-area, #bill-print-area * { visibility: visible; font-family: monospace; }
          #bill-print-area { display: block !important; position: absolute; top: 0; left: 0; width: 80mm; padding: 6px; }
        }
      `}</style>

      {/* ── Top bar ── */}
      <div className="px-3 pt-2 pb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/table-billing", { replace: true })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border bg-white shadow-sm text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
          >
            ← Back
          </button>
          <span className="text-sm font-bold text-gray-700 hidden sm:block">
            {tableName ? `Table: ${tableName}` : "Table Order"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {orderItems.length > 0 && (
            <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full">
              {orderItems.length} item{orderItems.length > 1 ? "s" : ""} · ₹{payableTotal.toFixed(0)}
            </span>
          )}
        </div>
      </div>

      {/* ── Three-panel grid ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[15%_50%_35%] gap-3 px-3 pb-4 h-auto xl:h-[calc(100vh-108px)]">

        {/* ── PANEL 1: Categories ── */}
        <aside className="bg-white rounded-2xl border shadow-sm flex flex-col xl:overflow-hidden">
          <div className="px-3 pt-3 pb-2 border-b">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-2">Categories</p>
            <input
              className="w-full border border-gray-200 rounded-xl px-2.5 py-1.5 text-[11px] bg-gray-50 focus:outline-none focus:border-blue-400"
              placeholder="Search…"
              value={categorySearch}
              onChange={e => setCategorySearch(e.target.value)}
            />
          </div>
          <div className="flex-1 overflow-y-auto no-scroll p-2 space-y-0.5">
            <button
              onClick={() => setActiveCat("ALL")}
              className={`w-full text-left px-3 py-2 rounded-xl text-[12px] font-medium transition ${
                activeCat === "ALL"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              All Items
            </button>
            {filteredCategories.map(c => (
              <button
                key={c.category_id}
                onClick={() => setActiveCat(c.category_id)}
                className={`w-full text-left px-3 py-2 rounded-xl text-[12px] font-medium transition ${
                  activeCat === c.category_id
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {c.category_name}
              </button>
            ))}
          </div>
        </aside>

        {/* ── PANEL 2: Items ── */}
        <div className="bg-white rounded-2xl border shadow-sm flex flex-col xl:overflow-hidden">
          <div className="px-3 pt-3 pb-2 border-b flex items-center gap-2">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Items</p>
            <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-1.5">{filteredItems.length}</span>
            <input
              className="flex-1 border border-gray-200 rounded-xl px-2.5 py-1.5 text-[11px] bg-gray-50 focus:outline-none focus:border-blue-400 ml-auto max-w-xs"
              placeholder="Search item…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex-1 overflow-y-auto no-scroll p-3">
            {filteredItems.length ? (
              <div className="grid grid-cols-3 sm:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-1">
                {filteredItems.map(item => {
                  const imgUrl = item.image_filename ? `${API_BASE}/item-images/${item.image_filename}` : "";
                  const inOrder = orderItems.some(o => o.item_id === item.item_id);
                  const orderQty = orderItems.find(o => o.item_id === item.item_id)?.quantity || 0;
                  return (
                    <button
                      key={item.item_id}
                      onClick={() => addItem(item.item_id)}
                      className={`
                        group relative overflow-hidden rounded-md border text-left transition-all
                        cursor-pointer bg-white hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md
                        ${inOrder ? "border-blue-300 bg-blue-50 shadow-sm" : "border-gray-200"}
                      `}
                    >
                      <div className="relative aspect-square w-full overflow-hidden bg-gradient-to-br from-slate-50 via-white to-blue-50">
                        {imgUrl ? (
                          <img src={imgUrl} alt={item.item_name} className="w-full h-full object-cover"
                            onError={e => { e.currentTarget.style.display = "none"; }} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[11px] text-gray-300">🍽</div>
                        )}
                      </div>
                      <div className="p-1 min-w-0 space-y-0.5">
                        <p className="truncate text-[9px] font-semibold leading-tight text-gray-800">{item.item_name}</p>
                        <span className="text-[10px] font-extrabold text-blue-700">₹{Number(item.price).toFixed(0)}</span>
                      </div>
                      {inOrder && (
                        <span className="absolute right-1 top-1 min-w-[18px] h-4.5 rounded-full bg-blue-600 px-1 text-[8px] font-bold text-white shadow-sm flex items-center justify-center">
                          {orderQty}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-gray-300">
                <div className="text-3xl mb-1">🔍</div>
                <p className="text-xs">No items found</p>
              </div>
            )}
          </div>
        </div>

        {/* ── PANEL 3: Bill ── */}
        <div className="bg-white rounded-2xl border shadow-sm flex flex-col xl:overflow-hidden min-h-0">

          {/* ── Customer ── */}
          <div className="px-3 pt-2 pb-1.5 border-b space-y-1.5">
            <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Customer</p>
            <div className="flex gap-1.5">
              <div className="flex-1">
                <label className="text-[9px] text-gray-400 font-semibold uppercase">Mobile</label>
                <input
                  inputMode="numeric"
                  maxLength={10}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[12px] bg-gray-50 focus:outline-none focus:border-blue-400"
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
              <div className="flex-1">
                <label className="text-[9px] text-gray-400 font-semibold uppercase">Name</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[12px] bg-gray-50 focus:outline-none focus:border-blue-400"
                  value={customer.name}
                  onChange={e => setCustomer(p => ({ ...p, name: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-1.5">
              <div className="flex-1">
                <label className="text-[9px] text-gray-400 font-semibold uppercase">Customer GST</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[11px] bg-gray-50 focus:outline-none focus:border-blue-400"
                  value={customer.gst_number || ""}
                  onChange={e => setCustomer(p => ({ ...p, gst_number: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
            </div>
          </div>

          {/* ── Order items (cart) ── */}
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Order Items</p>
              <p className="text-[11px] text-gray-500">
                {orderItems.length
                  ? `${orderItems.length} line item${orderItems.length > 1 ? "s" : ""}`
                  : "Add items to build the table order"}
              </p>
            </div>
            {orderItems.length > 0 && (
              <button
                type="button"
                onClick={clearOrder}
                disabled={cartBusy}
                className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
              >
                {cartBusy ? "Working..." : "Clear All"}
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto no-scroll px-2 py-1 min-h-0">
            {!orderItems.length ? (
              <div className="flex flex-col items-center justify-center h-full py-6 text-gray-300">
                <div className="text-3xl mb-1">🛒</div>
                <p className="text-xs">Cart is empty</p>
              </div>
            ) : (
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-[10px] text-gray-400 border-b">
                    <th className="text-left py-1 font-semibold">Item</th>
                    <th className="text-center py-1 font-semibold w-20">Qty</th>
                    <th className="text-right py-1 font-semibold w-16">Amount</th>
                    <th className="text-right py-1 font-semibold w-20">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {orderItems.map(it => (
                    <tr key={it.order_item_id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="py-1 pr-1">
                        <p className="font-semibold text-gray-800 leading-tight truncate max-w-[120px]">{it.item_name}</p>
                        <p className="text-[10px] text-gray-400">₹{Number(it.price || 0).toFixed(2)} each</p>
                      </td>
                      <td className="py-1">
                        <div className="flex items-center justify-center gap-0.5">
                          <button type="button" onClick={() => changeQty(it.item_id, -1)}
                            className="w-5 h-5 rounded border bg-white text-gray-500 text-xs font-bold flex items-center justify-center hover:bg-gray-100">−</button>
                          <span className="w-8 text-center text-[11px] font-semibold">{it.quantity}</span>
                          <button type="button" onClick={() => changeQty(it.item_id, 1)}
                            className="w-5 h-5 rounded border bg-white text-gray-500 text-xs font-bold flex items-center justify-center hover:bg-gray-100">+</button>
                        </div>
                      </td>
                      <td className="py-1 text-right font-bold text-gray-800">
                        ₹{(Number(it.price || 0) * it.quantity).toFixed(2)}
                      </td>
                      <td className="py-1 text-right">
                        <button
                          type="button"
                          onClick={() => removeItem(it)}
                          disabled={cartBusy}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                          title="Remove item"
                        >
                          X
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Totals ── */}
          <div className="border-t px-3 py-1.5 space-y-1.5">
            <button
              type="button"
              onClick={() => setShowTotals(v => !v)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left transition hover:border-blue-200"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-bold text-gray-800">Payable</span>
                <div className="text-right">
                  <div className="text-[13px] font-bold text-blue-700">₹{payableTotal.toFixed(2)}</div>
                  <div className="text-[9px] font-semibold text-gray-400">{showTotals ? "Hide details" : "Show details"}</div>
                </div>
              </div>
            </button>
            {showTotals && (
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] space-y-1">
                <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>₹{total.toFixed(2)}</span></div>
                {serviceChargeAmount > 0 && <div className="flex justify-between text-gray-500"><span>Service Charge</span><span>₹{serviceChargeAmount.toFixed(2)}</span></div>}
                <div className="flex justify-between border-t border-slate-200 pt-1 text-[14px] font-bold">
                  <span className="text-gray-800">Payable</span>
                  <span className="text-blue-700">₹{payableTotal.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>

          {/* ── Payment Mode ── */}
          <div className="border-t px-3 py-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Payment Mode</p>
              <label className="flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer">
                <input type="checkbox" checked={splitEnabled} onChange={e => setSplitEnabled(e.target.checked)} className="rounded" />
                Split
              </label>
            </div>
            {!splitEnabled && (
              <div className="flex flex-wrap gap-1">
                {PAYMENT_MODES.map(m => (
                  <button
                    key={m}
                    onClick={() => setPaymentMode(m)}
                    className={`px-2 py-1 rounded-lg border text-[10px] font-bold transition ${
                      paymentMode === m
                        ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                        : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
                    }`}
                  >
                    {m.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
            {splitEnabled && (
              <>
                <div className="grid grid-cols-3 gap-1.5">
                  {PAYMENT_MODES.map(m => (
                    <div key={m}>
                      <label className="text-[9px] text-gray-400 font-semibold uppercase">{m}</label>
                      <input
                        inputMode="decimal"
                        type="number"
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[11px] bg-gray-50 focus:outline-none focus:border-blue-400 mt-0.5"
                        value={split[m]}
                        onChange={e => setSplit(s => ({ ...s, [m]: e.target.value }))}
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>
                <p className={`text-[10px] font-semibold ${Math.abs(splitTotal - payableTotal) > 0.01 ? "text-red-500" : "text-emerald-600"}`}>
                  Split: ₹{splitTotal.toFixed(2)} / Payable: ₹{payableTotal.toFixed(2)}
                </p>
              </>
            )}
          </div>

          {/* ── Action buttons ── */}
          <div className="px-3 pb-3 pt-2 space-y-2 border-t">
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={confirmOrderAndPrintKOT}
                disabled={!orderItems.length || completing}
                className="py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-white text-[12px] font-bold shadow-sm transition disabled:opacity-60"
              >
                🧾 {branch?.kot_required !== false ? "KOT" : "Confirm"}
              </button>
              <button
                onClick={() => completeOrder(false)}
                disabled={!orderItems.length || completing}
                className="py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-[12px] font-bold shadow-sm transition disabled:opacity-60"
              >
                {completing ? "..." : "💾 Save"}
              </button>
              <button
                onClick={() => completeOrder(branch?.receipt_required !== false)}
                disabled={!orderItems.length || completing}
                className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-[12px] font-bold shadow-sm transition disabled:opacity-60"
              >
                {completing ? "..." : "🖨 Print"}
              </button>
            </div>
            <button
              onClick={cancelTable}
              className="w-full py-2 rounded-xl bg-gray-100 hover:bg-gray-200 active:scale-95 text-gray-600 text-[12px] font-bold transition"
            >
              Cancel Table
            </button>
          </div>
        </div>
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
