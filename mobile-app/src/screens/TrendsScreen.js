import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import api from "../api/client";
import { useAuth } from "../context/AuthContext";

const METRICS = [
  { key: "sales", label: "Sales" },
  { key: "bills", label: "Bills" },
  { key: "gst", label: "GST" },
  { key: "discount", label: "Discount" },
  { key: "avg_bill", label: "Avg Bill" },
  { key: "items", label: "Items Sold" },
];
const PERIODS = [
  { key: "day", label: "Daily" },
  { key: "week", label: "Weekly" },
  { key: "month", label: "Monthly" },
];
const fmt = (n) => Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export default function TrendsScreen() {
  const { session } = useAuth();
  const isAdmin = String(session?.role_name || session?.role || "").toLowerCase() === "admin";

  const [metric, setMetric] = useState("sales");
  const [period, setPeriod] = useState("day");
  const [current, setCurrent] = useState(null);
  const [previous, setPrevious] = useState(null);
  const [breakdown, setBreakdown] = useState([]);
  const [breakdownTab, setBreakdownTab] = useState("category");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { metric, period, size: 12 };
      if (isAdmin && session?.branch_id) params.branch_id = session.branch_id;
      const [curRes, prevRes] = await Promise.all([
        api.get("/dashboard/trend-metric", { params }),
        api.get("/dashboard/trend-metric", { params: { ...params, compare: "prev" } }),
      ]);
      setCurrent(curRes?.data || null);
      setPrevious(prevRes?.data || null);

      const bdRes = await api.get(breakdownTab === "category" ? "/reports/sales/category" : "/reports/sales/items");
      setBreakdown(Array.isArray(bdRes?.data) ? bdRes.data : []);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load trends");
    } finally {
      setLoading(false);
    }
  }, [metric, period, breakdownTab, isAdmin, session?.branch_id]);

  useEffect(() => { load(); }, [load]);

  const points = current?.points || current?.series || [];
  const maxVal = Math.max(1, ...points.map((p) => Number(p.value || 0)));
  const curTotal = current?.total ?? points.reduce((s, p) => s + Number(p.value || 0), 0);
  const prevTotal = previous?.total ?? (previous?.points || []).reduce((s, p) => s + Number(p.value || 0), 0);
  const growth = prevTotal ? (((curTotal - prevTotal) / prevTotal) * 100).toFixed(1) : null;

  const breakdownTotal = breakdown.reduce((s, b) => s + Number(b.amount || b.total || 0), 0);

  return (
    <SafeAreaView style={st.safe}>
      <ScrollView contentContainerStyle={st.scroll}>
        <View style={st.chipRow}>
          {METRICS.map((m) => (
            <Pressable key={m.key} style={[st.chip, metric === m.key && st.chipActive]} onPress={() => setMetric(m.key)}>
              <Text style={[st.chipText, metric === m.key && st.chipTextActive]}>{m.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={st.chipRow}>
          {PERIODS.map((p) => (
            <Pressable key={p.key} style={[st.chip, period === p.key && st.chipActive]} onPress={() => setPeriod(p.key)}>
              <Text style={[st.chipText, period === p.key && st.chipTextActive]}>{p.label}</Text>
            </Pressable>
          ))}
        </View>

        {loading ? (
          <View style={st.center}><ActivityIndicator size="large" color="#6366f1" /></View>
        ) : (
          <>
            <View style={st.summaryCard}>
              <Text style={st.summaryValue}>{fmt(curTotal)}</Text>
              <Text style={st.summaryLabel}>{METRICS.find((m) => m.key === metric)?.label} ({PERIODS.find((p) => p.key === period)?.label})</Text>
              {growth !== null && (
                <Text style={[st.growth, Number(growth) >= 0 ? st.growthUp : st.growthDown]}>
                  {Number(growth) >= 0 ? "▲" : "▼"} {Math.abs(growth)}% vs previous period
                </Text>
              )}
            </View>

            <View style={st.barsCard}>
              {points.length === 0 ? (
                <Text style={st.emptyText}>No data for this period</Text>
              ) : points.map((p, i) => (
                <View key={i} style={st.barRow}>
                  <Text style={st.barLabel} numberOfLines={1}>{p.label || p.period || p.date}</Text>
                  <View style={st.barTrack}>
                    <View style={[st.barFill, { width: `${Math.max(4, (Number(p.value || 0) / maxVal) * 100)}%` }]} />
                  </View>
                  <Text style={st.barValue}>{fmt(p.value)}</Text>
                </View>
              ))}
            </View>

            <View style={st.chipRow}>
              {["category", "item"].map((t) => (
                <Pressable key={t} style={[st.chip, breakdownTab === t && st.chipActive]} onPress={() => setBreakdownTab(t)}>
                  <Text style={[st.chipText, breakdownTab === t && st.chipTextActive]}>By {t === "category" ? "Category" : "Item"}</Text>
                </Pressable>
              ))}
            </View>
            <View style={st.barsCard}>
              {breakdown.length === 0 ? (
                <Text style={st.emptyText}>No breakdown data</Text>
              ) : breakdown.slice(0, 10).map((b, i) => {
                const val = Number(b.amount || b.total || 0);
                const pct = breakdownTotal ? ((val / breakdownTotal) * 100).toFixed(0) : 0;
                return (
                  <View key={i} style={st.barRow}>
                    <Text style={st.barLabel} numberOfLines={1}>{b.category || b.item_name || b.name}</Text>
                    <View style={st.barTrack}>
                      <View style={[st.barFill, { width: `${Math.max(4, pct)}%`, backgroundColor: "#10b981" }]} />
                    </View>
                    <Text style={st.barValue}>{pct}%</Text>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f6fb" },
  center: { paddingVertical: 40, alignItems: "center" },
  scroll: { padding: 14, gap: 12, paddingBottom: 24 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#fff" },
  chipActive: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  chipText: { fontSize: 11, fontWeight: "700", color: "#4b5563" },
  chipTextActive: { color: "#fff" },
  summaryCard: { backgroundColor: "#fff", borderRadius: 18, borderWidth: 1.5, borderColor: "#e4e9f2", padding: 18, alignItems: "center", gap: 4 },
  summaryValue: { fontSize: 30, fontWeight: "900", color: "#111827" },
  summaryLabel: { fontSize: 12, color: "#9ca3af", fontWeight: "700", textTransform: "uppercase" },
  growth: { fontSize: 13, fontWeight: "800", marginTop: 6 },
  growthUp: { color: "#059669" },
  growthDown: { color: "#dc2626" },
  barsCard: { backgroundColor: "#fff", borderRadius: 18, borderWidth: 1.5, borderColor: "#e4e9f2", padding: 14, gap: 10 },
  barRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  barLabel: { width: 90, fontSize: 11, color: "#4b5563", fontWeight: "600" },
  barTrack: { flex: 1, height: 12, borderRadius: 6, backgroundColor: "#f1f3f9", overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: "#6366f1", borderRadius: 6 },
  barValue: { width: 60, fontSize: 11, color: "#374151", fontWeight: "700", textAlign: "right" },
  emptyText: { fontSize: 12, color: "#9ca3af", fontStyle: "italic", textAlign: "center", paddingVertical: 10 },
});
