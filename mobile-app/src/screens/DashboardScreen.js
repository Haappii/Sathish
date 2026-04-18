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
import { formatBusinessDateLabel, toBusinessYmd } from "../utils/businessDate";

export default function DashboardScreen() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [businessDate, setBusinessDate] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const shopRes = await api.get("/shop/details");
      const appDate = shopRes?.data?.app_date || null;
      setBusinessDate(appDate);
      const res = await api.get("/dashboard/stats", { params: { date: toBusinessYmd(appDate) } });
      setData(res.data);
    } catch (err) {
      const msg = err?.response?.data?.detail || "Failed to load dashboard";
      Alert.alert("Error", String(msg));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator size="large" /></View>
      </SafeAreaView>
    );
  }

  const sales   = data?.today_sales   ?? 0;
  const invoices = data?.today_bills ?? 0;
  const expense = data?.total_expenses ?? 0;
  const due     = data?.total_dues     ?? 0;
  const topItems = data?.top_items      ?? [];
  const recentInvoices = data?.recent_invoices ?? [];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      >
        {/* Date */}
        <Text style={styles.dateLabel}>Business Date: {formatBusinessDateLabel(businessDate)}</Text>

        {/* Summary Cards */}
        <View style={styles.cardRow}>
          <StatCard label="Today's Sales" value={`₹${fmt(sales)}`} color="#2563eb" />
          <StatCard label="Invoices"       value={String(invoices)}  color="#2563eb" />
        </View>
        <View style={styles.cardRow}>
          <StatCard label="Expenses" value={`₹${fmt(expense)}`} color="#b45309" />
          <StatCard label="Dues"     value={`₹${fmt(due)}`}     color="#b91c1c" />
        </View>

        {/* Top Items */}
        {topItems.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Top Selling Items</Text>
            {topItems.slice(0, 5).map((item, i) => (
              <View key={i} style={styles.row}>
                <Text style={styles.rowLabel} numberOfLines={1}>{item.item_name}</Text>
                <Text style={styles.rowValue}>Qty: {item.quantity}  ₹{fmt(item.revenue)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Recent Invoices */}
        {recentInvoices.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Bills</Text>
            {recentInvoices.slice(0, 5).map((inv, i) => (
              <View key={i} style={styles.row}>
                <View>
                  <Text style={styles.rowLabel}>{inv.invoice_number}</Text>
                  <Text style={styles.rowSub}>{inv.customer_name || "Walk-in"}</Text>
                </View>
                <Text style={styles.rowValue}>₹{fmt(inv.grand_total)}</Text>
              </View>
            ))}
          </View>
        )}

        {data === null && (
          <View style={styles.center}>
            <Text style={styles.empty}>No dashboard data available.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ label, value, color }) {
  return (
    <View style={styles.card}>
      <View style={[styles.cardAccentBar, { backgroundColor: color }]} />
      <Text style={[styles.cardValue, { color }]}>{value}</Text>
      <Text style={styles.cardLabel}>{label}</Text>
    </View>
  );
}

function fmt(n) {
  const num = Number(n ?? 0);
  return num.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

const styles = StyleSheet.create({
  safe:  { flex: 1, backgroundColor: "#f0f4ff" },
  scroll: { padding: 14, gap: 12, paddingBottom: 28 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  dateLabel: { color: "#8896ae", fontWeight: "700", fontSize: 12, marginBottom: 2, letterSpacing: 0.3 },
  cardRow:   { flexDirection: "row", gap: 10 },
  card: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 14,
    paddingLeft: 18,
    borderWidth: 1.5,
    borderColor: "#dde6f7",
    overflow: "hidden",
    shadowColor: "#1a2463", shadowOpacity: 0.08, shadowRadius: 14,
    shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
  cardAccentBar: {
    position: "absolute", top: 0, left: 0, bottom: 0, width: 4,
    borderTopLeftRadius: 18, borderBottomLeftRadius: 18,
  },
  cardValue: { fontSize: 22, fontWeight: "900", letterSpacing: -0.5 },
  cardLabel: { color: "#8896ae", marginTop: 3, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  section: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.5,
    borderColor: "#dde6f7",
    gap: 10,
    shadowColor: "#1a2463", shadowOpacity: 0.07, shadowRadius: 12, elevation: 4,
  },
  sectionTitle: { fontWeight: "800", fontSize: 13, color: "#0c1228", textTransform: "uppercase", letterSpacing: 0.5 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f4ff",
  },
  rowLabel: { fontWeight: "700", color: "#0c1228", maxWidth: "60%", fontSize: 13 },
  rowSub:   { color: "#8896ae", fontSize: 12, marginTop: 2 },
  rowValue: { color: "#4a5a78", fontSize: 13, fontWeight: "700" },
  empty: { color: "#8896ae", fontWeight: "600" },
});
