/**
 * TableOrderScreen — manage items for a specific table.
 * Shows existing open order + allows adding items, sending KOT, and billing.
 */
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  const [billOpen, setBillOpen]   = useState(false);
  const [billing, setBilling]     = useState(false);
  const [paymentMode, setPaymentMode] = useState("cash");
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTableId, setTransferTableId] = useState(null);
  const [transferBusy, setTransferBusy] = useState(false);
  const [tables, setTables] = useState([]);

  const PAYMENT_MODES = ["cash", "card", "upi"];

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [catRes, itemRes, orderRes, tableRes] = await Promise.all([
        api.get("/category/"),
        api.get("/items/"),
        api.get(`/table-billing/order/by-table/${table.table_id}`),
        api.get("/table-billing/tables"),
      ]);
      const categoryRows = catRes.data?.categories ?? catRes.data ?? [];
      const itemRows = itemRes.data?.items ?? itemRes.data ?? [];

      setCategories(categoryRows);
      setItems(itemRows);
      setOrder(orderRes.data ?? null);
      setTables(tableRes.data?.tables ?? tableRes.data ?? []);
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
    setBillOpen(true);
  };

  const saveBill = async () => {
    if (!order?.order_id) return;
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

      const payload = {
        customer_name: String(order?.customer_name || "Walk-in"),
        mobile: String(order?.mobile || ""),
        payment_mode: paymentMode,
        payment_split: null,
        service_charge: 0,
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
      Alert.alert("Error", err?.response?.data?.detail || "Failed to transfer table");
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
    <SafeAreaView style={styles.safe}>
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

      <Modal visible={billOpen} transparent animationType="fade" onRequestClose={() => setBillOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Confirm Bill - Table {table.table_name}</Text>
            <ScrollView style={{ maxHeight: 260 }}>
              {mergedBillItems.map((row) => (
                <View key={String(row.item_id)} style={styles.modalItemRow}>
                  <Text style={styles.modalItemName}>{row.item_name} x{row.quantity}</Text>
                  <Text style={styles.modalItemAmt}>₹{Number(row.amount || 0).toFixed(2)}</Text>
                </View>
              ))}
            </ScrollView>

            <Text style={styles.modalTotal}>Total: ₹{Number(mergedBillTotal || 0).toFixed(2)}</Text>

            <Text style={styles.modalSubTitle}>Payment Mode</Text>
            <View style={styles.paymentRow}>
              {PAYMENT_MODES.map((mode) => (
                <Pressable
                  key={mode}
                  style={[styles.paymentBtn, paymentMode === mode && styles.paymentBtnActive]}
                  onPress={() => setPaymentMode(mode)}
                >
                  <Text style={[styles.paymentBtnText, paymentMode === mode && styles.paymentBtnTextActive]}>
                    {mode.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setBillOpen(false)} disabled={billing}>
                <Text style={styles.modalCancelText}>Close</Text>
              </Pressable>
              <Pressable style={[styles.modalSave, billing && { opacity: 0.6 }]} onPress={saveBill} disabled={billing}>
                <Text style={styles.modalSaveText}>{billing ? "Saving..." : "Save Bill"}</Text>
              </Pressable>
            </View>
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
  bannerActions: { flexDirection: "row", gap: 8, alignItems: "center" },
  billBtn:     { backgroundColor: "#fff", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  billBtnText: { color: "#1d4ed8", fontWeight: "800" },
  transferBtn: { backgroundColor: "#e0e7ff", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  transferBtnText: { color: "#3730a3", fontWeight: "800" },
  cancelTableBtn: { backgroundColor: "#fee2e2", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  cancelTableBtnText: { color: "#b91c1c", fontWeight: "800" },
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
    borderColor: "#e2e8f0",
    gap: 10,
  },
  modalTitle: { fontSize: 16, fontWeight: "800", color: "#0f172a" },
  modalSubTitle: { fontSize: 13, fontWeight: "700", color: "#334155" },
  modalItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingVertical: 6,
  },
  modalItemName: { color: "#0f172a", flex: 1, paddingRight: 8 },
  modalItemAmt: { color: "#0f172a", fontWeight: "700" },
  modalTotal: { textAlign: "right", fontWeight: "800", fontSize: 16, color: "#047857" },
  transferRow: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
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
  transferRowText: { color: "#0f172a", fontWeight: "700" },
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
  paymentBtnActive: { backgroundColor: "#1d4ed8", borderColor: "#1d4ed8" },
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
});
