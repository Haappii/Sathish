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

export default function AlertsScreen({ navigation }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await api.get("/alerts/summary");
      setSummary(res?.data || null);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load alerts");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={st.safe}>
        <View style={st.center}><ActivityIndicator size="large" color="#6366f1" /></View>
      </SafeAreaView>
    );
  }

  const lowStock = summary?.low_stock_top || [];
  const dayClosePending = summary?.day_close_pending || [];
  const openShifts = summary?.open_shifts || [];

  return (
    <SafeAreaView style={st.safe}>
      <ScrollView
        contentContainerStyle={st.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      >
        <Card
          icon="📦"
          title="Low Stock"
          count={summary?.low_stock_count ?? lowStock.length}
          color="#f59e0b"
          onOpen={() => navigation.navigate("Inventory")}
        >
          {lowStock.length === 0 ? (
            <Text style={st.emptyText}>No low-stock items</Text>
          ) : lowStock.map((item, i) => (
            <View key={i} style={st.row}>
              <Text style={st.rowLabel} numberOfLines={1}>{item.item_name}</Text>
              <Text style={st.rowValueWarn}>short by {item.short_by}</Text>
            </View>
          ))}
        </Card>

        <Card
          icon="🌙"
          title="Day Close Pending"
          count={dayClosePending.length}
          color="#6366f1"
          onOpen={() => navigation.navigate("DayClose")}
        >
          {dayClosePending.length === 0 ? (
            <Text style={st.emptyText}>All branches closed for today</Text>
          ) : dayClosePending.map((b, i) => (
            <View key={i} style={st.row}>
              <Text style={st.rowLabel}>{b.branch_name}</Text>
            </View>
          ))}
        </Card>

        <Card
          icon="🏧"
          title="Open Cash Shifts"
          count={openShifts.reduce((s, b) => s + Number(b.open_shifts || 0), 0)}
          color="#10b981"
          onOpen={() => navigation.navigate("CashDrawer")}
        >
          {openShifts.length === 0 ? (
            <Text style={st.emptyText}>No open shifts</Text>
          ) : openShifts.map((b, i) => (
            <View key={i} style={st.row}>
              <Text style={st.rowLabel}>Branch #{b.branch_id}</Text>
              <Text style={st.rowValue}>{b.open_shifts} open</Text>
            </View>
          ))}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function Card({ icon, title, count, color, onOpen, children }) {
  return (
    <View style={st.card}>
      <View style={st.cardHeader}>
        <View style={st.cardHeaderLeft}>
          <View style={[st.iconWrap, { backgroundColor: `${color}22` }]}>
            <Text style={{ fontSize: 20 }}>{icon}</Text>
          </View>
          <View>
            <Text style={st.cardTitle}>{title}</Text>
            <Text style={[st.cardCount, { color }]}>{count}</Text>
          </View>
        </View>
        <Pressable style={st.openBtn} onPress={onOpen}>
          <Text style={st.openBtnText}>Open ›</Text>
        </Pressable>
      </View>
      <View style={st.cardBody}>{children}</View>
    </View>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f6fb" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 14, gap: 12, paddingBottom: 24 },
  card: {
    backgroundColor: "#fff", borderRadius: 18, borderWidth: 1.5, borderColor: "#e4e9f2",
    padding: 14, gap: 10,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 13, fontWeight: "700", color: "#374151" },
  cardCount: { fontSize: 20, fontWeight: "900" },
  openBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: "#eef2ff" },
  openBtnText: { color: "#6366f1", fontWeight: "700", fontSize: 12 },
  cardBody: { borderTopWidth: 1, borderTopColor: "#f1f3f9", paddingTop: 8, gap: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowLabel: { fontSize: 13, color: "#374151", flex: 1, marginRight: 8 },
  rowValue: { fontSize: 12, color: "#6b7280", fontWeight: "700" },
  rowValueWarn: { fontSize: 12, color: "#dc2626", fontWeight: "700" },
  emptyText: { fontSize: 12, color: "#9ca3af", fontStyle: "italic" },
});
