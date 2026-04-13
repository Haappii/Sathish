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
      const [summaryRes, topItemsRes] = await Promise.all([
        api.get("/analytics/summary", { params: { from_date: from, to_date: to } }).catch(() => ({ data: null })),
        api.get("/reports/sales/items", { params: { from_date: from, to_date: to } }).catch(() => ({ data: [] })),
      ]);

      const itemsRows = Array.isArray(topItemsRes?.data) ? topItemsRes.data : [];
      const topRows = [...itemsRows]
        .sort((a, b) => Number(b?.amount || 0) - Number(a?.amount || 0))
        .slice(0, 10)
        .map((r) => ({
          item_name: r?.item || r?.item_name || "Item",
          total_qty: Number(r?.quantity || 0),
          total_amount: Number(r?.amount || 0),
        }));

      setData(summaryRes?.data || null);
      setTopItems(topRows);

    } catch (err) {
      if (!silent) Alert.alert("Error", err?.response?.data?.detail || "Failed to load analytics");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [rangeIdx]);

  useEffect(() => { load(); }, [load]);

  const fin = data?.financials || {};
  const payment = data?.payment_breakdown || {};
  const collections = data?.collections || {};
  const openDues = data?.open_dues || {};
  const stock = data?.stock || {};

  const paymentRows = Object.entries(payment)
    .map(([key, amount]) => ({ key, amount: Number(amount || 0) }))
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const paymentTotal = paymentRows.reduce((acc, row) => acc + row.amount, 0);
  const paymentColors = {
    CASH: "#059669",
    UPI: "#7c3aed",
    CARD: "#0891b2",
    CREDIT: "#dc2626",
    "GIFT CARD": "#d97706",
    WALLET: "#ea580c",
  };

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
        <View style={styles.center}><ActivityIndicator size="large" color="#0b57d0" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.container}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={["#0b57d0"]} />}
        >
          {/* KPIs */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sales Overview</Text>
            <View style={styles.kpiGrid}>
              <KpiCard
                label="Net Sales (Ex Tax)"
                value={fmt(fin.sales_ex_tax)}
                accent="#059669"
              />
              <KpiCard
                label="Gross Profit"
                value={fmt(fin.gross_profit)}
                accent="#0b57d0"
              />
              <KpiCard
                label="Net Profit"
                value={fmt(fin.profit)}
                accent="#d97706"
              />
              <KpiCard
                label="GST Collected"
                value={fmt(fin.gst)}
                accent="#7c3aed"
              />
              <KpiCard
                label="Discount"
                value={fmt(fin.discount)}
                accent="#0891b2"
              />
              <KpiCard
                label="Returns Refund"
                value={fmt(fin.returns_refund)}
                accent="#dc2626"
              />
              <KpiCard
                label="Expenses"
                value={fmt(fin.expense)}
                accent="#b91c1c"
              />
              <KpiCard
                label="Due Collections"
                value={fmt(collections.amount)}
                accent="#0b57d0"
              />
              <KpiCard
                label="Open Dues"
                value={fmt(openDues.outstanding)}
                sub={`${fmtCount(openDues.count)} invoices`}
                accent="#991b1b"
              />
              <KpiCard
                label={stock.raw_materials_only ? "Raw Material Stock" : "Stock Valuation"}
                value={fmt(stock.valuation)}
                accent="#1e40af"
              />
            </View>
          </View>

          {/* Payment Breakdown */}
          {paymentRows.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Payment Breakdown</Text>
              {paymentRows.map((p) => {
                const total = paymentTotal > 0 ? paymentTotal : 1;
                const pct = Math.round((p.amount / total) * 100);
                const color = paymentColors[p.key] || "#475569";
                return (
                  <View key={p.key} style={styles.payRow}>
                    <Text style={styles.payLabel}>{p.key}</Text>
                    <View style={styles.barOuter}>
                      <View style={[styles.barInner, { width: `${pct}%`, backgroundColor: color }]} />
                    </View>
                    <Text style={[styles.payAmt, { color }]}>{fmt(p.amount)}</Text>
                  </View>
                );
              })}
            </View>
          )}

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

        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f3f6ff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  rangeBar: {
    flexDirection: "row", padding: 12, paddingBottom: 0, gap: 8,
  },
  rangeBtn: {
    flex: 1, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 999,
    paddingVertical: 7, alignItems: "center", backgroundColor: "#fff",
  },
  rangeBtnActive: { backgroundColor: "#0b57d0", borderColor: "#0b57d0" },
  rangeTxt: { fontSize: 12, fontWeight: "700", color: "#334155" },
  rangeTxtActive: { color: "#fff" },
  container: { padding: 12, gap: 10, paddingBottom: 32 },
  section: {
    backgroundColor: "#fff", borderRadius: 14, borderWidth: 1,
    borderColor: "#d9e3ff", padding: 12, gap: 10,
  },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: "#0b1220" },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  kpiCard: {
    width: "48%", backgroundColor: "#ffffff", borderRadius: 10,
    padding: 10, gap: 2,
  },
  kpiLabel: { fontSize: 10, color: "#64748b", fontWeight: "600", textTransform: "uppercase" },
  kpiValue: { fontSize: 18, fontWeight: "800" },
  kpiSub: { fontSize: 10, color: "#94a3b8" },
  payRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  payLabel: { width: 44, fontSize: 12, fontWeight: "700", color: "#334155" },
  barOuter: {
    flex: 1, height: 8, backgroundColor: "#d9e3ff", borderRadius: 4, overflow: "hidden",
  },
  barInner: { height: 8, borderRadius: 4 },
  payAmt: { width: 72, textAlign: "right", fontSize: 12, fontWeight: "700" },
  topRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#f3f6ff",
  },
  topRank: { width: 22, textAlign: "center", color: "#94a3b8", fontWeight: "800", fontSize: 13 },
  topName: { fontWeight: "700", color: "#0b1220", fontSize: 13 },
  topMeta: { color: "#64748b", fontSize: 11 },
  topAmt: { fontSize: 13, fontWeight: "800", color: "#059669" },
});
