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
import { useAuth } from "../context/AuthContext";

const fmt = (n) => `₹${Number(n || 0).toFixed(2)}`;

export default function DayCloseScreen() {
  const { session } = useAuth();
  const branchId = session?.branch_id ?? null;
  const branchName = session?.branch_name || "";
  const businessDate = session?.app_date || new Date().toISOString().split("T")[0];

  const [date, setDate] = useState(businessDate);
  const [status, setStatus] = useState([]);
  const [dayReport, setDayReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [statusRes, reportRes] = await Promise.all([
        api.get("/day-close/status", { params: { date_str: date } }),
        api.get("/day-close/summary", {
          params: { date_str: date, branch_id: branchId },
        }).catch(() => ({ data: null })),
      ]);
      setStatus(statusRes?.data || []);
      setDayReport(reportRes?.data || null);
    } catch (err) {
      if (!silent) Alert.alert("Error", err?.response?.data?.detail || "Failed to load day-close data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [date, branchId]);

  useEffect(() => { loadData(); }, [loadData]);

  const currentBranchStatus = status.find(
    (s) => Number(s.branch_id) === Number(branchId)
  );
  const isClosed = currentBranchStatus?.is_closed === true;

  const closeDay = () => {
    if (isClosed) return Alert.alert("Already Closed", "Day is already closed for this branch.");
    Alert.alert(
      "Close Day",
      `Are you sure you want to close day ${date} for ${branchName || "this branch"}?\n\nThis will lock all invoices for the day.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Close Day",
          style: "destructive",
          onPress: async () => {
            setClosing(true);
            try {
              await api.post("/day-close/close", {
                date_str: date,
                branch_id: branchId,
              });
              Alert.alert("Day Closed", `Day ${date} has been closed successfully.`);
              await loadData(true);
            } catch (err) {
              Alert.alert("Error", err?.response?.data?.detail || "Failed to close day");
            } finally {
              setClosing(false);
            }
          },
        },
      ]
    );
  };

  const report = dayReport;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} colors={["#2563eb"]} />}
      >
        {/* Date + Status */}
        <View style={[styles.section, styles.headerSection]}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.dateLabel}>{date}</Text>
              <Text style={styles.branchLabel}>{branchName || "Current Branch"}</Text>
            </View>
            <View style={[styles.statusBadge, isClosed ? styles.badgeClosed : styles.badgeOpen]}>
              <Text style={[styles.statusBadgeText, isClosed ? styles.badgeClosedText : styles.badgeOpenText]}>
                {isClosed ? "CLOSED" : "OPEN"}
              </Text>
            </View>
          </View>
        </View>

        {/* Sales Summary */}
        {report && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sales Summary</Text>
            <View style={styles.statsGrid}>
              {[
                { label: "Total Sales", value: fmt(report.total_sales ?? report.total_invoice_amount), accent: "#059669" },
                { label: "Invoices", value: String(report.invoice_count ?? report.total_invoices ?? 0), accent: "#2563eb" },
                { label: "Cash", value: fmt(report.cash ?? report.cash_sales), accent: "#d97706" },
                { label: "UPI", value: fmt(report.upi ?? report.upi_sales), accent: "#7c3aed" },
                { label: "Card", value: fmt(report.card ?? report.card_sales), accent: "#0891b2" },
                { label: "Credit", value: fmt(report.credit ?? report.credit_sales ?? 0), accent: "#dc2626" },
              ].map((kpi) => (
                <View key={kpi.label} style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>{kpi.label}</Text>
                  <Text style={[styles.kpiValue, { color: kpi.accent }]}>{kpi.value}</Text>
                </View>
              ))}
            </View>
            {Number(report.expenses ?? 0) > 0 && (
              <View style={styles.expenseRow}>
                <Text style={styles.expenseLabel}>Expenses</Text>
                <Text style={styles.expenseValue}>{fmt(report.expenses)}</Text>
              </View>
            )}
            {Number(report.net_cash ?? 0) !== 0 && (
              <View style={styles.netRow}>
                <Text style={styles.netLabel}>Net Cash</Text>
                <Text style={styles.netValue}>{fmt(report.net_cash)}</Text>
              </View>
            )}
          </View>
        )}

        {/* Status of all branches (if admin) */}
        {status.length > 1 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Branch Status</Text>
            {status.map((s) => (
              <View key={String(s.branch_id)} style={styles.branchRow}>
                <Text style={styles.branchRowName}>{s.branch_name}</Text>
                <View style={[styles.miniStatus, s.is_closed ? styles.badgeClosed : styles.badgeOpen]}>
                  <Text style={[styles.miniStatusText, s.is_closed ? styles.badgeClosedText : styles.badgeOpenText]}>
                    {s.is_closed ? "CLOSED" : "OPEN"}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Close Day Button */}
        {!isClosed && (
          <Pressable
            style={[styles.closeBtn, closing && styles.btnDisabled]}
            disabled={closing}
            onPress={closeDay}
          >
            <Text style={styles.closeBtnText}>{closing ? "Closing…" : `Close Day — ${date}`}</Text>
          </Pressable>
        )}

        {isClosed && (
          <View style={styles.closedNotice}>
            <Text style={styles.closedNoticeText}>
              ✓ Day is closed. No more billing allowed for this date.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f0f4ff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 14, gap: 12, paddingBottom: 32 },
  section: {
    backgroundColor: "#fff", borderRadius: 18, borderWidth: 1.5,
    borderColor: "#dde6f7", padding: 14, gap: 10,
    shadowColor: "#1a2463", shadowOpacity: 0.07, shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  headerSection: { backgroundColor: "#0c1228" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dateLabel: { color: "#fff", fontSize: 20, fontWeight: "800" },
  branchLabel: { color: "#7a8fa8", fontSize: 13, fontWeight: "600" },
  statusBadge: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5, borderWidth: 2 },
  badgeOpen: { backgroundColor: "#dcfce7", borderColor: "#86efac" },
  badgeClosed: { backgroundColor: "#fee2e2", borderColor: "#fca5a5" },
  statusBadgeText: { fontWeight: "800", fontSize: 13 },
  badgeOpenText: { color: "#166534" },
  badgeClosedText: { color: "#991b1b" },
  sectionTitle: { fontSize: 12, fontWeight: "800", color: "#4a5a78", textTransform: "uppercase", letterSpacing: 0.6 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  kpiCard: {
    width: "47.5%", backgroundColor: "#f6f8fe", borderRadius: 14,
    borderWidth: 1.5, borderColor: "#dde6f7", padding: 12, gap: 3,
  },
  kpiLabel: { fontSize: 10, color: "#8896ae", fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  kpiValue: { fontSize: 18, fontWeight: "900", letterSpacing: -0.5 },
  expenseRow: { flexDirection: "row", justifyContent: "space-between", paddingTop: 8, borderTopWidth: 1.5, borderTopColor: "#dde6f7" },
  expenseLabel: { color: "#dc2626", fontWeight: "700" },
  expenseValue: { color: "#dc2626", fontWeight: "800" },
  netRow: { flexDirection: "row", justifyContent: "space-between" },
  netLabel: { color: "#059669", fontWeight: "700" },
  netValue: { color: "#059669", fontWeight: "800", fontSize: 15 },
  branchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#f0f4ff" },
  branchRowName: { color: "#4a5a78", fontWeight: "700" },
  miniStatus: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1.5 },
  miniStatusText: { fontWeight: "700", fontSize: 11 },
  closeBtn: {
    backgroundColor: "#dc2626", borderRadius: 16, paddingVertical: 15, alignItems: "center",
    shadowColor: "#dc2626", shadowOpacity: 0.35, shadowRadius: 10, elevation: 5,
  },
  closeBtnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  btnDisabled: { opacity: 0.5 },
  closedNotice: {
    backgroundColor: "#ecfdf5", borderRadius: 16, padding: 16, alignItems: "center",
    borderWidth: 1.5, borderColor: "#6ee7b7",
  },
  closedNoticeText: { color: "#166534", fontWeight: "700", textAlign: "center", fontSize: 14 },
});
