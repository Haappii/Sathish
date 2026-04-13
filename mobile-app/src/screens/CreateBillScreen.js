import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import api from "../api/client";
import useOnlineStatus from "../hooks/useOnlineStatus";
import { WEB_APP_BASE } from "../config/api";
import { useAuth } from "../context/AuthContext";
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

export default function CreateBillScreen({ route }) {
  const { isOnline } = useOnlineStatus();
  const { session } = useAuth();

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
          setBranchDetails(branchRes?.data || {});
          setCategories(cats);
          setItemsData(items);
          // Refresh cache
          await cacheCategories(cats);
          await cacheItems(items);
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
      const price = Number(item.selling_price || item.price || 0);
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

  const discountValue = useMemo(
    () => Math.min(grossTotal, Math.max(0, toAmount(discountAmt))),
    [grossTotal, discountAmt]
  );

  const payableTotal = useMemo(
    () => Math.round(Math.max(0, grossTotal - discountValue)),
    [grossTotal, discountValue]
  );

  useEffect(() => {
    const auto = branchDiscountAmount(subtotal, branchDetails);
    setDiscountAmt(String(Math.round(auto)));
  }, [subtotal, branchDetails?.discount_enabled, branchDetails?.discount_type, branchDetails?.discount_value]);

  // ── Customer auto-fill ─────────────────────────────────────────────────────
  const fetchCustomerByMobile = async (mobile) => {
    if (!mobile || mobile.length !== 10 || !isOnline) return;
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

  const resetForm = () => {
    setCart([]);
    setCustomer({ mobile: DEFAULT_MOBILE, name: "NA", gst_number: "", email: "" });
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
  const saveInvoice = async (action = BILL_ACTIONS.PRINT_BOTH) => {
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

          if (action === BILL_ACTIONS.HOLD) {
            Alert.alert(
              "Hold Saved",
              `Token: ${kotToken || "-"}\nOrder: #${sourceOrderId || "-"}\nYou can complete or cancel this hold bill from Home.`
            );
            resetForm();
            return;
          }

          const kotRes = await api.post(`/kot/create/${sourceOrderId}`);
          kotToken =
            String(kotRes?.data?.kot_number || "").trim() ||
            String(kotRes?.data?.kot_token || "").trim() ||
            kotToken;

          const checkoutRes = await api.post(`/table-billing/order/checkout/${sourceOrderId}`, checkoutPayload);
          invoiceNo = String(checkoutRes?.data?.invoice_number || "").trim();
        } else {
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
      // Reset form
      resetForm();
    } catch (err) {
      // API call failed even though we thought we were online — queue it
      await enqueueInvoice(payload);
      const count = await getPendingCount();
      setPendingCount(count);
      Alert.alert("Network Error", "Bill saved locally and will sync when reconnected.");
      resetForm();
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
    <SafeAreaView style={styles.safe}>
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

      <ScrollView contentContainerStyle={styles.container}>
        {/* Item Search + Category Filter */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Items</Text>
          <TextInput
            value={itemSearch}
            onChangeText={setItemSearch}
            style={styles.input}
            placeholder="Search item…"
            placeholderTextColor="#94a3b8"
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Pressable
              style={[styles.chip, selectedCat === "ALL" && styles.chipActive]}
              onPress={() => setSelectedCat("ALL")}
            >
              <Text style={[styles.chipText, selectedCat === "ALL" && styles.chipTextActive]}>All</Text>
            </Pressable>
            {categories.map((c) => (
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
                  <Text style={styles.itemName} numberOfLines={2}>{item.item_name}</Text>
                  <Text style={styles.itemPrice}>
                    ₹{Number(item.selling_price || item.price || 0).toFixed(2)}{isWeightItem(item) ? "/kg" : ""}
                  </Text>
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
                onPress={() => setPaymentMode(m)}
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
          <TextInput
            style={styles.input}
            placeholder="0"
            keyboardType="numeric"
            value={discountAmt}
            placeholderTextColor="#94a3b8"
            onChangeText={(v) => setDiscountAmt(v.replace(/[^\d.]/g, ""))}
          />

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

          {(paymentMode === "coupon" || paymentMode === "split") && (
            <>
              <Text style={styles.sectionTitle}>Coupon</Text>
              <TextInput
                style={styles.input}
                placeholder="Coupon code"
                value={couponCode}
                placeholderTextColor="#94a3b8"
                onChangeText={setCouponCode}
                autoCapitalize="characters"
              />
            </>
          )}

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
          {discountValue > 0 && <Text style={styles.total}>Discount: {fmt(discountValue)}</Text>}
          <Text style={styles.total}>Payable: {fmt(payableTotal)}</Text>

          <Pressable
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            disabled={saving}
            onPress={() => saveInvoice(BILL_ACTIONS.PRINT_BOTH)}
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
              onPress={() => saveInvoice(BILL_ACTIONS.SAVE_ONLY)}
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
});
