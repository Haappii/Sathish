import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import api from "../api/client";
import { useAuth } from "../context/AuthContext";

const METRICS = [
  { key: "sales", label: "Sales Amount" },
  { key: "bills", label: "Bills Count" },
  { key: "gst", label: "GST Collected" },
  { key: "discount", label: "Discount Given" },
  { key: "avg_bill", label: "Avg Bill Value" },
  { key: "items", label: "Items Sold" },
];
const PERIODS = [
  { key: "day", label: "Daily" },
  { key: "week", label: "Weekly" },
  { key: "month", label: "Monthly" },
];
const PRESETS = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "fy", label: "Financial Year" },
  { key: "alltime", label: "All Time" },
  { key: "custom", label: "Custom" },
];
const fmt = (n) => Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const fmtD = (d) => d.toISOString().slice(0, 10);

function getDateRange(preset, bDate) {
  const today = bDate ? new Date(bDate) : new Date();
  const todayStr = fmtD(today);
  if (preset === "today") return { from: todayStr, to: todayStr };
  if (preset === "week") { const d = new Date(today); d.setDate(d.getDate() - 6); return { from: fmtD(d), to: todayStr }; }
  if (preset === "month") { const d = new Date(today.getFullYear(), today.getMonth(), 1); return { from: fmtD(d), to: todayStr }; }
  if (preset === "fy") {
    const y = today.getFullYear(), m = today.getMonth();
    const s = m >= 3 ? new Date(y, 3, 1) : new Date(y - 1, 3, 1);
    const e = m >= 3 ? new Date(y + 1, 2, 31) : new Date(y, 2, 31);
    return { from: fmtD(s), to: fmtD(e) };
  }
  if (preset === "alltime") return { from: "2000-01-01", to: todayStr };
  return null;
}

