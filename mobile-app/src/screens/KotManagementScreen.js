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


const STATUS_COLORS = {
  PENDING: "#d97706",
  PREPARING: "#2563eb",
  READY: "#059669",
  SERVED: "#7c3aed",
  COMPLETED: "#4a5a78",
};

const NEXT_STATUS = {
  PENDING: "PREPARING",
  PREPARING: "READY",
  READY: "SERVED",
  SERVED: "COMPLETED",
};

export default function KotManagementScreen() {
  const { theme } = useTheme();
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
    const interval = setInterval(() => load(true), 5000); // Auto-refresh every 5s (matches web)
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
  safe: { flex: 1, backgroundColor: "#f4f6fb" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 14, gap: 12, paddingBottom: 24 },
  header: { fontSize: 17, fontWeight: "900", color: "#0a0f1e", letterSpacing: -0.2 },
  empty: { color: "#9ca3af", fontSize: 14, fontWeight: "600" },
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
  headRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontWeight: "900", color: "#0a0f1e", fontSize: 15 },
  badge: { fontWeight: "800", fontSize: 12, letterSpacing: 0.5 },
  sub: { color: "#4b5563", fontSize: 13 },
  itemsWrap: {
    gap: 6,
    backgroundColor: "#f8f9fd",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#e4e9f2",
    padding: 10,
  },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  section: { gap: 5 },
  orderTypeBadge: {
    backgroundColor: "#eef2ff",
    color: "#6366f1",
    fontSize: 10,
    fontWeight: "800",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    overflow: "hidden",
  },
  itemNotes: { color: "#9ca3af", fontSize: 11, fontStyle: "italic", flex: 1 },
  itemRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  itemName: { color: "#0a0f1e", flex: 1, paddingRight: 8, fontSize: 13, fontWeight: "600" },
  itemQty: { color: "#4b5563", fontWeight: "800", fontSize: 13 },
  btn: {
    marginTop: 4,
    borderRadius: 13,
    backgroundColor: "#6366f1",
    paddingVertical: 13,
    alignItems: "center",
    shadowColor: "#6366f1",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  btnDisabled: { backgroundColor: "#9ca3af", shadowColor: "transparent", elevation: 0 },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
