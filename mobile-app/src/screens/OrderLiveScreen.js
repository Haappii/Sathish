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
  View,
} from "react-native";

import api from "../api/client";

const FLOW = ["ORDER_PLACED", "ORDER_PREPARING", "FOOD_PREPARED", "MOVED_TO_TABLE", "COMPLETED"];
const FLOW_LABELS = ["Placed", "Preparing", "Ready", "At Table", "Done"];

const STATUS_COLORS = {
  ORDER_PLACED: "#0b57d0",
  ORDER_PREPARING: "#d97706",
  FOOD_PREPARED: "#16a34a",
  MOVED_TO_TABLE: "#7c3aed",
  COMPLETED: "#475569",
};

function fmtTime(v) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function OrderLiveScreen() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingOrder, setUpdatingOrder] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await api.get("/kot/tracking/orders", {
        params: { include_without_kot: false },
      });
      const list = Array.isArray(res?.data) ? res.data : [];
      const visibleRows = list.filter((row) => {
        const orderType = String(row?.order_type || "").trim().toUpperCase();
        const status = String(row?.status || "").trim().toUpperCase();
        const isHandedOverTakeaway = orderType === "TAKEAWAY" && status === "SERVED";
        const isMovedToTable = status === "MOVED_TO_TABLE";
        return !(isHandedOverTakeaway || isMovedToTable);
      });
      setRows(visibleRows);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load order live");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const updateStatus = useCallback(async (orderId, nextStatus) => {
    if (!nextStatus) return;
    setUpdatingOrder(orderId);
    try {
      await api.put(`/kot/tracking/order/${orderId}/status`, { status: nextStatus });
      await load(true);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to update status");
    } finally {
      setUpdatingOrder(null);
    }
  }, [load]);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 30000); // Auto-refresh every 30s
    return () => clearInterval(interval);
  }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator size="large" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      >
        <View style={styles.headerRow}>
          <Text style={styles.header}>Live Orders ({rows.length})</Text>
          {refreshing && <ActivityIndicator size="small" color="#0b57d0" />}
        </View>

        {rows.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>🍽️</Text>
            <Text style={styles.emptyText}>No active live orders.</Text>
          </View>
        ) : null}

        {rows.map((row) => {
          const currentIndex = FLOW.indexOf(String(row.status || "").toUpperCase());
          const statusColor = STATUS_COLORS[String(row.status || "").toUpperCase()] || "#475569";
          const isBusy = updatingOrder === row.order_id;
          
          return (
            <View key={String(row.order_id)} style={styles.card}>
              {/* Order Header */}
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.title}>Order #{row.order_id}</Text>
                  <Text style={styles.sub}>
                    Table: {row.table_name || "-"}  •  {row.order_type || "DINE_IN"}
                  </Text>
                  {row.customer_name && (
                    <Text style={styles.sub}>Customer: {row.customer_name}</Text>
                  )}
                </View>
                <View style={[styles.statusBadge, { backgroundColor: statusColor + "20", borderColor: statusColor }]}>
                  <Text style={[styles.statusText, { color: statusColor }]}>
                    {row.status_label || row.status || "-"}
                  </Text>
                </View>
              </View>

              {/* Order Time */}
              <Text style={styles.timeText}>
                Opened: {fmtTime(row.opened_at)}
                {row.kotCount > 0 && ` • ${row.kot_count} KOT`}
              </Text>

              {/* Items List */}
              {(row.items || []).length > 0 && (
                <View style={styles.itemsBox}>
                  <Text style={styles.itemsTitle}>Items ({row.item_count || row.items?.length || 0})</Text>
                  {(row.items || []).map((it, idx) => (
                    <View key={idx} style={styles.itemRow}>
                      <View style={[styles.kotDot, { backgroundColor: it.kot_sent ? "#16a34a" : "#f59e0b" }]} />
                      <Text style={styles.itemName}>{it.item_name || `Item #${it.item_id}`}</Text>
                      <Text style={styles.itemQty}>× {it.quantity}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* KOT Status */}
              {(row.kots || []).length > 0 && (
                <View style={styles.kotBox}>
                  <Text style={styles.kotTitle}>KOT Status</Text>
                  {(row.kots || []).map((kot) => (
                    <View key={kot.kot_id} style={styles.kotRow}>
                      <Text style={styles.kotNumber}>KOT #{kot.kot_number || kot.kot_id}</Text>
                      <Text style={[styles.kotStatus, { color: statusColor }]}>{kot.status_label || kot.status}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Progress Steps */}
              <View style={styles.stepsContainer}>
                {FLOW.map((step, idx) => (
                  <View key={`${row.order_id}-${step}`} style={styles.stepItem}>
                    <View
                      style={[
                        styles.stepDot,
                        idx <= currentIndex ? styles.stepDone : styles.stepTodo,
                      ]}
                    />
                    <Text style={[styles.stepLabel, idx <= currentIndex && styles.stepLabelDone]}>
                      {FLOW_LABELS[idx]}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Update Status Button */}
              {row.next_status && (
                <Pressable
                  style={[styles.updateBtn, isBusy && styles.updateBtnDisabled]}
                  disabled={isBusy}
                  onPress={() => updateStatus(row.order_id, row.next_status)}
                >
                  <Text style={styles.updateBtnText}>
                    {isBusy ? "Updating..." : `Mark as: ${row.next_status?.replace(/_/g, " ")}`}
                  </Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f3f6ff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 12, gap: 10, paddingBottom: 20 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  header: { fontSize: 16, fontWeight: "800", color: "#0b1220" },
  emptyBox: { alignItems: "center", paddingVertical: 40, gap: 8 },
  emptyIcon: { fontSize: 40 },
  emptyText: { color: "#64748b", fontSize: 14 },
  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d9e3ff",
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  title: { fontWeight: "800", color: "#0b1220", fontSize: 13 },
  sub: { color: "#334155", fontSize: 11, marginTop: 2 },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusText: { fontSize: 10, fontWeight: "700" },
  timeText: { color: "#94a3b8", fontSize: 11 },
  itemsBox: {
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 8,
    gap: 4,
  },
  itemsTitle: { fontSize: 11, fontWeight: "700", color: "#334155", marginBottom: 2 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  kotDot: { width: 6, height: 6, borderRadius: 3 },
  itemName: { flex: 1, fontSize: 12, color: "#1e293b" },
  itemQty: { fontSize: 12, fontWeight: "700", color: "#334155" },
  kotBox: { gap: 4 },
  kotTitle: { fontSize: 11, fontWeight: "700", color: "#334155" },
  kotRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  kotNumber: { fontSize: 11, color: "#475569" },
  kotStatus: { fontSize: 11, fontWeight: "700" },
  stepsContainer: { flexDirection: "row", justifyContent: "space-between" },
  stepItem: { alignItems: "center", gap: 4, flex: 1 },
  stepDot: { width: 14, height: 14, borderRadius: 7 },
  stepDone: { backgroundColor: "#0b57d0" },
  stepTodo: { backgroundColor: "#cbd5e1" },
  stepLabel: { fontSize: 8, color: "#94a3b8", textAlign: "center" },
  stepLabelDone: { color: "#0b57d0", fontWeight: "600" },
  updateBtn: {
    backgroundColor: "#0b57d0",
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
  },
  updateBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  updateBtnDisabled: { opacity: 0.5 },
});
