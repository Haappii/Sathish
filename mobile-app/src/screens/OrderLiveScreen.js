import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import api from "../api/client";

const FLOW = ["ORDER_PLACED", "ORDER_PREPARING", "FOOD_PREPARED", "MOVED_TO_TABLE", "COMPLETED"];

export default function OrderLiveScreen() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await api.get("/kot/tracking/orders", {
        params: { include_without_kot: false },
      });
      setRows(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load order live");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
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
        <Text style={styles.header}>Live Orders ({rows.length})</Text>

        {rows.length === 0 ? <Text style={styles.empty}>No active live orders.</Text> : null}

        {rows.map((row) => {
          const currentIndex = FLOW.indexOf(String(row.status || "").toUpperCase());
          return (
            <View key={String(row.order_id)} style={styles.card}>
              <Text style={styles.title}>Order #{row.order_id}</Text>
              <Text style={styles.sub}>Table: {row.table_name || "-"}</Text>
              <Text style={styles.sub}>Type: {row.order_type || "DINE_IN"}</Text>
              <Text style={styles.sub}>Status: {row.status_label || row.status || "-"}</Text>

              <View style={styles.stepsRow}>
                {FLOW.map((step, idx) => (
                  <View
                    key={`${row.order_id}-${step}`}
                    style={[
                      styles.stepDot,
                      idx <= currentIndex ? styles.stepDone : styles.stepTodo,
                    ]}
                  />
                ))}
              </View>

            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f1f5f9" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 12, gap: 10, paddingBottom: 20 },
  header: { fontSize: 16, fontWeight: "800", color: "#0f172a" },
  empty: { color: "#64748b" },
  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  title: { fontWeight: "800", color: "#0f172a" },
  sub: { color: "#334155", fontSize: 12 },
  stepsRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  stepDot: { width: 14, height: 14, borderRadius: 7 },
  stepDone: { backgroundColor: "#1d4ed8" },
  stepTodo: { backgroundColor: "#cbd5e1" },
});
