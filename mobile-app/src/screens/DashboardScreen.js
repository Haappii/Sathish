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
          <StatCard label="Today's Sales" value={`₹${fmt(sales)}`} color="#1d4ed8" />
          <StatCard label="Invoices"       value={String(invoices)}  color="#0f766e" />
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
    <View style={[styles.card, { borderTopColor: color, borderTopWidth: 3 }]}>
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
  safe:  { flex: 1, backgroundColor: "#f1f5f9" },
  scroll: { padding: 14, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  dateLabel: { color: "#64748b", fontWeight: "600", marginBottom: 2 },
  cardRow:   { flexDirection: "row", gap: 10 },
  card: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  cardValue: { fontSize: 22, fontWeight: "800" },
  cardLabel: { color: "#64748b", marginTop: 2, fontSize: 12 },
  section: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 10,
  },
  sectionTitle: { fontWeight: "700", fontSize: 15, color: "#0f172a" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  rowLabel: { fontWeight: "600", color: "#1e293b", maxWidth: "60%" },
  rowSub:   { color: "#94a3b8", fontSize: 12 },
  rowValue: { color: "#475569", fontSize: 13 },
  empty: { color: "#94a3b8" },
});
