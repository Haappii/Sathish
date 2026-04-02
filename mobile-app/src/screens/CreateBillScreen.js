import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import {
  cacheCategories,
  cacheItems,
  getCachedCategories,
  getCachedItems,
} from "../offline/cache";
import { enqueueInvoice, getPendingCount } from "../offline/queue";
import { syncOfflineQueue } from "../offline/sync";

const DEFAULT_MOBILE = "9999999999";
const PAYMENT_MODES  = ["cash", "card", "upi", "credit"];
const fmt = (n) => `₹${Number(n || 0).toFixed(2)}`;

export default function CreateBillScreen() {
  const { isOnline } = useOnlineStatus();

  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [categories, setCategories] = useState([]);
  const [itemsData, setItemsData]  = useState([]);
  const [selectedCat, setSelectedCat] = useState("ALL");
  const [itemSearch, setItemSearch]   = useState("");
  const [cart, setCart]           = useState([]);
  const [customer, setCustomer]   = useState({ mobile: DEFAULT_MOBILE, name: "", gst_number: "" });
  const [paymentMode, setPaymentMode] = useState("cash");
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing]     = useState(false);

  // ── Load data (API first, fallback to cache) ───────────────────────────────
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        if (isOnline) {
          const [catRes, itemRes] = await Promise.all([
            api.get("/category/"),
            api.get("/items/"),
          ]);
          const cats  = catRes?.data || [];
          const items = itemRes?.data || [];
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
  }, [isOnline]);

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
  const addToCart = (item) => {
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
        .map((x) => x.item_id === itemId ? { ...x, qty: Math.max(1, x.qty + delta) } : x)
        .filter((x) => x.qty > 0)
    );
  };

  const removeItem = (itemId) => setCart((prev) => prev.filter((x) => x.item_id !== itemId));

  const subtotal = useMemo(
    () => cart.reduce((t, x) => t + x.price * x.qty, 0),
    [cart]
  );

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

  // ── Save invoice (online → API, offline → queue) ───────────────────────────
  const saveInvoice = async () => {
    if (!cart.length) return Alert.alert("Validation", "Add at least one item");

    const mobile = String(customer.mobile || "").replace(/\D/g, "");
    if (mobile.length !== 10) return Alert.alert("Validation", "Enter a valid 10-digit mobile");
    if (!String(customer.name || "").trim()) return Alert.alert("Validation", "Customer name is required");

    const payload = {
      customer_name: String(customer.name || "").trim(),
      mobile,
      customer_gst: String(customer.gst_number || "").trim() || null,
      discounted_amt: 0,
      payment_mode: paymentMode,
      payment_split: null,
      items: cart.map((x) => ({
        item_id: x.item_id,
        quantity: x.qty,
        amount: x.qty * x.price,
      })),
    };

    setSaving(true);
    try {
      if (isOnline) {
        // Online — submit directly
        const res = await api.post("/invoice/", payload);
        const invoiceNo = res?.data?.invoice_number || "";
        Alert.alert("Saved ✓", invoiceNo ? `Invoice: ${invoiceNo}` : "Invoice saved");
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
      setCart([]);
      setCustomer({ mobile: DEFAULT_MOBILE, name: "", gst_number: "" });
      setPaymentMode("cash");
    } catch (err) {
      // API call failed even though we thought we were online — queue it
      await enqueueInvoice(payload);
      const count = await getPendingCount();
      setPendingCount(count);
      Alert.alert("Network Error", "Bill saved locally and will sync when reconnected.");
      setCart([]);
      setCustomer({ mobile: DEFAULT_MOBILE, name: "", gst_number: "" });
      setPaymentMode("cash");
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
                  <Text style={styles.itemPrice}>₹{Number(item.selling_price || item.price || 0).toFixed(2)}</Text>
                  {inCart && <Text style={styles.inCartBadge}>×{inCart.qty} in cart</Text>}
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
                  <Text style={styles.cartAmount}>{fmt(x.qty * x.price)}</Text>
                </View>
                <View style={styles.qtyWrap}>
                  <Pressable style={styles.qtyBtn} onPress={() => changeQty(x.item_id, -1)}>
                    <Text style={styles.qtyTxt}>−</Text>
                  </Pressable>
                  <Text style={styles.qtyValue}>{x.qty}</Text>
                  <Pressable style={[styles.qtyBtn, { backgroundColor: "#1d4ed8" }]} onPress={() => changeQty(x.item_id, 1)}>
                    <Text style={[styles.qtyTxt, { color: "#fff" }]}>+</Text>
                  </Pressable>
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

          <Pressable
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            disabled={saving}
            onPress={saveInvoice}
          >
            <Text style={styles.saveTxt}>
              {saving
                ? "Saving…"
                : isOnline
                  ? `Save Invoice  ${fmt(subtotal)}`
                  : `Save Offline  ${fmt(subtotal)}`}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: "#f1f5f9" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  offlineBanner: { backgroundColor: "#92400e", padding: 10, alignItems: "center" },
  offlineBannerText: { color: "#fef3c7", fontWeight: "700", fontSize: 13 },
  syncBanner: { backgroundColor: "#1d4ed8", padding: 10, alignItems: "center" },
  syncBannerText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  container: { padding: 12, gap: 10, paddingBottom: 24 },
  section: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 12,
    gap: 8,
  },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: "#0f172a" },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 11,
    paddingVertical: 10,
    color: "#0f172a",
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
  chipActive: { backgroundColor: "#1d4ed8", borderColor: "#1d4ed8" },
  chipText:       { color: "#334155", fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  itemCard: {
    flex: 1,
    minHeight: 88,
    borderWidth: 1,
    borderColor: "#dbeafe",
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#f8fafc",
  },
  itemCardActive: { borderColor: "#1d4ed8", backgroundColor: "#eff6ff" },
  itemName:    { fontWeight: "700", color: "#1e293b" },
  itemPrice:   { marginTop: 6, color: "#1d4ed8", fontWeight: "700" },
  inCartBadge: { marginTop: 4, color: "#16a34a", fontSize: 11, fontWeight: "700" },
  cartRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#fff",
  },
  cartName:   { fontWeight: "700", color: "#0f172a" },
  cartAmount: { marginTop: 2, color: "#475569" },
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
  qtyTxt:   { fontSize: 18, color: "#0f172a", fontWeight: "700" },
  qtyValue: { fontWeight: "700", color: "#0f172a", minWidth: 20, textAlign: "center" },
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
  modeBtnActive: { backgroundColor: "#1d4ed8", borderColor: "#1d4ed8" },
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
});
