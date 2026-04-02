/**
 * TableOrderScreen — manage items for a specific table.
 * Shows existing open order + allows adding items, sending KOT, and billing.
 */
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import api from "../api/client";

export default function TableOrderScreen({ route, navigation }) {
  const { table } = route.params;

  const [order, setOrder]         = useState(null);
  const [categories, setCategories] = useState([]);
  const [items, setItems]         = useState([]);
  const [selCat, setSelCat]       = useState(null);
  const [search, setSearch]       = useState("");
  const [cart, setCart]           = useState({}); // item_id → qty
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending]     = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [catRes, itemRes, orderRes] = await Promise.all([
        api.get("/category/"),
        api.get("/items/"),
        api.get(`/table-billing/tables/${table.table_id}/open-order`).catch(() => ({ data: null })),
      ]);
      setCategories(catRes.data?.categories ?? catRes.data ?? []);
      setItems(itemRes.data?.items ?? itemRes.data ?? []);
      setOrder(orderRes.data);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [table.table_id]);

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
    return s + qty * Number(item?.selling_price ?? 0);
  }, 0);

  const sendKOT = async () => {
    if (cartCount === 0) return Alert.alert("Empty", "Add items first");
    setSending(true);
    try {
      // Create/update the order then send KOT
      const cartItems = Object.entries(cart).map(([id, qty]) => ({
        item_id: Number(id),
        quantity: qty,
      }));

      let orderId = order?.order_id;

      if (!orderId) {
        // Open a new order for this table
        const res = await api.post("/table-billing/orders", {
          table_id: table.table_id,
          order_type: "DINE_IN",
        });
        orderId = res.data.order_id;
      }

      // Add items to order
      await api.post(`/table-billing/orders/${orderId}/items`, { items: cartItems });

      // Send KOT
      await api.post(`/kot/create/${orderId}`);

      setCart({});
      Alert.alert("KOT Sent", "Items sent to kitchen!");
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to send KOT");
    } finally {
      setSending(false);
    }
  };

  const billTable = () => {
    if (!order?.order_id) return Alert.alert("No Order", "No open order on this table.");
    navigation.navigate("CreateBill", { prefillOrderId: order.order_id, tableId: table.table_id });
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
      {/* Current Order Summary */}
      {order && (
        <View style={styles.orderBanner}>
          <Text style={styles.orderBannerText}>
            Order #{order.order_id}  •  {order.items?.length ?? 0} items  •  ₹{fmt(order.total_amount)}
          </Text>
          <Pressable style={styles.billBtn} onPress={billTable}>
            <Text style={styles.billBtnText}>Bill</Text>
          </Pressable>
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ padding: 14, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      >
        {/* Search */}
        <TextInput
          style={styles.search}
          placeholder="Search items…"
          value={search}
          onChangeText={setSearch}
          placeholderTextColor="#94a3b8"
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
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName} numberOfLines={1}>{item.item_name}</Text>
                <Text style={styles.itemPrice}>₹{fmt(item.selling_price)}</Text>
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
                <Pressable style={[styles.qtyBtn, { backgroundColor: "#1d4ed8" }]} onPress={() => adjust(item.item_id, 1)}>
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
    </SafeAreaView>
  );
}

function fmt(n) {
  return Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: "#f1f5f9" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  orderBanner: {
    backgroundColor: "#1d4ed8",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
  },
  orderBannerText: { color: "#bfdbfe", fontWeight: "600", flex: 1 },
  billBtn:     { backgroundColor: "#fff", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  billBtnText: { color: "#1d4ed8", fontWeight: "800" },
  search: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    color: "#0f172a",
  },
  catChip: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    backgroundColor: "#fff",
  },
  catChipActive: { backgroundColor: "#1d4ed8", borderColor: "#1d4ed8" },
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
    borderColor: "#e2e8f0",
  },
  itemName:  { fontWeight: "600", color: "#0f172a" },
  itemPrice: { color: "#475569", marginTop: 2 },
  qtyRow:    { flexDirection: "row", alignItems: "center", gap: 8 },
  qtyBtn:    { width: 32, height: 32, borderRadius: 8, backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#e2e8f0" },
  qtyBtnText: { fontWeight: "800", fontSize: 18 },
  qtyNum:    { fontWeight: "700", fontSize: 16, minWidth: 20, textAlign: "center" },
  cartFooter: {
    backgroundColor: "#1d4ed8",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
  },
  cartItems: { color: "#bfdbfe", fontSize: 12 },
  cartTotal: { color: "#fff", fontWeight: "800", fontSize: 18 },
  kotBtn:    { backgroundColor: "#fff", borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  kotBtnText: { color: "#1d4ed8", fontWeight: "800" },
});
