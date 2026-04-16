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

const SUMMARY_STATUSES = [
  { key: "ORDER_PLACED",    label: "Order Placed",    color: "#0b57d0", bg: "#eff6ff", border: "#bfdbfe" },
  { key: "ORDER_PREPARING", label: "Order Preparing", color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
  { key: "FOOD_PREPARED",   label: "Food Prepared",   color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
  { key: "MOVED_TO_TABLE",  label: "Moved To Table",  color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe" },
];

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
            {refreshing && <ActivityIndicator size="small" color="#0b57d0" style={{ marginLeft: 4 }} />}
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
  // ── Tab toggle ──
  tabRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  tabBtn: {
    borderWidth: 1, borderColor: "#d9e3ff", borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4, backgroundColor: "#fff",
  },
  tabBtnActive: { backgroundColor: "#0b1220", borderColor: "#0b1220" },
  tabBtnText: { fontSize: 11, fontWeight: "700", color: "#475569" },
  tabBtnTextActive: { color: "#fff" },
  // ── Summary ──
  summaryCard: {
    backgroundColor: "#fff", borderWidth: 1, borderRadius: 14,
    overflow: "hidden", marginBottom: 4,
  },
  summaryHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1,
  },
  summaryHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  summaryDot: { width: 8, height: 8, borderRadius: 4 },
  summaryLabel: { fontSize: 12, fontWeight: "800" },
  summaryCount: { fontSize: 20, fontWeight: "900" },
  summaryTotalsRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: "#f8fafc", borderBottomWidth: 1, borderBottomColor: "#f1f5f9",
  },
  summaryTotalsText: { fontSize: 11, color: "#64748b", fontWeight: "600" },
  summaryTotalsBold: { fontSize: 11, color: "#0b1220", fontWeight: "800" },
  summaryBreakdown: {
    paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6,
    borderBottomWidth: 1, borderBottomColor: "#f1f5f9",
  },
  summaryBreakdownTitle: {
    fontSize: 9, fontWeight: "800", color: "#94a3b8",
    letterSpacing: 0.8, marginBottom: 6,
  },
  summaryBreakdownRow: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", paddingVertical: 2,
  },
  summaryBreakdownName: { fontSize: 12, color: "#1e293b", flex: 1, paddingRight: 8 },
  summaryBreakdownCount: { fontSize: 12, fontWeight: "800" },
  summaryEmpty: {
    padding: 12, textAlign: "center", fontSize: 11, color: "#94a3b8",
  },
  summaryOrderRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 12, paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: "#f8fafc",
  },
  summaryOrderTitle: { fontSize: 12, fontWeight: "700", color: "#0b1220", flex: 1 },
  summaryOrderBadge: {
    backgroundColor: "#f1f5f9", borderRadius: 999,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  summaryOrderBadgeText: { fontSize: 10, fontWeight: "700", color: "#475569" },
});
