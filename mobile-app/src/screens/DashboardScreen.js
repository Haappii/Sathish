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
  TextInput,
  View,
} from "react-native";
import api from "../api/client";
import { canAccess, modulesToPermMap } from "../auth/rbac";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";


export default function DashboardScreen() {
  const { theme } = useTheme();
  const { session } = useAuth();
  const roleLower = String(session?.role_name || session?.role || "").toLowerCase();
  const isAdmin = roleLower === "admin";
  const branchId = session?.branch_id ?? null;

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [canExpenseWrite, setCanExpenseWrite] = useState(false);

  const [reportMode, setReportMode] = useState("today"); // today | month | custom
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [categorySales, setCategorySales] = useState([]);
  const [branchSales, setBranchSales] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState(isAdmin ? null : branchId ?? null);
  const [selectedBranchName, setSelectedBranchName] = useState(isAdmin ? "All Branches" : (session?.branch_name || "All Branches"));
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [categoryItems, setCategoryItems] = useState([]);
  const [categoryItemsLoading, setCategoryItemsLoading] = useState(false);

  const [expenseForm, setExpenseForm] = useState({ amount: "", category: "" });
  const [expenseSaving, setExpenseSaving] = useState(false);

  const hasValidCustomRange = reportMode !== "custom" || Boolean(fromDate && toDate);

  const loadStats = useCallback(async () => {
    try {
      const res = await api.get("/dashboard/stats");
      setStats(res?.data || null);
    } catch {
      setStats(null);
    }
  }, []);

  const loadPerms = useCallback(async () => {
    try {
      const res = await api.get("/permissions/my");
      const enabled = Boolean(res?.data?.enabled);
      const permMap = modulesToPermMap(res?.data?.modules);
      if (enabled && permMap) {
        setCanExpenseWrite(canAccess(permMap, { module: "expenses", action: "write" }));
      } else {
        setCanExpenseWrite(roleLower === "admin" || roleLower === "manager");
      }
    } catch {
      setCanExpenseWrite(roleLower === "admin" || roleLower === "manager");
    }
  }, [roleLower]);

  const loadCategorySales = useCallback(async (targetBranchId = selectedBranchId) => {
    if (!hasValidCustomRange) return;
    try {
      const res = await api.get("/reports/category-sales", {
        params: {
          mode: reportMode,
          from_date: reportMode === "custom" ? fromDate || undefined : undefined,
          to_date: reportMode === "custom" ? toDate || undefined : undefined,
          branch_id: targetBranchId ?? undefined,
        },
      });
      setCategorySales(res?.data || []);
      setSelectedCategory(null);
      setCategoryItems([]);
    } catch {
      setCategorySales([]);
    }
  }, [selectedBranchId, hasValidCustomRange, reportMode, fromDate, toDate]);

  const loadBranchSales = useCallback(async () => {
    if (!isAdmin || !hasValidCustomRange) return;
    try {
      const res = await api.get("/reports/branch-sales", {
        params: {
          mode: reportMode,
          from_date: reportMode === "custom" ? fromDate || undefined : undefined,
          to_date: reportMode === "custom" ? toDate || undefined : undefined,
        },
      });
      const rows = (res?.data || []).slice().sort((a, b) => Number(b?.total_sales || 0) - Number(a?.total_sales || 0));
      setBranchSales(rows);
    } catch {
      setBranchSales([]);
    }
  }, [isAdmin, hasValidCustomRange, reportMode, fromDate, toDate]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      await Promise.all([loadStats(), loadPerms()]);
    } catch (err) {
      if (!silent) Alert.alert("Error", err?.response?.data?.detail || "Failed to load dashboard");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadStats, loadPerms]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!hasValidCustomRange) return;
    loadCategorySales(selectedBranchId);
    loadBranchSales();
  }, [hasValidCustomRange, selectedBranchId, loadCategorySales, loadBranchSales]);

  const handleBranchClick = (row) => {
    setSelectedBranchId(row.branch_id);
    setSelectedBranchName(row.branch_name || `Branch ${row.branch_id}`);
    loadCategorySales(row.branch_id);
  };
  const handleAllBranchesClick = () => {
    setSelectedBranchId(null);
    setSelectedBranchName("All Branches");
    loadCategorySales(null);
  };

  const handleCategoryClick = async (row) => {
    if (!hasValidCustomRange) return;
    setSelectedCategory(row);
    setCategoryItems([]);
    setCategoryItemsLoading(true);
    try {
      const res = await api.get("/reports/category-item-details", {
        params: {
          category_id: row.category_id,
          branch_id: selectedBranchId ?? undefined,
          mode: reportMode,
          from_date: reportMode === "custom" ? fromDate || undefined : undefined,
          to_date: reportMode === "custom" ? toDate || undefined : undefined,
        },
      });
      setCategoryItems(res?.data || []);
    } catch {
      setCategoryItems([]);
    } finally {
      setCategoryItemsLoading(false);
    }
  };

  const saveQuickExpense = async () => {
    if (expenseSaving) return;
    if (!expenseForm.amount || !expenseForm.category.trim()) {
      return Alert.alert("Validation", "Amount and category are required");
    }
    setExpenseSaving(true);
    try {
      await api.post("/expenses/", {
        expense_date: session?.app_date || new Date().toISOString().split("T")[0],
        amount: Number(expenseForm.amount),
        category: expenseForm.category.trim(),
        payment_mode: "cash",
        note: null,
        branch_id: branchId ?? null,
      });
      Alert.alert("Saved", "Expense recorded successfully");
      setExpenseForm({ amount: "", category: "" });
      loadStats();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to save expense");
    } finally {
      setExpenseSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator size="large" /></View>
      </SafeAreaView>
    );
  }

  const statCards = [
    { label: "Today's Bills", value: String(Number(stats?.today_bills || 0)), color: "#4f46e5" },
    { label: "Today's Sales", value: `₹${fmt(stats?.today_sales)}`, color: "#059669" },
    { label: "Today's Returns", value: String(Number(stats?.today_returns || 0)), color: "#dc2626" },
    { label: "Pending Dues", value: `₹${fmt(stats?.pending_dues)}`, color: "#d97706" },
  ];

  const categoryTotal = categorySales.reduce((s, r) => s + Number(r.total_sales || 0), 0);
  const branchTotal = branchSales.reduce((s, r) => s + Number(r.total_sales || 0), 0);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      >
        {/* Stat Cards */}
        <View style={styles.statGrid}>
          {statCards.map((s) => (
            <View key={s.label} style={styles.statCard}>
              <View style={[styles.statAccent, { backgroundColor: s.color }]} />
              <Text style={[styles.statValue, { color: s.color }]}>{stats === null ? "—" : s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Sales Filter */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sales Filter</Text>
          <View style={styles.modeRow}>
            {["today", "month", "custom"].map((mode) => (
              <Pressable key={mode} style={[styles.modeBtn, reportMode === mode && styles.modeBtnActive]} onPress={() => setReportMode(mode)}>
                <Text style={[styles.modeBtnText, reportMode === mode && styles.modeBtnTextActive]}>
                  {mode === "today" ? "Today" : mode === "month" ? "Month" : "Custom"}
                </Text>
              </Pressable>
            ))}
          </View>
          {reportMode === "custom" && (
            <View style={styles.dateRow}>
              <TextInput style={styles.dateInput} value={fromDate} onChangeText={setFromDate} placeholder="From YYYY-MM-DD" placeholderTextColor="#94a3b8" />
              <TextInput style={styles.dateInput} value={toDate} onChangeText={setToDate} placeholder="To YYYY-MM-DD" placeholderTextColor="#94a3b8" />
            </View>
          )}
          {!hasValidCustomRange && <Text style={styles.warnText}>Select both From and To dates.</Text>}
        </View>

        {/* Branch Sales (admin) */}
        {isAdmin && (
          <View style={styles.section}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>Branch Sales</Text>
              <Pressable style={[styles.allBtn, selectedBranchId == null && styles.allBtnActive]} onPress={handleAllBranchesClick}>
                <Text style={[styles.allBtnText, selectedBranchId == null && styles.allBtnTextActive]}>All</Text>
              </Pressable>
            </View>
            {branchSales.length === 0 ? (
              <Text style={styles.empty}>No data for selected range</Text>
            ) : (
              branchSales.map((row) => {
                const sel = String(row.branch_id) === String(selectedBranchId);
                const pct = branchTotal ? ((Number(row.total_sales || 0) / branchTotal) * 100).toFixed(0) : 0;
                return (
                  <Pressable key={row.branch_id} style={[styles.breakdownRow, sel && styles.breakdownRowSel]} onPress={() => handleBranchClick(row)}>
                    <Text style={styles.breakdownName} numberOfLines={1}>{row.branch_name || `Branch ${row.branch_id}`}</Text>
                    <Text style={styles.breakdownPct}>{pct}%</Text>
                    <Text style={styles.breakdownAmt}>₹{fmt(row.total_sales)}</Text>
                  </Pressable>
                );
              })
            )}
          </View>
        )}

        {/* Category Sales */}
        <View style={styles.section}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>Category Sales</Text>
            {isAdmin && <Text style={styles.branchTag}>{selectedBranchName}</Text>}
          </View>
          {categorySales.length === 0 ? (
            <Text style={styles.empty}>No data for selected range</Text>
          ) : (
            categorySales.map((row) => {
              const sel = String(row.category_id) === String(selectedCategory?.category_id);
              const pct = categoryTotal ? ((Number(row.total_sales || 0) / categoryTotal) * 100).toFixed(0) : 0;
              return (
                <Pressable key={row.category_id} style={[styles.breakdownRow, sel && styles.breakdownRowSel]} onPress={() => handleCategoryClick(row)}>
                  <Text style={styles.breakdownName} numberOfLines={1}>{row.category_name || "-"}</Text>
                  <Text style={styles.breakdownPct}>{pct}%</Text>
                  <Text style={styles.breakdownAmt}>₹{fmt(row.total_sales)}</Text>
                </Pressable>
              );
            })
          )}
          {selectedCategory && (
            <View style={styles.categoryDetail}>
              <View style={styles.rowBetween}>
                <Text style={styles.categoryDetailTitle}>{selectedCategory.category_name}</Text>
                <Pressable onPress={() => { setSelectedCategory(null); setCategoryItems([]); }}>
                  <Text style={styles.clearBtn}>Clear</Text>
                </Pressable>
              </View>
              {categoryItemsLoading ? (
                <ActivityIndicator color="#6366f1" />
              ) : categoryItems.length === 0 ? (
                <Text style={styles.empty}>No items found.</Text>
              ) : (
                categoryItems.map((item, idx) => (
                  <View key={`${item?.item_name || "item"}-${idx}`} style={styles.itemRow}>
                    <Text style={styles.itemName} numberOfLines={1}>{item?.item_name || "-"}</Text>
                    <Text style={styles.itemQty}>{Number(item?.total_qty || 0)}</Text>
                    <Text style={styles.itemAmt}>₹{fmt(item?.total_sales ?? item?.total_amount)}</Text>
                  </View>
                ))
              )}
            </View>
          )}
        </View>

        {/* Quick Expense */}
        {canExpenseWrite && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quick Expense</Text>
            <Text style={styles.fieldLabel}>Amount</Text>
            <TextInput
              style={styles.textInput}
              value={expenseForm.amount}
              onChangeText={(t) => setExpenseForm((f) => ({ ...f, amount: t }))}
              keyboardType="numeric"
              placeholder="0.00"
              placeholderTextColor="#94a3b8"
            />
            <Text style={styles.fieldLabel}>Category</Text>
            <TextInput
              style={styles.textInput}
              value={expenseForm.category}
              onChangeText={(t) => setExpenseForm((f) => ({ ...f, category: t }))}
              placeholder="e.g. Rent, Utilities"
              placeholderTextColor="#94a3b8"
            />
            <Pressable style={[styles.saveBtn, expenseSaving && styles.btnDisabled]} disabled={expenseSaving} onPress={saveQuickExpense}>
              <Text style={styles.saveBtnText}>{expenseSaving ? "Saving…" : "Save Expense"}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function fmt(n) {
  const num = Number(n ?? 0);
  return num.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f6fb" },
  scroll: { padding: 14, gap: 12, paddingBottom: 28 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: {
    width: "47.5%", backgroundColor: "#ffffff", borderRadius: 18, padding: 14, paddingLeft: 18,
    borderWidth: 1.5, borderColor: "#e4e9f2", overflow: "hidden",
    shadowColor: "#0a0f1e", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
  statAccent: { position: "absolute", top: 0, left: 0, bottom: 0, width: 4, borderTopLeftRadius: 18, borderBottomLeftRadius: 18 },
  statValue: { fontSize: 20, fontWeight: "900", letterSpacing: -0.5 },
  statLabel: { color: "#9ca3af", marginTop: 3, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  section: {
    backgroundColor: "#ffffff", borderRadius: 18, padding: 14, borderWidth: 1.5, borderColor: "#e4e9f2", gap: 10,
    shadowColor: "#0a0f1e", shadowOpacity: 0.07, shadowRadius: 12, elevation: 4,
  },
  sectionTitle: { fontWeight: "800", fontSize: 12, color: "#0a0f1e", textTransform: "uppercase", letterSpacing: 0.5 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modeRow: { flexDirection: "row", gap: 6, backgroundColor: "#f4f6fb", padding: 4, borderRadius: 12 },
  modeBtn: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 9 },
  modeBtnActive: { backgroundColor: "#fff" },
  modeBtnText: { fontSize: 11, fontWeight: "800", color: "#9ca3af" },
  modeBtnTextActive: { color: "#4f46e5" },
  dateRow: { flexDirection: "row", gap: 8 },
  dateInput: {
    flex: 1, borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 9, backgroundColor: "#f8f9fd", fontSize: 12, color: "#0a0f1e",
  },
  warnText: { color: "#b45309", fontSize: 11, fontWeight: "700", backgroundColor: "#fffbeb", padding: 8, borderRadius: 10 },
  allBtn: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  allBtnActive: { backgroundColor: "#4f46e5", borderColor: "#4f46e5" },
  allBtnText: { fontSize: 10, fontWeight: "800", color: "#4b5563" },
  allBtnTextActive: { color: "#fff" },
  branchTag: { fontSize: 10, fontWeight: "700", color: "#4f46e5", backgroundColor: "#eef2ff", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  breakdownRow: {
    flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 10,
    borderRadius: 12, borderWidth: 1, borderColor: "#f1f3f9",
  },
  breakdownRowSel: { borderColor: "#c7d2fe", backgroundColor: "#eef2ff" },
  breakdownName: { flex: 1, fontSize: 12, fontWeight: "700", color: "#374151" },
  breakdownPct: { fontSize: 10, color: "#9ca3af", fontWeight: "700" },
  breakdownAmt: { fontSize: 12, fontWeight: "800", color: "#0a0f1e" },
  empty: { color: "#9ca3af", fontWeight: "600", fontSize: 12, paddingVertical: 8, textAlign: "center" },
  categoryDetail: { borderTopWidth: 1, borderTopColor: "#f1f3f9", paddingTop: 10, gap: 6 },
  categoryDetailTitle: { fontSize: 12, fontWeight: "800", color: "#0a0f1e" },
  clearBtn: { color: "#dc2626", fontSize: 11, fontWeight: "700" },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 5 },
  itemName: { flex: 1, fontSize: 12, color: "#4b5563", fontWeight: "600" },
  itemQty: { fontSize: 12, fontWeight: "800", color: "#0a0f1e" },
  itemAmt: { fontSize: 12, color: "#9ca3af", width: 70, textAlign: "right" },
  fieldLabel: { fontSize: 10, color: "#9ca3af", fontWeight: "700", textTransform: "uppercase" },
  textInput: {
    borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: "#f8f9fd", fontSize: 13, color: "#0a0f1e",
  },
  saveBtn: { backgroundColor: "#059669", borderRadius: 14, paddingVertical: 13, alignItems: "center", marginTop: 4 },
  saveBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  btnDisabled: { opacity: 0.6 },
});
