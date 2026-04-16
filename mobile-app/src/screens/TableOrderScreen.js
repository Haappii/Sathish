/**
 * TableOrderScreen — manage items for a specific table.
 * Shows existing open order + allows adding items, sending KOT, and billing.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { WEB_APP_BASE } from "../config/api";

const normalizeServiceCharge = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
};

const branchDiscountAmount = (subtotal, branchDetails) => {
  const enabled = Boolean(branchDetails?.discount_enabled);
  if (!enabled) return 0;
  const raw = Number(branchDetails?.discount_value || 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  const discountType = String(branchDetails?.discount_type || "flat").toLowerCase();
  if (discountType === "percent") return Math.max(0, Math.min(subtotal, (subtotal * raw) / 100));
  return Math.max(0, Math.min(subtotal, raw));
};

const isAbsoluteUrl = (v) => /^https?:\/\//i.test(String(v || ""));

const resolveItemImageUrl = (item) => {
  const raw = String(
    item?.image_url || item?.image || item?.item_image || item?.image_path || item?.photo || item?.thumbnail || ""
  ).trim();
  if (!raw) return "";
  if (raw.startsWith("data:") || isAbsoluteUrl(raw)) return raw;
  if (raw.startsWith("/")) return `${WEB_APP_BASE}${raw}`;
  return `${WEB_APP_BASE}/${raw}`;
};

export default function TableOrderScreen({ route, navigation }) {
  const { table } = route.params;
  const { session } = useAuth();
  const { theme } = useTheme();

  const [order, setOrder]         = useState(null);
  const [categories, setCategories] = useState([]);
  const [items, setItems]         = useState([]);
  const [selCat, setSelCat]       = useState(null);
  const [search, setSearch]       = useState("");
  const [cart, setCart]           = useState({}); // item_id → qty
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending]     = useState(false);
  const [billOpen, setBillOpen]   = useState(false);
  const [billing, setBilling]     = useState(false);
  const [paymentMode, setPaymentMode] = useState("cash");
  const [serviceCharge, setServiceCharge] = useState("0");
  const [discountAmt, setDiscountAmt] = useState("0");
  const [customerName, setCustomerName] = useState("Walk-in");
  const [customerMobile, setCustomerMobile] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerGst, setCustomerGst] = useState("");
  const [giftCardCode, setGiftCardCode] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [splitCash, setSplitCash] = useState("");
  const [splitCard, setSplitCard] = useState("");
  const [splitUpi, setSplitUpi] = useState("");
  const [splitGift, setSplitGift] = useState("");
  const [walletMobile, setWalletMobile] = useState("");
  const [walletAmount, setWalletAmount] = useState("");
  const [branchDetails, setBranchDetails] = useState({});
  const [shopDetails, setShopDetails] = useState({});
  const [upiUtr, setUpiUtr] = useState("");
  const [upiQrIdx, setUpiQrIdx] = useState(0);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTableId, setTransferTableId] = useState(null);
  const [transferBusy, setTransferBusy] = useState(false);
  const [tables, setTables] = useState([]);
  const [customerLookupBusy, setCustomerLookupBusy] = useState(false);
  const mobileLookupTimerRef = useRef(null);

  const PAYMENT_MODES = ["cash", "card", "upi", "credit", "gift_card", "coupon", "split", "wallet"];

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const branchPromise = session?.branch_id
        ? api.get(`/branch/${session.branch_id}`).catch(() => null)
        : Promise.resolve(null);

      const [catRes, itemRes, orderRes, tableRes, shopRes, branchRes] = await Promise.all([
        api.get("/category/"),
        api.get("/items/"),
        api.get(`/table-billing/order/by-table/${table.table_id}`),
        api.get("/table-billing/tables"),
        api.get("/shop/details").catch(() => null),
        branchPromise,
      ]);
      const categoryRows = catRes.data?.categories ?? catRes.data ?? [];
      const itemRows = itemRes.data?.items ?? itemRes.data ?? [];

      setCategories(categoryRows);
      setItems(itemRows);
      setOrder(orderRes.data ?? null);
      setTables(tableRes.data?.tables ?? tableRes.data ?? []);
      const nextBranch = branchRes?.data || {};
      setBranchDetails(nextBranch);
      const shopData = shopRes?.data || {};
      setShopDetails(shopData);
      const branchServiceCharge = nextBranch?.service_charge_required
        ? normalizeServiceCharge(nextBranch?.service_charge_amount ?? 0)
        : normalizeServiceCharge(shopData?.service_charge ?? shopData?.default_service_charge ?? 0);
      setServiceCharge(String(branchServiceCharge));

      const orderData = orderRes?.data || {};
      setCustomerName(String(orderData?.customer_name || "Walk-in"));
      setCustomerMobile(String(orderData?.mobile || ""));
      const existingSplit = (orderData?.payment_split && typeof orderData.payment_split === "object") ? orderData.payment_split : {};
      setCustomerEmail(String(existingSplit?.customer_email || ""));
      setCustomerGst(String(existingSplit?.customer_gst || ""));
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [table.table_id, session?.branch_id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { navigation.setOptions({ title: `Table ${table.table_name}` }); }, [table, navigation]);

  const visibleItems = items.filter((it) => {
    const matchCat = !selCat || it.category_id === selCat;
    const matchSearch = !search || (it.item_name || "").toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch && it.is_active !== false;
  });

  const adjust = (itemId, delta) => {
    setCart((prev) => {
      const cur = prev[itemId] ?? 0;
      const next = cur + delta;
      if (next <= 0) {
        const { [itemId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: next };
    });
  };

  const cartCount = Object.values(cart).reduce((s, q) => s + q, 0);
  const cartTotal = Object.entries(cart).reduce((s, [id, qty]) => {
    const item = items.find((i) => i.item_id === Number(id));
    return s + qty * Number(item?.selling_price ?? item?.price ?? 0);
  }, 0);

  const existingItemQty = Array.isArray(order?.items)
    ? order.items.reduce((sum, row) => sum + Number(row?.quantity || 0), 0)
    : 0;

  const existingTotal = Array.isArray(order?.items)
    ? order.items.reduce(
        (sum, row) =>
          sum +
          Number(
            row?.amount ??
            Number(row?.quantity || 0) * Number(row?.price || 0)
          ),
        0
      )
    : 0;

  const bannerItemQty = existingItemQty + cartCount;
  const bannerTotal = existingTotal + cartTotal;

  const mergedBillItems = (() => {
    const map = new Map();

    for (const row of order?.items || []) {
      const key = Number(row?.item_id || 0);
      if (!key) continue;
      const qty = Number(row?.quantity || 0);
      const amount = Number(row?.amount ?? qty * Number(row?.price || 0));
      const prev = map.get(key) || {
        item_id: key,
        item_name: row?.item_name || `Item ${key}`,
        quantity: 0,
        amount: 0,
      };
      prev.quantity += qty;
      prev.amount += amount;
      map.set(key, prev);
    }

    for (const [id, qty] of Object.entries(cart)) {
      const key = Number(id);
      const item = items.find((x) => Number(x.item_id) === key);
      const price = Number(item?.selling_price ?? item?.price ?? 0);
      const amount = Number(qty || 0) * price;
      const prev = map.get(key) || {
        item_id: key,
        item_name: item?.item_name || `Item ${key}`,
        quantity: 0,
        amount: 0,
      };
      prev.quantity += Number(qty || 0);
      prev.amount += amount;
      map.set(key, prev);
    }

    return Array.from(map.values());
  })();

  const mergedBillTotal = mergedBillItems.reduce((sum, row) => sum + Number(row?.amount || 0), 0);

  const serviceChargeNum = normalizeServiceCharge(serviceCharge);
  const serviceChargeGstPercent = Number(
    branchDetails?.service_charge_gst_required ? (branchDetails?.service_charge_gst_percent || 0) : 0
  );
  const serviceChargeGstAmt = serviceChargeGstPercent > 0
    ? Number(((serviceChargeNum * serviceChargeGstPercent) / 100).toFixed(2))
    : 0;
  const discountNum = Math.max(0, Number(discountAmt || 0));
  const grossBillTotal = Number((mergedBillTotal + serviceChargeNum + serviceChargeGstAmt).toFixed(2));
  const netBillTotal = Math.max(0, Number((grossBillTotal - discountNum).toFixed(2)));

  useEffect(() => {
    const auto = branchDiscountAmount(mergedBillTotal, branchDetails);
    setDiscountAmt(String(Math.round(auto)));
  }, [mergedBillTotal, branchDetails?.discount_enabled, branchDetails?.discount_type, branchDetails?.discount_value]);

  const lookupCustomerByMobile = useCallback(async (mobile) => {
    const mm = String(mobile || "").replace(/\D/g, "").slice(0, 10);
    if (mm.length !== 10) return;
    setCustomerLookupBusy(true);
    try {
      const res = await api.get(`/table-billing/latest-by-mobile/${mm}`);
      const row = res?.data || {};
      if (row?.customer_name) {
        setCustomerName(String(row.customer_name));
      }
    } catch {
      // Customer may be new; keep entered values without interrupting billing flow.
    } finally {
      setCustomerLookupBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!billOpen) return;
    const mm = String(customerMobile || "").replace(/\D/g, "").slice(0, 10);
    if (mobileLookupTimerRef.current) {
      clearTimeout(mobileLookupTimerRef.current);
      mobileLookupTimerRef.current = null;
    }
    if (mm.length !== 10) return;
    mobileLookupTimerRef.current = setTimeout(() => {
      lookupCustomerByMobile(mm);
    }, 350);

    return () => {
      if (mobileLookupTimerRef.current) {
        clearTimeout(mobileLookupTimerRef.current);
        mobileLookupTimerRef.current = null;
      }
    };
  }, [billOpen, customerMobile, lookupCustomerByMobile]);

  const sendKOT = async () => {
    if (cartCount === 0) return Alert.alert("Empty", "Add items first");
    if (!order?.order_id) return Alert.alert("Error", "Order is not available for this table.");
    setSending(true);
    try {
      for (const [id, qty] of Object.entries(cart)) {
        await api.post("/table-billing/order/item/add", null, {
          params: {
            order_id: order.order_id,
            item_id: Number(id),
            qty,
          },
        });
      }

      await api.post(`/kot/create/${order.order_id}`);

      setCart({});
      Alert.alert("KOT Sent", "Items sent to kitchen!");
      load(true);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to send KOT");
    } finally {
      setSending(false);
    }
  };

  const billTable = () => {
    if (!order?.order_id) return Alert.alert("No Order", "No open order on this table.");
    if ((order?.items?.length || 0) + cartCount <= 0) {
      return Alert.alert("No Items", "Add items before billing.");
    }
    setUpiUtr("");
    setUpiQrIdx(0);
    setBillOpen(true);
  };

  const saveBill = async () => {
    if (!order?.order_id) return;
    if (paymentMode === "upi" && upiUtr.trim().length !== 5) {
      return Alert.alert("Validation", "Enter UTR last 5 digits to confirm UPI payment");
    }
    setBilling(true);
    try {
      for (const [id, qty] of Object.entries(cart)) {
        await api.post("/table-billing/order/item/add", null, {
          params: {
            order_id: order.order_id,
            item_id: Number(id),
            qty,
          },
        });
      }

      const splitPayload = {
        gift_card_code: giftCardCode.trim() || undefined,
        gift_card_amount: Number(splitGift || 0) || undefined,
        coupon_code: couponCode.trim() || undefined,
        cash: Number(splitCash || 0) || undefined,
        card: Number(splitCard || 0) || undefined,
        upi: Number(splitUpi || 0) || undefined,
        wallet_mobile: walletMobile.trim() || undefined,
        wallet_amount: Number(walletAmount || 0) || undefined,
        customer_email: customerEmail.trim() || undefined,
        customer_gst: customerGst.trim() || undefined,
        upi_utr: (paymentMode === "upi" && upiUtr.trim()) ? upiUtr.trim().toUpperCase() : undefined,
      };
      const paymentSplit = Object.fromEntries(Object.entries(splitPayload).filter(([, v]) => v !== undefined));

      const payload = {
        customer_name: String(customerName || order?.customer_name || "Walk-in"),
        mobile: String(customerMobile || order?.mobile || ""),
        payment_mode: paymentMode,
        payment_split: Object.keys(paymentSplit).length ? paymentSplit : null,
        service_charge: normalizeServiceCharge(serviceCharge),
        discounted_amt: Math.max(0, Number(discountAmt || 0)),
        customer_gst: customerGst.trim() || null,
        customer_email: customerEmail.trim() || null,
      };

      const res = await api.post(`/table-billing/order/checkout/${order.order_id}`, payload);
      const invoiceNo = String(res?.data?.invoice_number || "").trim();

      setBillOpen(false);
      setCart({});
      Alert.alert("Bill Saved", invoiceNo ? `Invoice: ${invoiceNo}` : "Invoice saved successfully.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to save bill");
    } finally {
      setBilling(false);
    }
  };

  const cancelTable = () => {
    if (!order?.order_id) return Alert.alert("No Order", "No open order to cancel.");
    Alert.alert("Cancel Table", "Cancel this table order and free the table?", [
      { text: "No", style: "cancel" },
      {
        text: "Yes, Cancel",
        style: "destructive",
        onPress: async () => {
          try {
            await api.post(`/table-billing/order/cancel/${order.order_id}`);
            Alert.alert("Cancelled", "Table status changed to FREE.", [
              { text: "OK", onPress: () => navigation.goBack() },
            ]);
          } catch (err) {
            Alert.alert("Error", err?.response?.data?.detail || "Failed to cancel table");
          }
        },
      },
    ]);
  };

  const destinationTables = tables.filter(
    (t) => Number(t.table_id) !== Number(table.table_id) && !t.order_id
  );

  const transferTableOrder = async () => {
    if (!order?.order_id) {
      Alert.alert("No Order", "No open order available to transfer.");
      return;
    }
    if (!transferTableId) {
      Alert.alert("Select Table", "Choose a destination table first.");
      return;
    }

    setTransferBusy(true);
    try {
      const res = await api.post("/table-billing/order/transfer", {
        from_table_id: Number(table.table_id),
        to_table_id: Number(transferTableId),
      });

      setTransferOpen(false);
      setTransferTableId(null);
      Alert.alert(
        "Transferred",
        `Order moved to ${res?.data?.to_table_name || "selected table"}.`,
        [{ text: "OK", onPress: () => navigation.goBack() }]
      );
    } catch (err) {
      const status = Number(err?.response?.status || 0);
      const shouldFallback = status === 0 || status >= 500 || status === 404 || status === 405 || status === 422;
      if (shouldFallback) {
        try {
          const sourceRes = await api.get(`/table-billing/order/by-table/${Number(table.table_id)}`);
          const sourceOrderId = Number(sourceRes?.data?.order_id || 0);
          const sourceItems = Array.isArray(sourceRes?.data?.items) ? sourceRes.data.items : [];
          if (!sourceOrderId || !sourceItems.length) {
            throw new Error("No items found on source table");
          }

          const destRes = await api.get(`/table-billing/order/by-table/${Number(transferTableId)}`);
          const destOrderId = Number(destRes?.data?.order_id || 0);
          if (!destOrderId) {
            throw new Error("Unable to open destination table");
          }

          for (const row of sourceItems) {
            const qty = Number(row?.quantity || 0);
            const itemId = Number(row?.item_id || 0);
            if (!itemId || qty <= 0) continue;
            await api.post("/table-billing/order/item/add", null, {
              params: {
                order_id: destOrderId,
                item_id: itemId,
                qty,
              },
            });
          }

          await api.post(`/table-billing/order/cancel/${sourceOrderId}`);
          setTransferOpen(false);
          setTransferTableId(null);
          Alert.alert(
            "Transferred",
            "Order transferred successfully.",
            [{ text: "OK", onPress: () => navigation.goBack() }]
          );
        } catch (fallbackErr) {
          Alert.alert("Error", fallbackErr?.response?.data?.detail || fallbackErr?.message || "Failed to transfer table");
        }
      } else {
        Alert.alert("Error", err?.response?.data?.detail || "Failed to transfer table");
      }
    } finally {
      setTransferBusy(false);
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
      {/* Current Order Summary */}
      {order && (
        <View style={styles.orderBanner}>
          <Text style={styles.orderBannerText}>
            Order #{order.order_id}  •  {bannerItemQty} items  •  ₹{fmt(bannerTotal)}
          </Text>
          <View style={styles.bannerActions}>
            <Pressable
              style={styles.transferBtn}
              onPress={() => {
                setTransferTableId(null);
                setTransferOpen(true);
              }}
            >
              <Text style={styles.transferBtnText}>Transfer</Text>
            </Pressable>
            <Pressable style={styles.cancelTableBtn} onPress={cancelTable}>
              <Text style={styles.cancelTableBtnText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.billBtn} onPress={billTable}>
              <Text style={styles.billBtnText}>Bill</Text>
            </Pressable>
          </View>
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ padding: 14, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      >
        {/* Search */}
        <TextInput
          style={[styles.search, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }]}
          placeholder="Search items…"
          value={search}
          onChangeText={setSearch}
          placeholderTextColor={theme.textMuted}
        />

        {/* Category Filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {[{ category_id: null, category_name: "All" }, ...categories].map((cat) => (
            <Pressable
              key={cat.category_id ?? "all"}
              style={[styles.catChip, selCat === cat.category_id && styles.catChipActive]}
              onPress={() => setSelCat(cat.category_id)}
            >
              <Text style={[styles.catText, selCat === cat.category_id && styles.catTextActive]}>
                {cat.category_name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Items */}
        {visibleItems.map((item) => {
          const qty = cart[item.item_id] ?? 0;
          return (
            <View key={item.item_id} style={styles.itemCard}>
              {resolveItemImageUrl(item) ? (
                <Image source={{ uri: resolveItemImageUrl(item) }} style={styles.itemThumb} resizeMode="cover" />
              ) : null}
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName} numberOfLines={1}>{item.item_name}</Text>
                <Text style={styles.itemPrice}>₹{fmt(item.selling_price ?? item.price)}</Text>
              </View>
              <View style={styles.qtyRow}>
                {qty > 0 ? (
                  <>
                    <Pressable style={styles.qtyBtn} onPress={() => adjust(item.item_id, -1)}>
                      <Text style={styles.qtyBtnText}>−</Text>
                    </Pressable>
                    <Text style={styles.qtyNum}>{qty}</Text>
                  </>
                ) : null}
                <Pressable style={[styles.qtyBtn, { backgroundColor: "#0b57d0" }]} onPress={() => adjust(item.item_id, 1)}>
                  <Text style={[styles.qtyBtnText, { color: "#fff" }]}>+</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Cart Footer */}
      {cartCount > 0 && (
        <View style={styles.cartFooter}>
          <View>
            <Text style={styles.cartItems}>{cartCount} item{cartCount > 1 ? "s" : ""} added</Text>
            <Text style={styles.cartTotal}>₹{fmt(cartTotal)}</Text>
          </View>
          <Pressable style={styles.kotBtn} onPress={sendKOT} disabled={sending}>
            <Text style={styles.kotBtnText}>{sending ? "Sending…" : "Send KOT"}</Text>
          </Pressable>
        </View>
      )}

      <Modal visible={billOpen} transparent animationType="fade" onRequestClose={() => setBillOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxHeight: "90%" }]}>
            <Text style={styles.modalTitle}>Confirm Bill - Table {table.table_name}</Text>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 10 }}>
              {mergedBillItems.map((row) => (
                <View key={String(row.item_id)} style={styles.modalItemRow}>
                  <Text style={styles.modalItemName}>{row.item_name} x{row.quantity}</Text>
                  <Text style={styles.modalItemAmt}>₹{Number(row.amount || 0).toFixed(2)}</Text>
                </View>
              ))}

            <Text style={styles.modalTotal}>Items Total: ₹{Number(mergedBillTotal || 0).toFixed(2)}</Text>
            <Text style={styles.modalBreakdown}>Service Charge: ₹{serviceChargeNum.toFixed(2)}</Text>
            <Text style={styles.modalBreakdown}>Service Charge GST: ₹{serviceChargeGstAmt.toFixed(2)}</Text>
            <Text style={styles.modalBreakdown}>Discount: ₹{discountNum.toFixed(2)}</Text>
            <Text style={styles.modalGrandTotal}>Payable: ₹{netBillTotal.toFixed(2)}</Text>

            <Text style={styles.modalSubTitle}>Customer Mobile</Text>
            <TextInput
              style={styles.search}
              placeholder="10-digit mobile"
              keyboardType="phone-pad"
              value={customerMobile}
              onChangeText={(v) => setCustomerMobile(v.replace(/\D/g, "").slice(0, 10))}
              placeholderTextColor="#94a3b8"
            />
            {customerLookupBusy ? <Text style={styles.lookupHint}>Fetching customer…</Text> : null}

            <Text style={styles.modalSubTitle}>Customer Name</Text>
            <TextInput
              style={styles.search}
              placeholder="Walk-in"
              value={customerName}
              onChangeText={setCustomerName}
              placeholderTextColor="#94a3b8"
            />

            <Text style={styles.modalSubTitle}>Customer Email</Text>
            <TextInput
              style={styles.search}
              placeholder="Email"
              value={customerEmail}
              onChangeText={setCustomerEmail}
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <Text style={styles.modalSubTitle}>Customer GST</Text>
            <TextInput
              style={styles.search}
              placeholder="GST number"
              value={customerGst}
              onChangeText={setCustomerGst}
              placeholderTextColor="#94a3b8"
              autoCapitalize="characters"
            />

            <Text style={styles.modalSubTitle}>Service Charge</Text>
            <TextInput
              style={styles.search}
              placeholder="0"
              keyboardType="numeric"
              value={serviceCharge}
              onChangeText={(v) => setServiceCharge(v.replace(/[^\d.]/g, ""))}
              placeholderTextColor="#94a3b8"
            />

            <Text style={styles.modalSubTitle}>Discount</Text>
            <TextInput
              style={styles.search}
              placeholder="0"
              keyboardType="numeric"
              value={discountAmt}
              onChangeText={(v) => setDiscountAmt(v.replace(/[^\d.]/g, ""))}
              placeholderTextColor="#94a3b8"
            />

            <Text style={styles.modalSubTitle}>Payment Mode</Text>
            <View style={styles.paymentRow}>
              {PAYMENT_MODES.map((mode) => (
                <Pressable
                  key={mode}
                  style={[styles.paymentBtn, paymentMode === mode && styles.paymentBtnActive]}
                  onPress={() => { setPaymentMode(mode); setUpiUtr(""); }}
                >
                  <Text style={[styles.paymentBtnText, paymentMode === mode && styles.paymentBtnTextActive]}>
                    {mode.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>

            {paymentMode === "upi" && (
              <View style={styles.upiSection}>
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
                      <View style={styles.upiNoIdBox}>
                        <Text style={styles.upiNoIdTxt}>No UPI ID configured for this branch.</Text>
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
                      <View style={styles.upiQrBox}>
                        <QRCode
                          value={`upi://pay?pa=${encodeURIComponent(upiIds[safeIdx])}&pn=${encodeURIComponent(shopDetails.shop_name || "Shop")}&am=${netBillTotal.toFixed(2)}&cu=INR`}
                          size={160}
                          backgroundColor="#ffffff"
                          color="#0b1220"
                        />
                        <Text style={styles.upiQrId}>{upiIds[safeIdx]}</Text>
                        <Text style={styles.upiQrAmt}>Amount: ₹{netBillTotal.toFixed(2)}</Text>
                      </View>
                    </View>
                  );
                })()}
                <Text style={styles.modalSubTitle}>UTR Last 5 Digits *</Text>
                <TextInput
                  style={styles.search}
                  placeholder="e.g. AB123"
                  value={upiUtr}
                  onChangeText={(v) => setUpiUtr(v.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 5))}
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="characters"
                  maxLength={5}
                />
              </View>
            )}

            {(paymentMode === "gift_card" || paymentMode === "split") && (
              <>
                <Text style={styles.modalSubTitle}>Gift Card</Text>
                <TextInput
                  style={styles.search}
                  placeholder="Gift card code"
                  value={giftCardCode}
                  onChangeText={setGiftCardCode}
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="characters"
                />
                <TextInput
                  style={styles.search}
                  placeholder="Gift card amount"
                  keyboardType="numeric"
                  value={splitGift}
                  onChangeText={(v) => setSplitGift(v.replace(/[^\d.]/g, ""))}
                  placeholderTextColor="#94a3b8"
                />
              </>
            )}

            {(paymentMode === "coupon" || paymentMode === "split") && (
              <>
                <Text style={styles.modalSubTitle}>Coupon Code</Text>
                <TextInput
                  style={styles.search}
                  placeholder="Coupon code"
                  value={couponCode}
                  onChangeText={setCouponCode}
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="characters"
                />
              </>
            )}

            {paymentMode === "split" && (
              <>
                <Text style={styles.modalSubTitle}>Split Payments</Text>
                <TextInput
                  style={styles.search}
                  placeholder="Cash amount"
                  keyboardType="numeric"
                  value={splitCash}
                  onChangeText={(v) => setSplitCash(v.replace(/[^\d.]/g, ""))}
                  placeholderTextColor="#94a3b8"
                />
                <TextInput
                  style={styles.search}
                  placeholder="Card amount"
                  keyboardType="numeric"
                  value={splitCard}
                  onChangeText={(v) => setSplitCard(v.replace(/[^\d.]/g, ""))}
                  placeholderTextColor="#94a3b8"
                />
                <TextInput
                  style={styles.search}
                  placeholder="UPI amount"
                  keyboardType="numeric"
                  value={splitUpi}
                  onChangeText={(v) => setSplitUpi(v.replace(/[^\d.]/g, ""))}
                  placeholderTextColor="#94a3b8"
                />
              </>
            )}

            {(paymentMode === "wallet" || paymentMode === "split") && (
              <>
                <Text style={styles.modalSubTitle}>Wallet</Text>
                <TextInput
                  style={styles.search}
                  placeholder="Wallet mobile"
                  keyboardType="phone-pad"
                  value={walletMobile}
                  onChangeText={(v) => setWalletMobile(v.replace(/\D/g, "").slice(0, 10))}
                  placeholderTextColor="#94a3b8"
                />
                <TextInput
                  style={styles.search}
                  placeholder="Wallet amount"
                  keyboardType="numeric"
                  value={walletAmount}
                  onChangeText={(v) => setWalletAmount(v.replace(/[^\d.]/g, ""))}
                  placeholderTextColor="#94a3b8"
                />
              </>
            )}

            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setBillOpen(false)} disabled={billing}>
                <Text style={styles.modalCancelText}>Close</Text>
              </Pressable>
              <Pressable style={[styles.modalSave, billing && { opacity: 0.6 }]} onPress={saveBill} disabled={billing}>
                <Text style={styles.modalSaveText}>{billing ? "Saving..." : "Save Bill"}</Text>
              </Pressable>
            </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={transferOpen} transparent animationType="fade" onRequestClose={() => setTransferOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Transfer Table</Text>
            <Text style={styles.modalSubTitle}>Move current order to another free table</Text>

            <ScrollView style={{ maxHeight: 240 }}>
              {destinationTables.length ? (
                destinationTables.map((t) => {
                  const active = Number(transferTableId) === Number(t.table_id);
                  return (
                    <Pressable
                      key={t.table_id}
                      style={[styles.transferRow, active && styles.transferRowActive]}
                      onPress={() => setTransferTableId(t.table_id)}
                    >
                      <Text style={[styles.transferRowText, active && styles.transferRowTextActive]}>
                        {t.table_name}
                      </Text>
                    </Pressable>
                  );
                })
              ) : (
                <Text style={styles.emptyTransferText}>No free tables available.</Text>
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setTransferOpen(false)} disabled={transferBusy}>
                <Text style={styles.modalCancelText}>Close</Text>
              </Pressable>
              <Pressable
                style={[styles.modalSave, transferBusy && { opacity: 0.6 }]}
                onPress={transferTableOrder}
                disabled={transferBusy}
              >
                <Text style={styles.modalSaveText}>{transferBusy ? "Transferring..." : "Transfer"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function fmt(n) {
  return Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: "#f3f6ff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  orderBanner: {
    backgroundColor: "#0b57d0",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
  },
  orderBannerText: { color: "#bfdbfe", fontWeight: "600", flex: 1 },
  bannerActions: { flexDirection: "row", gap: 8, alignItems: "center" },
  billBtn:     { backgroundColor: "#fff", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  billBtnText: { color: "#0b57d0", fontWeight: "800" },
  transferBtn: { backgroundColor: "#e0e7ff", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  transferBtnText: { color: "#3730a3", fontWeight: "800" },
  cancelTableBtn: { backgroundColor: "#fee2e2", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  cancelTableBtnText: { color: "#b91c1c", fontWeight: "800" },
  search: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#d9e3ff",
    color: "#0b1220",
  },
  catChip: {
    borderWidth: 1,
    borderColor: "#d9e3ff",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    backgroundColor: "#fff",
  },
  catChipActive: { backgroundColor: "#0b57d0", borderColor: "#0b57d0" },
  catText:       { color: "#475569", fontWeight: "600", fontSize: 13 },
  catTextActive: { color: "#fff" },
  itemCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#d9e3ff",
  },
  itemThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    marginRight: 10,
    backgroundColor: "#e2e8f0",
  },
  itemName:  { fontWeight: "600", color: "#0b1220" },
  itemPrice: { color: "#475569", marginTop: 2 },
  qtyRow:    { flexDirection: "row", alignItems: "center", gap: 8 },
  qtyBtn:    { width: 32, height: 32, borderRadius: 8, backgroundColor: "#f3f6ff", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#d9e3ff" },
  qtyBtnText: { fontWeight: "800", fontSize: 18 },
  qtyNum:    { fontWeight: "700", fontSize: 16, minWidth: 20, textAlign: "center" },
  cartFooter: {
    backgroundColor: "#0b57d0",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
  },
  cartItems: { color: "#bfdbfe", fontSize: 12 },
  cartTotal: { color: "#fff", fontWeight: "800", fontSize: 18 },
  kotBtn:    { backgroundColor: "#fff", borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  kotBtnText: { color: "#0b57d0", fontWeight: "800" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(2,6,23,0.45)",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#d9e3ff",
  },
  modalTitle: { fontSize: 16, fontWeight: "800", color: "#0b1220" },
  modalSubTitle: { fontSize: 13, fontWeight: "700", color: "#334155" },
  modalItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f6ff",
    paddingVertical: 6,
  },
  modalItemName: { color: "#0b1220", flex: 1, paddingRight: 8 },
  modalItemAmt: { color: "#0b1220", fontWeight: "700" },
  modalTotal: { textAlign: "right", fontWeight: "800", fontSize: 16, color: "#047857" },
  modalBreakdown: { textAlign: "right", color: "#334155", fontWeight: "600" },
  modalGrandTotal: { textAlign: "right", fontWeight: "900", fontSize: 18, color: "#047857" },
  lookupHint: { color: "#0b57d0", fontSize: 12, fontWeight: "600" },
  transferRow: {
    borderWidth: 1,
    borderColor: "#d9e3ff",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    backgroundColor: "#fff",
  },
  transferRowActive: {
    borderColor: "#4f46e5",
    backgroundColor: "#eef2ff",
  },
  transferRowText: { color: "#0b1220", fontWeight: "700" },
  transferRowTextActive: { color: "#3730a3" },
  emptyTransferText: { color: "#94a3b8", paddingVertical: 6 },
  paymentRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  paymentBtn: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "#fff",
  },
  paymentBtnActive: { backgroundColor: "#0b57d0", borderColor: "#0b57d0" },
  paymentBtnText: { color: "#334155", fontWeight: "700", fontSize: 12 },
  paymentBtnTextActive: { color: "#fff" },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 4 },
  modalCancel: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  modalCancelText: { color: "#475569", fontWeight: "700" },
  modalSave: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#059669",
  },
  modalSaveText: { color: "#fff", fontWeight: "800" },
  upiSection: { gap: 8 },
  upiTabRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
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
  upiQrBox: {
    alignItems: "center",
    backgroundColor: "#f8faff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#d9e3ff",
    padding: 14,
    gap: 6,
  },
  upiQrId: { fontSize: 12, fontWeight: "700", color: "#334155", textAlign: "center" },
  upiQrAmt: { fontSize: 14, fontWeight: "800", color: "#0b57d0", textAlign: "center" },
  upiNoIdBox: {
    backgroundColor: "#fef9ec",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#fde68a",
    padding: 10,
  },
  upiNoIdTxt: { fontSize: 12, color: "#92400e", fontWeight: "600", textAlign: "center" },
});
