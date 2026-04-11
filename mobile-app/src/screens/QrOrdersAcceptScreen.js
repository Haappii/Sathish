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

function dt(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

export default function QrOrdersAcceptScreen({ navigation }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState({});

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await api.get("/qr-orders/pending");
      setRows(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load QR orders");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const action = async (row, type) => {
    const id = row?.qr_order_id;
    if (!id) return;

    setBusy((prev) => ({ ...prev, [id]: type }));
    try {
      if (type === "accept") {
        const res = await api.post(`/qr-orders/${id}/accept`);
        const orderId = res?.data?.order_id;
        if (orderId) {
          navigation.navigate("TableOrder", {
            table: {
              table_id: row.table_id,
              table_name: row.table_name,
            },
          });
        }
      } else {
        await api.post(`/qr-orders/${id}/reject`);
      }
      await load(true);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || `Failed to ${type} QR order`);
    } finally {
      setBusy((prev) => ({ ...prev, [id]: "" }));
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
        <Text style={styles.header}>Pending QR Orders ({rows.length})</Text>

        {rows.length === 0 ? <Text style={styles.empty}>No pending QR orders.</Text> : null}

        {rows.map((row) => (
          <View key={String(row.qr_order_id)} style={styles.card}>
            <Text style={styles.title}>#{row.qr_order_id} • Table {row.table_name || row.table_id}</Text>
            <Text style={styles.meta}>{row.customer_name || "Walk-in"} • {row.mobile || "-"}</Text>
            <Text style={styles.meta}>Created: {dt(row.created_at)}</Text>

            <View style={styles.itemBox}>
              {(row.items || []).map((it, idx) => (
                <View key={`${row.qr_order_id}-${idx}`} style={styles.itemRow}>
                  <Text style={styles.itemName}>{it.item_name || `Item ${it.item_id}`}</Text>
                  <Text style={styles.itemQty}>x{it.quantity}</Text>
                </View>
              ))}
            </View>

            <View style={styles.btnRow}>
              <Pressable
                style={[styles.btn, styles.rejectBtn]}
                onPress={() => action(row, "reject")}
                disabled={Boolean(busy[row.qr_order_id])}
              >
                <Text style={styles.btnText}>{busy[row.qr_order_id] === "reject" ? "Rejecting..." : "Reject"}</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, styles.acceptBtn]}
                onPress={() => action(row, "accept")}
                disabled={Boolean(busy[row.qr_order_id])}
              >
                <Text style={styles.btnText}>{busy[row.qr_order_id] === "accept" ? "Accepting..." : "Accept"}</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f1f5f9" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 12, gap: 10, paddingBottom: 20 },
  header: { fontWeight: "800", fontSize: 16, color: "#0f172a" },
  empty: { color: "#64748b" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 12,
    gap: 6,
  },
  title: { fontWeight: "800", color: "#0f172a" },
  meta: { color: "#475569", fontSize: 12 },
  itemBox: { marginTop: 6, gap: 4 },
  itemRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  itemName: { color: "#1e293b", flex: 1, paddingRight: 8 },
  itemQty: { color: "#334155", fontWeight: "700" },
  btnRow: { marginTop: 8, flexDirection: "row", gap: 8 },
  btn: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10 },
  rejectBtn: { backgroundColor: "#b91c1c" },
  acceptBtn: { backgroundColor: "#1d4ed8" },
  btnText: { color: "#fff", fontWeight: "700" },
});
