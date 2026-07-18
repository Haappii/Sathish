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
import { useTheme } from "../context/ThemeContext";


const fmt = (n) => `₹${Number(n || 0).toFixed(2)}`;
const fmtDate = (v) => {
  if (!v) return "-";
  return String(v).split("T")[0];
};

const PAYMENT_MODES_FILTER = ["all", "cash", "card", "upi", "credit"];

export default function ReportsScreen() {
  const { theme } = useTheme();
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
            <SumItem label="Invoices" value={String(summary.invoice_count ?? rows.length)} color="#2563eb" />
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
  safe: { flex: 1, backgroundColor: "#f4f6fb" },
  filterCard: {
    backgroundColor: "#ffffff", margin: 14, borderRadius: 18,
    borderWidth: 1.5, borderColor: "#e4e9f2", padding: 14, gap: 10,
    shadowColor: "#0a0f1e", shadowOpacity: 0.07, shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  dateRow: { flexDirection: "row", gap: 10 },
  label: { fontSize: 11, fontWeight: "700", color: "#9ca3af", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 },
  dateInput: {
    borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12,
    backgroundColor: "#f8f9fd", paddingHorizontal: 12, paddingVertical: 10, color: "#0a0f1e", fontSize: 14,
  },
  modeRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: {
    borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#f8f9fd",
  },
  chipActive: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  chipText: { fontSize: 11, fontWeight: "700", color: "#4b5563" },
  chipTextActive: { color: "#fff" },
  runBtn: {
    backgroundColor: "#6366f1", borderRadius: 14, paddingVertical: 13,
    alignItems: "center", justifyContent: "center", minHeight: 44,
    shadowColor: "#6366f1", shadowOpacity: 0.35, shadowRadius: 10, elevation: 5,
  },
  runBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
  summaryCard: {
    backgroundColor: "#ffffff", marginHorizontal: 14, borderRadius: 18,
    borderWidth: 1.5, borderColor: "#e4e9f2", padding: 14, gap: 8,
    shadowColor: "#0a0f1e", shadowOpacity: 0.07, shadowRadius: 12, elevation: 4,
  },
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  sumItem: { alignItems: "center", gap: 3 },
  sumLabel: { fontSize: 10, color: "#9ca3af", fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  sumValue: { fontSize: 18, fontWeight: "900" },
  taxLine: { color: "#9ca3af", fontSize: 12, textAlign: "center", fontWeight: "600" },
  list: { padding: 14, paddingTop: 8, gap: 8, paddingBottom: 24 },
  row: {
    backgroundColor: "#ffffff", borderRadius: 16, borderWidth: 1.5,
    borderColor: "#e4e9f2", padding: 12, flexDirection: "row", alignItems: "center",
    shadowColor: "#0a0f1e", shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  invNo: { fontWeight: "800", color: "#0a0f1e", fontSize: 14 },
  rowMeta: { color: "#4b5563", fontSize: 12, marginTop: 2 },
  modeBadge: {
    marginTop: 4, backgroundColor: "#eef2ff", borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start",
    borderWidth: 1, borderColor: "#bfdbfe",
  },
  modeBadgeText: { color: "#6366f1", fontSize: 10, fontWeight: "800" },
  rowAmt: { fontSize: 15, fontWeight: "900", color: "#10b981", marginLeft: 8 },
  emptyWrap: { alignItems: "center", paddingTop: 50, gap: 10 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { color: "#9ca3af", fontSize: 15, fontWeight: "700" },
});
