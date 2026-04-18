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

  // Keys that are non-monetary (phone numbers, codes, text) — must be excluded
  const NON_MONETARY_KEYS = new Set([
    "wallet_mobile", "gift_card_code", "coupon_code",
    "customer_email", "customer_gst", "upi_utr",
  ]);

  // Map raw API keys to human-readable labels
  const PAYMENT_LABEL_MAP = {
    cash: "Cash", CASH: "Cash",
    card: "Card", CARD: "Card",
    upi: "UPI", UPI: "UPI",
    credit: "Credit", CREDIT: "Credit",
    wallet: "Wallet", WALLET: "Wallet",
    wallet_amount: "Wallet",
    gift_card: "Gift Card", GIFT_CARD: "Gift Card",
    gift_card_amount: "Gift Card",
    coupon: "Coupon", COUPON: "Coupon",
    split: "Split", SPLIT: "Split",
  };

  const paymentRows = Object.entries(payment)
    .filter(([key]) => !NON_MONETARY_KEYS.has(key))
    .map(([key, amount]) => ({
      key,
      label: PAYMENT_LABEL_MAP[key] || key.replace(/_/g, " ").toUpperCase(),
      amount: Number(amount || 0),
    }))
    .filter((x) => x.amount > 0 && x.amount < 1_000_000_000) // guard against phone numbers slipping through
    .reduce((acc, row) => {
      // Merge duplicate labels (e.g. wallet + wallet_amount both → "Wallet")
      const existing = acc.find((r) => r.label === row.label);
      if (existing) { existing.amount += row.amount; return acc; }
      return [...acc, row];
    }, [])
    .sort((a, b) => b.amount - a.amount);

  const paymentTotal = paymentRows.reduce((acc, row) => acc + row.amount, 0);
  const paymentColors = {
    Cash: "#059669",
    UPI: "#7c3aed",
    Card: "#0891b2",
    Credit: "#dc2626",
    "Gift Card": "#d97706",
    Wallet: "#ea580c",
    Coupon: "#0284c7",
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
        <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.container}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={["#2563eb"]} />}
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
                label="Due Collections"
                value={fmt(collections.amount)}
                accent="#2563eb"
              />
              <KpiCard
                label="Open Dues"
                value={fmt(openDues.outstanding)}
                sub={`${fmtCount(openDues.count)} invoices`}
                accent="#991b1b"
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
                const color = paymentColors[p.label] || "#475569";
                return (
                  <View key={p.key} style={styles.payRow}>
                    <Text style={styles.payLabel}>{p.label}</Text>
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
  safe: { flex: 1, backgroundColor: "#f0f4ff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  rangeBar: { flexDirection: "row", paddingHorizontal: 14, paddingVertical: 12, paddingBottom: 4, gap: 8 },
  rangeBtn: {
    flex: 1, borderWidth: 1.5, borderColor: "#d0dcf0", borderRadius: 999,
    paddingVertical: 8, alignItems: "center", backgroundColor: "#fff",
  },
  rangeBtnActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  rangeTxt: { fontSize: 12, fontWeight: "700", color: "#4a5a78" },
  rangeTxtActive: { color: "#fff" },
  container: { padding: 14, gap: 12, paddingBottom: 36 },
  section: {
    backgroundColor: "#fff", borderRadius: 18, borderWidth: 1.5,
    borderColor: "#dde6f7", padding: 14, gap: 12,
    shadowColor: "#1a2463", shadowOpacity: 0.07, shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  sectionTitle: { fontSize: 12, fontWeight: "800", color: "#4a5a78", textTransform: "uppercase", letterSpacing: 0.5 },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  kpiCard: {
    width: "47.5%", backgroundColor: "#f6f8fe", borderRadius: 14, borderWidth: 1.5,
    borderColor: "#dde6f7", padding: 12, gap: 3,
  },
  kpiLabel: { fontSize: 9, color: "#8896ae", fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  kpiValue: { fontSize: 20, fontWeight: "900", letterSpacing: -0.5 },
  kpiSub: { fontSize: 10, color: "#8896ae", fontWeight: "600" },
  payRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  payLabel: { width: 76, fontSize: 12, fontWeight: "700", color: "#4a5a78" },
  barOuter: { flex: 1, height: 9, backgroundColor: "#dde6f7", borderRadius: 5, overflow: "hidden" },
  barInner: { height: 9, borderRadius: 5 },
  payAmt: { width: 76, textAlign: "right", fontSize: 12, fontWeight: "800", color: "#0c1228" },
  topRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#f0f4ff",
  },
  topRank: { width: 24, textAlign: "center", color: "#8896ae", fontWeight: "800", fontSize: 13 },
  topName: { fontWeight: "800", color: "#0c1228", fontSize: 13 },
  topMeta: { color: "#8896ae", fontSize: 11 },
  topAmt: { fontSize: 14, fontWeight: "900", color: "#059669" },
});
