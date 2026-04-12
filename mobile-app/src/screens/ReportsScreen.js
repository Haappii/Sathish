import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import api from "../api/client";
import { useAuth } from "../context/AuthContext";

const fmt = (n) => `₹${Number(n || 0).toFixed(2)}`;
const fmtDate = (v) => {
  if (!v) return "-";
  return String(v).split("T")[0];
};

const PAYMENT_MODES_FILTER = ["all", "cash", "card", "upi", "credit"];

export default function ReportsScreen() {
  const { session } = useAuth();
  const bizDate = session?.app_date || new Date().toISOString().split("T")[0];
  const thirtyAgoBiz = () => {
    const d = new Date(bizDate);
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  };
  const [startDate, setStartDate] = useState(() => thirtyAgoBiz());
  const [endDate, setEndDate] = useState(bizDate);
  const [modeFilter, setModeFilter] = useState("all");
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadReport = async () => {
    if (!startDate || !endDate) return Alert.alert("Validation", "Select start and end dates");
    setLoading(true);
    setLoaded(false);
    try {
      const params = { start: startDate, end: endDate };
      if (modeFilter !== "all") params.payment_mode = modeFilter;
      const res = await api.get("/reports/sales", { params });
      const data = res?.data || {};
      setRows(data.rows || data.invoices || []);
      setSummary(data.summary || data);
      setLoaded(true);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load report");
    } finally {
      setLoading(false);
    }
  };

  const renderRow = ({ item: row }) => (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.invNo}>{row.invoice_number}</Text>
        <Text style={styles.rowMeta}>{row.customer_name || "Walk-in"} · {fmtDate(row.invoice_date)}</Text>
        {row.payment_mode && (
          <View style={styles.modeBadge}>
            <Text style={styles.modeBadgeText}>{String(row.payment_mode).toUpperCase()}</Text>
          </View>
        )}
      </View>
      <Text style={styles.rowAmt}>{fmt(row.total_amount ?? row.amount ?? 0)}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      {/* Filter bar */}
      <View style={styles.filterCard}>
        <View style={styles.dateRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>From</Text>
            <TextInput
              style={styles.dateInput}
              value={startDate}
              onChangeText={setStartDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#94a3b8"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>To</Text>
            <TextInput
              style={styles.dateInput}
              value={endDate}
              onChangeText={setEndDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#94a3b8"
            />
          </View>
        </View>

        <View style={styles.modeRow}>
          {PAYMENT_MODES_FILTER.map((m) => (
            <Pressable
              key={m}
              style={[styles.chip, modeFilter === m && styles.chipActive]}
              onPress={() => setModeFilter(m)}
            >
              <Text style={[styles.chipText, modeFilter === m && styles.chipTextActive]}>
                {m.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          style={[styles.runBtn, loading && styles.btnDisabled]}
          disabled={loading}
          onPress={loadReport}
        >
          {loading
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.runBtnText}>Generate Report</Text>}
        </Pressable>
      </View>

      {/* Summary */}
      {loaded && summary && (
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <SumItem label="Invoices" value={String(summary.invoice_count ?? rows.length)} color="#1d4ed8" />
            <SumItem label="Total Sales" value={fmt(summary.total_amount ?? summary.total_sales)} color="#059669" />
            <SumItem label="Avg Ticket" value={fmt(summary.avg_ticket ?? summary.average_invoice)} color="#d97706" />
          </View>
          {summary.total_tax > 0 && (
            <Text style={styles.taxLine}>GST / Tax Collected: {fmt(summary.total_tax)}</Text>
          )}
        </View>
      )}

      {/* Rows */}
      {loaded && (
        <FlatList
          data={rows}
          keyExtractor={(r, i) => String(r.invoice_number || r.id || i)}
          renderItem={renderRow}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyIcon}>📊</Text>
              <Text style={styles.emptyTitle}>No invoices in this period</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function SumItem({ label, value, color }) {
  return (
    <View style={styles.sumItem}>
      <Text style={styles.sumLabel}>{label}</Text>
      <Text style={[styles.sumValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f1f5f9" },
  filterCard: {
    backgroundColor: "#fff", margin: 12, borderRadius: 14,
    borderWidth: 1, borderColor: "#e2e8f0", padding: 12, gap: 10,
  },
  dateRow: { flexDirection: "row", gap: 10 },
  label: { fontSize: 11, fontWeight: "700", color: "#64748b", marginBottom: 4 },
  dateInput: {
    borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10,
    backgroundColor: "#f8fafc", paddingHorizontal: 10, paddingVertical: 9, color: "#0f172a",
  },
  modeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 5, backgroundColor: "#fff",
  },
  chipActive: { backgroundColor: "#1d4ed8", borderColor: "#1d4ed8" },
  chipText: { fontSize: 11, fontWeight: "600", color: "#334155" },
  chipTextActive: { color: "#fff" },
  runBtn: {
    backgroundColor: "#1d4ed8", borderRadius: 10, paddingVertical: 12,
    alignItems: "center", justifyContent: "center", minHeight: 44,
  },
  runBtnText: { color: "#fff", fontWeight: "800" },
  btnDisabled: { opacity: 0.5 },
  summaryCard: {
    backgroundColor: "#fff", marginHorizontal: 12, borderRadius: 12,
    borderWidth: 1, borderColor: "#e2e8f0", padding: 12, gap: 6,
  },
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  sumItem: { alignItems: "center", gap: 2 },
  sumLabel: { fontSize: 10, color: "#64748b", fontWeight: "600" },
  sumValue: { fontSize: 16, fontWeight: "800" },
  taxLine: { color: "#64748b", fontSize: 12, textAlign: "center" },
  list: { padding: 12, paddingTop: 8, gap: 6, paddingBottom: 24 },
  row: {
    backgroundColor: "#fff", borderRadius: 10, borderWidth: 1,
    borderColor: "#e2e8f0", padding: 10, flexDirection: "row", alignItems: "center",
  },
  invNo: { fontWeight: "800", color: "#0f172a" },
  rowMeta: { color: "#64748b", fontSize: 12, marginTop: 2 },
  modeBadge: {
    marginTop: 4, backgroundColor: "#eff6ff", borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2, alignSelf: "flex-start",
  },
  modeBadgeText: { color: "#1d4ed8", fontSize: 10, fontWeight: "700" },
  rowAmt: { fontSize: 15, fontWeight: "800", color: "#059669" },
  emptyWrap: { alignItems: "center", paddingTop: 40, gap: 8 },
  emptyIcon: { fontSize: 36 },
  emptyTitle: { color: "#64748b", fontSize: 15, fontWeight: "700" },
});
