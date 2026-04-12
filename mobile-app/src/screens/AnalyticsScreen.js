import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useAuth } from "../context/AuthContext";

const fmt = (n) => `₹${Number(n || 0).toFixed(2)}`;
const fmtCount = (n) => String(Number(n || 0));

function KpiCard({ label, value, sub, accent }) {
  return (
    <View style={[styles.kpiCard, { borderLeftColor: accent, borderLeftWidth: 4 }]}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, { color: accent }]}>{value}</Text>
      {sub ? <Text style={styles.kpiSub}>{sub}</Text> : null}
    </View>
  );
}

export default function AnalyticsScreen() {
  const { session } = useAuth();
  const businessDate = session?.app_date || new Date().toISOString().split("T")[0];
  const nDaysBeforeBiz = useCallback((n) => {
    const d = new Date(businessDate);
    d.setDate(d.getDate() - n);
    return d.toISOString().split("T")[0];
  }, [businessDate]);
  const RANGES = useMemo(() => [
    { label: "Today", from: () => businessDate, to: () => businessDate },
    { label: "7 Days", from: () => nDaysBeforeBiz(6), to: () => businessDate },
    { label: "30 Days", from: () => nDaysBeforeBiz(29), to: () => businessDate },
    { label: "90 Days", from: () => nDaysBeforeBiz(89), to: () => businessDate },
  ], [businessDate, nDaysBeforeBiz]);

  const [rangeIdx, setRangeIdx] = useState(0);
  const [data, setData] = useState(null);
  const [dashStats, setDashStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [topItems, setTopItems] = useState([]);

  const range = RANGES[rangeIdx];

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const from = range.from();
      const to = range.to();
      const [summaryRes, dashRes, topItemsRes] = await Promise.all([
        api.get("/reports/sales/summary", { params: { from_date: from, to_date: to, group_by: "date" } }).catch(() => ({ data: [] })),
        api.get("/dashboard/stats", { params: { date: to } }).catch(() => ({ data: null })),
        api.get("/reports/sales/items", { params: { from_date: from, to_date: to } }).catch(() => ({ data: [] })),
      ]);

      const summaryRows = Array.isArray(summaryRes?.data) ? summaryRes.data : [];
      const merged = summaryRows.reduce((acc, row) => {
        acc.invoice_count += Number(row?.bills || 0);
        acc.total_sales += Number(row?.grand_total || 0);
        acc.total_discount += Number(row?.discount || 0);
        acc.total_gst += Number(row?.gst || 0);
        acc.sub_total += Number(row?.sub_total || 0);
        return acc;
      }, {
        invoice_count: 0,
        total_sales: 0,
        total_discount: 0,
        total_gst: 0,
        sub_total: 0,
      });

      const itemsRows = Array.isArray(topItemsRes?.data) ? topItemsRes.data : [];
      const topRows = [...itemsRows]
        .sort((a, b) => Number(b?.amount || 0) - Number(a?.amount || 0))
        .slice(0, 10)
        .map((r) => ({
          item_name: r?.item || r?.item_name || "Item",
          total_qty: Number(r?.quantity || 0),
          total_amount: Number(r?.amount || 0),
        }));

      setData(merged);
      setDashStats(dashRes?.data || null);
      setTopItems(topRows);

    } catch (err) {
      if (!silent) Alert.alert("Error", err?.response?.data?.detail || "Failed to load analytics");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [rangeIdx]);

  useEffect(() => { load(); }, [load]);

  const stats = data || dashStats || {};

  return (
    <SafeAreaView style={styles.safe}>
      {/* Range Selector */}
      <View style={styles.rangeBar}>
        {RANGES.map((r, i) => (
          <Pressable
            key={r.label}
            style={[styles.rangeBtn, rangeIdx === i && styles.rangeBtnActive]}
            onPress={() => setRangeIdx(i)}
          >
            <Text style={[styles.rangeTxt, rangeIdx === i && styles.rangeTxtActive]}>
              {r.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#1d4ed8" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.container}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={["#1d4ed8"]} />}
        >
          {/* KPIs */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sales Overview</Text>
            <View style={styles.kpiGrid}>
              <KpiCard
                label="Total Revenue"
                value={fmt(stats.total_revenue ?? stats.total_sales ?? stats.total_amount)}
                accent="#059669"
              />
              <KpiCard
                label="Invoices"
                value={fmtCount(stats.invoice_count ?? stats.total_invoices)}
                accent="#1d4ed8"
              />
              <KpiCard
                label="Avg. Ticket"
                value={fmt(stats.avg_ticket ?? stats.average_invoice)}
                accent="#d97706"
              />
              <KpiCard
                label="New Customers"
                value={fmtCount(stats.new_customers ?? stats.customer_count)}
                accent="#7c3aed"
              />
            </View>
          </View>

          {/* Payment Breakdown */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payment Breakdown</Text>
            {[
              { label: "Cash", key: "cash", color: "#059669" },
              { label: "UPI", key: "upi", color: "#7c3aed" },
              { label: "Card", key: "card", color: "#0891b2" },
              { label: "Credit", key: "credit", color: "#dc2626" },
            ].map((p) => {
              const val = Number(
                stats[p.key] ?? stats[`${p.key}_sales`] ?? stats[`${p.key}_total`] ?? 0
              );
              const total = Number(stats.total_revenue ?? stats.total_sales ?? stats.total_amount ?? 1);
              const pct = total > 0 ? Math.round((val / total) * 100) : 0;
              return (
                <View key={p.label} style={styles.payRow}>
                  <Text style={styles.payLabel}>{p.label}</Text>
                  <View style={styles.barOuter}>
                    <View style={[styles.barInner, { width: `${pct}%`, backgroundColor: p.color }]} />
                  </View>
                  <Text style={[styles.payAmt, { color: p.color }]}>{fmt(val)}</Text>
                </View>
              );
            })}
          </View>

          {/* Top Items */}
          {topItems.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Top Selling Items</Text>
              {topItems.map((item, idx) => (
                <View key={String(item.item_id || idx)} style={styles.topRow}>
                  <Text style={styles.topRank}>{idx + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.topName}>{item.item_name || item.name}</Text>
                    <Text style={styles.topMeta}>Qty: {item.total_qty ?? item.quantity}</Text>
                  </View>
                  <Text style={styles.topAmt}>{fmt(item.total_amount ?? item.revenue)}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Expenses */}
          {(stats.total_expenses ?? stats.expenses) > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Expenses</Text>
              <KpiCard
                label="Total Expenses"
                value={fmt(stats.total_expenses ?? stats.expenses)}
                accent="#dc2626"
              />
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f1f5f9" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  rangeBar: {
    flexDirection: "row", padding: 12, paddingBottom: 0, gap: 8,
  },
  rangeBtn: {
    flex: 1, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 999,
    paddingVertical: 7, alignItems: "center", backgroundColor: "#fff",
  },
  rangeBtnActive: { backgroundColor: "#1d4ed8", borderColor: "#1d4ed8" },
  rangeTxt: { fontSize: 12, fontWeight: "700", color: "#334155" },
  rangeTxtActive: { color: "#fff" },
  container: { padding: 12, gap: 10, paddingBottom: 32 },
  section: {
    backgroundColor: "#fff", borderRadius: 14, borderWidth: 1,
    borderColor: "#e2e8f0", padding: 12, gap: 10,
  },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: "#0f172a" },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  kpiCard: {
    width: "48%", backgroundColor: "#f8fafc", borderRadius: 10,
    padding: 10, gap: 2,
  },
  kpiLabel: { fontSize: 10, color: "#64748b", fontWeight: "600", textTransform: "uppercase" },
  kpiValue: { fontSize: 18, fontWeight: "800" },
  kpiSub: { fontSize: 10, color: "#94a3b8" },
  payRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  payLabel: { width: 44, fontSize: 12, fontWeight: "700", color: "#334155" },
  barOuter: {
    flex: 1, height: 8, backgroundColor: "#e2e8f0", borderRadius: 4, overflow: "hidden",
  },
  barInner: { height: 8, borderRadius: 4 },
  payAmt: { width: 72, textAlign: "right", fontSize: 12, fontWeight: "700" },
  topRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#f1f5f9",
  },
  topRank: { width: 22, textAlign: "center", color: "#94a3b8", fontWeight: "800", fontSize: 13 },
  topName: { fontWeight: "700", color: "#0f172a", fontSize: 13 },
  topMeta: { color: "#64748b", fontSize: 11 },
  topAmt: { fontSize: 13, fontWeight: "800", color: "#059669" },
});
