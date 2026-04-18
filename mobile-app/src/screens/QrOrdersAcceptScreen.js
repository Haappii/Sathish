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
  safe: { flex: 1, backgroundColor: "#f0f4ff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 14, gap: 12, paddingBottom: 24 },
  header: { fontWeight: "900", fontSize: 17, color: "#0c1228", letterSpacing: -0.2 },
  empty: { color: "#8896ae", fontSize: 14, fontWeight: "600" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "#dde6f7",
    padding: 16,
    gap: 8,
    shadowColor: "#1a2463",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  title: { fontWeight: "900", color: "#0c1228", fontSize: 15 },
  meta: { color: "#4a5a78", fontSize: 13 },
  itemBox: {
    marginTop: 6,
    gap: 5,
    backgroundColor: "#f6f8fe",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#dde6f7",
    padding: 10,
  },
  itemRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  itemName: { color: "#0c1228", flex: 1, paddingRight: 8, fontSize: 13, fontWeight: "600" },
  itemQty: { color: "#4a5a78", fontWeight: "800", fontSize: 13 },
  btnRow: { marginTop: 10, flexDirection: "row", gap: 10 },
  btn: { flex: 1, alignItems: "center", paddingVertical: 13, borderRadius: 13 },
  rejectBtn: {
    backgroundColor: "#dc2626",
    shadowColor: "#dc2626",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  acceptBtn: {
    backgroundColor: "#2563eb",
    shadowColor: "#2563eb",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
