import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";

import api from "../api/client";
import useOnlineStatus from "../hooks/useOnlineStatus";
import { API_BASE, WEB_APP_BASE } from "../config/api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import {
  cacheCategories,
  cacheItems,
  getCachedCategories,
  getCachedItems,
} from "../offline/cache";
import { enqueueInvoice, getPendingCount } from "../offline/queue";
import { syncOfflineQueue } from "../offline/sync";
import { printInvoiceByNumber, printKotTokenSlip } from "../utils/printInvoice";

const DEFAULT_MOBILE = "9999999999";
const PAYMENT_MODES  = ["cash", "card", "upi", "credit", "gift_card", "coupon", "split", "wallet"];
const fmt = (n) => `₹${Number(n || 0).toFixed(2)}`;
const BILL_ACTIONS = {
  PRINT_BOTH: "print_both",
  SAVE_ONLY: "save_only",
  HOLD: "hold",
};

const normalizeServiceCharge = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
};

const normalizeWeightGrams = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(1, Math.round(n));
};

const computeWeightLineAmount = (ratePerKg, grams) => {
  const g = normalizeWeightGrams(grams);
  const kg = g / 1000;
  return Math.round(Number(ratePerKg || 0) * kg);
};

const branchDiscountAmount = (subtotal, branchDetails) => {
  const enabled = Boolean(branchDetails?.discount_enabled);
  if (!enabled) return 0;
  const raw = Number(branchDetails?.discount_value || 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  const discountType = String(branchDetails?.discount_type || "flat").toLowerCase();
  if (discountType === "percent") {
    return Math.max(0, Math.min(subtotal, (subtotal * raw) / 100));
  }
  return Math.max(0, Math.min(subtotal, raw));
};

const toAmount = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const isAbsoluteUrl = (v) => /^https?:\/\//i.test(String(v || ""));

const resolveItemImageUrl = (item) => {
  const imageFilename = String(item?.image_filename || "").trim();
  if (imageFilename) {
    return `${String(API_BASE || "").replace(/\/+$/, "")}/item-images/${encodeURIComponent(imageFilename)}`;
  }

  const raw = String(
    item?.image_url || item?.image || item?.item_image || item?.image_path || item?.photo || item?.thumbnail || ""
  ).trim();
  if (!raw) return "";
  if (raw.startsWith("data:") || isAbsoluteUrl(raw)) return raw;
  if (raw.startsWith("/")) return `${WEB_APP_BASE}${raw}`;
  return `${WEB_APP_BASE}/${raw}`;
};

export default function CreateBillScreen({ route }) {
  const { isOnline } = useOnlineStatus();
  const { session } = useAuth();
  const { theme } = useTheme();

  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [categories, setCategories] = useState([]);
  const [itemsData, setItemsData]  = useState([]);
  const [selectedCat, setSelectedCat] = useState("ALL");
  const [itemSearch, setItemSearch]   = useState("");
  const [cart, setCart]           = useState([]);
  const [customer, setCustomer]   = useState({ mobile: DEFAULT_MOBILE, name: "NA", gst_number: "", email: "" });
  const [paymentMode, setPaymentMode] = useState("cash");
  const [serviceCharge, setServiceCharge] = useState("0");
  const [discountAmt, setDiscountAmt] = useState("0");
  const [giftCardCode, setGiftCardCode] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [splitCash, setSplitCash] = useState("");
  const [splitCard, setSplitCard] = useState("");
  const [splitUpi, setSplitUpi] = useState("");
  const [splitGift, setSplitGift] = useState("");
  const [walletMobile, setWalletMobile] = useState("");
  const [walletAmount, setWalletAmount] = useState("");
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing]     = useState(false);
  const [shopName, setShopName]   = useState("Haappii Billing");
  const [shopDetails, setShopDetails] = useState({});
  const [branchDetails, setBranchDetails] = useState({});
  const [weightModalVisible, setWeightModalVisible] = useState(false);
  const [pendingWeightItem, setPendingWeightItem] = useState(null);
  const [weightInput, setWeightInput] = useState("250");
  const [upiConfirmOpen, setUpiConfirmOpen] = useState(false);
  const [upiUtr, setUpiUtr] = useState("");
  const [upiQrIdx, setUpiQrIdx] = useState(0);
  const [upiPendingAction, setUpiPendingAction] = useState(null);
  const [customerDue, setCustomerDue] = useState(0);
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponMsg, setCouponMsg] = useState("");
  const [discountType, setDiscountType] = useState("flat");
  const [priceLevel, setPriceLevel] = useState("BASE");
  const [priceLevels, setPriceLevels] = useState(["BASE"]);
  const [priceMap, setPriceMap] = useState({});
  const [stockData, setStockData] = useState([]);
  const [inventoryEnabled, setInventoryEnabled] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [heldDrafts, setHeldDrafts] = useState([]);
  const [showHeldPanel, setShowHeldPanel] = useState(false);
  const routeOrderId = Number(route?.params?.prefillOrderId || 0) || null;
  const isTableBillingFlow = Boolean(routeOrderId);
  const isHotelFlow = String(shopDetails?.billing_type || shopDetails?.shop_type || "").toLowerCase() === "hotel";

  const fetchLatestKotToken = async (orderId) => {
    const id = Number(orderId || 0);
    if (!id) return "";
    try {
      const res = await api.get(`/kot/order/${id}`);
      const list = Array.isArray(res?.data) ? res.data : [];
      const latest = list[list.length - 1] || {};
      return String(latest?.kot_number || latest?.kot_token || "").trim();
    } catch {
      return "";
    }
  };

  // ── Load data (API first, fallback to cache) ───────────────────────────────
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        if (isOnline) {
          const branchPromise = session?.branch_id
            ? api.get(`/branch/${session.branch_id}`).catch(() => null)
            : Promise.resolve(null);

          const [catRes, itemRes, shopRes, branchRes] = await Promise.all([
            api.get("/category/"),
            api.get("/items/"),
            api.get("/shop/details"),
            branchPromise,
          ]);
          const cats  = catRes?.data || [];
          const items = itemRes?.data || [];
          const nextShop = shopRes?.data || {};
          setShopName(nextShop?.shop_name || "Haappii Billing");
          setShopDetails(nextShop);
          setServiceCharge(String(normalizeServiceCharge(nextShop?.service_charge ?? nextShop?.default_service_charge ?? 0)));
          setInventoryEnabled(Boolean(nextShop?.inventory_enabled));
          setBranchDetails(branchRes?.data || {});
          setCategories(cats);
          setItemsData(items);
          // Refresh cache
          await cacheCategories(cats);
          await cacheItems(items);
          // Load price levels
          try {
            const [lvlRes, allRes] = await Promise.all([
              api.get("/pricing/levels"),
              api.get("/pricing/all"),
            ]);
            const lvls = (lvlRes?.data || []).map(x => String(x?.level || "").trim().toUpperCase()).filter(Boolean);
            const map = {};
            for (const r of allRes?.data || []) {
              const id = String(r.item_id);
              const lvl = String(r.level || "").trim().toUpperCase();
              if (!id || !lvl) continue;
              if (!map[id]) map[id] = {};
              map[id][lvl] = Number(r.price || 0);
            }
            setPriceLevels(["BASE", ...lvls]);
            setPriceMap(map);
          } catch { /* no custom price levels */ }
          // Load inventory stock
          if (nextShop?.inventory_enabled && session?.branch_id) {
            try {
              const stockRes = await api.get("/inventory/list", { params: { branch_id: session.branch_id } });
              setStockData(stockRes?.data || []);
            } catch { setStockData([]); }
          }
          // Load held drafts
          try {
            const draftRes = await api.get("/invoice/draft/list");
            setHeldDrafts(draftRes?.data || []);
          } catch { /* silent */ }
        } else {
          // Use cached data
          const [cats, items] = await Promise.all([
            getCachedCategories(),
            getCachedItems(),
          ]);
          setCategories(cats);
          setItemsData(items);
        }
      } catch {
        // Network failed — fall back to cache
        const [cats, items] = await Promise.all([
          getCachedCategories(),
          getCachedItems(),
        ]);
        setCategories(cats);
        setItemsData(items);
      } finally {
        setLoading(false);
      }
      // Refresh pending count
      const count = await getPendingCount();
      setPendingCount(count);
    })();
  }, [isOnline, session?.branch_id]);

  // ── Auto-sync when coming back online ─────────────────────────────────────
  useEffect(() => {
    if (isOnline && pendingCount > 0) {
      handleSync();
    }
  }, [isOnline]);

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const result = await syncOfflineQueue();
      const remaining = await getPendingCount();
      setPendingCount(remaining);
      if (result.synced > 0) {
        Alert.alert("Synced", `${result.synced} offline bill(s) uploaded successfully.`);
      }
      if (result.failed > 0) {
        Alert.alert("Sync Warning", `${result.failed} bill(s) could not be uploaded. They are saved for retry.`);
      }
    } finally {
      setSyncing(false);
    }
  };

  // ── Item filtering ─────────────────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    const q = itemSearch.toLowerCase();
    return (itemsData || []).filter((it) => {
      const nameMatch = String(it.item_name || "").toLowerCase().includes(q);
      const catMatch  = selectedCat === "ALL" || it.category_id === selectedCat;
      return nameMatch && catMatch && it.is_active !== false;
    });
  }, [itemsData, itemSearch, selectedCat]);

  // ── Cart management ────────────────────────────────────────────────────────
  const isWeightItem = (item) => Boolean(item?.sold_by_weight);

  const getLineAmount = (item) => {
    if (isWeightItem(item)) return Number(item.price || 0);
    return Number(item.price || 0) * Number(item.qty || 0);
  };

  const openWeightModal = (item, initialGrams = 250) => {
    setPendingWeightItem(item);
    setWeightInput(String(normalizeWeightGrams(initialGrams)));
    setWeightModalVisible(true);
  };

  const confirmWeightAddOrUpdate = () => {
    if (!pendingWeightItem) return;
    const grams = normalizeWeightGrams(weightInput);
    if (!grams) {
      Alert.alert("Validation", "Enter valid weight in grams");
      return;
    }

    const item = pendingWeightItem;
    const ratePerKg = Number(item.selling_price || item.price || 0);
    setCart((prev) => {
      const found = prev.find((x) => x.item_id === item.item_id);
      if (found) {
        const totalGrams = normalizeWeightGrams(Number(found.weight_grams || 0) + grams);
        return prev.map((x) =>
          x.item_id === item.item_id
            ? {
                ...x,
                qty: 1,
                unit_rate: ratePerKg,
                weight_grams: totalGrams,
                price: computeWeightLineAmount(ratePerKg, totalGrams),
              }
            : x
        );
      }

      return [
        ...prev,
        {
          ...item,
          qty: 1,
          unit_rate: ratePerKg,
          weight_grams: grams,
          price: computeWeightLineAmount(ratePerKg, grams),
        },
      ];
    });

    setWeightModalVisible(false);
    setPendingWeightItem(null);
  };

  const addToCart = (item) => {
    if (isWeightItem(item)) {
      const found = cart.find((x) => x.item_id === item.item_id);
      openWeightModal(item, found?.weight_grams || 250);
      return;
    }

    setCart((prev) => {
      const found = prev.find((x) => x.item_id === item.item_id);
      if (found) {
        return prev.map((x) => x.item_id === item.item_id ? { ...x, qty: x.qty + 1 } : x);
      }
      const price = getPriceForItem(item);
      return [...prev, { ...item, qty: 1, price }];
    });
  };

  const changeQty = (itemId, delta) => {
    setCart((prev) =>
      prev
        .map((x) => x.item_id === itemId
          ? (isWeightItem(x) ? x : { ...x, qty: Math.max(1, x.qty + delta) })
          : x)
        .filter((x) => x.qty > 0)
    );
  };

  const setWeightGrams = (itemId, gramsInput) => {
    const grams = normalizeWeightGrams(gramsInput);
    if (!grams) return;
    setCart((prev) =>
      prev.map((x) =>
        x.item_id === itemId
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

  const removeItem = (itemId) => setCart((prev) => prev.filter((x) => x.item_id !== itemId));

  const subtotal = useMemo(
    () => cart.reduce((t, x) => t + getLineAmount(x), 0),
    [cart]
  );

  const gstEnabled = Boolean(shopDetails?.gst_enabled);
  const gstPercent = toAmount(shopDetails?.gst_percent || 0);
  const gstMode = String(shopDetails?.gst_mode || "inclusive").toLowerCase();
  const gstAmount = useMemo(() => {
    if (!gstEnabled || gstPercent <= 0) return 0;
    if (gstMode === "exclusive") return (subtotal * gstPercent) / 100;
    return subtotal - subtotal / (1 + gstPercent / 100);
  }, [gstEnabled, gstPercent, gstMode, subtotal]);

  const grossTotal = useMemo(
    () => (gstEnabled && gstMode === "exclusive" ? subtotal + gstAmount : subtotal),
    [gstEnabled, gstMode, subtotal, gstAmount]
  );

  const manualDiscountValue = useMemo(() => {
    const v = toAmount(discountAmt);
    if (discountType === "percent") return (grossTotal * v) / 100;
    return v;
  }, [grossTotal, discountAmt, discountType]);

  const discountValue = useMemo(
    () => Math.min(grossTotal, Math.max(0, manualDiscountValue + Number(couponDiscount || 0))),
    [grossTotal, manualDiscountValue, couponDiscount]
  );

  const payableTotal = useMemo(
    () => Math.round(Math.max(0, grossTotal - discountValue)),
    [grossTotal, discountValue]
  );

  const loyaltyPct = Number(branchDetails?.loyalty_points_percentage || 0);
  const loyaltyPts = loyaltyPct > 0 ? Math.round(payableTotal * loyaltyPct / 100) : 0;

  useEffect(() => {
    const auto = branchDiscountAmount(subtotal, branchDetails);
    setDiscountAmt(String(Math.round(auto)));
  }, [subtotal, branchDetails?.discount_enabled, branchDetails?.discount_type, branchDetails?.discount_value]);

  // ── Customer auto-fill ─────────────────────────────────────────────────────
  const fetchCustomerByMobile = async (mobile) => {
    if (!mobile || mobile.length !== 10 || !isOnline) return;

    // Fetch outstanding due (non-blocking)
    api.get(`/dues/total-by-mobile/${mobile}`)
      .then(r => setCustomerDue(Number(r?.data?.total_due || 0)))
      .catch(() => setCustomerDue(0));

    try {
      const res = await api.get(`/invoice/customer/by-mobile/${mobile}`);
      if (res?.data?.customer_name) {
        setCustomer((p) => ({
          ...p,
          name: p.name || res.data.customer_name,
          gst_number: p.gst_number || res?.data?.gst_number || "",
        }));
      }
    } catch {
      // no match, ignore
    }
  };

  // ── Price level helpers ────────────────────────────────────────────────────
  const getPriceForItem = (item) => {
    const base = Number(item?.selling_price ?? item?.price ?? 0);
    const lvl = String(priceLevel || "BASE").toUpperCase();
    if (!lvl || lvl === "BASE") return base;
    const custom = priceMap?.[String(item?.item_id)]?.[lvl];
    return (custom !== undefined && custom !== null && custom !== "") ? Number(custom) : base;
  };

  const applyPriceLevelToCart = () => {
    setCart(prev =>
      prev.map(x => {
        const newPrice = getPriceForItem(x);
        if (isWeightItem(x)) {
          return { ...x, unit_rate: newPrice, price: computeWeightLineAmount(newPrice, x.weight_grams || 250) };
        }
        return { ...x, price: newPrice };
      })
    );
  };

  // ── Stock helpers ──────────────────────────────────────────────────────────
  const getStock = (id) => stockData.find(s => s.item_id === id)?.quantity ?? 0;
  const getEffectiveStock = (id) => getStock(id) - (cart.find(c => c.item_id === id)?.qty || 0);

  // ── Coupon ─────────────────────────────────────────────────────────────────
  const applyCoupon = async () => {
    const code = String(couponCode || "").trim();
    if (!code) { setCouponDiscount(0); setCouponMsg(""); return; }
    try {
      const res = await api.get(`/coupons/validate/${encodeURIComponent(code)}`, {
        params: { amount: grossTotal }
      });
      const data = res?.data || {};
      if (!data.valid) {
        setCouponDiscount(0);
        setCouponMsg(data.message || "Invalid coupon");
        Alert.alert("Coupon", data.message || "Invalid coupon");
        return;
      }
      const disc = Number(data.discount_amount || 0);
      setCouponDiscount(disc);
      setCouponMsg("Applied");
      Alert.alert("Coupon", `Applied: -₹${disc.toFixed(2)}`);
    } catch (e) {
      setCouponDiscount(0);
      setCouponMsg("");
      Alert.alert("Coupon", e?.response?.data?.detail || "Coupon validation failed");
    }
  };

  const clearCoupon = () => { setCouponCode(""); setCouponDiscount(0); setCouponMsg(""); };

  // ── Held drafts ────────────────────────────────────────────────────────────
  const loadHeldDrafts = async () => {
    try {
      const res = await api.get("/invoice/draft/list");
      setHeldDrafts(res?.data || []);
    } catch { /* silent */ }
  };

  const restoreFromDraft = async (draft) => {
    const restoredCart = [];
    for (const draftItem of draft.items || []) {
      const fullItem = itemsData.find(i => i.item_id === draftItem.item_id);
      if (!fullItem) continue;
      const price = draftItem.quantity > 0
        ? draftItem.amount / draftItem.quantity
        : Number(fullItem.selling_price || fullItem.price || 0);
      restoredCart.push({ ...fullItem, qty: draftItem.quantity || 1, price });
    }
    setCart(restoredCart);
    setCustomer({
      mobile: draft.mobile || DEFAULT_MOBILE,
      name: draft.customer_name || "NA",
      gst_number: draft.gst_number || "",
      email: "",
    });
    setDiscountAmt(String(Number(draft.discounted_amt || 0)));
    const mode = draft.payment_mode || "cash";
    setPaymentMode(mode === "split" ? "cash" : mode);
    setGiftCardCode(draft.payment_split?.gift_card_code || "");
    setShowHeldPanel(false);
    try {
      await api.delete(`/invoice/draft/${draft.draft_id}`);
      setHeldDrafts(prev => prev.filter(x => x?.draft_id !== draft.draft_id));
      Alert.alert("Restored", `Draft ${draft.draft_number} loaded into cart.`);
    } catch {
      Alert.alert("Restored", "Draft loaded into cart.");
    }
  };

  // ── Filtered categories ────────────────────────────────────────────────────
  const filteredCategories = categories.filter(c =>
    !categorySearch || String(c.category_name || "").toLowerCase().includes(categorySearch.toLowerCase())
  );

  const resetForm = () => {
    setCart([]);
    setCustomer({ mobile: DEFAULT_MOBILE, name: "NA", gst_number: "", email: "" });
    setCustomerDue(0);
    setCouponCode("");
    setCouponDiscount(0);
    setCouponMsg("");
    setDiscountType("flat");
    setPaymentMode("cash");
    setServiceCharge(String(normalizeServiceCharge(shopDetails?.service_charge ?? shopDetails?.default_service_charge ?? 0)));
    setDiscountAmt("0");
    setGiftCardCode("");
    setCouponCode("");
    setSplitCash("");
    setSplitCard("");
    setSplitUpi("");
    setSplitGift("");
    setWalletMobile("");
    setWalletAmount("");
  };

  // ── Save invoice variants (print both / save only / hold) ──────────────────
  const saveInvoice = async (action = BILL_ACTIONS.PRINT_BOTH, utrCode = null) => {
    if (!cart.length) return Alert.alert("Validation", "Add at least one item");

    const mobile = String(customer.mobile || "").replace(/\D/g, "");
    if (mobile.length !== 10) return Alert.alert("Validation", "Enter a valid 10-digit mobile");
    if (!String(customer.name || "").trim()) return Alert.alert("Validation", "Customer name is required");

    if (action === BILL_ACTIONS.HOLD && isTableBillingFlow) {
      return Alert.alert("Not Allowed", "Hold bill is available only for Take Away flow.");
    }

    if (action === BILL_ACTIONS.HOLD && !isOnline) {
      return Alert.alert("Offline", "Hold bill requires online connection.");
    }

    const normalizedDiscount = Math.max(0, Number(discountAmt || 0));
    const splitPayload = {
      gift_card_code: giftCardCode.trim() || undefined,
      gift_card_amount: Number(splitGift || 0) || undefined,
      coupon_code: couponCode.trim() || undefined,
      cash: Number(splitCash || 0) || undefined,
      card: Number(splitCard || 0) || undefined,
      upi: Number(splitUpi || 0) || undefined,
      wallet_mobile: walletMobile.trim() || undefined,
      wallet_amount: Number(walletAmount || 0) || undefined,
      customer_email: String(customer.email || "").trim() || undefined,
      upi_utr: (paymentMode === "upi" && utrCode) ? utrCode : undefined,
    };

    const paymentSplit = Object.fromEntries(Object.entries(splitPayload).filter(([, v]) => v !== undefined));

    if (paymentMode === "split") {
      const splitTotal =
        toAmount(splitCash) +
        toAmount(splitCard) +
        toAmount(splitUpi) +
        toAmount(splitGift) +
        toAmount(walletAmount);
      if (Math.abs(splitTotal - payableTotal) > 0.01) {
        return Alert.alert("Validation", "Split total must match payable amount");
      }
    }

    if (paymentMode === "gift_card") {
      if (!giftCardCode.trim()) return Alert.alert("Validation", "Gift card code is required");
      if (toAmount(splitGift) <= 0) return Alert.alert("Validation", "Gift card amount is required");
      if (Math.abs(toAmount(splitGift) - payableTotal) > 0.01) {
        return Alert.alert("Validation", "Gift card amount must match payable amount");
      }
    }

    const payload = {
      customer_name: String(customer.name || "").trim(),
      mobile,
      customer_gst: String(customer.gst_number || "").trim() || null,
      discounted_amt: normalizedDiscount,
      payment_mode: paymentMode,
      payment_split: Object.keys(paymentSplit).length ? paymentSplit : null,
      items: cart.map((x) => ({
        item_id: x.item_id,
        quantity: x.qty,
        amount: getLineAmount(x),
      })),
    };

    const checkoutPayload = {
      customer_name: payload.customer_name,
      mobile: payload.mobile,
      payment_mode: payload.payment_mode,
      payment_split: payload.payment_split,
      service_charge: isTableBillingFlow ? normalizeServiceCharge(serviceCharge) : 0,
      discounted_amt: normalizedDiscount,
      customer_gst: payload.customer_gst,
      customer_email: String(customer.email || "").trim() || null,
    };

    setSaving(true);
    try {
      if (isOnline) {
        let invoiceNo = "";
        let kotToken = "";
        let sourceOrderId = routeOrderId;

        if (isTableBillingFlow && isHotelFlow) {
          const checkoutRes = await api.post(`/table-billing/order/checkout/${routeOrderId}`, checkoutPayload);
          invoiceNo = String(checkoutRes?.data?.invoice_number || "").trim();
        } else if (isHotelFlow) {
          // For HOLD in hotel takeaway — save as draft invoice (same as non-hotel)
          if (action === BILL_ACTIONS.HOLD) {
            const draftRes = await api.post("/invoice/draft/", payload);
            const draftNumber = String(draftRes?.data?.draft_number || "").trim();
            Alert.alert(
              "Bill Held",
              `Draft: ${draftNumber || "-"}\nFind it in Held Invoices to process or cancel.`
            );
            resetForm();
            return;
          }

          const takeawayRes = await api.post("/table-billing/takeaway", {
            customer_name: payload.customer_name,
            mobile: payload.mobile,
            notes: "",
            token_number: null,
            items: cart.map((x) => ({
              item_id: x.item_id,
              quantity: x.qty,
              price: isWeightItem(x) ? Number(x.unit_rate || x.price || 0) : x.price,
            })),
          });

          sourceOrderId = Number(takeawayRes?.data?.order_id || 0) || null;
          kotToken = String(takeawayRes?.data?.token_number || "").trim();

          const kotRes = await api.post(`/kot/create/${sourceOrderId}`);
          kotToken =
            String(kotRes?.data?.kot_number || "").trim() ||
            String(kotRes?.data?.kot_token || "").trim() ||
            kotToken;

          const checkoutRes = await api.post(`/table-billing/order/checkout/${sourceOrderId}`, checkoutPayload);
          invoiceNo = String(checkoutRes?.data?.invoice_number || "").trim();
        } else {
          if (action === BILL_ACTIONS.HOLD) {
            const draftRes = await api.post("/invoice/draft/", payload);
            const draftNumber = String(draftRes?.data?.draft_number || "").trim();
            Alert.alert(
              "Bill Held",
              `Draft: ${draftNumber || "-"}\nFind it in Held Invoices to process or cancel.`
            );
            resetForm();
            return;
          }

          const res = await api.post("/invoice/", payload);
          invoiceNo = String(res?.data?.invoice_number || "").trim();
          kotToken =
            String(res?.data?.kot_number || "").trim() ||
            String(res?.data?.kot_token || "").trim() ||
            "";
          const fallbackOrderId = Number(res?.data?.order_id || 0) || routeOrderId || null;
          if (!kotToken && fallbackOrderId) {
            kotToken = await fetchLatestKotToken(fallbackOrderId);
          }
        }

        if (!kotToken && sourceOrderId) {
          kotToken = await fetchLatestKotToken(sourceOrderId);
        }

        const receiptRequired = branchDetails?.receipt_required !== false;
        if (action === BILL_ACTIONS.PRINT_BOTH && invoiceNo) {
          try {
            if (kotToken) {
              await printKotTokenSlip(
                {
                  tokenNumber: kotToken,
                  orderId: sourceOrderId,
                  items: cart.map((x) => ({ item_name: x.item_name, quantity: x.qty })),
                  customerName: payload.customer_name,
                },
                {
                  shop: shopDetails,
                  branch: branchDetails,
                  shopName,
                }
              );
            }

            if (receiptRequired) {
              await printInvoiceByNumber(api, invoiceNo, {
                shop: shopDetails,
                branch: branchDetails,
                shopName,
                webBase: WEB_APP_BASE,
                kotToken,
              });
            }
            Alert.alert("Saved ✓", `Invoice: ${invoiceNo}\nPrinted KOT token and invoice.`);
          } catch {
            Alert.alert("Saved ✓", `Invoice: ${invoiceNo}\nUnable to send print command.`);
          }
        } else {
          Alert.alert("Saved ✓", invoiceNo ? `Invoice: ${invoiceNo}\nSaved without printing.` : "Invoice saved");
        }
      } else {
        // Offline — save to local queue
        const localId = await enqueueInvoice(payload);
        const count   = await getPendingCount();
        setPendingCount(count);
        Alert.alert(
          "Saved Offline 📦",
          `Bill saved locally (${localId.slice(-6)}). It will sync automatically when you're back online.\n\nPending: ${count} bill(s)`
        );
      }
      // Reset form and refresh held drafts list
      resetForm();
      loadHeldDrafts();
    } catch (err) {
      const serverMessage = String(err?.response?.data?.detail || "").trim();
      const isNetworkFailure = !err?.response;

      // Queue only when request truly could not reach server.
      if (isNetworkFailure) {
        if (isHotelFlow || isTableBillingFlow) {
          Alert.alert(
            "Network Error",
            "Table/QR billing requires online checkout. Please reconnect and try again."
          );
          return;
        }
        await enqueueInvoice(payload);
        const count = await getPendingCount();
        setPendingCount(count);
        Alert.alert("Network Error", "Bill saved locally and will sync when reconnected.");
        resetForm();
      } else {
        Alert.alert("Unable to Save", serverMessage || "Failed to save invoice.");
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator size="large" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      {/* Offline / Sync Banner */}
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>
            ⚡ Offline Mode — bills will sync when reconnected
          </Text>
        </View>
      )}
      {isOnline && pendingCount > 0 && (
        <Pressable style={styles.syncBanner} onPress={handleSync} disabled={syncing}>
          <Text style={styles.syncBannerText}>
            {syncing ? "Syncing…" : `📤 ${pendingCount} offline bill(s) pending — tap to sync`}
          </Text>
        </Pressable>
      )}

      {/* Held Drafts Banner */}
      {heldDrafts.length > 0 && (
        <Pressable style={styles.heldBanner} onPress={() => setShowHeldPanel(true)}>
          <Text style={styles.heldBannerText}>
            ⏸ {heldDrafts.length} held bill{heldDrafts.length > 1 ? "s" : ""} — tap to restore
          </Text>
        </Pressable>
      )}

      <ScrollView contentContainerStyle={styles.container}>
        {/* Item Search + Category Filter */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Items</Text>
          <TextInput
            value={itemSearch}
            onChangeText={setItemSearch}
            style={[styles.input, { borderColor: theme.inputBorder, backgroundColor: theme.inputBg, color: theme.text }]}
            placeholder="Search item…"
            placeholderTextColor={theme.textMuted}
          />
          <TextInput
            value={categorySearch}
            onChangeText={setCategorySearch}
            style={[styles.input, { borderColor: theme.inputBorder, backgroundColor: theme.inputBg, color: theme.text }]}
            placeholder="Search category…"
            placeholderTextColor={theme.textMuted}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Pressable
              style={[styles.chip, selectedCat === "ALL" && styles.chipActive]}
              onPress={() => setSelectedCat("ALL")}
            >
              <Text style={[styles.chipText, selectedCat === "ALL" && styles.chipTextActive]}>All</Text>
            </Pressable>
            {filteredCategories.map((c) => (
              <Pressable
                key={String(c.category_id)}
                style={[styles.chip, selectedCat === c.category_id && styles.chipActive]}
                onPress={() => setSelectedCat(c.category_id)}
              >
                <Text style={[styles.chipText, selectedCat === c.category_id && styles.chipTextActive]}>
                  {c.category_name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <FlatList
            data={filteredItems}
            keyExtractor={(item) => String(item.item_id)}
            numColumns={2}
            scrollEnabled={false}
            columnWrapperStyle={{ gap: 8 }}
            contentContainerStyle={{ gap: 8 }}
            renderItem={({ item }) => {
              const inCart = cart.find((x) => x.item_id === item.item_id);
              return (
                <Pressable style={[styles.itemCard, inCart && styles.itemCardActive]} onPress={() => addToCart(item)}>
                  {resolveItemImageUrl(item) ? (
                    <Image source={{ uri: resolveItemImageUrl(item) }} style={styles.itemThumb} resizeMode="cover" />
                  ) : (
                    <View style={[styles.itemThumb, styles.itemThumbFallback]}>
                      <Text style={styles.itemThumbFallbackText}>IMG</Text>
                    </View>
                  )}
                  <Text style={styles.itemName} numberOfLines={2}>{item.item_name}</Text>
                  <Text style={styles.itemPrice}>
                    ₹{Number(item.selling_price || item.price || 0).toFixed(2)}{isWeightItem(item) ? "/kg" : ""}
                  </Text>
                  {inventoryEnabled && !isHotelFlow && (
                    <Text style={[styles.stockBadge, getEffectiveStock(item.item_id) <= 0 && styles.stockBadgeOut]}>
                      {getEffectiveStock(item.item_id) <= 0 ? "Out of stock" : `Stock: ${getEffectiveStock(item.item_id)}`}
                    </Text>
                  )}
                  {inCart && (
                    <Text style={styles.inCartBadge}>
                      {isWeightItem(inCart)
                        ? `${Math.round(Number(inCart.weight_grams || 0))}g in cart`
                        : `×${inCart.qty} in cart`}
                    </Text>
                  )}
                </Pressable>
              );
            }}
          />
        </View>

        {/* Cart */}
        {cart.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Cart</Text>
            {cart.map((x) => (
              <View key={String(x.item_id)} style={styles.cartRow}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.cartName} numberOfLines={2}>{x.item_name}</Text>
                  <Text style={styles.cartAmount}>{fmt(getLineAmount(x))}</Text>
                  {isWeightItem(x) && (
                    <Text style={styles.cartMeta}>
                      {Math.round(Number(x.weight_grams || 0))}g @ ₹{Number(x.unit_rate || x.price || 0).toFixed(2)}/kg
                    </Text>
                  )}
                </View>
                <View style={styles.qtyWrap}>
                  {isWeightItem(x) ? (
                    <>
                      <TextInput
                        style={styles.weightInput}
                        keyboardType="numeric"
                        value={String(Math.round(Number(x.weight_grams || 0)))}
                        onChangeText={(v) => setWeightGrams(x.item_id, v)}
                      />
                      <Text style={styles.gramTxt}>g</Text>
                    </>
                  ) : (
                    <>
                      <Pressable style={styles.qtyBtn} onPress={() => changeQty(x.item_id, -1)}>
                        <Text style={styles.qtyTxt}>−</Text>
                      </Pressable>
                      <Text style={styles.qtyValue}>{x.qty}</Text>
                      <Pressable style={[styles.qtyBtn, { backgroundColor: "#0b57d0" }]} onPress={() => changeQty(x.item_id, 1)}>
                        <Text style={[styles.qtyTxt, { color: "#fff" }]}>+</Text>
                      </Pressable>
                    </>
                  )}
                  <Pressable onPress={() => removeItem(x.item_id)}>
                    <Text style={styles.removeTxt}>✕</Text>
                  </Pressable>
                </View>
              </View>
            ))}
            <Text style={styles.total}>Total: {fmt(subtotal)}</Text>
          </View>
        )}

        {/* Customer */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customer</Text>

          {/* Price Level */}
          {priceLevels.length > 1 && (
            <View style={styles.priceLevelRow}>
              <Text style={styles.priceLevelLabel}>Price Level:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                {priceLevels.map(lvl => (
                  <Pressable
                    key={lvl}
                    style={[styles.priceLevelBtn, priceLevel === lvl && styles.priceLevelBtnActive]}
                    onPress={() => { setPriceLevel(lvl); applyPriceLevelToCart(); }}
                  >
                    <Text style={[styles.priceLevelTxt, priceLevel === lvl && styles.priceLevelTxtActive]}>{lvl}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          <TextInput
            style={styles.input}
            placeholder="Mobile number"
            keyboardType="phone-pad"
            value={customer.mobile}
            placeholderTextColor="#94a3b8"
            onChangeText={(v) => {
              let next = v.replace(/\D/g, "").slice(0, 10);
              setCustomer((p) => ({ ...p, mobile: next }));
              if (next.length === 10) fetchCustomerByMobile(next);
              else setCustomerDue(0);
            }}
          />
          <TextInput
            style={styles.input}
            placeholder="Customer name"
            value={customer.name}
            placeholderTextColor="#94a3b8"
            onChangeText={(v) => setCustomer((p) => ({ ...p, name: v }))}
          />
          <TextInput
            style={styles.input}
            placeholder="GST number (optional)"
            value={customer.gst_number}
            placeholderTextColor="#94a3b8"
            onChangeText={(v) => setCustomer((p) => ({ ...p, gst_number: v }))}
          />
          <TextInput
            style={styles.input}
            placeholder="Email (optional)"
            value={customer.email}
            placeholderTextColor="#94a3b8"
            onChangeText={(v) => setCustomer((p) => ({ ...p, email: v }))}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        {/* Payment + Save */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Mode</Text>
          <View style={styles.modeRow}>
            {PAYMENT_MODES.map((m) => (
              <Pressable
                key={m}
                style={[styles.modeBtn, paymentMode === m && styles.modeBtnActive]}
                onPress={() => { setPaymentMode(m); setUpiUtr(""); }}
              >
                <Text style={[styles.modeTxt, paymentMode === m && styles.modeTxtActive]}>
                  {m.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </View>

          {isTableBillingFlow && (
            <>
              <Text style={styles.sectionTitle}>Service Charge</Text>
              <TextInput
                style={styles.input}
                placeholder="0"
                keyboardType="numeric"
                value={serviceCharge}
                placeholderTextColor="#94a3b8"
                onChangeText={(v) => setServiceCharge(v.replace(/[^\d.]/g, ""))}
              />
            </>
          )}

          <Text style={styles.sectionTitle}>Discount</Text>
          <View style={styles.discountRow}>
            <Pressable
              style={[styles.discTypeBtn, discountType === "flat" && styles.discTypeBtnActive]}
              onPress={() => setDiscountType("flat")}
            >
              <Text style={[styles.discTypeTxt, discountType === "flat" && styles.discTypeTxtActive]}>₹ Flat</Text>
            </Pressable>
            <Pressable
              style={[styles.discTypeBtn, discountType === "percent" && styles.discTypeBtnActive]}
              onPress={() => setDiscountType("percent")}
            >
              <Text style={[styles.discTypeTxt, discountType === "percent" && styles.discTypeTxtActive]}>% Off</Text>
            </Pressable>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              placeholder="0"
              keyboardType="numeric"
              value={discountAmt}
              placeholderTextColor="#94a3b8"
              onChangeText={(v) => setDiscountAmt(v.replace(/[^\d.]/g, ""))}
            />
          </View>

          {(paymentMode === "gift_card" || paymentMode === "split") && (
            <>
              <Text style={styles.sectionTitle}>Gift Card</Text>
              <TextInput
                style={styles.input}
                placeholder="Gift card code"
                value={giftCardCode}
                placeholderTextColor="#94a3b8"
                onChangeText={setGiftCardCode}
                autoCapitalize="characters"
              />
              <TextInput
                style={styles.input}
                placeholder="Gift card amount"
                keyboardType="numeric"
                value={splitGift}
                placeholderTextColor="#94a3b8"
                onChangeText={(v) => setSplitGift(v.replace(/[^\d.]/g, ""))}
              />
            </>
          )}

          {/* Coupon — always visible */}
          <Text style={styles.sectionTitle}>Coupon</Text>
          <View style={styles.couponRow}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              placeholder="Coupon code"
              value={couponCode}
              placeholderTextColor="#94a3b8"
              onChangeText={setCouponCode}
              autoCapitalize="characters"
            />
            <Pressable style={styles.couponApplyBtn} onPress={applyCoupon}>
              <Text style={styles.couponApplyTxt}>Apply</Text>
            </Pressable>
            {couponCode ? (
              <Pressable style={styles.couponClearBtn} onPress={clearCoupon}>
                <Text style={styles.couponClearTxt}>✕</Text>
              </Pressable>
            ) : null}
          </View>
          {couponMsg ? (
            <Text style={[styles.couponMsg, couponDiscount > 0 && styles.couponMsgSuccess]}>{couponMsg}</Text>
          ) : null}

          {(paymentMode === "coupon" || paymentMode === "split") && null}

          {paymentMode === "split" && (
            <>
              <Text style={styles.sectionTitle}>Split Payments</Text>
              <TextInput
                style={styles.input}
                placeholder="Cash amount"
                keyboardType="numeric"
                value={splitCash}
                placeholderTextColor="#94a3b8"
                onChangeText={(v) => setSplitCash(v.replace(/[^\d.]/g, ""))}
              />
              <TextInput
                style={styles.input}
                placeholder="Card amount"
                keyboardType="numeric"
                value={splitCard}
                placeholderTextColor="#94a3b8"
                onChangeText={(v) => setSplitCard(v.replace(/[^\d.]/g, ""))}
              />
              <TextInput
                style={styles.input}
                placeholder="UPI amount"
                keyboardType="numeric"
                value={splitUpi}
                placeholderTextColor="#94a3b8"
                onChangeText={(v) => setSplitUpi(v.replace(/[^\d.]/g, ""))}
              />
            </>
          )}

          {(paymentMode === "wallet" || paymentMode === "split") && (
            <>
              <Text style={styles.sectionTitle}>Wallet</Text>
              <TextInput
                style={styles.input}
                placeholder="Wallet mobile"
                keyboardType="phone-pad"
                value={walletMobile}
                placeholderTextColor="#94a3b8"
                onChangeText={(v) => setWalletMobile(v.replace(/\D/g, "").slice(0, 10))}
              />
              <TextInput
                style={styles.input}
                placeholder="Wallet amount"
                keyboardType="numeric"
                value={walletAmount}
                placeholderTextColor="#94a3b8"
                onChangeText={(v) => setWalletAmount(v.replace(/[^\d.]/g, ""))}
              />
            </>
          )}

          <Text style={styles.total}>Subtotal: {fmt(subtotal)}</Text>
          {gstEnabled && <Text style={styles.total}>GST ({gstPercent}%): {fmt(gstAmount)}</Text>}
          {manualDiscountValue > 0 && <Text style={styles.total}>Discount: -{fmt(manualDiscountValue)}</Text>}
          {couponDiscount > 0 && <Text style={styles.couponDiscountLine}>Coupon: -{fmt(couponDiscount)}</Text>}
          {discountValue > 0 && <Text style={styles.total}>Total discount: -{fmt(discountValue)}</Text>}
          <Text style={styles.total}>Payable: {fmt(payableTotal)}</Text>
          {loyaltyPts > 0 && (
            <Text style={styles.loyaltyPts}>+{loyaltyPts} pts will be earned</Text>
          )}
          {customerDue > 0 && (
            <Text style={styles.customerDueText}>Previous Due: {fmt(customerDue)}</Text>
          )}
          {customerDue > 0 && (
            <Text style={styles.collectTotal}>Total to Collect: {fmt(payableTotal + customerDue)}</Text>
          )}

          <Pressable
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            disabled={saving}
            onPress={() => {
              if (paymentMode === "upi") {
                setUpiPendingAction(BILL_ACTIONS.PRINT_BOTH);
                setUpiUtr("");
                setUpiQrIdx(0);
                setUpiConfirmOpen(true);
              } else {
                saveInvoice(BILL_ACTIONS.PRINT_BOTH);
              }
            }}
          >
            <Text style={styles.saveTxt}>
              {saving
                ? "Saving…"
                : isOnline
                  ? `Print KOT + Invoice  ${fmt(payableTotal)}`
                  : `Save Offline  ${fmt(payableTotal)}`}
            </Text>
          </Pressable>

          {isOnline && (
            <Pressable
              style={[styles.saveOnlyBtn, saving && styles.saveBtnDisabled]}
              disabled={saving}
              onPress={() => {
                if (paymentMode === "upi") {
                  setUpiPendingAction(BILL_ACTIONS.SAVE_ONLY);
                  setUpiUtr("");
                  setUpiQrIdx(0);
                  setUpiConfirmOpen(true);
                } else {
                  saveInvoice(BILL_ACTIONS.SAVE_ONLY);
                }
              }}
            >
              <Text style={styles.saveOnlyTxt}>{saving ? "Saving…" : "Save Without Printing"}</Text>
            </Pressable>
          )}

          {isOnline && !isTableBillingFlow && (
            <Pressable
              style={[styles.holdBtn, saving && styles.saveBtnDisabled]}
              disabled={saving}
              onPress={() => saveInvoice(BILL_ACTIONS.HOLD)}
            >
              <Text style={styles.holdTxt}>{saving ? "Holding…" : "Hold Bill"}</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      {/* UPI Payment Confirmation Modal */}
      <Modal transparent visible={upiConfirmOpen} animationType="slide" onRequestClose={() => setUpiConfirmOpen(false)}>
        <View style={[styles.modalBackdrop, { justifyContent: "flex-start", paddingTop: 40 }]}>
          <ScrollView
            style={{ width: "100%" }}
            contentContainerStyle={{ padding: 16 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.upiModal}>
              <Text style={styles.upiModalTitle}>UPI Payment</Text>

              {(() => {
                const upiIds = [
                  branchDetails?.upi_id,
                  branchDetails?.upi_id_2,
                  branchDetails?.upi_id_3,
                  branchDetails?.upi_id_4,
                ]
                  .map(id => String(id || "").trim())
                  .filter(Boolean);
                if (upiIds.length === 0 && shopDetails?.upi_id) upiIds.push(String(shopDetails.upi_id).trim());
                if (upiIds.length === 0) {
                  return (
                    <View style={styles.upiNoId}>
                      <Text style={styles.upiNoIdText}>No UPI ID configured for this branch.</Text>
                    </View>
                  );
                }
                const safeIdx = Math.min(upiQrIdx, upiIds.length - 1);
                return (
                  <View>
                    {upiIds.length > 1 && (
                      <View style={styles.upiTabRow}>
                        {upiIds.map((_, i) => (
                          <Pressable
                            key={i}
                            style={[styles.upiTab, safeIdx === i && styles.upiTabActive]}
                            onPress={() => setUpiQrIdx(i)}
                          >
                            <Text style={[styles.upiTabText, safeIdx === i && styles.upiTabTextActive]}>
                              QR {i + 1}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                    <View style={styles.upiQrWrap}>
                      <QRCode
                        value={`upi://pay?pa=${encodeURIComponent(upiIds[safeIdx])}&pn=${encodeURIComponent(shopName)}&am=${payableTotal.toFixed(2)}&cu=INR`}
                        size={180}
                        backgroundColor="#ffffff"
                        color="#0b1220"
                      />
                      <Text style={styles.upiIdLabel}>{upiIds[safeIdx]}</Text>
                      <Text style={styles.upiAmtLabel}>Amount: {fmt(payableTotal)}</Text>
                    </View>
                  </View>
                );
              })()}

              <Text style={styles.upiFieldLabel}>Customer Name</Text>
              <TextInput
                style={styles.input}
                value={customer.name}
                onChangeText={(v) => setCustomer((p) => ({ ...p, name: v }))}
                placeholder="Customer name"
                placeholderTextColor="#94a3b8"
              />

              <Text style={styles.upiFieldLabel}>Mobile Number</Text>
              <TextInput
                style={styles.input}
                value={customer.mobile}
                onChangeText={(v) => setCustomer((p) => ({ ...p, mobile: v.replace(/\D/g, "").slice(0, 10) }))}
                placeholder="10-digit mobile"
                keyboardType="phone-pad"
                placeholderTextColor="#94a3b8"
              />

              <Text style={styles.upiFieldLabel}>UTR Last 5 Digits</Text>
              <TextInput
                style={styles.input}
                value={upiUtr}
                onChangeText={(v) => setUpiUtr(v.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 5))}
                placeholder="e.g. AB123"
                placeholderTextColor="#94a3b8"
                autoCapitalize="characters"
                maxLength={5}
              />

              <View style={styles.upiModalBtns}>
                <Pressable
                  style={styles.upiCancelBtn}
                  onPress={() => setUpiConfirmOpen(false)}
                >
                  <Text style={styles.upiCancelTxt}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.upiDoneBtn, saving && { opacity: 0.6 }]}
                  disabled={saving}
                  onPress={() => {
                    const name = String(customer.name || "").trim();
                    const mobile = String(customer.mobile || "").replace(/\D/g, "");
                    const utr = upiUtr.trim();
                    if (!name) return Alert.alert("Validation", "Customer name is required");
                    if (mobile.length !== 10) return Alert.alert("Validation", "Enter a valid 10-digit mobile");
                    if (utr.length !== 5) return Alert.alert("Validation", "Enter UTR last 5 digits");
                    setUpiConfirmOpen(false);
                    saveInvoice(upiPendingAction, utr);
                  }}
                >
                  <Text style={styles.upiDoneTxt}>{saving ? "Saving…" : "Payment Done"}</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Held Drafts Modal */}
      <Modal transparent visible={showHeldPanel} animationType="slide" onRequestClose={() => setShowHeldPanel(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.heldModal]}>
            <View style={styles.heldModalHeader}>
              <Text style={styles.heldModalTitle}>⏸ Held Bills ({heldDrafts.length})</Text>
              <Pressable onPress={() => setShowHeldPanel(false)}>
                <Text style={styles.heldModalClose}>✕</Text>
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 400 }}>
              {heldDrafts.length === 0 ? (
                <Text style={styles.heldEmptyText}>No held bills</Text>
              ) : (
                heldDrafts.map(draft => (
                  <Pressable
                    key={draft.draft_id}
                    style={styles.heldDraftCard}
                    onPress={() => restoreFromDraft(draft)}
                  >
                    <View style={styles.heldDraftRow}>
                      <Text style={styles.heldDraftNumber}>{draft.draft_number}</Text>
                      <Text style={styles.heldDraftCount}>{draft.items?.length || 0} item{draft.items?.length !== 1 ? "s" : ""}</Text>
                    </View>
                    <Text style={styles.heldDraftName}>{draft.customer_name || "—"}</Text>
                    {draft.mobile && draft.mobile !== "9999999999" && (
                      <Text style={styles.heldDraftMobile}>{draft.mobile}</Text>
                    )}
                    <Text style={styles.heldDraftAmount}>₹{Number(draft.discounted_amt || 0).toFixed(0)}</Text>
                  </Pressable>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={weightModalVisible} animationType="fade" onRequestClose={() => setWeightModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.weightModalCard}>
            <Text style={styles.weightModalTitle}>Enter Weight (grams)</Text>
            <Text style={styles.weightModalItem}>{pendingWeightItem?.item_name || ""}</Text>
            <TextInput
              style={styles.weightModalInput}
              keyboardType="numeric"
              value={weightInput}
              onChangeText={setWeightInput}
              placeholder="e.g. 250"
              placeholderTextColor="#94a3b8"
            />
            <View style={styles.weightModalRow}>
              <Pressable style={[styles.weightModalBtn, styles.weightModalCancel]} onPress={() => setWeightModalVisible(false)}>
                <Text style={styles.weightModalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.weightModalBtn, styles.weightModalConfirm]} onPress={confirmWeightAddOrUpdate}>
                <Text style={styles.weightModalConfirmText}>Apply</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: "#f3f6ff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  offlineBanner: { backgroundColor: "#92400e", padding: 10, alignItems: "center" },
  offlineBannerText: { color: "#fef3c7", fontWeight: "700", fontSize: 13 },
  syncBanner: { backgroundColor: "#0b57d0", padding: 10, alignItems: "center" },
  syncBannerText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  container: { padding: 12, gap: 10, paddingBottom: 24 },
  section: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d9e3ff",
    padding: 12,
    gap: 8,
  },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: "#0b1220" },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    backgroundColor: "#ffffff",
    paddingHorizontal: 11,
    paddingVertical: 10,
    color: "#0b1220",
  },
  chip: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginRight: 8,
    backgroundColor: "#fff",
  },
  chipActive: { backgroundColor: "#0b57d0", borderColor: "#0b57d0" },
  chipText:       { color: "#334155", fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  itemCard: {
    flex: 1,
    minHeight: 88,
    borderWidth: 1,
    borderColor: "#d7e4ff",
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#ffffff",
  },
  itemThumb: {
    width: "100%",
    height: 72,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: "#f1f5f9",
  },
  itemThumbFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  itemThumbFallbackText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94a3b8",
  },
  itemCardActive: { borderColor: "#0b57d0", backgroundColor: "#e8f0ff" },
  itemName:    { fontWeight: "700", color: "#1e293b" },
  itemPrice:   { marginTop: 6, color: "#0b57d0", fontWeight: "700" },
  inCartBadge: { marginTop: 4, color: "#16a34a", fontSize: 11, fontWeight: "700" },
  cartRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#d9e3ff",
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#fff",
  },
  cartName:   { fontWeight: "700", color: "#0b1220" },
  cartAmount: { marginTop: 2, color: "#475569" },
  cartMeta: { marginTop: 2, color: "#64748b", fontSize: 11 },
  qtyWrap:    { flexDirection: "row", alignItems: "center", gap: 8 },
  qtyBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
  },
  qtyTxt:   { fontSize: 18, color: "#0b1220", fontWeight: "700" },
  qtyValue: { fontWeight: "700", color: "#0b1220", minWidth: 20, textAlign: "center" },
  weightInput: {
    minWidth: 54,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    textAlign: "center",
    color: "#0b1220",
    backgroundColor: "#fff",
  },
  gramTxt: { color: "#64748b", fontWeight: "700", fontSize: 12 },
  removeTxt: { color: "#b91c1c", fontSize: 16, fontWeight: "700", paddingHorizontal: 4 },
  total: { fontSize: 16, fontWeight: "800", color: "#047857", textAlign: "right" },
  loyaltyPts: { fontSize: 12, fontWeight: "700", color: "#d97706", textAlign: "right", marginTop: 2 },
  customerDueText: { fontSize: 14, fontWeight: "700", color: "#dc2626", textAlign: "right", marginTop: 4 },
  collectTotal: { fontSize: 16, fontWeight: "800", color: "#dc2626", textAlign: "right", marginTop: 2, borderTopWidth: 1, borderTopColor: "#fecaca", paddingTop: 4 },
  modeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  modeBtn: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  modeBtnActive: { backgroundColor: "#0b57d0", borderColor: "#0b57d0" },
  modeTxt:       { fontSize: 12, fontWeight: "700", color: "#334155" },
  modeTxtActive: { color: "#fff" },
  upiModal: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    gap: 8,
    shadowColor: "#0b1220",
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  upiModalTitle: { fontSize: 17, fontWeight: "800", color: "#0b1220", textAlign: "center", marginBottom: 4 },
  upiQrWrap: {
    alignItems: "center",
    backgroundColor: "#f8faff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#d9e3ff",
    padding: 16,
    gap: 8,
    marginBottom: 4,
  },
  upiIdLabel: { fontSize: 13, fontWeight: "700", color: "#334155", textAlign: "center" },
  upiAmtLabel: { fontSize: 15, fontWeight: "800", color: "#0b57d0", textAlign: "center" },
  upiNoId: {
    backgroundColor: "#fef9ec",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#fde68a",
    padding: 12,
  },
  upiNoIdText: { fontSize: 13, color: "#92400e", fontWeight: "600", textAlign: "center" },
  upiTabRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  upiTab: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: "#fff",
  },
  upiTabActive: { backgroundColor: "#0b57d0", borderColor: "#0b57d0" },
  upiTabText: { fontSize: 12, fontWeight: "700", color: "#334155" },
  upiTabTextActive: { color: "#fff" },
  upiFieldLabel: { fontSize: 12, fontWeight: "700", color: "#475569" },
  upiModalBtns: { flexDirection: "row", gap: 10, marginTop: 4 },
  upiCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  upiCancelTxt: { color: "#334155", fontWeight: "700", fontSize: 14 },
  upiDoneBtn: {
    flex: 2,
    backgroundColor: "#059669",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  upiDoneTxt: { color: "#fff", fontWeight: "800", fontSize: 14 },
  saveBtn: {
    marginTop: 4,
    borderRadius: 10,
    backgroundColor: "#059669",
    paddingVertical: 14,
    alignItems: "center",
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveTxt: { color: "#fff", fontWeight: "800", fontSize: 15 },
  saveOnlyBtn: {
    marginTop: 2,
    borderRadius: 10,
    backgroundColor: "#0b57d0",
    paddingVertical: 12,
    alignItems: "center",
  },
  saveOnlyTxt: { color: "#fff", fontWeight: "800", fontSize: 14 },
  holdBtn: {
    marginTop: 2,
    borderRadius: 10,
    backgroundColor: "#b45309",
    paddingVertical: 12,
    alignItems: "center",
  },
  holdTxt: { color: "#fff", fontWeight: "800", fontSize: 14 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  weightModalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#d9e3ff",
    padding: 16,
    gap: 10,
  },
  weightModalTitle: { fontSize: 16, fontWeight: "800", color: "#0b1220" },
  weightModalItem: { color: "#334155", fontWeight: "600" },
  weightModalInput: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#0b1220",
    backgroundColor: "#ffffff",
  },
  weightModalRow: { flexDirection: "row", gap: 10 },
  weightModalBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  weightModalCancel: { backgroundColor: "#d9e3ff" },
  weightModalConfirm: { backgroundColor: "#0b57d0" },
  weightModalCancelText: { color: "#334155", fontWeight: "700" },
  weightModalConfirmText: { color: "#fff", fontWeight: "700" },
  // ── Stock badge ────────────────────────────────────────────────────────────
  stockBadge: { marginTop: 3, fontSize: 10, fontWeight: "600", color: "#047857" },
  stockBadgeOut: { color: "#dc2626" },
  // ── Held drafts banner ─────────────────────────────────────────────────────
  heldBanner: { backgroundColor: "#b45309", padding: 10, alignItems: "center" },
  heldBannerText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  // ── Held drafts modal ──────────────────────────────────────────────────────
  heldModal: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#fde68a",
    overflow: "hidden",
  },
  heldModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fffbeb",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#fde68a",
  },
  heldModalTitle: { fontSize: 15, fontWeight: "800", color: "#92400e" },
  heldModalClose: { fontSize: 18, fontWeight: "700", color: "#92400e", paddingHorizontal: 4 },
  heldEmptyText: { textAlign: "center", color: "#94a3b8", fontSize: 13, padding: 20 },
  heldDraftCard: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#fef3c7",
    backgroundColor: "#fff",
  },
  heldDraftRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  heldDraftNumber: { fontSize: 12, fontWeight: "800", color: "#b45309" },
  heldDraftCount: { fontSize: 11, color: "#94a3b8" },
  heldDraftName: { fontSize: 13, fontWeight: "600", color: "#0b1220" },
  heldDraftMobile: { fontSize: 11, color: "#64748b", marginTop: 1 },
  heldDraftAmount: { fontSize: 13, fontWeight: "800", color: "#0b57d0", marginTop: 4 },
  // ── Price level ────────────────────────────────────────────────────────────
  priceLevelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  priceLevelLabel: { fontSize: 12, fontWeight: "700", color: "#475569", flexShrink: 0 },
  priceLevelBtn: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 6,
    backgroundColor: "#fff",
  },
  priceLevelBtnActive: { backgroundColor: "#0b57d0", borderColor: "#0b57d0" },
  priceLevelTxt: { fontSize: 11, fontWeight: "700", color: "#334155" },
  priceLevelTxtActive: { color: "#fff" },
  // ── Coupon ─────────────────────────────────────────────────────────────────
  couponRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  couponApplyBtn: {
    backgroundColor: "#0b57d0",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  couponApplyTxt: { color: "#fff", fontWeight: "700", fontSize: 12 },
  couponClearBtn: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: "#f8fafc",
  },
  couponClearTxt: { color: "#64748b", fontWeight: "700", fontSize: 12 },
  couponMsg: { fontSize: 11, fontWeight: "600", color: "#dc2626", marginTop: 2 },
  couponMsgSuccess: { color: "#047857" },
  couponDiscountLine: { fontSize: 14, fontWeight: "700", color: "#047857", textAlign: "right" },
  // ── Discount type toggle ───────────────────────────────────────────────────
  discountRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  discTypeBtn: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: "#fff",
    flexShrink: 0,
  },
  discTypeBtnActive: { backgroundColor: "#0b57d0", borderColor: "#0b57d0" },
  discTypeTxt: { fontSize: 11, fontWeight: "700", color: "#334155" },
  discTypeTxtActive: { color: "#fff" },
});
