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

const STATUS_COLORS = {
  PENDING: "#f59e0b",
  PREPARING: "#2563eb",
  READY: "#16a34a",
  SERVED: "#7c3aed",
  COMPLETED: "#475569",
};

const NEXT_STATUS = {
  PENDING: "PREPARING",
  PREPARING: "READY",
  READY: "SERVED",
  SERVED: "COMPLETED",
};

export default function KotManagementScreen() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updating, setUpdating] = useState({});

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await api.get("/kot/pending");
      setRows(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load KOT list");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 30000); // Auto-refresh every 30s
    return () => clearInterval(interval);
  }, [load]);

  const updateStatus = async (row) => {
    const kotId = row?.kot_id;
    const currentStatus = String(row?.status || "").toUpperCase();
    const next = NEXT_STATUS[currentStatus];
    if (!kotId || !next) return;

    setUpdating((prev) => ({ ...prev, [kotId]: true }));
    try {
      await api.put(`/kot/${kotId}/status`, { status: next });
      await load(true);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to update KOT status");
    } finally {
      setUpdating((prev) => ({ ...prev, [kotId]: false }));
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
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      >
        <Text style={styles.header}>KOT Queue ({rows.length})</Text>

        {rows.length === 0 ? <Text style={styles.empty}>No pending KOT orders.</Text> : null}

        {rows.map((row) => {
          const status = String(row.status || "PENDING").toUpperCase();
          const next = NEXT_STATUS[status];
          return (
            <View key={String(row.kot_id)} style={styles.card}>
              <View style={styles.headRow}>
                <Text style={styles.title}>{row.kot_number || `KOT ${row.kot_id}`}</Text>
                <Text style={[styles.badge, { color: STATUS_COLORS[status] || "#475569" }]}>{status}</Text>
              </View>
        <View style={styles.section}>
          {/* Table/Order Info */}
          <View style={styles.infoRow}>
            <Text style={styles.sub}>
              {row.table_name ? `Table: ${row.table_name}` : (row.table_id ? `Table ID: ${row.table_id}` : "No Table")}
            </Text>
            {row.order_type && (
              <Text style={styles.orderTypeBadge}>{row.order_type}</Text>
            )}
          </View>
          {row.customer_name && (
            <Text style={styles.sub}>Customer: {row.customer_name}</Text>
          )}
          {row.token_number && (
            <Text style={styles.sub}>Token: #{row.token_number}</Text>
          )}

              <View style={styles.itemsWrap}>
                {(row.items || []).map((it, idx) => (
                  <View key={`${row.kot_id}-${idx}`} style={styles.itemRow}>
                    <Text style={styles.itemName}>{it.item_name}</Text>
                    {it.notes ? <Text style={styles.itemNotes}>{it.notes}</Text> : null}
                    <Text style={styles.itemQty}>x{it.quantity}</Text>
                  </View>
                ))}
              </View>
        </View>

              <Pressable
                style={[styles.btn, !next && styles.btnDisabled]}
                disabled={!next || Boolean(updating[row.kot_id])}
                onPress={() => updateStatus(row)}
              >
                <Text style={styles.btnText}>
                  {updating[row.kot_id]
                    ? "Updating..."
                    : next
                      ? `Move to ${next}`
                      : "Completed"}
                </Text>
              </Pressable>
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
  header: { fontSize: 16, fontWeight: "800", color: "#0b1220" },
  empty: { color: "#64748b" },
  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d9e3ff",
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  headRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontWeight: "800", color: "#0b1220" },
  badge: { fontWeight: "700", fontSize: 12 },
  sub: { color: "#334155", fontSize: 12 },
  itemsWrap: { gap: 5 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  section: { gap: 4 },
  orderTypeBadge: {
    backgroundColor: "#e8f0ff",
    color: "#0b57d0",
    fontSize: 10,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  itemNotes: { color: "#7c8ba1", fontSize: 10, fontStyle: "italic", flex: 1 },
  itemRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  itemName: { color: "#0b1220", flex: 1, paddingRight: 8 },
  itemQty: { color: "#334155", fontWeight: "700" },
  btn: {
    marginTop: 4,
    borderRadius: 10,
    backgroundColor: "#0b57d0",
    paddingVertical: 10,
    alignItems: "center",
  },
  btnDisabled: { backgroundColor: "#94a3b8" },
  btnText: { color: "#fff", fontWeight: "700" },
});
