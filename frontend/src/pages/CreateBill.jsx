/* eslint-disable react-hooks/set-state-in-effect */
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import authAxios from "../api/authAxios";
import { API_BASE } from "../config/api";
import { useToast } from "../components/Toast";
import { getSession } from "../utils/auth";
import { buildBusinessDateTimeLabel, formatBusinessDate, getBusinessDate } from "../utils/businessDate";
import { getReceiptAddressLines, maskMobileForPrint } from "../utils/receipt";
import { generateFeedbackQrHtml as buildFeedbackQrHtml } from "../utils/feedbackQr";
import { printDirectText } from "../utils/printDirect";
import appLogo from "../assets/app_logo.png";
import {
  cacheMasterData,
  getCachedMasterData,
} from "../utils/offlineCache";
import { addOfflineBill } from "../utils/offlineBills";

const DEFAULT_MOBILE = "9999999999";

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
  const [weightModalVisible, setWeightModalVisible] = useState(false);
  const [pendingWeightItem, setPendingWeightItem] = useState(null);
  const [weightInput, setWeightInput] = useState("250");

const [customer, setCustomer] = useState({
  mobile: DEFAULT_MOBILE,
  name: "NA",
  gst_number: ""
});

  const [discountType, setDiscountType] = useState("flat");
  const [discount, setDiscount] = useState(0);
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponMsg, setCouponMsg] = useState("");
  const defaultDiscountBranchRef = useRef(null);

  const [priceLevel, setPriceLevel] = useState("BASE");
  const [priceLevels, setPriceLevels] = useState(["BASE"]);
  const [priceMap, setPriceMap] = useState({});
  const paymentModes = ["cash", "card", "upi", "credit", "gift_card", "wallet"];
  const splitModes = ["cash", "card", "upi", "gift_card", "wallet"];
  const [paymentMode, setPaymentMode] = useState("cash");
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [split, setSplit] = useState({
    cash: "",
    card: "",
    upi: "",
    gift_card: "",
    wallet: "",
  });
  const [giftCardCode, setGiftCardCode] = useState("");
  const selectedItemIds = useMemo(() => new Set(cart.map((c) => c.item_id)), [cart]);

  const paymentModeLabel = m => {
    const map = {
      cash: "CASH",
      card: "CARD",
      upi: "UPI",
      credit: "CREDIT",
      gift_card: "GIFT CARD",
      wallet: "WALLET",
    };
    return map[m] || String(m || "").toUpperCase();
  };

  const [gstEnabled, setGstEnabled] = useState(false);
  const [gstPercent, setGstPercent] = useState(0);
  const [gstMode, setGstMode] = useState("inclusive");
  const [offlineMode, setOfflineMode] = useState(!navigator.onLine);
  const [showCustomerDetails, setShowCustomerDetails] = useState(false);
  const [showCouponEditor, setShowCouponEditor] = useState(false);
  const [showBillDetails, setShowBillDetails] = useState(false);
  const [heldDrafts, setHeldDrafts] = useState([]);
  const [showHeldPanel, setShowHeldPanel] = useState(false);


  const printTextRef = useRef(null);
  const kotPrintRef = useRef(null);
  const navigate = useNavigate();
  const isHotel = useMemo(
    () => String(shop?.billing_type || shop?.shop_type || "").toLowerCase() === "hotel",
    [shop]
  );

  /* ---------------- LOAD DATA ---------------- */
  const applyCachedData = useCallback((cached, { forceDefaultDiscount = false } = {}) => {
    if (!cached) return;

    if (cached.shop) {
      setShop(cached.shop);
      setGstEnabled(cached.shop?.gst_enabled || false);
      setGstPercent(Number(cached.shop?.gst_percent || 0));
      setGstMode(String(cached.shop?.gst_mode || "inclusive").toLowerCase());
      setInventoryEnabled(cached.shop?.inventory_enabled || false);
    }

    if (cached.branch) {
      setBranch(cached.branch);
      const discountAlreadyApplied =
        defaultDiscountBranchRef.current === branch_id && !forceDefaultDiscount;

      if (!discountAlreadyApplied && cached.branch?.discount_enabled) {
        const t = String(cached.branch.discount_type || "flat").toLowerCase();
        const v = Number(cached.branch.discount_value || 0);
        if (v > 0) {
          setDiscountType(t === "percent" ? "percent" : "flat");
          setDiscount(v);
        }
        defaultDiscountBranchRef.current = branch_id;
      }
    }

    if (cached.categories) setCategories(cached.categories);
    if (cached.items) setItemsData(cached.items);
    if (cached.priceLevels) setPriceLevels(cached.priceLevels);
    if (cached.priceMap) setPriceMap(cached.priceMap);
    if (cached.stock) setStockData(cached.stock);
  }, [branch_id]);

  const loadData = useCallback(async ({ forceDefaultDiscount = false } = {}) => {
    const cached = getCachedMasterData(branch_id);

    if (!navigator.onLine) {
      applyCachedData(cached, { forceDefaultDiscount });
      setOfflineMode(true);
      showToast("Offline mode: using cached data", "warning");
      return;
    }

    try {
      const shopRes = await authAxios.get("/shop/details");
      const s = shopRes.data || {};
      setShop(s);
      setGstEnabled(s?.gst_enabled || false);
      setGstPercent(Number(s?.gst_percent || 0));
      setGstMode(String(s?.gst_mode || "inclusive").toLowerCase());
      setInventoryEnabled(s?.inventory_enabled || false);
      cacheMasterData({ shop: s });

      let branchData = null;
      if (branch_id) {
        try {
          const br = await authAxios.get(`/branch/${branch_id}`);
          branchData = br.data || {};
          setBranch(branchData);
          const discountAlreadyApplied =
            defaultDiscountBranchRef.current === branch_id && !forceDefaultDiscount;

          if (!discountAlreadyApplied && branchData?.discount_enabled) {
            const t = String(branchData.discount_type || "flat").toLowerCase();
            const v = Number(branchData.discount_value || 0);
            if (v > 0) {
              setDiscountType(t === "percent" ? "percent" : "flat");
              setDiscount(v);
            }
            defaultDiscountBranchRef.current = branch_id;
          }
          cacheMasterData({ branch: branchData, branchId: branch_id });
        } catch {
          if (cached.branch) {
            applyCachedData({ branch: cached.branch }, { forceDefaultDiscount });
          }
        }
      }

      const cats = await authAxios.get("/category/");
      const catRows = cats.data || [];
      setCategories(catRows);
      cacheMasterData({ categories: catRows });

      const items = await authAxios.get("/items/");
      const itemRows = (items.data || []).filter((it) => !it?.is_raw_material);
      setItemsData(itemRows);
      cacheMasterData({ items: itemRows });

      // Pricing / price levels (optional, RBAC-controlled)
      try {
        const [lvlRes, allRes] = await Promise.all([
          authAxios.get("/pricing/levels"),
          authAxios.get("/pricing/all"),
        ]);
        const lvls = (lvlRes.data || [])
          .map(x => String(x?.level || "").trim().toUpperCase())
          .filter(Boolean);
        const map = {};
        for (const r of allRes.data || []) {
          const id = String(r.item_id);
          const lvl = String(r.level || "").trim().toUpperCase();
          if (!id || !lvl) continue;
          if (!map[id]) map[id] = {};
          map[id][lvl] = Number(r.price || 0);
        }
        setPriceLevels(["BASE", ...lvls]);
        setPriceMap(map);
        cacheMasterData({
          priceLevels: ["BASE", ...lvls],
          priceMap: map,
        });
      } catch {
        if (cached.priceLevels?.length) setPriceLevels(cached.priceLevels);
        if (cached.priceMap) setPriceMap(cached.priceMap);
      }

      if ((s?.inventory_enabled || cached?.shop?.inventory_enabled) && branch_id) {
        try {
          const stock = await authAxios.get("/inventory/list", {
            params: { branch_id }
          });
          const stockRows = stock.data || [];
          setStockData(stockRows);
          cacheMasterData({ stock: stockRows, branchId: branch_id });
        } catch {
          if (cached.stock?.length) setStockData(cached.stock);
        }
      } else {
        setStockData([]);
      }

      setOfflineMode(false);
    } catch {
      if (cached.hasAny) {
        applyCachedData(cached, { forceDefaultDiscount });
        setOfflineMode(true);
        showToast("Offline mode: using cached data", "warning");
      } else {
        showToast("Failed to load data", "error");
      }
    }
  }, [branch_id, applyCachedData, showToast]);

  useEffect(() => {
    defaultDiscountBranchRef.current = null;
    loadData({ forceDefaultDiscount: true });
  }, [branch_id, loadData]);

  const loadHeldDrafts = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const res = await authAxios.get("/invoice/draft/list");
      setHeldDrafts(res.data || []);
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    loadHeldDrafts();
  }, [loadHeldDrafts]);

  useEffect(() => {
    const handleOnline = () => {
      setOfflineMode(false);
      loadData({ forceDefaultDiscount: false });
    };
    const handleOffline = () => setOfflineMode(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [branch_id, loadData]);

  /* ---------------- CUSTOMER AUTO-FILL ---------------- */
  const fetchCustomerByMobile = async mobile => {
    if (!mobile || mobile.length !== 10) return;

    const extractName = data =>
      (data?.customer_name ||
        data?.customerName ||
        data?.name ||
        data?.customer?.customer_name ||
        data?.customer?.name ||
        "").trim();

    const extractGst = data =>
      (data?.gst_number ||
        data?.gstNumber ||
        data?.customer?.gst_number ||
        data?.customer?.gstNumber ||
        "").trim();

    const applyCustomer = (name, gst) => {
      if (!name) return false;
      setCustomer(prev => ({
        ...prev,
        name,
        gst_number: prev.gst_number || gst || "",
      }));
      showToast("Customer loaded from previous bill", "success");
      return true;
    };

    try {
      const res = await authAxios.get(
        `/invoice/customer/by-mobile/${mobile}`
      );

      const fetchedName = extractName(res.data);
      const fetchedGst = extractGst(res.data);
      const applied = applyCustomer(fetchedName, fetchedGst);

      // Fallback: master customers table (in case invoices don't have names).
      if (!applied) {
        try {
          const res2 = await authAxios.get(`/customers/by-mobile/${mobile}`);
          applyCustomer(extractName(res2.data), extractGst(res2.data));
        } catch (fallbackErr) {
          console.warn("No customer record found for mobile", fallbackErr?.response?.status);
        }
      }
    } catch (err) {
      console.error("Failed to fetch customer by mobile", err);
    }
  };

  /* ---------------- MOBILE & NAME ---------------- */
  const handleMobileChange = e => {
    let value = e.target.value.replace(/\D/g, "");
    if (value.length > 10) value = value.slice(0, 10);

    setCustomer(prev => ({ ...prev, mobile: value, name: value ? prev.name : "NA" }));
    if (value.length === 10) fetchCustomerByMobile(value);
  };

  const handleMobileBlur = () => {
    if (!customer.mobile || customer.mobile.length < 10) {
      setCustomer(prev => ({ ...prev, mobile: DEFAULT_MOBILE, name: "NA" }));
    } else {
      fetchCustomerByMobile(customer.mobile);
    }
  };

  const handleNameChange = e => {
    const value = e.target.value.replace(/[^a-zA-Z\s]/g, "");
    setCustomer(prev => ({ ...prev, name: value || "NA" }));
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
  const categoryNameById = useMemo(
    () =>
      categories.reduce((acc, cat) => {
        acc[String(cat.category_id)] = cat.category_name;
        return acc;
      }, {}),
    [categories]
  );

  const filteredItems = itemsData
    .map(item => ({ ...item, stock: getStock(item.item_id) }))
    .filter(item =>
      item.item_name.toLowerCase().includes(itemSearch.toLowerCase()) &&
      (selectedCat === "All" || item.category_id == selectedCat)
    )
    .sort((a, b) => (b.stock ?? 0) - (a.stock ?? 0));

  const isWeightItem = item => Boolean(item?.sold_by_weight);

  const normalizeWeightGrams = value => {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(1, Math.round(n));
  };

  const computeWeightLineAmount = (ratePerKg, grams) => {
    const weightKg = normalizeWeightGrams(grams) / 1000;
    return Math.round(Number(ratePerKg || 0) * weightKg);
  };

  const openWeightModal = (item, initial = 250) => {
    setPendingWeightItem(item);
    setWeightInput(String(normalizeWeightGrams(initial)));
    setWeightModalVisible(true);
  };

  const closeWeightModal = () => {
    setWeightModalVisible(false);
    setPendingWeightItem(null);
  };

  const getLineAmount = item => {
    if (isWeightItem(item)) return Number(item.price || 0);
    return Number(item.price || 0) * Number(item.qty || 0);
  };

  /* ---------------- CART FUNCTIONS ---------------- */
  const addToCart = item => {
    const isRaw = Boolean(item?.is_raw_material);
    if (!isWeightItem(item) && inventoryEnabled && (!isHotel || isRaw) && getEffectiveStock(item.item_id) <= 0)
      return showToast("Out of stock", "error");

    if (isWeightItem(item)) {
      const ex = cart.find(x => x.item_id === item.item_id);
      openWeightModal(item, ex?.weight_grams || 250);
      return;
    }

    setCart(prev => {
      const ex = prev.find(x => x.item_id === item.item_id);
      if (ex && !isWeightItem(item))
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
        x.item_id === id
          ? (isWeightItem(x) ? x : { ...x, qty: Math.max(1, x.qty + delta) })
          : x
      )
    );

  const setQty = (id, val) => {
    const inCart = cart.find(i => i.item_id === id);
    if (isWeightItem(inCart)) return;
    const q = Math.max(1, Number(val) || 1);
    const item = itemsData.find(i => i.item_id === id);
    const isRaw = Boolean(item?.is_raw_material);
    if (inventoryEnabled && (!isHotel || isRaw) && q > getStock(id))
      return showToast("Exceeds stock limit", "error");

    setCart(prev =>
      prev.map(x => (x.item_id === id ? { ...x, qty: q } : x))
    );
  };

  const setWeightGrams = (id, val) => {
    const grams = normalizeWeightGrams(val);
    if (!grams) return;
    setCart(prev =>
      prev.map(x =>
        x.item_id === id
          ? {
              ...x,
              qty: 1,
              weight_grams: grams,
              price: computeWeightLineAmount(x.unit_rate ?? x.price, grams),
            }
          : x
      )
    );
  };

  const confirmWeightAddOrUpdate = () => {
    if (!pendingWeightItem) return;
    const grams = normalizeWeightGrams(weightInput);
    if (!grams) {
      showToast("Enter valid weight in grams", "error");
      return;
    }

    const item = pendingWeightItem;
    const unitPrice = getPriceForItem(item);

    setCart(prev => {
      const ex = prev.find(x => x.item_id === item.item_id);
      if (ex) {
        const nextGrams = normalizeWeightGrams(Number(ex.weight_grams || 0) + grams);
        return prev.map(x =>
          x.item_id === item.item_id
            ? {
                ...x,
                qty: 1,
                weight_grams: nextGrams,
                unit_rate: unitPrice,
                price: computeWeightLineAmount(unitPrice, nextGrams),
              }
            : x
        );
      }

      return [
        ...prev,
        {
          ...item,
          base_price: Number(item.price || 0),
          price_level: String(priceLevel || "BASE").toUpperCase(),
          qty: 1,
          weight_grams: grams,
          unit_rate: unitPrice,
          price: computeWeightLineAmount(unitPrice, grams),
        },
      ];
    });

    closeWeightModal();
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
        unit_rate: isWeightItem(x) ? getPriceForItem(x) : x.unit_rate,
        price: isWeightItem(x)
          ? computeWeightLineAmount(getPriceForItem(x), x.weight_grams || 250)
          : getPriceForItem(x)
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
  const subTotal = cart.reduce((t, x) => t + getLineAmount(x), 0);

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

  const payable = Math.round(grossTotal - discountValue);
  const hasRealCustomerMobile =
    String(customer.mobile || "").trim() &&
    String(customer.mobile || "").trim() !== DEFAULT_MOBILE &&
    !/^9{9,}$/.test(String(customer.mobile || "").trim());
  const hasCustomerName =
    String(customer.name || "").trim() &&
    String(customer.name || "").trim().toUpperCase() !== "NA";
  const customerSummary = hasRealCustomerMobile || hasCustomerName || customer.gst_number
    ? [hasCustomerName ? customer.name : null, hasRealCustomerMobile ? customer.mobile : null, customer.gst_number ? "GST added" : null]
        .filter(Boolean)
        .join(" • ")
    : "Tap to add customer";

  const splitTotal = splitModes
    .map(k => Number(split[k] || 0))
    .reduce((a, b) => a + b, 0);

  /* ---------------- PRINT ---------------- */
  const generateBillText = invoiceNo => {
    const is80mm = (branch?.paper_size || "58mm") === "80mm";
    const WIDTH    = is80mm ? 48 : 32;
    const ITEM_COL = is80mm ? 22 : 14;
    const QTY_COL  = is80mm ? 5  : 4;
    const RATE_COL = is80mm ? 9  : 6;
    const TOTAL_COL = WIDTH - ITEM_COL - QTY_COL - RATE_COL;
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
    t += `Date : ${formatBusinessDate(getBusinessDate(shop?.app_date), "en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })}\n`;
    const isPlaceholder = customer.mobile === DEFAULT_MOBILE || /^9{9,}$/.test(customer.mobile);
    if (!isPlaceholder) {
      t += `Customer : ${customer.name}\n`;
      t += `Mobile : ${maskMobileForPrint(customer.mobile)}\n`;
      if (customer.gst_number) t += `GSTIN : ${customer.gst_number}\n`;
    }
    if (splitEnabled) {
      const parts = [
        ["Cash", split.cash],
        ["Card", split.card],
        ["UPI", split.upi],
        ["GiftCard", split.gift_card],
        ["Wallet", split.wallet],
      ]
        .map(([label, value]) => [label, Number(value || 0)])
        .filter(([, value]) => value > 0)
        .map(([label, value]) => `${label} ${value.toFixed(2)}`);

      const codeTxt =
        Number(split.gift_card || 0) > 0 && String(giftCardCode || "").trim()
          ? `, Code ${String(giftCardCode || "").trim().toUpperCase()}`
          : "";

      t += `Payment : Split (${parts.join(", ") || "0.00"})${codeTxt}\n`;
    } else {
      const pm = String(paymentMode || "cash");
      const codeTxt =
        pm === "gift_card" && String(giftCardCode || "").trim()
          ? ` (${String(giftCardCode || "").trim().toUpperCase()})`
          : "";
      t += `Payment : ${paymentModeLabel(pm)}${codeTxt}\n`;
    }
    t += line + "\n";
    t +=
      "Item".padEnd(ITEM_COL) +
      "Qty".padStart(QTY_COL) +
      "Rate".padStart(RATE_COL) +
      "Total".padStart(TOTAL_COL) +
      "\n";
    t += line + "\n";
    cart.forEach(i => {
      const qtyLabel = isWeightItem(i)
        ? `${Math.round(Number(i.weight_grams || 0))}g`
        : String(i.qty);
      const rateValue = isWeightItem(i)
        ? Number(i.unit_rate || i.price || 0)
        : Number(i.price || 0);
      const lineAmount = getLineAmount(i);
      t +=
        i.item_name.slice(0, ITEM_COL).padEnd(ITEM_COL) +
        qtyLabel.padStart(QTY_COL) +
        rateValue.toFixed(2).padStart(RATE_COL) +
        lineAmount.toFixed(2).padStart(TOTAL_COL) +
        "\n";
    });
    t += line + "\n";
    const totalItems = cart.reduce((s, i) => s + (isWeightItem(i) ? 1 : Number(i.qty || 0)), 0);
    const left = `Items: ${totalItems}`;
    const right = `Subtotal : ${subTotal.toFixed(2)}`;
    const gap = Math.max(1, WIDTH - left.length - right.length);
    t += left + " ".repeat(gap) + right + "\n";
    if (gstEnabled) t += rightKV(`GST ${gstPercent}%`, tax.toFixed(2)) + "\n";
    if (discountValue) t += rightKV("Discount", discountValue.toFixed(2)) + "\n";
    t += rightKV("Grand Total", payable.toFixed(2)) + "\n";
    t += line + "\n";
    const fssai = String(branch?.fssai_number || shop?.fssai_number || "").trim();
    if (fssai) t += center(`FSSAI No: ${fssai}`) + "\n";
    // Footer + 4 blank lines to ensure the message prints on the same ticket
    t += center("Thank You! Visit Again") + "\n";
    t += "\n".repeat(4);
    return t;
  };

  const generateFeedbackQrHtml = async (invoiceNo) => {
    return buildFeedbackQrHtml({
      shopId: shop?.shop_id,
      invoiceNo,
      enabled: branch?.feedback_qr_enabled !== false,
    });
  };

  const generateLogoHtml = async () => {
    if (branch?.print_logo_enabled === false) return "";
    return `<img src="${appLogo}" alt="Logo" style="max-height:20mm;max-width:100%;display:block;margin:0 auto 2px;" />`;
  };

  const generateKOTText = (kotItems, invoiceNumber, customerName, categoryLabel = null) => {
    const is80mm = (branch?.paper_size || "58mm") === "80mm";
    const WIDTH = is80mm ? 48 : 32;
    const NAME_COL = is80mm ? 34 : 22;
    const COUNT_COL = is80mm ? 10 : 8;
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
    t += center(buildBusinessDateTimeLabel(getBusinessDate(shop?.app_date))) + "\n";
    t += center("Take Away") + "\n";
    t += line + "\n";
    t += `Invoice : ${invoiceNumber || "N/A"}`.slice(0, WIDTH).padEnd(WIDTH) + "\n";
    t += `Customer: ${(customerName || "N/A").slice(0, 22)}`.padEnd(WIDTH) + "\n";
    if (categoryLabel) {
      t += `Category: ${categoryLabel.slice(0, 22)}`.padEnd(WIDTH) + "\n";
    }
    t += line + "\n";
    t += "Item Name".padEnd(NAME_COL) + rightCol("Item Count", COUNT_COL) + "\n";
    t += line + "\n";
    kotItems.forEach(i => {
      const name = String(i.item_name || "").slice(0, NAME_COL).padEnd(NAME_COL);
      const count = isWeightItem(i)
        ? `${Math.round(Number(i.weight_grams || 0))}g`
        : String(i.qty || 0);
      t += name + rightCol(count, COUNT_COL) + "\n";
    });
    t += line + "\n";
    const totalItems = kotItems.reduce((s, i) => s + (isWeightItem(i) ? 1 : Number(i.qty || 0)), 0);
    t += center(`Total Count - ${totalItems}`) + "\n";
    t += line + "\n";
    return t;
  };

  const printKOT = async (invoiceNumber, customerName) => {
    // Group cart items by category — one KOT ticket per category
    const grouped = {};
    cart.forEach(item => {
      const catId = String(item.category_id || "other");
      if (!grouped[catId]) grouped[catId] = [];
      grouped[catId].push(item);
    });

    const catIds = Object.keys(grouped);
    const multiCat = catIds.length > 1;

    for (const catId of catIds) {
      const label = multiCat ? (categoryNameById[catId] || catId) : null;
      const ok = await printDirectText(
        generateKOTText(grouped[catId], invoiceNumber, customerName, label),
        { fontSize: 9, paperSize: branch?.paper_size || "58mm" }
      );
      if (!ok) {
        showToast("Printing failed. Check printer/popup settings.", "error");
        break;
      }
    }
  };

  const createTrackedTakeawayKot = async (invoiceNumber) => {
    if (!isHotel || branch?.kot_required === false) return;

    const takeawayRes = await authAxios.post("/table-billing/takeaway", {
      customer_name: customer.name,
      mobile: customer.mobile,
      notes: invoiceNumber ? `Sales billing invoice ${invoiceNumber}` : "Sales billing takeaway",
      token_number: invoiceNumber || null,
      items: cart.map((item) => ({
        item_id: item.item_id,
        quantity: item.qty,
      })),
    });

    const orderId = takeawayRes?.data?.order_id;
    if (!orderId) {
      throw new Error("Tracked takeaway order was not created");
    }

    await authAxios.post(`/kot/create/${orderId}`);
  };

  const resetBillForm = () => {
    setCart([]);
    setCustomer({ mobile: DEFAULT_MOBILE, name: "NA", gst_number: "" });
    setDiscount(0);
    setCouponCode("");
    setCouponDiscount(0);
    setCouponMsg("");
    setPaymentMode("cash");
    setSplitEnabled(false);
    setSplit({ cash: "", card: "", upi: "", gift_card: "", wallet: "" });
    setGiftCardCode("");
  };

  const saveInvoice = async (print = false) => {
    if (!customer.mobile || customer.mobile.length < 10)
      return showToast("Enter valid 10-digit mobile", "error");
    if (!customer.name) return showToast("Customer name required", "error");
    if (!cart.length) return showToast("Cart empty", "error");
    if (splitEnabled && Math.abs(splitTotal - payable) > 0.01) {
      return showToast("Split amounts must equal payable total", "error");
    }
    if (!splitEnabled && paymentMode === "gift_card" && !String(giftCardCode || "").trim()) {
      return showToast("Enter gift card code", "error");
    }
    if (splitEnabled && Number(split.gift_card || 0) > 0 && !String(giftCardCode || "").trim()) {
      return showToast("Enter gift card code for gift card split", "error");
    }
    if (!splitEnabled && paymentMode === "wallet" && /^9{9,}$/.test(String(customer.mobile || ""))) {
      return showToast("Valid customer mobile required for wallet payment", "error");
    }
    if (splitEnabled && Number(split.wallet || 0) > 0 && /^9{9,}$/.test(String(customer.mobile || ""))) {
      return showToast("Valid customer mobile required for wallet split", "error");
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
            upi: Number(split.upi || 0),
            gift_card_amount: Number(split.gift_card || 0),
            gift_card_code: String(giftCardCode || "").trim() || null,
            wallet_amount: Number(split.wallet || 0),
            wallet_mobile: String(customer.mobile || "").trim() || null,
          }
        : paymentMode === "gift_card"
          ? {
              gift_card_amount: Number(payable || 0),
              gift_card_code: String(giftCardCode || "").trim() || null,
            }
          : paymentMode === "wallet"
            ? {
                wallet_amount: Number(payable || 0),
                wallet_mobile: String(customer.mobile || "").trim() || null,
              }
            : null,
      items: cart.map(x => ({
        item_id: x.item_id,
        quantity: x.qty,
        amount: getLineAmount(x)
      }))
    };

    try {
      const res = await authAxios.post(`/invoice/`, payload);
      let trackingWarning = "";

      if (branch?.kot_required !== false) {
        if (isHotel) {
          try {
            await createTrackedTakeawayKot(res?.data?.invoice_number);
          } catch (trackingErr) {
            trackingWarning =
              trackingErr?.response?.data?.detail ||
              trackingErr?.message ||
              "Order tracking was not created for this takeaway bill";
          }
        }

        await printKOT(res?.data?.invoice_number, customer.name);
      }

      if (print && branch?.receipt_required !== false) {
        const [logoHtml, qrHtml] = await Promise.all([
          generateLogoHtml(),
          generateFeedbackQrHtml(res.data.invoice_number),
        ]);
        const ok = await printDirectText(generateBillText(res.data.invoice_number), {
          fontSize: 8,
          paperSize: branch?.paper_size || "58mm",
          headerHtml: logoHtml,
          extraHtml: qrHtml,
        });
        if (!ok) showToast("Printing failed. Check printer/popup settings.", "error");
      } else if (print && branch?.receipt_required === false) {
        showToast("Receipt printing disabled for this branch", "warning");
      }

      showToast(
        trackingWarning ? `Bill saved. ${trackingWarning}` : "Bill saved",
        trackingWarning ? "warning" : "success"
      );
      resetBillForm();
      defaultDiscountBranchRef.current = null;
      await loadData({ forceDefaultDiscount: true });
    } catch (err) {
      const isNetworkError = !err?.response || !navigator.onLine;
      if (isNetworkError) {
        addOfflineBill(payload);
        showToast("Saved offline. It will auto-sync when internet returns.", "warning");

        resetBillForm();
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
    if (!splitEnabled && paymentMode === "gift_card" && !String(giftCardCode || "").trim()) {
      return showToast("Enter gift card code", "error");
    }
    if (splitEnabled && Number(split.gift_card || 0) > 0 && !String(giftCardCode || "").trim()) {
      return showToast("Enter gift card code for gift card split", "error");
    }
    if (!splitEnabled && paymentMode === "wallet" && /^9{9,}$/.test(String(customer.mobile || ""))) {
      return showToast("Valid customer mobile required for wallet payment", "error");
    }
    if (splitEnabled && Number(split.wallet || 0) > 0 && /^9{9,}$/.test(String(customer.mobile || ""))) {
      return showToast("Valid customer mobile required for wallet split", "error");
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
            upi: Number(split.upi || 0),
            gift_card_amount: Number(split.gift_card || 0),
            gift_card_code: String(giftCardCode || "").trim() || null,
            wallet_amount: Number(split.wallet || 0),
            wallet_mobile: String(customer.mobile || "").trim() || null,
          }
        : paymentMode === "gift_card"
          ? {
              gift_card_amount: Number(payable || 0),
              gift_card_code: String(giftCardCode || "").trim() || null,
            }
          : paymentMode === "wallet"
            ? {
                wallet_amount: Number(payable || 0),
                wallet_mobile: String(customer.mobile || "").trim() || null,
              }
            : null,
      items: cart.map(x => ({
        item_id: x.item_id,
        quantity: x.qty,
        amount: getLineAmount(x)
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
      setSplit({ cash: "", card: "", upi: "", gift_card: "", wallet: "" });
      setGiftCardCode("");
      defaultDiscountBranchRef.current = null;
      await loadData({ forceDefaultDiscount: true });
      loadHeldDrafts();
    } catch (err) {
      const msg = err?.response?.data?.detail || "Draft save failed";
      showToast(msg, "error");
    }
  };

  const restoreFromDraft = (draft) => {
    const restoredCart = [];
    for (const draftItem of draft.items) {
      const fullItem = itemsData.find(i => i.item_id === draftItem.item_id);
      if (!fullItem) continue;
      const price = draftItem.quantity > 0
        ? draftItem.amount / draftItem.quantity
        : Number(fullItem.price || 0);
      const derivedWeight = fullItem?.sold_by_weight && Number(fullItem.price || 0) > 0
        ? Math.max(1, Math.round((Number(draftItem.amount || 0) * 1000) / Number(fullItem.price || 1)))
        : null;
      restoredCart.push({
        ...fullItem,
        base_price: Number(fullItem.price || 0),
        price_level: "BASE",
        unit_rate: fullItem?.sold_by_weight ? Number(fullItem.price || 0) : undefined,
        weight_grams: derivedWeight,
        price: fullItem?.sold_by_weight
          ? computeWeightLineAmount(Number(fullItem.price || 0), derivedWeight || 250)
          : price,
        qty: fullItem?.sold_by_weight ? 1 : draftItem.quantity,
      });
    }
    setCart(restoredCart);
    setCustomer({
      mobile: draft.mobile || DEFAULT_MOBILE,
      name: draft.customer_name || "NA",
      gst_number: draft.gst_number || "",
    });
    setDiscount(Number(draft.discounted_amt || 0));
    setCouponCode("");
    setCouponDiscount(0);
    setCouponMsg("");
    const mode = draft.payment_mode || "cash";
    if (mode === "split") {
      setSplitEnabled(true);
      const ps = draft.payment_split || {};
      setSplit({
        cash: ps.cash || "",
        card: ps.card || "",
        upi: ps.upi || "",
        gift_card: ps.gift_card_amount || "",
        wallet: ps.wallet_amount || "",
      });
      setGiftCardCode(ps.gift_card_code || "");
    } else {
      setSplitEnabled(false);
      setPaymentMode(mode);
      if (mode === "gift_card") setGiftCardCode(draft.payment_split?.gift_card_code || "");
      else if (mode === "wallet") setGiftCardCode("");
      else setGiftCardCode("");
    }
    setShowHeldPanel(false);
    showToast(`Draft ${draft.draft_number} restored to cart`, "success");
  };

  return (
    <>
      <style>{`
        html, body, #root { height: 100%; margin: 0; padding: 0; overflow: hidden; }
        .no-scroll::-webkit-scrollbar { display: none; }
        .no-scroll { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <div className="h-full flex flex-col overflow-hidden">

      {/* ── Top bar ── */}
      <div className="px-3 pt-2 pb-2 flex items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/home", { replace: true })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border bg-white shadow-sm text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
          >
            ← Back
          </button>
          <span className="text-sm font-bold text-gray-700 hidden sm:block">New Bill</span>
        </div>
        <div className="flex items-center gap-2">
          {cart.length > 0 && (
            <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full">
              {cart.length} item{cart.length > 1 ? "s" : ""} · ₹{payable.toFixed(0)}
            </span>
          )}
          {heldDrafts.length > 0 && (
            <button
              onClick={() => setShowHeldPanel(true)}
              className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl border bg-amber-50 border-amber-200 shadow-sm text-xs font-bold text-amber-700 hover:bg-amber-100 transition"
            >
              ⏸ Held
              <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {heldDrafts.length}
              </span>
            </button>
          )}
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
            offlineMode
              ? "bg-amber-50 text-amber-700 border-amber-200"
              : "bg-emerald-50 text-emerald-700 border-emerald-200"
          }`}>
            {offlineMode ? "⚡ Offline" : "● Online"}
          </span>
        </div>
      </div>

      {/* ── Held Bills Panel ── */}
      {showHeldPanel && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowHeldPanel(false)} />
          <div className="relative w-full max-w-sm bg-white h-full shadow-2xl flex flex-col">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <p className="text-sm font-bold text-gray-700">⏸ Held Bills ({heldDrafts.length})</p>
              <button onClick={() => setShowHeldPanel(false)} className="text-gray-400 hover:text-gray-600 text-lg font-bold">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {heldDrafts.length === 0 ? (
                <p className="text-xs text-gray-400 text-center mt-8">No held bills</p>
              ) : (
                heldDrafts.map(draft => (
                  <button
                    key={draft.draft_id}
                    onClick={() => restoreFromDraft(draft)}
                    className="w-full text-left bg-white border border-amber-200 rounded-xl px-4 py-3 hover:bg-amber-50 hover:border-amber-400 transition shadow-sm"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-bold text-amber-700">{draft.draft_number}</span>
                      <span className="text-[10px] text-gray-400">{draft.items?.length || 0} item{draft.items?.length !== 1 ? "s" : ""}</span>
                    </div>
                    <p className="text-xs font-semibold text-gray-700">{draft.customer_name || "—"}</p>
                    {draft.mobile && draft.mobile !== "9999999999" && (
                      <p className="text-[10px] text-gray-400">{draft.mobile}</p>
                    )}
                    <p className="text-[11px] font-bold text-blue-600 mt-1">₹{Number(draft.discounted_amt || 0).toFixed(0)}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Three-panel grid ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[15%_50%_35%] gap-3 px-3 pb-4 flex-1 min-h-0">

        {/* ── PANEL 1: Categories ── */}
        <aside className="bg-white rounded-2xl border shadow-sm flex flex-col overflow-hidden">
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
              onClick={() => setSelectedCat("All")}
              className={`w-full text-left px-3 py-2 rounded-xl text-[12px] font-medium transition ${
                selectedCat === "All"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              All Items
            </button>
            {filteredCategories.map(c => (
              <button
                key={c.category_id}
                onClick={() => setSelectedCat(c.category_id)}
                className={`w-full text-left px-3 py-2 rounded-xl text-[12px] font-medium transition ${
                  selectedCat === c.category_id
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
        <div className="bg-white rounded-2xl border shadow-sm flex flex-col overflow-hidden">
          <div className="px-3 pt-3 pb-2 border-b flex items-center gap-2">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Items</p>
            <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-1.5">{filteredItems.length}</span>
            <input
              className="flex-1 border border-gray-200 rounded-xl px-2.5 py-1.5 text-[11px] bg-gray-50 focus:outline-none focus:border-blue-400 ml-auto max-w-xs"
              placeholder="Search item…"
              value={itemSearch}
              onChange={e => setItemSearch(e.target.value)}
            />
          </div>

          <div className="flex-1 overflow-y-auto no-scroll p-3">
            {filteredItems.length ? (
              <div className="grid grid-cols-3 sm:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-1">
                {filteredItems.map(item => {
                const stock = getEffectiveStock(item.item_id);
                const isRaw = Boolean(item?.is_raw_material);
                const out = inventoryEnabled && (!isHotel || isRaw) && stock <= 0;
                const imgUrl = item.image_filename ? `${API_BASE}/item-images/${item.image_filename}` : "";
                const showStockLabel = inventoryEnabled && (isRaw || !isHotel);
                const isSelected = selectedItemIds.has(item.item_id);
                const cartEntry = cart.find(c => c.item_id === item.item_id);
                const cartQty = cartEntry?.qty || 0;
                const categoryName = categoryNameById[String(item.category_id)] || "Item";

                return (
                  <button
                    key={item.item_id}
                    disabled={out}
                    onClick={() => addToCart(item)}
                    className={`
                      group relative overflow-hidden rounded-md border text-left transition-all
                      ${out ? "cursor-not-allowed border-red-200 bg-red-50 opacity-50" : "cursor-pointer bg-white hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"}
                      ${isSelected ? "border-blue-300 bg-blue-50 shadow-sm" : "border-gray-200"}
                    `}
                  >
                    {/* Tiny thumbnail */}
                    <div className={`relative aspect-square w-full overflow-hidden ${out ? "bg-red-100" : "bg-gradient-to-br from-slate-50 via-white to-blue-50"}`}>
                      {imgUrl ? (
                        <img src={imgUrl} alt={item.item_name} className="w-full h-full object-cover"
                          onError={e => { e.currentTarget.style.display = "none"; }} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[11px] text-gray-300">🛍</div>
                      )}
                    </div>

                    <span className="absolute left-1 top-1 rounded-full bg-white/90 px-1 py-0.5 text-[7px] font-semibold text-slate-600 shadow-sm">
                      {categoryName}
                    </span>

                    <div className="p-1 min-w-0 space-y-0.5">
                      <p className="truncate text-[9px] font-semibold leading-tight text-gray-800">{item.item_name}</p>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-extrabold text-blue-700">Rs.{Number(getPriceForItem(item)).toFixed(0)}</span>
                        {showStockLabel && (
                          <span className={`text-[7px] font-semibold ${getStockColor(stock)}`}>Stock {stock}</span>
                        )}
                      </div>
                    </div>

                    {isSelected && (
                      <span className="absolute right-1 top-1 min-w-[18px] h-4.5 rounded-full bg-blue-600 px-1 text-[8px] font-bold text-white shadow-sm flex items-center justify-center">
                        {isWeightItem(cartEntry) ? `${Math.round(Number(cartEntry?.weight_grams || 0))}g` : cartQty}
                      </span>
                    )}
                    {out && (
                      <span className="absolute inset-x-0 bottom-0 bg-red-600/90 px-1 py-0.5 text-center text-[8px] font-bold tracking-wide text-white">OUT OF STOCK</span>
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
        <div className="bg-white rounded-2xl border shadow-sm flex flex-col overflow-hidden min-h-0">

          {/* ── Customer ── */}
          <div className="px-3 pt-2 pb-1.5 border-b space-y-1.5">
            <button
              type="button"
              onClick={() => setShowCustomerDetails(v => !v)}
              className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-left transition hover:border-blue-200 hover:bg-blue-50/40"
            >
              <div className="flex items-center justify-between gap-2">
                <div>

                {weightModalVisible && (
                  <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4">
                    <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white shadow-2xl p-4">
                      <h3 className="text-sm font-bold text-slate-800">Enter Weight (grams)</h3>
                      <p className="mt-1 text-xs text-slate-500">{pendingWeightItem?.item_name || ""}</p>
                      <input
                        type="number"
                        autoFocus
                        className="mt-3 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                        value={weightInput}
                        onChange={e => setWeightInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") confirmWeightAddOrUpdate();
                        }}
                        placeholder="e.g. 250"
                      />
                      <div className="mt-4 flex gap-2">
                        <button
                          onClick={closeWeightModal}
                          className="flex-1 rounded-lg border border-slate-300 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={confirmWeightAddOrUpdate}
                          className="flex-1 rounded-lg py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700"
                        >
                          OK
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                  <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Customer</p>
                  <p className="text-[10px] font-medium text-gray-600">{customerSummary}</p>
                </div>
                <span className="text-[9px] font-bold text-gray-400">{showCustomerDetails ? "Hide" : "Show"}</span>
              </div>
            </button>

            {showCustomerDetails && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Price Level</span>
                  <div className="flex items-center gap-1">
                    <select
                      className="border border-gray-200 rounded-lg px-1.5 py-0.5 text-[10px] bg-gray-50 focus:outline-none"
                      value={priceLevel}
                      onChange={e => setPriceLevel(e.target.value)}
                    >
                      {priceLevels.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                    <button onClick={applyPriceLevelToCart} className="text-[10px] px-2 py-0.5 border rounded-lg bg-gray-50 hover:bg-gray-100">Apply</button>
                  </div>
                </div>

                <div className="flex gap-1.5">
                  <div className="flex-1">
                    <label className="text-[9px] text-gray-400 font-semibold uppercase">Mobile</label>
                    <input
                      inputMode="numeric" maxLength={10}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[12px] bg-gray-50 focus:outline-none focus:border-blue-400"
                      value={customer.mobile}
                      onFocus={() => setCustomer(p => ({ ...p, mobile: "" }))}
                      onChange={handleMobileChange}
                      onBlur={handleMobileBlur}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[9px] text-gray-400 font-semibold uppercase">Name</label>
                    <input
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[12px] bg-gray-50 focus:outline-none focus:border-blue-400"
                      value={customer.name}
                      onChange={handleNameChange}
                      onFocus={() => { if (customer.name === "NA") setCustomer(p => ({ ...p, name: "" })); }}
                      onBlur={() => { if (!customer.name?.trim()) setCustomer(p => ({ ...p, name: "NA" })); }}
                    />
                  </div>
                </div>

                <input
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[11px] bg-gray-50 focus:outline-none focus:border-blue-400"
                  value={customer.gst_number}
                  onChange={e => setCustomer({ ...customer, gst_number: e.target.value })}
                  placeholder="Customer GST (optional)"
                />
              </>
            )}
          </div>

          {/* ── Cart ── */}
          {cart.length > 0 && (
            <div className="px-3 pt-1.5 pb-0 flex items-center justify-between">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Cart</span>
              <button
                onClick={() => setCart([])}
                className="text-[10px] font-semibold text-red-400 hover:text-red-600 transition"
              >
                Clear all
              </button>
            </div>
          )}
          <div className="flex-1 overflow-y-auto no-scroll px-2 py-1 min-h-0">
            {!cart.length ? (
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
                    <th className="w-5" />
                  </tr>
                </thead>
                <tbody>
                  {cart.map(item => (
                    <tr key={item.item_id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="py-1 pr-1">
                        <p className="font-semibold text-gray-800 leading-tight truncate max-w-[120px]">{item.item_name}</p>
                        <p className="text-[10px] text-gray-400">
                          {isWeightItem(item)
                            ? `₹${Number(item.unit_rate || item.price || 0).toFixed(2)}/kg`
                            : `₹${Number(item.price || 0).toFixed(2)} each`}
                        </p>
                      </td>
                      <td className="py-1">
                        {isWeightItem(item) ? (
                          <div className="flex items-center justify-center gap-0.5">
                            <input
                              type="number"
                              className="w-14 border border-gray-200 rounded text-center text-[11px] py-0 bg-white focus:outline-none"
                              value={Math.round(Number(item.weight_grams || 0))}
                              onChange={e => setWeightGrams(item.item_id, e.target.value)}
                            />
                            <span className="text-[10px] text-gray-400">g</span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-0.5">
                            <button onClick={() => changeQty(item.item_id, -1)}
                              className="w-5 h-5 rounded border bg-white text-gray-500 text-xs font-bold flex items-center justify-center hover:bg-gray-100">−</button>
                            <input
                              type="number"
                              className="w-8 border border-gray-200 rounded text-center text-[11px] py-0 bg-white focus:outline-none"
                              value={item.qty}
                              onChange={e => setQty(item.item_id, e.target.value)}
                            />
                            <button onClick={() => changeQty(item.item_id, 1)}
                              className="w-5 h-5 rounded border bg-white text-gray-500 text-xs font-bold flex items-center justify-center hover:bg-gray-100">+</button>
                          </div>
                        )}
                      </td>
                      <td className="py-1 text-right font-bold text-gray-800">₹{getLineAmount(item).toFixed(2)}</td>
                      <td className="py-1 pl-1">
                        <button onClick={() => removeItem(item.item_id)}
                          className="w-5 h-5 rounded bg-red-50 text-red-400 text-[10px] flex items-center justify-center hover:bg-red-100">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Coupon + Discount + Totals ── */}
          <div className="border-t px-3 py-1.5 space-y-1.5">
            <button
              type="button"
              onClick={() => setShowCouponEditor(v => !v)}
              className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-left transition hover:border-blue-200 hover:bg-blue-50/40"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Coupon</p>
                  <p className="text-[10px] font-medium text-gray-600">
                    {couponCode ? couponCode : couponMsg ? couponMsg : "Tap to add coupon"}
                  </p>
                </div>
                <span className="text-[9px] font-bold text-gray-400">{showCouponEditor ? "Hide" : "Show"}</span>
              </div>
            </button>

            {showCouponEditor && (
              <div className="space-y-1.5">
                <div className="flex gap-1.5">
                  <input
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-[11px] bg-gray-50 focus:outline-none focus:border-blue-400"
                    placeholder="Coupon code"
                    value={couponCode}
                    onChange={e => setCouponCode(e.target.value.toUpperCase())}
                  />
                  <button onClick={applyCoupon} className="px-2.5 py-1.5 rounded-lg border text-[11px] bg-gray-50 hover:bg-gray-100 font-semibold">Apply</button>
                  <button onClick={clearCoupon} className="px-2.5 py-1.5 rounded-lg border text-[11px] bg-gray-50 hover:bg-gray-100">X</button>
                </div>
                {couponMsg && (
                  <p className={`px-1 text-[10px] font-semibold ${couponDiscount > 0 ? "text-emerald-700" : "text-rose-600"}`}>
                    {couponMsg}
                  </p>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowBillDetails(v => !v)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left transition hover:border-blue-200"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-bold text-gray-800">Payable</span>
                <div className="text-right">
                  <div className="text-[13px] font-bold text-blue-700">₹{payable.toFixed(2)}</div>
                  <div className="text-[9px] font-semibold text-gray-400">{showBillDetails ? "Hide details" : "Show details"}</div>
                </div>
              </div>
            </button>

            {showBillDetails && (
              <div className="space-y-1.5">
                <div className="flex gap-1.5">
                  <select
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-[11px] bg-gray-50 focus:outline-none"
                    value={discountType}
                    onChange={e => setDiscountType(e.target.value)}
                  >
                    <option value="flat">Flat ₹</option>
                    <option value="percent">% Off</option>
                  </select>
                  <input
                    type="number"
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-[11px] bg-gray-50 focus:outline-none focus:border-blue-400"
                    value={discount}
                    onChange={e => setDiscount(e.target.value)}
                    placeholder="Discount amount"
                  />
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] space-y-1">
                  <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>₹{subTotal.toFixed(2)}</span></div>
                  {gstEnabled && <div className="flex justify-between text-gray-500"><span>GST {gstPercent}%</span><span>₹{tax.toFixed(2)}</span></div>}
                  {manualDiscountValue > 0 && <div className="flex justify-between text-rose-500 font-medium"><span>Discount</span><span>-₹{manualDiscountValue.toFixed(2)}</span></div>}
                  {Number(couponDiscount || 0) > 0 && <div className="flex justify-between text-emerald-600 font-medium"><span>Coupon</span><span>-₹{Number(couponDiscount || 0).toFixed(2)}</span></div>}
                  {discountValue > 0 && <div className="flex justify-between font-semibold text-gray-600"><span>Total discount</span><span>-₹{discountValue.toFixed(2)}</span></div>}
                  <div className="flex justify-between border-t border-slate-200 pt-1 text-[14px] font-bold">
                    <span className="text-gray-800">Payable</span>
                    <span className="text-blue-700">₹{payable.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Payment ── */}
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
                {paymentModes.map(m => (
                  <button
                    key={m}
                    onClick={() => setPaymentMode(m)}
                    className={`px-2 py-1 rounded-lg border text-[10px] font-bold transition ${
                      paymentMode === m
                        ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                        : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
                    }`}
                  >
                    {paymentModeLabel(m)}
                  </button>
                ))}
              </div>
            )}

            {((!splitEnabled && paymentMode === "gift_card") || (splitEnabled && Number(split.gift_card || 0) > 0)) && (
              <input
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[11px] bg-gray-50 focus:outline-none focus:border-blue-400"
                placeholder="Gift Card Code"
                value={giftCardCode}
                onChange={e => setGiftCardCode(e.target.value)}
              />
            )}

            {splitEnabled && (
              <>
                <div className="grid grid-cols-2 gap-1.5">
                  {splitModes.map(m => (
                    <div key={m}>
                      <label className="text-[9px] text-gray-400 font-semibold uppercase">{paymentModeLabel(m)}</label>
                      <input
                        type="number"
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[11px] bg-gray-50 focus:outline-none focus:border-blue-400 mt-0.5"
                        value={split[m]}
                        onChange={e => setSplit(s => ({ ...s, [m]: e.target.value }))}
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>
                <p className={`text-[10px] font-semibold ${Math.abs(splitTotal - payable) > 0.01 ? "text-red-500" : "text-emerald-600"}`}>
                  Split: ₹{splitTotal.toFixed(2)} / Payable: ₹{payable.toFixed(2)}
                </p>
              </>
            )}
          </div>

          {/* ── Action buttons ── */}
          <div className="px-3 pb-3 pt-2 grid grid-cols-3 gap-2 border-t">
            <button
              onClick={() => saveInvoice(false)}
              className="py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-[12px] font-bold shadow-sm transition"
            >
              💾 Save
            </button>
            <button
              onClick={saveDraft}
              className="py-2.5 rounded-xl bg-slate-500 hover:bg-slate-600 active:scale-95 text-white text-[12px] font-bold shadow-sm transition"
            >
              ⏸ Hold
            </button>
            <button
              onClick={() => saveInvoice(true)}
              className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-[12px] font-bold shadow-sm transition"
            >
              🖨 Print
            </button>
          </div>
        </div>
      </div>

      <div id="bill-print-area"><pre ref={printTextRef} style={{ fontSize: "12px" }} /></div>
      <div style={{ display: "none" }}><pre ref={kotPrintRef} /></div>

      </div>
    </>
  );
}
