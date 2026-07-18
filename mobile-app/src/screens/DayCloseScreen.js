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
import { useTheme } from "../context/ThemeContext";


const fmt = (n) => `₹${Number(n || 0).toFixed(2)}`;

function isHeadOfficeBranch(session) {
  const headOfficeBranchId = Number(session?.head_office_branch_id || 0);
  const branchType = String(session?.branch_type || "").toLowerCase();
  const branchName = String(session?.branch_name || "").toLowerCase();
  return (
    (headOfficeBranchId > 0 && Number(session?.branch_id || 0) === headOfficeBranchId) ||
    branchType.includes("head") ||
    branchName.includes("head")
  );
}

export default function DayCloseScreen() {
  const { theme } = useTheme();
  const { session, logout } = useAuth();
  const isHeadOffice = isHeadOfficeBranch(session);

  const [date, setDate] = useState(session?.app_date || new Date().toISOString().split("T")[0]);
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState(
    isHeadOffice ? "" : String(session?.branch_id || "")
  );
  const [status, setStatus] = useState([]);
  const [dayReport, setDayReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadBranches = useCallback(async () => {
    if (isHeadOffice) {
      try {
        const res = await api.get("/branch/active");
        setBranches(res?.data || []);
      } catch {
        setBranches([]);
      }
    } else if (session?.branch_id) {
      setBranches([{ branch_id: session.branch_id, branch_name: session.branch_name || "Current Branch" }]);
      setSelectedBranch(String(session.branch_id));
    }
  }, [isHeadOffice, session?.branch_id, session?.branch_name]);

  const loadStatus = useCallback(async (d) => {
    try {
      const res = await api.get("/day-close/status", { params: { date_str: d } });
      const rows = res?.data || [];
      setStatus(isHeadOffice ? rows : rows.filter((r) => String(r.branch_id) === String(session?.branch_id)));
    } catch {
      setStatus([]);
    }
  }, [isHeadOffice, session?.branch_id]);

  const loadDayReport = useCallback(async (branchId, d) => {
    if (!branchId || !d) {
      setDayReport(null);
      return;
    }
    setReportLoading(true);
    try {
      const res = await api.get("/day-close/cash-summary", { params: { date_str: d, branch_id: branchId } });
      setDayReport(res?.data || null);
    } catch {
      setDayReport(null);
    } finally {
      setReportLoading(false);
    }
  }, []);

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const shopRes = await api.get("/shop/details").catch(() => null);
      const appDate = shopRes?.data?.app_date ? String(shopRes.data.app_date).split("T")[0] : date;
      setDate(appDate);
      await loadBranches();
      await loadStatus(appDate);
      if (selectedBranch) await loadDayReport(selectedBranch, appDate);
    } catch (err) {
      if (!silent) Alert.alert("Error", err?.response?.data?.detail || "Failed to load day-close data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadBranches, loadStatus, loadDayReport, selectedBranch, date]);

  useEffect(() => { loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedBranch && date) loadDayReport(selectedBranch, date);
    else setDayReport(null);
  }, [selectedBranch, date, loadDayReport]);

  const closedCount = status.filter((s) => s.closed).length;
  const totalCount = status.length || 1;
  const pct = Math.round((closedCount / totalCount) * 100);
  const allClosed = status.length > 0 && closedCount === status.length;
  const selectedBranchClosed = status.some((s) => String(s.branch_id) === String(selectedBranch) && s.closed);

  const closeBranch = () => {
    if (!selectedBranch) return Alert.alert("Select Branch", "Please select a branch first.");
    if (selectedBranchClosed) return Alert.alert("Already Closed", "This branch is already closed for the selected date.");
    Alert.alert(
      "Close Branch Day",
      `Close business day ${date} for this branch?\n\nThis will lock all invoices for the day and sign you out.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Close Branch Day",
          style: "destructive",
          onPress: async () => {
            setClosing(true);
            try {
              await api.post("/day-close/branch", null, { params: { date_str: date, branch_id: Number(selectedBranch) } });
              await logout();
            } catch (err) {
              Alert.alert("Error", err?.response?.data?.detail || "Failed to close branch day");
              setClosing(false);
            }
          },
        },
      ]
    );
  };

  const closeShop = () => {
    if (!allClosed) return;
    Alert.alert(
      "Close Shop Day",
      `Close the full shop day for ${date}?\n\nAll branches must already be closed. This will sign you out.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Close Shop Day",
          style: "destructive",
          onPress: async () => {
            setClosing(true);
            try {
              await api.post("/day-close/shop", null, { params: { date_str: date } });
              await logout();
            } catch (err) {
              Alert.alert("Error", err?.response?.data?.detail || "Failed to close shop day");
              setClosing(false);
            }
          },
        },
      ]
    );
  };

  const report = dayReport;
  const totals = report?.report_totals || {};
  const paymentModes = Object.entries(report?.payment_modes || {});

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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadAll(true)} colors={["#2563eb"]} />}
      >
        {/* Date + Branch select */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Close Day</Text>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Business Date</Text>
            <Text style={styles.fieldValue}>{date}</Text>
          </View>
          {isHeadOffice ? (
            <View style={{ gap: 8 }}>
              <Text style={styles.fieldLabel}>Branch</Text>
              <View style={styles.chipWrap}>
                {branches.map((b) => {
                  const isClosed = status.some((s) => String(s.branch_id) === String(b.branch_id) && s.closed);
                  const active = String(selectedBranch) === String(b.branch_id);
                  return (
                    <Pressable
                      key={b.branch_id}
                      style={[styles.chip, active && styles.chipActive, isClosed && styles.chipDisabled]}
                      onPress={() => !isClosed && setSelectedBranch(String(b.branch_id))}
                      disabled={isClosed}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {b.branch_name}{isClosed ? " (Closed)" : ""}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : (
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Branch</Text>
              <Text style={styles.fieldValue}>{branches[0]?.branch_name || session?.branch_name || "Current Branch"}</Text>
            </View>
          )}

          <Pressable
            style={[styles.closeBtn, (closing || !selectedBranch || selectedBranchClosed) && styles.btnDisabled]}
            disabled={closing || !selectedBranch || selectedBranchClosed}
            onPress={closeBranch}
          >
            <Text style={styles.closeBtnText}>{closing ? "Closing…" : "Close Branch Day"}</Text>
          </Pressable>
          {selectedBranchClosed && (
            <Text style={styles.hintOk}>✓ This branch is already closed for the selected date.</Text>
          )}

          {isHeadOffice && (
            <>
              <Pressable
                style={[styles.shopCloseBtn, (closing || !allClosed) && styles.btnDisabled]}
                disabled={closing || !allClosed}
                onPress={closeShop}
              >
                <Text style={styles.closeBtnText}>{closing ? "Closing…" : "Close Shop Day"}</Text>
              </Pressable>
              {status.length > 0 && !allClosed && (
                <Text style={styles.hintWarn}>Close all active branches first before closing the full shop day.</Text>
              )}
            </>
          )}
        </View>

        {/* Day Closing Report */}
        {selectedBranch && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Day Closing Report</Text>
            {reportLoading ? (
              <ActivityIndicator color="#2563eb" />
            ) : !report ? (
              <Text style={styles.empty}>No data available for this branch and date.</Text>
            ) : (
              <>
                <View style={styles.statsGrid}>
                  {[
                    { label: "Total Amount", value: fmt(totals.total_amount), accent: "#0a0f1e" },
                    { label: "Total Cash", value: fmt(totals.cash), accent: "#059669" },
                    { label: "UPI", value: fmt(totals.upi), accent: "#2563eb" },
                    { label: "Card", value: fmt(totals.card), accent: "#0891b2" },
                    { label: "Gift Card", value: fmt(totals.gift_card), accent: "#d97706" },
                    { label: "Discount", value: fmt(totals.discount), accent: "#dc2626" },
                    { label: "GST", value: fmt(totals.gst), accent: "#2563eb" },
                    ...(Number(totals.wallet || 0) > 0 ? [{ label: "Wallet", value: fmt(totals.wallet), accent: "#7c3aed" }] : []),
                    ...(Number(totals.other || 0) > 0 ? [{ label: "Other", value: fmt(totals.other), accent: "#64748b" }] : []),
                  ].map((kpi) => (
                    <View key={kpi.label} style={styles.kpiCard}>
                      <Text style={styles.kpiLabel}>{kpi.label}</Text>
                      <Text style={[styles.kpiValue, { color: kpi.accent }]}>{kpi.value}</Text>
                    </View>
                  ))}
                </View>

                <Text style={[styles.sectionTitle, { marginTop: 6 }]}>Payment Breakdown</Text>
                {paymentModes.length === 0 ? (
                  <Text style={styles.empty}>No payment data for this branch and date.</Text>
                ) : (
                  paymentModes.map(([mode, amount]) => (
                    <View key={mode} style={styles.branchRow}>
                      <Text style={styles.branchRowName}>{mode}</Text>
                      <Text style={styles.fieldValue}>{fmt(amount)}</Text>
                    </View>
                  ))
                )}
              </>
            )}
          </View>
        )}

        {/* Branch Close Progress */}
        {status.length > 0 && (
          <View style={styles.section}>
            <View style={styles.headerRow}>
              <Text style={styles.sectionTitle}>Branch Close Progress</Text>
              <Text style={[styles.pctText, allClosed && { color: "#059669" }]}>{pct}%</Text>
            </View>
            <Text style={styles.progressSub}>{closedCount} of {status.length} branches closed</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: allClosed ? "#10b981" : "#2563eb" }]} />
            </View>
            {status.map((s) => (
              <View key={String(s.branch_id)} style={styles.branchRow}>
                <Text style={styles.branchRowName}>{s.branch_name}</Text>
                <View style={[styles.miniStatus, s.closed ? styles.badgeClosed : styles.badgeOpen]}>
                  <Text style={[styles.miniStatusText, s.closed ? styles.badgeClosedText : styles.badgeOpenText]}>
                    {s.closed ? "CLOSED" : "OPEN"}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f6fb" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 14, gap: 12, paddingBottom: 32 },
  section: {
    backgroundColor: "#ffffff", borderRadius: 18, borderWidth: 1.5,
    borderColor: "#e4e9f2", padding: 14, gap: 10,
    shadowColor: "#0a0f1e", shadowOpacity: 0.07, shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  sectionTitle: { fontSize: 12, fontWeight: "800", color: "#4b5563", textTransform: "uppercase", letterSpacing: 0.6 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  fieldRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  fieldLabel: { color: "#9ca3af", fontWeight: "700", fontSize: 12 },
  fieldValue: { color: "#0a0f1e", fontWeight: "800", fontSize: 14 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 999,
    paddingHorizontal: 13, paddingVertical: 7, backgroundColor: "#f8f9fd",
  },
  chipActive: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  chipDisabled: { opacity: 0.45 },
  chipText: { fontSize: 11, fontWeight: "700", color: "#4b5563" },
  chipTextActive: { color: "#fff" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  kpiCard: {
    width: "47.5%", backgroundColor: "#f8f9fd", borderRadius: 14,
    borderWidth: 1.5, borderColor: "#e4e9f2", padding: 12, gap: 3,
  },
  kpiLabel: { fontSize: 10, color: "#9ca3af", fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  kpiValue: { fontSize: 18, fontWeight: "900", letterSpacing: -0.5 },
  branchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#f4f6fb" },
  branchRowName: { color: "#4b5563", fontWeight: "700" },
  miniStatus: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1.5 },
  miniStatusText: { fontWeight: "700", fontSize: 11 },
  badgeOpen: { backgroundColor: "#dcfce7", borderColor: "#86efac" },
  badgeClosed: { backgroundColor: "#fee2e2", borderColor: "#fca5a5" },
  badgeOpenText: { color: "#166534" },
  badgeClosedText: { color: "#991b1b" },
  progressSub: { color: "#9ca3af", fontSize: 11, fontWeight: "600" },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: "#f1f3f9", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 4 },
  pctText: { fontWeight: "900", fontSize: 14, color: "#4b5563" },
  closeBtn: {
    backgroundColor: "#0B3C8C", borderRadius: 16, paddingVertical: 15, alignItems: "center",
    shadowColor: "#0B3C8C", shadowOpacity: 0.3, shadowRadius: 10, elevation: 5, marginTop: 4,
  },
  shopCloseBtn: {
    backgroundColor: "#059669", borderRadius: 16, paddingVertical: 15, alignItems: "center",
    shadowColor: "#059669", shadowOpacity: 0.3, shadowRadius: 10, elevation: 5,
  },
  closeBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  btnDisabled: { opacity: 0.5 },
  hintOk: { color: "#059669", fontSize: 11, fontWeight: "700" },
  hintWarn: { color: "#d97706", fontSize: 11, fontWeight: "700" },
  empty: { color: "#9ca3af", fontWeight: "600", fontSize: 12 },
});
