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
  ACCEPTED: "#1d4ed8",
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
        <View style={styles.center}><ActivityIndicator size="large" color="#1d4ed8" /></View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o, i) => String(o.id || o.order_id || i)}
          renderItem={renderOrder}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={["#1d4ed8"]} />
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
  safe: { flex: 1, backgroundColor: "#f1f5f9" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  filterBar: { flexDirection: "row", padding: 12, paddingBottom: 4, gap: 8 },
  statusBar: { paddingHorizontal: 12, paddingBottom: 8, flexGrow: 0 },
  chip: {
    borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 6, marginRight: 6, backgroundColor: "#fff",
  },
  chipActive: { backgroundColor: "#1d4ed8", borderColor: "#1d4ed8" },
  chipText: { fontSize: 11, fontWeight: "600", color: "#334155" },
  chipTextActive: { color: "#fff" },
  list: { padding: 12, paddingTop: 0, gap: 8, paddingBottom: 24 },
  card: {
    backgroundColor: "#fff", borderRadius: 14, borderWidth: 1,
    borderColor: "#e2e8f0", padding: 12, gap: 8,
  },
  cardTop: { flexDirection: "row", gap: 8 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  orderId: { fontWeight: "800", color: "#0f172a", fontSize: 13 },
  providerBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  providerText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  orderMeta: { color: "#64748b", fontSize: 12, marginTop: 1 },
  itemsList: { color: "#475569", fontSize: 11, marginTop: 2 },
  rightCol: { alignItems: "flex-end", gap: 4 },
  orderAmt: { fontSize: 15, fontWeight: "800", color: "#059669" },
  statusBadge: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 10, fontWeight: "700" },
  nextBtn: {
    backgroundColor: "#1d4ed8", borderRadius: 10, paddingVertical: 10,
    alignItems: "center", justifyContent: "center",
  },
  nextBtnText: { color: "#fff", fontWeight: "700" },
  btnDisabled: { opacity: 0.5 },
  emptyWrap: { alignItems: "center", paddingTop: 60, gap: 8 },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { color: "#64748b", fontSize: 16, fontWeight: "700" },
  emptyMsg: { color: "#94a3b8", fontSize: 13 },
});
