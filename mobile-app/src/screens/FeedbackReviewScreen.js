import { useCallback, useEffect, useState } from "react";
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

const RATING_FILTERS = ["all", "5", "4", "3", "2", "1"];
const fmtDate = (v) => {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

export default function FeedbackReviewScreen() {
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [ratingFilter, setRatingFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (filter, isRefresh) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params = {};
      if (filter && filter !== "all") params.rating = filter;
      params.limit = 200;
      const [summaryRes, listRes] = await Promise.all([
        api.get("/feedback/summary"),
        api.get("/feedback/list", { params }),
      ]);
      setSummary(summaryRes?.data || null);
      setRows(Array.isArray(listRes?.data?.items) ? listRes.data.items : []);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load feedback");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(ratingFilter); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectFilter = (f) => {
    setRatingFilter(f);
    load(f);
  };

  const byRating = summary?.by_rating || {};

  const renderItem = ({ item }) => (
    <View style={st.card}>
      <View style={st.cardTop}>
        <Text style={st.stars}>{"★".repeat(Number(item.rating || 0))}{"☆".repeat(5 - Number(item.rating || 0))}</Text>
        <Text style={st.date}>{fmtDate(item.created_at)}</Text>
      </View>
      {item.comment ? <Text style={st.comment}>{item.comment}</Text> : null}
      <View style={st.cardBottom}>
        <Text style={st.meta}>{item.customer_name || "Anonymous"}{item.mobile ? ` · ${item.mobile}` : ""}</Text>
        {item.invoice_no ? <Text style={st.meta}>Inv #{item.invoice_no}</Text> : null}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={st.safe}>
      {loading ? (
        <View style={st.center}><ActivityIndicator size="large" color="#6366f1" /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r, i) => String(r.feedback_id || i)}
          renderItem={renderItem}
          contentContainerStyle={st.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(ratingFilter, true)} />}
          ListHeaderComponent={
            <View>
              {summary && (
                <View style={st.summaryCard}>
                  <View style={st.summaryRow}>
                    <View style={st.summaryItem}>
                      <Text style={st.summaryValue}>{summary.total ?? 0}</Text>
                      <Text style={st.summaryLabel}>Total</Text>
                    </View>
                    <View style={st.summaryItem}>
                      <Text style={[st.summaryValue, { color: "#f59e0b" }]}>{Number(summary.average || 0).toFixed(1)} ★</Text>
                      <Text style={st.summaryLabel}>Average</Text>
                    </View>
                  </View>
                  <View style={st.barsWrap}>
                    {[5, 4, 3, 2, 1].map((r) => {
                      const count = byRating[r] || 0;
                      const pct = summary.total ? Math.round((count / summary.total) * 100) : 0;
                      return (
                        <View key={r} style={st.barRow}>
                          <Text style={st.barLabel}>{r}★</Text>
                          <View style={st.barTrack}>
                            <View style={[st.barFill, { width: `${pct}%` }]} />
                          </View>
                          <Text style={st.barCount}>{count}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}
              <View style={st.filterRow}>
                {RATING_FILTERS.map((f) => (
                  <Pressable
                    key={f}
                    style={[st.chip, ratingFilter === f && st.chipActive]}
                    onPress={() => selectFilter(f)}
                  >
                    <Text style={[st.chipText, ratingFilter === f && st.chipTextActive]}>
                      {f === "all" ? "All" : `${f}★`}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={st.emptyWrap}>
              <Text style={st.emptyIcon}>💬</Text>
              <Text style={st.emptyTitle}>No feedback yet</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f6fb" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 14, paddingBottom: 24, gap: 10 },
  summaryCard: {
    backgroundColor: "#fff", borderRadius: 18, borderWidth: 1.5, borderColor: "#e4e9f2",
    padding: 16, marginBottom: 12, gap: 12,
  },
  summaryRow: { flexDirection: "row", justifyContent: "space-around" },
  summaryItem: { alignItems: "center" },
  summaryValue: { fontSize: 22, fontWeight: "900", color: "#111827" },
  summaryLabel: { fontSize: 11, color: "#9ca3af", fontWeight: "700", textTransform: "uppercase", marginTop: 2 },
  barsWrap: { gap: 6 },
  barRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  barLabel: { width: 26, fontSize: 11, color: "#6b7280", fontWeight: "700" },
  barTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: "#f1f3f9", overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: "#f59e0b", borderRadius: 4 },
  barCount: { width: 24, fontSize: 11, color: "#374151", textAlign: "right" },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 10 },
  chip: {
    borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 999,
    paddingHorizontal: 14, paddingVertical: 7, backgroundColor: "#fff",
  },
  chipActive: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  chipText: { fontSize: 12, fontWeight: "700", color: "#4b5563" },
  chipTextActive: { color: "#fff" },
  card: {
    backgroundColor: "#fff", borderRadius: 16, borderWidth: 1.5, borderColor: "#e4e9f2",
    padding: 12, gap: 6,
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  stars: { color: "#f59e0b", fontSize: 15 },
  date: { fontSize: 11, color: "#9ca3af" },
  comment: { fontSize: 13, color: "#374151", lineHeight: 18 },
  cardBottom: { flexDirection: "row", justifyContent: "space-between" },
  meta: { fontSize: 11, color: "#6b7280" },
  emptyWrap: { alignItems: "center", paddingTop: 60, gap: 10 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { color: "#9ca3af", fontSize: 15, fontWeight: "700" },
});
