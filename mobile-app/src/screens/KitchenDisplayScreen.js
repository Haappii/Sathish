import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import api from "../api/client";

const STATUS_FLOW = { PENDING: "PREPARING", PREPARING: "READY", READY: "SERVED", SERVED: "COMPLETED" };
const STATUS_LABEL = { PENDING: "Start Preparing", PREPARING: "Mark Ready", READY: "Mark Served", SERVED: "Complete" };
const STATUS_COLOR = { PENDING: "#f59e0b", PREPARING: "#0ea5e9", READY: "#059669", SERVED: "#6366f1", COMPLETED: "#9ca3af" };
const STATUS_ORDER = ["PENDING", "PREPARING", "READY", "SERVED", "COMPLETED"];

export default function KitchenDisplayScreen({ navigation }) {
  const [kots, setKots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const intervalRef = useRef(null);

  const load = useCallback(async (isRefresh) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await api.get("/kot/tracking/orders");
      const orders = Array.isArray(res.data) ? res.data : [];
      const flat = [];
      orders.forEach((order) => {
        (order.kots || order.kot_list || []).forEach((kot) => {
          if (String(kot.status || "").toUpperCase() === "COMPLETED") return;
          flat.push({
            ...kot,
            tableId: order.table_id || order.tableId,
            tableName: order.table_name || order.tableName,
            tokenNumber: order.token_number || order.tokenNumber,
            orderType: order.order_type || order.orderType,
          });
        });
      });
      flat.sort((a, b) => {
        const oa = STATUS_ORDER.indexOf(a.status), ob = STATUS_ORDER.indexOf(b.status);
        if (oa !== ob) return oa - ob;
        return new Date(a.printedAt || a.printed_at || 0) - new Date(b.printedAt || b.printed_at || 0);
      });
      setKots(flat);
    } catch (err) {
      if (!isRefresh) Alert.alert("Error", err?.response?.data?.detail || "Failed to load kitchen orders");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(() => load(true), 5000);
    return () => clearInterval(intervalRef.current);
  }, [load]);

  const advance = async (kot) => {
    const next = STATUS_FLOW[kot.status];
    if (!next) return;
    setBusyId(kot.kot_id || kot.kotNumber);
    try {
      await api.put(`/kot/${kot.kot_id}/status`, { status: next });
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to update status");
    } finally {
      setBusyId(null);
    }
  };

  const renderItem = ({ item }) => (
    <View style={[st.card, { borderColor: STATUS_COLOR[item.status] || "#e4e9f2" }]}>
      <View style={st.cardTop}>
        <Text style={st.kotNo}>KOT #{item.kotNumber || item.kot_number}</Text>
        <View style={[st.badge, { backgroundColor: `${STATUS_COLOR[item.status]}22` }]}>
          <Text style={[st.badgeText, { color: STATUS_COLOR[item.status] }]}>{item.status}</Text>
        </View>
      </View>
      <Text style={st.meta}>{item.tableName || `Token ${item.tokenNumber}` || item.orderType}</Text>
      {(item.items || []).slice(0, 5).map((it, i) => (
        <Text key={i} style={st.itemLine}>• {it.item_name} × {it.quantity}</Text>
      ))}
      {(item.items || []).length > 5 && (
        <Text style={st.moreLine}>+ {(item.items || []).length - 5} more items</Text>
      )}
      <View style={st.actionsRow}>
        {item.tableId && String(item.orderType || "").toUpperCase() !== "TAKEAWAY" && (
          <Pressable
            style={st.openBtn}
            onPress={() => navigation.navigate("TableOrder", { table: { table_id: item.tableId, table_name: item.tableName } })}
          >
            <Text style={st.openBtnText}>Open</Text>
          </Pressable>
        )}
        {STATUS_FLOW[item.status] && (
          <Pressable
            style={[st.advanceBtn, { backgroundColor: STATUS_COLOR[item.status] }]}
            disabled={busyId === (item.kot_id || item.kotNumber)}
            onPress={() => advance(item)}
          >
            {busyId === (item.kot_id || item.kotNumber)
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={st.advanceBtnText}>{STATUS_LABEL[item.status]}</Text>}
          </Pressable>
        )}
      </View>
    </View>
  );

  const counts = STATUS_ORDER.reduce((acc, s) => {
    acc[s] = kots.filter((k) => k.status === s).length;
    return acc;
  }, {});

  return (
    <SafeAreaView style={st.safe}>
      <View style={st.headerRow}>
        <Text style={st.headerText}>{kots.length} active order{kots.length === 1 ? "" : "s"}</Text>
        <Pressable style={st.liveLink} onPress={() => navigation.navigate("OrderLive")}>
          <Text style={st.liveLinkText}>Order Live ›</Text>
        </Pressable>
      </View>
      <View style={st.countsRow}>
        {STATUS_ORDER.filter((s) => s !== "COMPLETED").map((s) => (
          <View key={s} style={st.countChip}>
            <Text style={st.countChipText}>{s}: {counts[s] || 0}</Text>
          </View>
        ))}
      </View>
      {loading ? (
        <View style={st.center}><ActivityIndicator size="large" color="#6366f1" /></View>
      ) : (
        <FlatList
          data={kots}
          keyExtractor={(k, i) => String(k.kot_id || k.kotNumber || i)}
          renderItem={renderItem}
          contentContainerStyle={st.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          ListEmptyComponent={<View style={st.emptyWrap}><Text style={st.emptyIcon}>🍳</Text><Text style={st.emptyTitle}>No active kitchen orders</Text></View>}
        />
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f6fb" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingTop: 10 },
  headerText: { fontSize: 12, color: "#6b7280", fontWeight: "700" },
  liveLink: { paddingHorizontal: 10, paddingVertical: 5 },
  liveLinkText: { color: "#6366f1", fontWeight: "700", fontSize: 12 },
  list: { padding: 14, gap: 10, paddingBottom: 24 },
  card: { backgroundColor: "#fff", borderRadius: 16, borderWidth: 2, padding: 12, gap: 4 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  kotNo: { fontSize: 14, fontWeight: "800", color: "#0a0f1e" },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 10, fontWeight: "800" },
  meta: { fontSize: 12, color: "#6b7280", fontWeight: "600" },
  itemLine: { fontSize: 12, color: "#374151", marginTop: 2 },
  moreLine: { fontSize: 11, color: "#9ca3af", marginTop: 2, fontWeight: "600" },
  actionsRow: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 8 },
  openBtn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: "#e4e9f2", backgroundColor: "#f8f9fd" },
  openBtnText: { color: "#374151", fontWeight: "700", fontSize: 12 },
  advanceBtn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, alignItems: "center" },
  advanceBtnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  countsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 14, paddingTop: 8 },
  countChip: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#e4e9f2", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  countChipText: { fontSize: 10, fontWeight: "700", color: "#4b5563" },
  emptyWrap: { alignItems: "center", paddingTop: 50, gap: 10 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { color: "#9ca3af", fontSize: 15, fontWeight: "700" },
});
