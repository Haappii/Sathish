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

const DEFAULT_MOBILE = "9999999999";

const paymentModes = ["cash", "card", "upi", "credit"];

const fmt = (n) => `Rs. ${Number(n || 0).toFixed(2)}`;

export default function CreateBillScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [categories, setCategories] = useState([]);
  const [itemsData, setItemsData] = useState([]);

  const [selectedCat, setSelectedCat] = useState("ALL");
  const [itemSearch, setItemSearch] = useState("");

  const [cart, setCart] = useState([]);
  const [customer, setCustomer] = useState({
    mobile: DEFAULT_MOBILE,
    name: "",
    gst_number: "",
  });
  const [paymentMode, setPaymentMode] = useState("cash");

  const loadData = async () => {
    setLoading(true);
    try {
      const [catRes, itemRes] = await Promise.all([api.get("/category/"), api.get("/items/")]);
      setCategories(catRes?.data || []);
      setItemsData(itemRes?.data || []);
    } catch (err) {
      const msg = err?.response?.data?.detail || "Failed to load categories/items";
      Alert.alert("Error", String(msg));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredItems = useMemo(() => {
    const q = itemSearch.toLowerCase();
    return (itemsData || []).filter((it) => {
      const nameMatch = String(it.item_name || "").toLowerCase().includes(q);
      const catMatch = selectedCat === "ALL" || it.category_id === selectedCat;
      return nameMatch && catMatch;
    });
  }, [itemsData, itemSearch, selectedCat]);

  const addToCart = (item) => {
    setCart((prev) => {
      const found = prev.find((x) => x.item_id === item.item_id);
      if (found) {
        return prev.map((x) =>
          x.item_id === item.item_id ? { ...x, qty: x.qty + 1 } : x
        );
      }
      return [...prev, { ...item, qty: 1, price: Number(item.price || 0) }];
    });
  };

  const changeQty = (itemId, delta) => {
    setCart((prev) =>
      prev
        .map((x) =>
          x.item_id === itemId ? { ...x, qty: Math.max(1, Number(x.qty || 1) + delta) } : x
        )
        .filter((x) => x.qty > 0)
    );
  };

  const removeItem = (itemId) => {
    setCart((prev) => prev.filter((x) => x.item_id !== itemId));
  };

  const subtotal = useMemo(
    () => cart.reduce((t, x) => t + Number(x.price || 0) * Number(x.qty || 0), 0),
    [cart]
  );

  const fetchCustomerByMobile = async (mobile) => {
    if (!mobile || mobile.length !== 10) return;
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
      // no customer data; keep manual input
    }
  };

  const saveInvoice = async () => {
    if (!cart.length) {
      Alert.alert("Validation", "Add at least one item");
      return;
    }

    const mobile = String(customer.mobile || "").replace(/\D/g, "");
    if (mobile.length !== 10) {
      Alert.alert("Validation", "Enter a valid 10-digit mobile");
      return;
    }
    if (!String(customer.name || "").trim()) {
      Alert.alert("Validation", "Customer name is required");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        customer_name: String(customer.name || "").trim(),
        mobile,
        customer_gst: String(customer.gst_number || "").trim() || null,
        discounted_amt: 0,
        payment_mode: paymentMode,
        payment_split: null,
        items: cart.map((x) => ({
          item_id: x.item_id,
          quantity: Number(x.qty || 1),
          amount: Number(x.qty || 1) * Number(x.price || 0),
        })),
      };

      const res = await api.post("/invoice/", payload);
      const invoiceNo = res?.data?.invoice_number || "";
      Alert.alert("Saved", invoiceNo ? `Invoice: ${invoiceNo}` : "Invoice saved");
      setCart([]);
      setCustomer({ mobile: DEFAULT_MOBILE, name: "", gst_number: "" });
      setPaymentMode("cash");
    } catch (err) {
      const msg = err?.response?.data?.detail || "Failed to save invoice";
      Alert.alert("Error", String(msg));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Filters</Text>
          <TextInput
            value={itemSearch}
            onChangeText={setItemSearch}
            style={styles.input}
            placeholder="Search item"
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rowScroll}>
            <Pressable
              style={[styles.chip, selectedCat === "ALL" && styles.chipActive]}
              onPress={() => setSelectedCat("ALL")}
            >
              <Text style={[styles.chipText, selectedCat === "ALL" && styles.chipTextActive]}>
                All
              </Text>
            </Pressable>
            {categories.map((c) => (
              <Pressable
                key={String(c.category_id)}
                style={[styles.chip, selectedCat === c.category_id && styles.chipActive]}
                onPress={() => setSelectedCat(c.category_id)}
              >
                <Text
                  style={[
                    styles.chipText,
                    selectedCat === c.category_id && styles.chipTextActive,
                  ]}
                >
                  {c.category_name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Items</Text>
          <FlatList
            data={filteredItems}
            keyExtractor={(item) => String(item.item_id)}
            numColumns={2}
            scrollEnabled={false}
            columnWrapperStyle={{ gap: 8 }}
            contentContainerStyle={{ gap: 8 }}
            renderItem={({ item }) => (
              <Pressable style={styles.itemCard} onPress={() => addToCart(item)}>
                <Text style={styles.itemName} numberOfLines={2}>
                  {item.item_name}
                </Text>
                <Text style={styles.itemPrice}>{fmt(item.price)}</Text>
              </Pressable>
            )}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customer</Text>
          <TextInput
            style={styles.input}
            placeholder="Mobile"
            keyboardType="phone-pad"
            value={customer.mobile}
            onChangeText={(v) => {
              let next = v.replace(/\D/g, "");
              if (next.length > 10) next = next.slice(0, 10);
              setCustomer((p) => ({ ...p, mobile: next }));
              if (next.length === 10) fetchCustomerByMobile(next);
            }}
          />
          <TextInput
            style={styles.input}
            placeholder="Customer Name"
            value={customer.name}
            onChangeText={(v) => setCustomer((p) => ({ ...p, name: v }))}
          />
          <TextInput
            style={styles.input}
            placeholder="Customer GST (optional)"
            value={customer.gst_number}
            onChangeText={(v) => setCustomer((p) => ({ ...p, gst_number: v }))}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cart</Text>
          {cart.length === 0 ? <Text style={styles.empty}>Cart is empty</Text> : null}
          {cart.map((x) => (
            <View key={String(x.item_id)} style={styles.cartRow}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.cartName} numberOfLines={2}>
                  {x.item_name}
                </Text>
                <Text style={styles.cartAmount}>{fmt(Number(x.qty || 0) * Number(x.price || 0))}</Text>
              </View>
              <View style={styles.qtyWrap}>
                <Pressable style={styles.qtyBtn} onPress={() => changeQty(x.item_id, -1)}>
                  <Text style={styles.qtyTxt}>-</Text>
                </Pressable>
                <Text style={styles.qtyValue}>{x.qty}</Text>
                <Pressable style={styles.qtyBtn} onPress={() => changeQty(x.item_id, 1)}>
                  <Text style={styles.qtyTxt}>+</Text>
                </Pressable>
                <Pressable style={styles.removeBtn} onPress={() => removeItem(x.item_id)}>
                  <Text style={styles.removeTxt}>Remove</Text>
                </Pressable>
              </View>
            </View>
          ))}

          <Text style={styles.total}>Total: {fmt(subtotal)}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment</Text>
          <View style={styles.modeRow}>
            {paymentModes.map((m) => (
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
            <Text style={styles.saveTxt}>{saving ? "Saving..." : "Save Invoice"}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f1f5f9" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
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
    backgroundColor: "#fff",
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  rowScroll: { marginTop: 2 },
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
  chipText: { color: "#334155", fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  itemCard: {
    flex: 1,
    minHeight: 92,
    borderWidth: 1,
    borderColor: "#dbeafe",
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#f8fafc",
  },
  itemName: { fontWeight: "700", color: "#1e293b" },
  itemPrice: { marginTop: 8, color: "#1d4ed8", fontWeight: "700" },
  empty: { color: "#64748b" },
  cartRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    padding: 8,
    backgroundColor: "#fff",
  },
  cartName: { fontWeight: "700", color: "#0f172a" },
  cartAmount: { marginTop: 2, color: "#475569" },
  qtyWrap: { alignItems: "center" },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
  },
  qtyTxt: { fontSize: 18, color: "#0f172a", fontWeight: "700" },
  qtyValue: { marginVertical: 6, fontWeight: "700", color: "#0f172a" },
  removeBtn: { marginTop: 6 },
  removeTxt: { color: "#b91c1c", fontSize: 12, fontWeight: "600" },
  total: { marginTop: 6, fontSize: 16, fontWeight: "800", color: "#047857" },
  modeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  modeBtn: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  modeBtnActive: { backgroundColor: "#1d4ed8", borderColor: "#1d4ed8" },
  modeTxt: { fontSize: 12, fontWeight: "700", color: "#334155" },
  modeTxtActive: { color: "#fff" },
  saveBtn: {
    marginTop: 8,
    borderRadius: 10,
    backgroundColor: "#059669",
    paddingVertical: 12,
    alignItems: "center",
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveTxt: { color: "#fff", fontWeight: "800" },
});
