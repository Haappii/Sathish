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
import { useTheme } from "../context/ThemeContext";


const FLOW = ["ORDER_PLACED", "ORDER_PREPARING", "FOOD_PREPARED", "MOVED_TO_TABLE", "COMPLETED"];
const FLOW_LABELS = ["Placed", "Preparing", "Ready", "At Table", "Done"];

const STATUS_COLORS = {
  ORDER_PLACED: "#2563eb",
  ORDER_PREPARING: "#d97706",
  FOOD_PREPARED: "#059669",
  MOVED_TO_TABLE: "#7c3aed",
  COMPLETED: "#4a5a78",
};

const SUMMARY_STATUSES = [
  { key: "ORDER_PLACED",    label: "Order Placed",    color: "#6366f1", bg: "#eff4ff", border: "#bfdbfe" },
  { key: "ORDER_PREPARING", label: "Order Preparing", color: "#f59e0b", bg: "#fffbeb", border: "#fcd34d" },
  { key: "FOOD_PREPARED",   label: "Food Prepared",   color: "#10b981", bg: "#ecfdf5", border: "#6ee7b7" },
  { key: "MOVED_TO_TABLE",  label: "Moved To Table",  color: "#7c3aed", bg: "#f5f3ff", border: "#c4b5fd" },
];