export default function TrendsScreen() {
  const { session } = useAuth();
  const isAdmin = String(session?.role_name || session?.role || "").toLowerCase() === "admin";

  const [metric, setMetric] = useState("sales");
  const [period, setPeriod] = useState("day");
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState("");
  const [current, setCurrent] = useState(null);
  const [previous, setPrevious] = useState(null);
  const [loading, setLoading] = useState(true);

  const [businessDate, setBusinessDate] = useState("");
  const [breakdownTab, setBreakdownTab] = useState("category");
  const [salesPreset, setSalesPreset] = useState("month");
  const [salesFrom, setSalesFrom] = useState("");
  const [salesTo, setSalesTo] = useState("");
  const [breakdown, setBreakdown] = useState([]);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [sortKey, setSortKey] = useState("amount");
  const [sortDir, setSortDir] = useState("desc");

  useEffect(() => {
    if (isAdmin) {
      api.get("/branch/active").then((res) => setBranches(res?.data || [])).catch(() => setBranches([]));
    }
    api.get("/shop/details").then((res) => {
      const bd = res?.data?.app_date || "";
      setBusinessDate(bd);
      const range = getDateRange("month", bd);
      if (range) { setSalesFrom(range.from); setSalesTo(range.to); }
    }).catch(() => {});
  }, [isAdmin]);

  const loadTrend = useCallback(async () => {
    setLoading(true);
    try {
      const size = period === "day" ? 14 : 12;
      const params = { metric, period, size };
      if (isAdmin && branchId) params.branch_id = Number(branchId);
      const [curRes, prevRes] = await Promise.all([
        api.get("/dashboard/trend-metric", { params }),
        api.get("/dashboard/trend-metric", { params: { ...params, compare: "prev" } }),
      ]);
      setCurrent(curRes?.data || null);
      setPrevious(prevRes?.data || null);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load trends");
    } finally {
      setLoading(false);
    }
  }, [metric, period, isAdmin, branchId]);

  const loadBreakdown = useCallback(async () => {
    const range = salesPreset === "custom" ? { from: salesFrom, to: salesTo } : getDateRange(salesPreset, businessDate);
    if (!range?.from || !range?.to) return;
    setBreakdownLoading(true);
    try {
      const endpoint = breakdownTab === "category" ? "/reports/sales/category" : "/reports/sales/items";
      const params = { from_date: range.from, to_date: range.to };
      if (isAdmin && branchId) params.branch_id = Number(branchId);
      const res = await api.get(endpoint, { params });
      setBreakdown(Array.isArray(res?.data) ? res.data : []);
    } catch {
      setBreakdown([]);
    } finally {
      setBreakdownLoading(false);
    }
  }, [breakdownTab, salesPreset, salesFrom, salesTo, businessDate, isAdmin, branchId]);

  useEffect(() => { loadTrend(); }, [loadTrend]);
  useEffect(() => {
    if (salesPreset !== "custom") loadBreakdown();
  }, [breakdownTab, salesPreset, branchId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (salesPreset === "custom" && salesFrom && salesTo) loadBreakdown();
  }, [salesFrom, salesTo]); // eslint-disable-line react-hooks/exhaustive-deps

  const points = current?.points || current?.series || current?.data || [];
  const prevPoints = previous?.points || previous?.series || previous?.data || [];
  const maxVal = Math.max(1, ...points.map((p) => Number(p.value || 0)));
  const curTotal = current?.total ?? points.reduce((s, p) => s + Number(p.value || 0), 0);
  const prevTotal = previous?.total ?? prevPoints.reduce((s, p) => s + Number(p.value || 0), 0);
  const growth = prevTotal ? (((curTotal - prevTotal) / prevTotal) * 100).toFixed(1) : null;

  const nameKey = breakdownTab === "category" ? "category" : "item";
  const sortedBreakdown = useMemo(() => {
    const arr = [...breakdown];
    arr.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "amount") return dir * (Number(a.amount || a.total || 0) - Number(b.amount || b.total || 0));
      if (sortKey === "quantity") return dir * (Number(a.quantity || 0) - Number(b.quantity || 0));
      return dir * String(a[nameKey] || a.name || "").localeCompare(String(b[nameKey] || b.name || ""));
    });
    return arr;
  }, [breakdown, sortKey, sortDir, nameKey]);
  const breakdownTotal = breakdown.reduce((s, b) => s + Number(b.amount || b.total || 0), 0);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  };
  const sortIcon = (key) => (sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "");

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
        {isAdmin && branches.length > 0 && (
          <View style={st.chipRow}>
            <Pressable style={[st.chip, !branchId && st.chipActive]} onPress={() => setBranchId("")}>
              <Text style={[st.chipText, !branchId && st.chipTextActive]}>All Branches</Text>
            </Pressable>
            {branches.map((b) => (
              <Pressable key={b.branch_id} style={[st.chip, String(branchId) === String(b.branch_id) && st.chipActive]} onPress={() => setBranchId(String(b.branch_id))}>
                <Text style={[st.chipText, String(branchId) === String(b.branch_id) && st.chipTextActive]}>{b.branch_name}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {loading ? (
          <View style={st.center}><ActivityIndicator size="large" color="#6366f1" /></View>
        ) : (
          <>
            <View style={st.summaryRow}>
              <View style={[st.summaryCard, { flex: 1 }]}>
                <Text style={st.summaryValue}>{fmt(curTotal)}</Text>
                <Text style={st.summaryLabel}>Current</Text>
              </View>
              <View style={[st.summaryCard, { flex: 1 }]}>
                <Text style={[st.summaryValue, { color: "#9ca3af" }]}>{fmt(prevTotal)}</Text>
                <Text style={st.summaryLabel}>Previous</Text>
              </View>
            </View>
            {growth !== null && (
              <Text style={[st.growth, Number(growth) >= 0 ? st.growthUp : st.growthDown]}>
                {Number(growth) >= 0 ? "▲" : "▼"} {Math.abs(growth)}% vs previous period
              </Text>
            )}

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

            {/* Period breakdown table */}
            {points.length > 0 && (
              <View style={st.barsCard}>
                <Text style={st.tableTitle}>Period Breakdown</Text>
                {points.map((p, i) => {
                  const curr = Number(p.value || 0);
                  const prev = Number(prevPoints[i]?.value || 0);
                  const g = prev === 0 ? null : (((curr - prev) / prev) * 100).toFixed(1);
                  return (
                    <View key={i} style={st.tableRow}>
                      <Text style={[st.tableCell, { flex: 1.3 }]} numberOfLines={1}>{p.label || p.period || p.date}</Text>
                      <Text style={[st.tableCell, st.tableRight]}>{fmt(curr)}</Text>
                      <Text style={[st.tableCell, st.tableRight, { color: "#9ca3af" }]}>{fmt(prev)}</Text>
                      <Text style={[st.tableCell, st.tableRight, g === null ? { color: "#9ca3af" } : g >= 0 ? st.growthUp : st.growthDown]}>
                        {g === null ? "—" : `${g >= 0 ? "▲" : "▼"} ${Math.abs(g)}%`}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Sales Breakdown */}
            <View style={st.chipRow}>
              {["category", "item"].map((t) => (
                <Pressable key={t} style={[st.chip, breakdownTab === t && st.chipActive]} onPress={() => setBreakdownTab(t)}>
                  <Text style={[st.chipText, breakdownTab === t && st.chipTextActive]}>{t === "category" ? "Category Sales" : "Item Sales"}</Text>
                </Pressable>
              ))}
            </View>

            <View style={st.chipRow}>
              {PRESETS.map((p) => (
                <Pressable
                  key={p.key}
                  style={[st.chip, salesPreset === p.key && st.chipActive]}
                  onPress={() => {
                    setSalesPreset(p.key);
                    if (p.key !== "custom") {
                      const r = getDateRange(p.key, businessDate);
                      if (r) { setSalesFrom(r.from); setSalesTo(r.to); }
                    }
                  }}
                >
                  <Text style={[st.chipText, salesPreset === p.key && st.chipTextActive]}>{p.label}</Text>
                </Pressable>
              ))}
            </View>
            {salesPreset === "custom" && (
              <View style={st.dateRow}>
                <TextInput style={st.dateInput} value={salesFrom} onChangeText={setSalesFrom} placeholder="From YYYY-MM-DD" placeholderTextColor="#94a3b8" />
                <TextInput style={st.dateInput} value={salesTo} onChangeText={setSalesTo} placeholder="To YYYY-MM-DD" placeholderTextColor="#94a3b8" />
              </View>
            )}

            {breakdownLoading ? (
              <ActivityIndicator color="#6366f1" style={{ marginVertical: 16 }} />
            ) : (
              <>
                <View style={st.barsCard}>
                  {breakdown.length === 0 ? (
                    <Text style={st.emptyText}>No breakdown data</Text>
                  ) : sortedBreakdown.slice(0, 15).map((b, i) => {
                    const val = Number(b.amount || b.total || 0);
                    const pct = breakdownTotal ? ((val / breakdownTotal) * 100).toFixed(0) : 0;
                    return (
                      <View key={i} style={st.barRow}>
                        <Text style={st.barLabel} numberOfLines={1}>{b[nameKey] || b.name}</Text>
                        <View style={st.barTrack}>
                          <View style={[st.barFill, { width: `${Math.max(4, pct)}%`, backgroundColor: "#10b981" }]} />
                        </View>
                        <Text style={st.barValue}>{pct}%</Text>
                      </View>
                    );
                  })}
                </View>

                {breakdown.length > 0 && (
                  <View style={st.barsCard}>
                    <View style={st.tableRow}>
                      <Pressable style={{ flex: 1.4 }} onPress={() => toggleSort("name")}>
                        <Text style={st.tableHead}>{breakdownTab === "category" ? "Category" : "Item"}{sortIcon("name")}</Text>
                      </Pressable>
                      <Pressable style={{ flex: 1 }} onPress={() => toggleSort("quantity")}>
                        <Text style={[st.tableHead, st.tableRight]}>Qty{sortIcon("quantity")}</Text>
                      </Pressable>
                      <Pressable style={{ flex: 1 }} onPress={() => toggleSort("amount")}>
                        <Text style={[st.tableHead, st.tableRight]}>Amount{sortIcon("amount")}</Text>
                      </Pressable>
                    </View>
                    {sortedBreakdown.map((row, i) => (
                      <View key={i} style={st.tableRow}>
                        <Text style={[st.tableCell, { flex: 1.4 }]} numberOfLines={1}>{row[nameKey] || row.name}</Text>
                        <Text style={[st.tableCell, st.tableRight, { flex: 1 }]}>{Number(row.quantity || 0).toLocaleString("en-IN")}</Text>
                        <Text style={[st.tableCell, st.tableRight, { flex: 1 }]}>{fmt(row.amount || row.total)}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
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
  summaryRow: { flexDirection: "row", gap: 10 },
  summaryCard: { backgroundColor: "#fff", borderRadius: 18, borderWidth: 1.5, borderColor: "#e4e9f2", padding: 16, alignItems: "center", gap: 4 },
  summaryValue: { fontSize: 22, fontWeight: "900", color: "#111827" },
  summaryLabel: { fontSize: 11, color: "#9ca3af", fontWeight: "700", textTransform: "uppercase" },
  growth: { fontSize: 13, fontWeight: "800", textAlign: "center" },
  growthUp: { color: "#059669" },
  growthDown: { color: "#dc2626" },
  barsCard: { backgroundColor: "#fff", borderRadius: 18, borderWidth: 1.5, borderColor: "#e4e9f2", padding: 14, gap: 10 },
  barRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  barLabel: { width: 90, fontSize: 11, color: "#4b5563", fontWeight: "600" },
  barTrack: { flex: 1, height: 12, borderRadius: 6, backgroundColor: "#f1f3f9", overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: "#6366f1", borderRadius: 6 },
  barValue: { width: 60, fontSize: 11, color: "#374151", fontWeight: "700", textAlign: "right" },
  emptyText: { fontSize: 12, color: "#9ca3af", fontStyle: "italic", textAlign: "center", paddingVertical: 10 },
  dateRow: { flexDirection: "row", gap: 8 },
  dateInput: {
    flex: 1, borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 9, backgroundColor: "#fff", fontSize: 12, color: "#0a0f1e",
  },
  tableTitle: { fontSize: 11, fontWeight: "800", color: "#4b5563", textTransform: "uppercase" },
  tableHead: { fontSize: 10, fontWeight: "800", color: "#9ca3af", textTransform: "uppercase" },
  tableRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#f4f6fb" },
  tableCell: { fontSize: 12, color: "#374151", fontWeight: "600" },
  tableRight: { textAlign: "right" },
});
