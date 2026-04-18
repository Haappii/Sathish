import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import api from "../api/client";

const PROVIDERS = ["ALL", "SWIGGY", "ZOMATO"];
const STATUSES = ["ALL", "NEW", "ACCEPTED", "PREPARING", "READY", "DISPATCHED", "DELIVERED", "CANCELLED"];
const NEXT_STATUS = {
  NEW: "ACCEPTED",
  ACCEPTED: "PREPARING",
  PREPARING: "READY",
  READY: "DISPATCHED",
  DISPATCHED: "DELIVERED",
};

const STATUS_COLOR = {
  NEW: "#d97706",
  ACCEPTED: "#2563eb",
  PREPARING: "#7c3aed",
  READY: "#0891b2",
  DISPATCHED: "#9333ea",
  DELIVERED: "#059669",
  CANCELLED: "#64748b",
  REJECTED: "#dc2626",
};

const fmt = (n) => `₹${Number(n || 0).toFixed(2)}`;
const fmtDateTime = (v) => {
  if (!v) return "-";
  try {
    return new Date(v).toLocaleString("en-IN", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch { return "-"; }
};

export default function OnlineOrdersScreen() {
  const [provider, setProvider] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const params = {};
      if (provider !== "ALL") params.provider = provider;
      if (statusFilter !== "ALL") params.status = statusFilter;
      if (search) params.q = search;
      const res = await api.get("/online-orders/", { params });
      const data = res?.data;
      setOrders(Array.isArray(data) ? data : (data?.orders || data?.rows || []));
    } catch (err) {
      if (!silent) Alert.alert("Error", err?.response?.data?.detail || "Failed to load online orders");
      setOrders([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [provider, statusFilter, search]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = (order, newStatus) => {
    Alert.alert(
      "Update Status",
      `Change order ${order.order_id || order.external_order_id} to ${newStatus}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Update",
          onPress: async () => {
            setBusyId(order.id || order.order_id);
            try {
              await api.patch(`/online-orders/${order.id || order.order_id}/status`, {
                status: newStatus,
              });
              await load(true);
            } catch (err) {
              Alert.alert("Error", err?.response?.data?.detail || "Status update failed");
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  };

  const renderOrder = ({ item: order }) => {
    const status = order.status || "NEW";
    const nextStatus = NEXT_STATUS[status];
    const isBusy = busyId === (order.id || order.order_id);
    const color = STATUS_COLOR[status] || "#64748b";

    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <View style={styles.headerRow}>
              <Text style={styles.orderId}>
                {order.external_order_id || order.order_id || "Order"}
              </Text>
              {order.provider && (
                <View style={[styles.providerBadge, { backgroundColor: order.provider === "SWIGGY" ? "#ff6900" : "#e23744" }]}>
                  <Text style={styles.providerText}>{order.provider}</Text>
                </View>
              )}
            </View>
            <Text style={styles.orderMeta}>{order.customer_name || "Customer"}</Text>
            <Text style={styles.orderMeta}>{fmtDateTime(order.created_at)}</Text>
            {Array.isArray(order.items) && (
              <Text style={styles.itemsList} numberOfLines={2}>
                {order.items.map((i) => `${i.name || i.item_name} ×${i.quantity || 1}`).join(", ")}
              </Text>
            )}
          </View>
          <View style={styles.rightCol}>
            <Text style={styles.orderAmt}>{fmt(order.total_amount || order.amount)}</Text>
            <View style={[styles.statusBadge, { backgroundColor: color + "20", borderColor: color }]}>
              <Text style={[styles.statusText, { color }]}>{status}</Text>
            </View>
          </View>
        </View>
        {nextStatus && (
          <Pressable
            style={[styles.nextBtn, isBusy && styles.btnDisabled]}
            disabled={isBusy}
            onPress={() => updateStatus(order, nextStatus)}
          >
            {isBusy
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.nextBtnText}>Mark {nextStatus}</Text>}
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Provider filter */}
      <View style={styles.filterBar}>
        {PROVIDERS.map((p) => (
          <Pressable
            key={p}
            style={[styles.chip, provider === p && styles.chipActive]}
            onPress={() => setProvider(p)}
          >
            <Text style={[styles.chipText, provider === p && styles.chipTextActive]}>{p}</Text>
          </Pressable>
        ))}
      </View>

      {/* Status filter */}
      <FlatList
        horizontal
        data={STATUSES}
        keyExtractor={(s) => s}
        showsHorizontalScrollIndicator={false}
        style={styles.statusBar}
        renderItem={({ item: s }) => (
          <Pressable
            style={[styles.chip, statusFilter === s && styles.chipActive]}
            onPress={() => setStatusFilter(s)}
          >
            <Text style={[styles.chipText, statusFilter === s && styles.chipTextActive]}>{s}</Text>
          </Pressable>
        )}
      />

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o, i) => String(o.id || o.order_id || i)}
          renderItem={renderOrder}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={["#2563eb"]} />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyIcon}>🛵</Text>
              <Text style={styles.emptyTitle}>No online orders</Text>
              <Text style={styles.emptyMsg}>Pull down to refresh</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f0f4ff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  filterBar: { flexDirection: "row", padding: 14, paddingBottom: 6, gap: 8 },
  statusBar: { paddingHorizontal: 14, paddingBottom: 10, flexGrow: 0 },
  chip: {
    borderWidth: 1.5, borderColor: "#d0dcf0", borderRadius: 999,
    paddingHorizontal: 13, paddingVertical: 7, marginRight: 6, backgroundColor: "#f6f8fe",
  },
  chipActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  chipText: { fontSize: 11, fontWeight: "700", color: "#4a5a78" },
  chipTextActive: { color: "#fff" },
  list: { padding: 14, paddingTop: 4, gap: 10, paddingBottom: 24 },
  card: {
    backgroundColor: "#fff", borderRadius: 18, borderWidth: 1.5,
    borderColor: "#dde6f7", padding: 14, gap: 10,
    shadowColor: "#1a2463", shadowOpacity: 0.07, shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  cardTop: { flexDirection: "row", gap: 10 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  orderId: { fontWeight: "900", color: "#0c1228", fontSize: 14 },
  providerBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  providerText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  orderMeta: { color: "#4a5a78", fontSize: 12, marginTop: 2, fontWeight: "600" },
  itemsList: { color: "#8896ae", fontSize: 11, marginTop: 3, lineHeight: 16 },
  rightCol: { alignItems: "flex-end", gap: 6 },
  orderAmt: { fontSize: 15, fontWeight: "900", color: "#059669" },
  statusBadge: { borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 10, fontWeight: "800" },
  nextBtn: {
    backgroundColor: "#2563eb", borderRadius: 13, paddingVertical: 12,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#2563eb", shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  nextBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  btnDisabled: { opacity: 0.5 },
  emptyWrap: { alignItems: "center", paddingTop: 64, gap: 10 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { color: "#8896ae", fontSize: 16, fontWeight: "800" },
  emptyMsg: { color: "#8896ae", fontSize: 13 },
});
