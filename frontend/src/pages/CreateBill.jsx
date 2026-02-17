import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import authAxios from "../api/authAxios";
import { API_BASE } from "../config/api";
import { useToast } from "../components/Toast";
import { getSession } from "../utils/auth";
import { getReceiptAddressLines, maskMobileForPrint } from "../utils/receipt";

const DEFAULT_MOBILE = "9999999999";
const OFFLINE_BILLS_KEY = "offline_bills_v1";

const pushOfflineBill = (payload) => {
  try {
    const existing = JSON.parse(localStorage.getItem(OFFLINE_BILLS_KEY) || "[]");
    const rows = Array.isArray(existing) ? existing : [];
    const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    rows.unshift({ id, createdAt: new Date().toISOString(), payload });
    localStorage.setItem(OFFLINE_BILLS_KEY, JSON.stringify(rows));
  } catch {
    // ignore
  }
};

export default function CreateBill() {
  const { showToast } = useToast();

  const session = getSession();
  const branch_id = session?.branch_id;

  const [shop, setShop] = useState({});
  const [branch, setBranch] = useState({});
  const [itemsData, setItemsData] = useState([]);
  const [categories, setCategories] = useState([]);
  const [stockData, setStockData] = useState([]);

  const [inventoryEnabled, setInventoryEnabled] = useState(false);

  const [selectedCat, setSelectedCat] = useState("All");
  const [itemSearch, setItemSearch] = useState("");
  const [categorySearch, setCategorySearch] = useState("");

  const [cart, setCart] = useState([]);

  const [customer, setCustomer] = useState({
    mobile: DEFAULT_MOBILE,
    name: "",
    gst_number: ""
  });

  const [discountType, setDiscountType] = useState("flat");
  const [discount, setDiscount] = useState(0);
  const [defaultDiscountApplied, setDefaultDiscountApplied] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponMsg, setCouponMsg] = useState("");

  const [priceLevel, setPriceLevel] = useState("BASE");
  const [priceLevels, setPriceLevels] = useState(["BASE"]);
  const [priceMap, setPriceMap] = useState({});
  const paymentModes = ["cash", "card", "upi", "credit"];
  const [paymentMode, setPaymentMode] = useState("cash");
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [split, setSplit] = useState({
    cash: "",
    card: "",
    upi: ""
  });

  const [gstEnabled, setGstEnabled] = useState(false);
  const [gstPercent, setGstPercent] = useState(0);
  const [gstMode, setGstMode] = useState("inclusive");

  const [showTotals, setShowTotals] = useState(false);

  const printTextRef = useRef(null);
  const kotPrintRef = useRef(null);
  const navigate = useNavigate();

  /* ---------------- LOAD DATA ---------------- */
  const loadData = async () => {
    try {
      const shopRes = await authAxios.get("/shop/details");
      const s = shopRes.data || {};
      setShop(s);

      if (branch_id) {
        try {
          const br = await authAxios.get(`/branch/${branch_id}`);
          const b = br.data || {};
          setBranch(b);
          if (!defaultDiscountApplied && b?.discount_enabled) {
            const t = String(b.discount_type || "flat").toLowerCase();
            const v = Number(b.discount_value || 0);
            if (v > 0) {
              setDiscountType(t === "percent" ? "percent" : "flat");
              setDiscount(v);
            }
            setDefaultDiscountApplied(true);
          }
        } catch {}
      }

      setGstEnabled(s?.gst_enabled || false);
      setGstPercent(Number(s?.gst_percent || 0));
      setGstMode(String(s?.gst_mode || "inclusive").toLowerCase());
      setInventoryEnabled(s?.inventory_enabled || false);

      const cats = await authAxios.get("/category/");
      setCategories(cats.data || []);

      const items = await authAxios.get("/items/");
      setItemsData(items.data || []);

      // Pricing / price levels (optional, RBAC-controlled)
      try {
        const [lvlRes, allRes] = await Promise.all([
          authAxios.get("/pricing/levels"),
          authAxios.get("/pricing/all"),
        ]);
        const lvls = (lvlRes.data || [])
          .map(x => String(x?.level || "").trim().toUpperCase())
          .filter(Boolean);
        setPriceLevels(["BASE", ...lvls]);

        const map = {};
        for (const r of allRes.data || []) {
          const id = String(r.item_id);
          const lvl = String(r.level || "").trim().toUpperCase();
          if (!id || !lvl) continue;
          if (!map[id]) map[id] = {};
          map[id][lvl] = Number(r.price || 0);
        }
        setPriceMap(map);
      } catch {
        setPriceLevels(["BASE"]);
        setPriceMap({});
      }

      if (s?.inventory_enabled && branch_id) {
        const stock = await authAxios.get("/inventory/list", {
          params: { branch_id }
        });
        setStockData(stock.data || []);
      }
    } catch {
      showToast("Failed to load data", "error");
    }
  };

  useEffect(() => {
    setDefaultDiscountApplied(false);
    loadData();
  }, [branch_id]);

  /* ---------------- CUSTOMER AUTO-FILL ---------------- */
  const fetchCustomerByMobile = async mobile => {
    if (!mobile || mobile.length !== 10) return;

    try {
      const res = await authAxios.get(
        `/invoice/customer/by-mobile/${mobile}`
      );

      if (res.data?.customer_name) {
        setCustomer(prev => ({
          ...prev,
          name: prev.name || res.data.customer_name,
          gst_number: prev.gst_number || res.data.gst_number || ""
        }));
        showToast("Customer loaded from previous bill", "success");
      }
    } catch {}
  };

  /* ---------------- MOBILE & NAME ---------------- */
  const handleMobileChange = e => {
    let value = e.target.value.replace(/\D/g, "");
    if (value.length > 10) value = value.slice(0, 10);

    setCustomer(prev => ({ ...prev, mobile: value }));
    if (value.length === 10) fetchCustomerByMobile(value);
  };

  const handleMobileBlur = () => {
    if (!customer.mobile || customer.mobile.length < 10) {
      setCustomer(prev => ({ ...prev, mobile: DEFAULT_MOBILE }));
    } else {
      fetchCustomerByMobile(customer.mobile);
    }
  };

  const handleNameChange = e => {
    const value = e.target.value.replace(/[^a-zA-Z\s]/g, "");
    setCustomer(prev => ({ ...prev, name: value }));
  };

  /* ---------------- STOCK HELPERS ---------------- */
  const getStock = id => stockData.find(s => s.item_id === id)?.quantity ?? 0;

  const getEffectiveStock = id => {
    const stock = getStock(id);
    const inCart = cart.find(c => c.item_id === id)?.qty || 0;
    return stock - inCart;
  };

  const getStockColor = qty => {
    if (qty === 0) return "text-red-600 font-semibold";
    if (qty <= 50) return "text-orange-500 font-semibold";
    return "text-emerald-700 font-semibold";
  };

  /* ---------------- FILTERS ---------------- */
  const filteredCategories = categories.filter(cat =>
    cat.category_name.toLowerCase().includes(categorySearch.toLowerCase())
  );

  const filteredItems = itemsData
    .map(item => ({ ...item, stock: getStock(item.item_id) }))
    .filter(item =>
      item.item_name.toLowerCase().includes(itemSearch.toLowerCase()) &&
      (selectedCat === "All" || item.category_id == selectedCat)
    )
    .sort((a, b) => (b.stock ?? 0) - (a.stock ?? 0));

  /* ---------------- CART FUNCTIONS ---------------- */
  const addToCart = item => {
    if (inventoryEnabled && getEffectiveStock(item.item_id) <= 0)
      return showToast("Out of stock", "error");

    setCart(prev => {
      const ex = prev.find(x => x.item_id === item.item_id);
      if (ex)
        return prev.map(x =>
          x.item_id === item.item_id ? { ...x, qty: x.qty + 1 } : x
        );
      const unitPrice = getPriceForItem(item);
      return [
        ...prev,
        {
          ...item,
          base_price: Number(item.price || 0),
          price_level: String(priceLevel || "BASE").toUpperCase(),
          price: unitPrice,
          qty: 1
        }
      ];
    });
  };

  const changeQty = (id, delta) =>
    setCart(prev =>
      prev.map(x =>
        x.item_id === id ? { ...x, qty: Math.max(1, x.qty + delta) } : x
      )
    );

  const setQty = (id, val) => {
    const q = Math.max(1, Number(val) || 1);
    if (inventoryEnabled && q > getStock(id))
      return showToast("Exceeds stock limit", "error");

    setCart(prev =>
      prev.map(x => (x.item_id === id ? { ...x, qty: q } : x))
    );
  };

  const removeItem = id => setCart(cart.filter(x => x.item_id !== id));

  const getPriceForItem = item => {
    const base = Number(item?.base_price ?? item?.price ?? 0);
    const lvl = String(priceLevel || "BASE").toUpperCase();
    if (!lvl || lvl === "BASE") return base;
    const custom = priceMap?.[String(item?.item_id)]?.[lvl];
    return custom !== undefined && custom !== null && custom !== ""
      ? Number(custom)
      : base;
  };

  const applyPriceLevelToCart = () => {
    setCart(prev =>
      prev.map(x => ({
        ...x,
        price_level: String(priceLevel || "BASE").toUpperCase(),
        price: getPriceForItem(x)
      }))
    );
  };

  const applyCoupon = async () => {
    const code = String(couponCode || "").trim();
    if (!code) {
      setCouponDiscount(0);
      setCouponMsg("");
      return;
    }
    try {
      const res = await authAxios.get(`/coupons/validate/${encodeURIComponent(code)}`, {
        params: { amount: grossTotal }
      });
      const data = res.data || {};
      if (!data.valid) {
        setCouponDiscount(0);
        setCouponMsg(data.message || "Invalid coupon");
        showToast(data.message || "Invalid coupon", "error");
        return;
      }
      const disc = Number(data.discount_amount || 0);
      setCouponDiscount(disc);
      setCouponMsg("Applied");
      showToast(`Coupon applied: -₹${disc.toFixed(2)}`, "success");
    } catch (e) {
      setCouponDiscount(0);
      setCouponMsg("");
      showToast(e?.response?.data?.detail || "Coupon validate failed", "error");
    }
  };

  const clearCoupon = () => {
    setCouponCode("");
    setCouponDiscount(0);
    setCouponMsg("");
  };

  /* ---------------- TOTALS ---------------- */
  const subTotal = cart.reduce((t, x) => t + x.price * x.qty, 0);

  let tax = 0;
  if (gstEnabled) {
    tax =
      gstMode === "exclusive"
        ? (subTotal * gstPercent) / 100
        : subTotal - subTotal / (1 + gstPercent / 100);
  }

  const manualDiscountValue =
    discountType === "percent"
      ? (subTotal * Number(discount || 0)) / 100
      : Number(discount) || 0;

  const grossTotal =
    gstEnabled && gstMode === "exclusive" ? subTotal + tax : subTotal;

  const discountValue = Math.min(
    grossTotal,
    Math.max(0, manualDiscountValue + Number(couponDiscount || 0))
  );

  const payable = grossTotal - discountValue;

  const splitTotal = ["cash", "card", "upi"]
    .map(k => Number(split[k] || 0))
    .reduce((a, b) => a + b, 0);

  /* ---------------- PRINT ---------------- */
  const generateBillText = invoiceNo => {
    const WIDTH = 48;
    const line = "-".repeat(WIDTH);
    const center = txt => " ".repeat(Math.max(0, Math.floor((WIDTH - txt.length) / 2))) + txt;
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
    t += `Invoice No : ${invoiceNo}\n`;
    t += `Date : ${new Date().toLocaleDateString("en-IN")}\n`;
    const isPlaceholder = customer.mobile === DEFAULT_MOBILE || /^9{9,}$/.test(customer.mobile);
    if (!isPlaceholder) {
      t += `Customer : ${customer.name}\n`;
      t += `Mobile : ${maskMobileForPrint(customer.mobile)}\n`;
      if (customer.gst_number) t += `GSTIN : ${customer.gst_number}\n`;
    }
    if (splitEnabled) {
      const parts = [
        `Cash ${Number(split.cash || 0).toFixed(2)}`,
        `Card ${Number(split.card || 0).toFixed(2)}`,
        `UPI ${Number(split.upi || 0).toFixed(2)}`
      ].join(", ");
      t += `Payment : Split (${parts})\n`;
    } else {
      t += `Payment : ${String(paymentMode || "cash").toUpperCase()}\n`;
    }
    t += line + "\n";
    t += "Item".padEnd(22) + "Qty".padStart(4) + "Rate".padStart(10) + "Total".padStart(12) + "\n";
    t += line + "\n";
    cart.forEach(i => {
      t +=
        i.item_name.slice(0, 22).padEnd(22) +
        String(i.qty).padStart(4) +
        i.price.toFixed(2).padStart(10) +
        (i.qty * i.price).toFixed(2).padStart(12) +
        "\n";
    });
    t += line + "\n";
    const totalItems = cart.reduce((s, i) => s + i.qty, 0);
    const left = `Items: ${totalItems}`;
    const right = `Subtotal : ${subTotal.toFixed(2)}`;
    const gap = Math.max(1, WIDTH - left.length - right.length);
    t += left + " ".repeat(gap) + right + "\n";
    if (gstEnabled) t += rightKV(`GST ${gstPercent}%`, tax.toFixed(2)) + "\n";
    if (discountValue) t += rightKV("Discount", discountValue.toFixed(2)) + "\n";
    t += rightKV("Grand Total", payable.toFixed(2)) + "\n";
    t += line + "\n";
    t += center("Thank You! Visit Again") + "\n";
    return t;
  };

  const generateKOTText = () => {
    const WIDTH = 32;
    const NAME_COL = 22;
    const COUNT_COL = 8;
    const line = "-".repeat(WIDTH);
    const center = txt =>
      " ".repeat(Math.max(0, Math.floor((WIDTH - txt.length) / 2))) + txt;
    const rightCol = (txt, width) =>
      " ".repeat(Math.max(0, width - txt.length)) + txt;

    let t = "";
    const headerName = branch.branch_name
      ? `${shop.shop_name || "Shop Name"} - ${branch.branch_name}`
      : shop.shop_name || "Shop Name";
    t += center(headerName) + "\n";
    t += center("Date & Time") + "\n";
    t += center(new Date().toLocaleString()) + "\n";
    t += center("Take way") + "\n";
    t += line + "\n";
    t += "Item Name".padEnd(NAME_COL) + rightCol("Item Count", COUNT_COL) + "\n";
    t += line + "\n";
    cart.forEach(i => {
      const name = String(i.item_name || "").slice(0, NAME_COL).padEnd(NAME_COL);
      const count = String(i.qty || 0);
      t += name + rightCol(count, COUNT_COL) + "\n";
    });
    t += line + "\n";
    const totalItems = cart.reduce((s, i) => s + i.qty, 0);
    t += center(`Total Count - ${totalItems}`) + "\n";
    t += line + "\n";
    return t;
  };

  const printKOT = () => {
    if (!kotPrintRef.current) return;
    kotPrintRef.current.textContent = generateKOTText();
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

  const saveInvoice = async (print = false) => {
    if (!customer.mobile || customer.mobile.length < 10)
      return showToast("Enter valid 10-digit mobile", "error");
    if (!customer.name) return showToast("Customer name required", "error");
    if (!cart.length) return showToast("Cart empty", "error");
    if (splitEnabled && Math.abs(splitTotal - payable) > 0.01) {
      return showToast("Split amounts must equal payable total", "error");
    }

    const payload = {
      customer_name: customer.name,
      mobile: customer.mobile,
      customer_gst: customer.gst_number || null,
      total_amount: payable,
      discounted_amt: discountValue,
      tax_amt: tax,
      payment_mode: splitEnabled ? "split" : paymentMode,
      payment_split: splitEnabled
        ? {
            cash: Number(split.cash || 0),
            card: Number(split.card || 0),
            upi: Number(split.upi || 0)
          }
        : null,
      items: cart.map(x => ({
        item_id: x.item_id,
        quantity: x.qty,
        amount: x.qty * x.price
      }))
    };

    try {
      const res = await authAxios.post(`/invoice/`, payload);

      printKOT();

      if (print && printTextRef.current) {
        printTextRef.current.textContent = generateBillText(res.data.invoice_number);
        setTimeout(() => window.print(), 600);
      }

      showToast("Bill saved", "success");
      setCart([]);
      setCustomer({ mobile: DEFAULT_MOBILE, name: "", gst_number: "" });
      setDiscount(0);
      setCouponCode("");
      setCouponDiscount(0);
      setCouponMsg("");
      setPaymentMode("cash");
      setSplitEnabled(false);
      setSplit({ cash: "", card: "", upi: "" });
      setDefaultDiscountApplied(false);
      await loadData();
    } catch (err) {
      const isNetworkError = !err?.response || !navigator.onLine;
      if (isNetworkError) {
        pushOfflineBill(payload);
        showToast("Saved offline. Sync later from Offline Sync.", "warning");

        setCart([]);
        setCustomer({ mobile: DEFAULT_MOBILE, name: "", gst_number: "" });
        setDiscount(0);
        setCouponCode("");
        setCouponDiscount(0);
        setCouponMsg("");
        setPaymentMode("cash");
        setSplitEnabled(false);
        setSplit({ cash: "", card: "", upi: "" });
        return;
      }

      const msg = err?.response?.data?.detail || "Save failed";
      showToast(msg, "error");
    }
  };

  const saveDraft = async () => {
    if (!customer.mobile || customer.mobile.length < 10)
      return showToast("Enter valid 10-digit mobile", "error");
    if (!customer.name) return showToast("Customer name required", "error");
    if (!cart.length) return showToast("Cart empty", "error");
    if (splitEnabled && Math.abs(splitTotal - payable) > 0.01) {
      return showToast("Split amounts must equal payable total", "error");
    }

    const payload = {
      customer_name: customer.name,
      mobile: customer.mobile,
      customer_gst: customer.gst_number || null,
      discounted_amt: discountValue,
      payment_mode: splitEnabled ? "split" : paymentMode,
      payment_split: splitEnabled
        ? {
            cash: Number(split.cash || 0),
            card: Number(split.card || 0),
            upi: Number(split.upi || 0)
          }
        : null,
      items: cart.map(x => ({
        item_id: x.item_id,
        quantity: x.qty,
        amount: x.qty * x.price
      }))
    };

    try {
      const res = await authAxios.post(`/invoice/draft/`, payload);
      const draftNo = res?.data?.draft_number;
      showToast(draftNo ? `Draft saved: ${draftNo}` : "Draft saved", "success");

      setCart([]);
      setCustomer({ mobile: DEFAULT_MOBILE, name: "", gst_number: "" });
      setDiscount(0);
      setCouponCode("");
      setCouponDiscount(0);
      setCouponMsg("");
      setPaymentMode("cash");
      setSplitEnabled(false);
      setSplit({ cash: "", card: "", upi: "" });
      setDefaultDiscountApplied(false);
      await loadData();
    } catch (err) {
      const msg = err?.response?.data?.detail || "Draft save failed";
      showToast(msg, "error");
    }
  };

  return (
    <>
      <style jsx global>{`
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
        /* Hide scrollbar but keep scroll functionality */
        .no-scroll::-webkit-scrollbar {
          display: none;
        }
        .no-scroll {
          -ms-overflow-style: none;  /* IE and Edge */
          scrollbar-width: none;     /* Firefox */
        }
      `}</style>

      {/* Back button - no extra margin/padding above */}
      <div className="px-2 sm:px-4 pt-2 pb-1">
        <button
          onClick={() => navigate("/home", { replace: true })}
          className="px-3 py-1.5 rounded-lg border bg-white shadow-sm text-[12px]"
        >
          &larr; Back
        </button>
      </div>

      {/* Main content - full remaining height, no page scroll */}
      <div
        className="grid grid-cols-1 xl:grid-cols-[200px_3fr_2fr] gap-4 xl:gap-6 px-2 sm:px-4 pb-4 h-auto xl:h-[calc(100vh-110px)]"
      >
        {/* CATEGORIES */}
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
              onClick={() => setSelectedCat("All")}
              className={`w-full text-left px-3 py-2 rounded mb-1 ${
                selectedCat === "All" ? "bg-blue-600 text-white" : "hover:bg-gray-100"
              }`}
            >
              All
            </button>
            {filteredCategories.map(c => (
              <button
                key={c.category_id}
                onClick={() => setSelectedCat(c.category_id)}
                className={`w-full text-left px-3 py-2 rounded mb-1 ${
                  selectedCat === c.category_id ? "bg-blue-600 text-white" : "hover:bg-gray-100"
                }`}
              >
                {c.category_name}
              </button>
            ))}
          </div>
        </aside>

        {/* ITEMS */}
        <div className="rounded-2xl border shadow-xl p-3 bg-white flex flex-col xl:overflow-hidden text-[11px]">
          <h2 className="text-sm font-bold text-center mb-2">ITEMS</h2>

          <div className="flex gap-2 mb-2">
            <input
              className="flex-1 border rounded-lg px-2 py-1 shadow-sm text-[11px]"
              placeholder="Search item..."
              value={itemSearch}
              onChange={e => setItemSearch(e.target.value)}
            />
          </div>

          <div className="max-h-[65vh] xl:max-h-none xl:flex-1 overflow-y-auto no-scroll pr-1">
            <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
              {filteredItems.map(item => {
                const stock = getEffectiveStock(item.item_id);
                const out = inventoryEnabled && stock <= 0;
                const imgUrl = item.image_filename
                  ? `${API_BASE}/item-images/${item.image_filename}`
                  : "";

                return (
                  <button
                    key={item.item_id}
                    disabled={out}
                    onClick={() => addToCart(item)}
                    className={`
                      text-left rounded-lg border shadow-sm bg-white
                      px-2 py-2 text-[11px] sm:text-[12px] leading-tight
                      hover:bg-blue-50
                      ${out ? "bg-red-50 border-red-300 opacity-70 cursor-not-allowed" : ""}
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
                        <div className="text-[12px] mt-1 font-medium">
                          RS.{Number(getPriceForItem(item)).toFixed(0)}
                        </div>
                        {inventoryEnabled && (
                          <div className={`text-[11px] mt-1 ${getStockColor(stock)}`}>
                            Stock - {stock}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ITEMS BILLING */}
        <div className="rounded-2xl border shadow-xl p-3 bg-white flex flex-col xl:overflow-hidden text-[11px]">
          <h2 className="text-sm font-bold text-center mb-2">ITEMS BILLING</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
            <div>
              <label className="text-[9px] text-gray-600">Price Level</label>
              <select
                className="border rounded-lg px-2 py-1 w-full text-[11px]"
                value={priceLevel}
                onChange={e => setPriceLevel(e.target.value)}
              >
                {priceLevels.map(l => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end justify-end">
              <button
                onClick={applyPriceLevelToCart}
                className="px-3 py-1.5 rounded-lg border bg-white shadow-sm text-[11px] hover:bg-gray-50"
                type="button"
              >
                Apply to Cart
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
            <div>
              <label className="text-[9px] text-gray-600">Mobile *</label>
              <input
                inputMode="numeric"
                maxLength={10}
                className="border rounded-lg px-2 py-1 w-full text-[11px]"
                value={customer.mobile}
                onFocus={() => setCustomer(p => ({ ...p, mobile: "" }))}
                onChange={handleMobileChange}
                onBlur={handleMobileBlur}
              />
            </div>
            <div>
              <label className="text-[9px] text-gray-600">Customer Name *</label>
              <input
                className="border rounded-lg px-2 py-1 w-full text-[11px]"
                value={customer.name}
                onChange={handleNameChange}
              />
            </div>
          </div>

          <div className="mb-2">
            <label className="text-[9px] text-gray-600">Customer GST</label>
            <input
              className="border rounded-lg px-2 py-1 w-full text-[11px]"
              value={customer.gst_number}
              onChange={e => setCustomer({ ...customer, gst_number: e.target.value })}
            />
          </div>

          <div className="rounded-xl border bg-white p-2 shadow-inner min-h-[220px] xl:min-h-0 flex-1 overflow-y-auto no-scroll text-[11px]">
            {!cart.length && (
              <p className="text-center text-slate-400 py-3 text-[10px]">
                Cart empty — add items
              </p>
            )}

            {cart.map(item => (
              <div key={item.item_id} className="flex justify-between border-b py-1 last:border-b-0">
                <span className="font-medium">{item.item_name}</span>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => changeQty(item.item_id, -1)}
                    className="px-2 rounded-lg border text-[11px]"
                  >−</button>

                  <input
                    type="number"
                    className="w-10 border rounded-lg px-1 py-1 text-center text-[11px]"
                    value={item.qty}
                    onChange={e => setQty(item.item_id, e.target.value)}
                  />

                  <button
                    onClick={() => changeQty(item.item_id, 1)}
                    className="px-2 rounded-lg border text-[11px]"
                  >+</button>

                  <button
                    onClick={() => removeItem(item.item_id)}
                    className="text-red-600 text-[10px]"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-2 rounded-xl border bg-white shadow overflow-hidden">
            <button
              onClick={() => setShowTotals(!showTotals)}
              className="w-full flex items-center justify-between px-3 py-2"
            >
              <span className="text-[12px] font-bold text-emerald-700">
                Payable: ₹ {payable.toFixed(2)}
              </span>
              <span className="text-[10px] text-gray-600">
                {showTotals ? "Hide Details ▲" : "Show Details ▼"}
              </span>
            </button>

            {showTotals && (
              <div className="px-3 pb-3 pt-1 text-[11px] space-y-1">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_70px_70px] gap-2 mb-2">
                  <input
                    className="border rounded-lg px-2 py-1 w-full text-[11px]"
                    placeholder="Coupon code"
                    value={couponCode}
                    onChange={e => setCouponCode(e.target.value.toUpperCase())}
                  />
                  <button
                    onClick={applyCoupon}
                    className="border rounded-lg px-2 py-1 text-[11px] hover:bg-gray-50"
                    type="button"
                  >
                    Apply
                  </button>
                  <button
                    onClick={clearCoupon}
                    className="border rounded-lg px-2 py-1 text-[11px] hover:bg-gray-50"
                    type="button"
                  >
                    Clear
                  </button>
                </div>

                {couponMsg && (
                  <div className="text-[10px] text-slate-600 -mt-1 mb-1">
                    Coupon: <span className="font-semibold">{couponMsg}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-1">
                  <select
                    className="border rounded-lg px-2 py-1 w-full text-[11px]"
                    value={discountType}
                    onChange={e => setDiscountType(e.target.value)}
                  >
                    <option value="flat">Flat</option>
                    <option value="percent">Percent %</option>
                  </select>

                  <input
                    type="number"
                    className="border rounded-lg px-2 py-1 w-full text-[11px]"
                    value={discount}
                    onChange={e => setDiscount(e.target.value)}
                  />
                </div>

                <p>Subtotal: ₹ {subTotal.toFixed(2)}</p>
                {gstEnabled && <p>GST: ₹ {tax.toFixed(2)}</p>}
                <p>Manual Discount: ₹ {manualDiscountValue.toFixed(2)}</p>
                <p>Coupon Discount: ₹ {Number(couponDiscount || 0).toFixed(2)}</p>
                <p className="font-semibold">Total Discount: ₹ {discountValue.toFixed(2)}</p>
              </div>
            )}
          </div>

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
                {paymentModes.map(m => (
                  <label
                    key={m}
                    className="flex items-center gap-2 text-[11px] cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="paymentMode"
                      value={m}
                      checked={paymentMode === m}
                      onChange={() => setPaymentMode(m)}
                    />
                    <span>{m.toUpperCase()}</span>
                  </label>
                ))}
              </div>
            )}

            {splitEnabled && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {paymentModes.map(m => (
                  <div key={m}>
                    <label className="text-[10px] text-gray-600">{m.toUpperCase()}</label>
                    <input
                      type="number"
                      className="border rounded-lg px-2 py-1 w-full text-[11px]"
                      value={split[m]}
                      onChange={e =>
                        setSplit(s => ({ ...s, [m]: e.target.value }))
                      }
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
            )}

            {splitEnabled && (
              <div className="text-[10px] text-gray-600">
                Split Total: ₹ {splitTotal.toFixed(2)} / Payable: ₹ {payable.toFixed(2)}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
            <button
              onClick={() => saveInvoice(false)}
              className="bg-blue-600 text-white py-1.5 rounded-lg shadow text-[11px]"
            >
              Save
            </button>
            <button
              onClick={saveDraft}
              className="bg-gray-600 text-white py-1.5 rounded-lg shadow text-[11px]"
            >
              Hold
            </button>
            <button
              onClick={() => saveInvoice(true)}
              className="bg-emerald-600 text-white py-1.5 rounded-lg shadow text-[11px]"
            >
              Save & Print
            </button>
          </div>
        </div>
      </div>

      <div id="bill-print-area">
        <pre ref={printTextRef} style={{ fontSize: "12px" }} />
      </div>

      <div style={{ display: "none" }}>
        <pre ref={kotPrintRef} />
      </div>
    </>
  );
}