function fmtTime(v) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function OrderLiveScreen() {
  const { theme } = useTheme();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingOrder, setUpdatingOrder] = useState(null);
  const [activeTab, setActiveTab] = useState("live");

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
        {/* Header + tab toggle */}
        <View style={styles.headerRow}>
          <Text style={styles.header}>Live Orders ({rows.length})</Text>
          <View style={styles.tabRow}>
            {["live", "summary"].map((tab) => (
              <Pressable
                key={tab}
                style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabBtnText, activeTab === tab && styles.tabBtnTextActive]}>
                  {tab === "live" ? "Live" : "Summary"}
                </Text>
              </Pressable>
            ))}
            {refreshing && <ActivityIndicator size="small" color="#2563eb" style={{ marginLeft: 4 }} />}
          </View>
        </View>

        {/* ── Summary Tab ── */}
        {activeTab === "summary" ? (
          rows.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>🍽️</Text>
              <Text style={styles.emptyText}>No active live orders.</Text>
            </View>
          ) : (
            SUMMARY_STATUSES.map(({ key, label, color, bg, border }) => {
              const group = rows.filter((r) => String(r.status || "").toUpperCase() === key);
              const totalItems = group.reduce((acc, r) => acc + (r.items || []).length, 0);
              const itemCountMap = {};
              group.forEach((r) => {
                (r.items || []).forEach((item) => {
                  const name = item.item_name || "Item";
                  itemCountMap[name] = (itemCountMap[name] || 0) + 1;
                });
              });
              const itemCountList = Object.entries(itemCountMap).sort((a, b) => b[1] - a[1]);
              return (
                <View key={key} style={[styles.summaryCard, { borderColor: border }]}>
                  {/* Status header */}
                  <View style={[styles.summaryHeader, { backgroundColor: bg, borderBottomColor: border }]}>
                    <View style={styles.summaryHeaderLeft}>
                      <View style={[styles.summaryDot, { backgroundColor: color }]} />
                      <Text style={[styles.summaryLabel, { color }]}>{label}</Text>
                    </View>
                    <Text style={[styles.summaryCount, { color }]}>{group.length}</Text>
                  </View>

                  {/* Total items */}
                  <View style={styles.summaryTotalsRow}>
                    <Text style={styles.summaryTotalsText}>Total items: </Text>
                    <Text style={styles.summaryTotalsBold}>{totalItems}</Text>
                  </View>

                  {/* Item breakdown */}
                  {itemCountList.length > 0 && (
                    <View style={styles.summaryBreakdown}>
                      <Text style={styles.summaryBreakdownTitle}>ITEM BREAKDOWN</Text>
                      {itemCountList.map(([name, count]) => (
                        <View key={name} style={styles.summaryBreakdownRow}>
                          <Text style={styles.summaryBreakdownName} numberOfLines={1}>{name}</Text>
                          <Text style={[styles.summaryBreakdownCount, { color }]}>×{count}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Per-order list */}
                  {group.length === 0 ? (
                    <Text style={styles.summaryEmpty}>No orders</Text>
                  ) : (
                    group.map((row) => {
                      const itemCount = (row.items || []).length;
                      const title = row.order_type?.toUpperCase() === "TAKEAWAY"
                        ? (row.token_number ? `Take Away ${row.token_number}` : "Take Away")
                        : (row.table_name ? `Table ${row.table_name}` : `Order #${row.order_id}`);
                      return (
                        <View key={String(row.order_id)} style={styles.summaryOrderRow}>
                          <Text style={styles.summaryOrderTitle} numberOfLines={1}>{title}</Text>
                          <View style={styles.summaryOrderBadge}>
                            <Text style={styles.summaryOrderBadgeText}>{itemCount} item{itemCount !== 1 ? "s" : ""}</Text>
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              );
            })
          )
        ) : (
          /* ── Live Board Tab ── */
          <>
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
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f6fb" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 14, gap: 12, paddingBottom: 24 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  header: { fontSize: 17, fontWeight: "900", color: "#0a0f1e", letterSpacing: -0.2 },
  emptyBox: { alignItems: "center", paddingVertical: 50, gap: 10 },
  emptyIcon: { fontSize: 44 },
  emptyText: { color: "#9ca3af", fontSize: 15, fontWeight: "600" },
  card: {
    backgroundColor: "#ffffff",
    borderWidth: 1.5,
    borderColor: "#e4e9f2",
    borderRadius: 18,
    padding: 14,
    gap: 10,
    shadowColor: "#0a0f1e",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  title: { fontWeight: "900", color: "#0a0f1e", fontSize: 14, letterSpacing: -0.1 },
  sub: { color: "#4b5563", fontSize: 12, marginTop: 3 },
  statusBadge: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  timeText: { color: "#9ca3af", fontSize: 11, fontWeight: "600" },
  itemsBox: {
    backgroundColor: "#f8f9fd",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#e4e9f2",
    padding: 10,
    gap: 5,
  },
  itemsTitle: { fontSize: 11, fontWeight: "800", color: "#4b5563", marginBottom: 3, letterSpacing: 0.5, textTransform: "uppercase" },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  kotDot: { width: 7, height: 7, borderRadius: 4 },
  itemName: { flex: 1, fontSize: 13, color: "#0a0f1e", fontWeight: "600" },
  itemQty: { fontSize: 12, fontWeight: "800", color: "#4b5563" },
  kotBox: { gap: 5 },
  kotTitle: { fontSize: 11, fontWeight: "800", color: "#4b5563", letterSpacing: 0.5, textTransform: "uppercase" },
  kotRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  kotNumber: { fontSize: 12, color: "#4b5563", fontWeight: "600" },
  kotStatus: { fontSize: 11, fontWeight: "800" },
  stepsContainer: { flexDirection: "row", justifyContent: "space-between" },
  stepItem: { alignItems: "center", gap: 4, flex: 1 },
  stepDot: { width: 16, height: 16, borderRadius: 8 },
  stepDone: { backgroundColor: "#6366f1" },
  stepTodo: { backgroundColor: "#e4e9f2" },
  stepLabel: { fontSize: 8, color: "#9ca3af", textAlign: "center", fontWeight: "600" },
  stepLabelDone: { color: "#6366f1", fontWeight: "700" },
  updateBtn: {
    backgroundColor: "#6366f1",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    shadowColor: "#6366f1",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  updateBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  updateBtnDisabled: { opacity: 0.5 },
  // ── Tab toggle ──
  tabRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  tabBtn: {
    borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#f8f9fd",
  },
  tabBtnActive: { backgroundColor: "#0a0f1e", borderColor: "#0a0f1e" },
  tabBtnText: { fontSize: 11, fontWeight: "700", color: "#4b5563" },
  tabBtnTextActive: { color: "#fff" },
  // ── Summary ──
  summaryCard: {
    backgroundColor: "#ffffff", borderWidth: 1.5, borderRadius: 18,
    overflow: "hidden", marginBottom: 4,
    shadowColor: "#0a0f1e", shadowOpacity: 0.07, shadowRadius: 12, elevation: 4,
  },
  summaryHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1.5,
  },
  summaryHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  summaryDot: { width: 10, height: 10, borderRadius: 5 },
  summaryLabel: { fontSize: 13, fontWeight: "800" },
  summaryCount: { fontSize: 24, fontWeight: "900" },
  summaryTotalsRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: "#f8f9fd", borderBottomWidth: 1, borderBottomColor: "#eef2ff",
  },
  summaryTotalsText: { fontSize: 12, color: "#9ca3af", fontWeight: "600" },
  summaryTotalsBold: { fontSize: 12, color: "#0a0f1e", fontWeight: "800" },
  summaryBreakdown: {
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: "#f4f6fb",
  },
  summaryBreakdownTitle: {
    fontSize: 9, fontWeight: "800", color: "#9ca3af",
    letterSpacing: 1, marginBottom: 7, textTransform: "uppercase",
  },
  summaryBreakdownRow: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", paddingVertical: 3,
  },
  summaryBreakdownName: { fontSize: 13, color: "#0a0f1e", flex: 1, paddingRight: 8, fontWeight: "600" },
  summaryBreakdownCount: { fontSize: 13, fontWeight: "800" },
  summaryEmpty: {
    padding: 14, textAlign: "center", fontSize: 12, color: "#9ca3af",
  },
  summaryOrderRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: "#f8f9fd",
  },
  summaryOrderTitle: { fontSize: 13, fontWeight: "700", color: "#0a0f1e", flex: 1 },
  summaryOrderBadge: {
    backgroundColor: "#eef2ff", borderRadius: 999,
    paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1, borderColor: "#e4e9f2",
  },
  summaryOrderBadgeText: { fontSize: 10, fontWeight: "700", color: "#4b5563" },
});
