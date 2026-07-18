import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
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
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

const WAGE_TYPES = ["DAILY", "MONTHLY", "ON_DEMAND"];
const PAYMENT_MODES = ["CASH", "UPI", "BANK", "CARD", "OTHER"];
const fmt = (n) => `₹${Number(n || 0).toFixed(2)}`;

const todayIso = () => new Date().toISOString().slice(0, 10);

const EMPTY_FORM = {
  employee_code: "",
  employee_name: "",
  mobile: "",
  designation: "",
  wage_type: "DAILY",
  daily_wage: "",
  monthly_wage: "",
  join_date: todayIso(),
  notes: "",
  active: true,
};

export default function EmployeesScreen({ route, navigation }) {
  const { session } = useAuth();
  const { theme } = useTheme();
  const role = String(session?.role_name || session?.role || "").toLowerCase();
  const canManage = role === "admin" || role === "manager";

  const requestedTab = String(route?.params?.initialTab || "employees").toLowerCase();
  const [activeTab, setActiveTab] = useState(requestedTab === "settlements" ? "settlements" : "employees");

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const [asOfDate, setAsOfDate] = useState(session?.app_date || new Date().toISOString().slice(0, 10));
  const [dueRows, setDueRows] = useState([]);
  const [branches, setBranches] = useState([]);
  const isAdmin = role === "admin";
  const [branchId, setBranchId] = useState(session?.branch_id || null);
  const [wageSummary, setWageSummary] = useState({ employee_count: 0, earned_till_as_of: 0, paid_till_as_of: 0, due_till_as_of: 0 });
  const [settleLoading, setSettleLoading] = useState(false);
  const [selectedSettlement, setSelectedSettlement] = useState(null);
  const [settlementSummary, setSettlementSummary] = useState(null);
  const [payments, setPayments] = useState([]);
  const [paymentForm, setPaymentForm] = useState({ amount: "", payment_mode: "CASH", notes: "" });
  const [settling, setSettling] = useState(false);

  useEffect(() => {
    navigation?.setOptions({ title: "Employee Management" });
  }, [navigation]);

  useEffect(() => {
    if (requestedTab === "settlements") setActiveTab("settlements");
  }, [requestedTab]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const includeInactive = statusFilter === "all" || statusFilter === "inactive";
      const res = await api.get("/employees", { params: { include_inactive: includeInactive } });
      const rows = Array.isArray(res?.data) ? res.data : [];
      const filteredRows =
        statusFilter === "active" ? rows.filter((x) => x?.active !== false)
        : statusFilter === "inactive" ? rows.filter((x) => x?.active === false)
        : rows;
      setEmployees(filteredRows);
    } catch (err) {
      if (!silent) Alert.alert("Error", err?.response?.data?.detail || "Failed to load employees");
      setEmployees([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!isAdmin) return;
    api.get("/branch/active").then((res) => setBranches(res?.data || [])).catch(() => setBranches([]));
  }, [isAdmin]);

  const loadWageSummary = useCallback(async () => {
    try {
      const res = await api.get("/employees/wages/summary", {
        params: { branch_id: isAdmin ? (branchId || undefined) : undefined, as_of_date: asOfDate },
      });
      setWageSummary(res?.data || { employee_count: 0, earned_till_as_of: 0, paid_till_as_of: 0, due_till_as_of: 0 });
    } catch {
      setWageSummary({ employee_count: 0, earned_till_as_of: 0, paid_till_as_of: 0, due_till_as_of: 0 });
    }
  }, [isAdmin, branchId, asOfDate]);

  useEffect(() => { loadWageSummary(); }, [loadWageSummary]);

  const loadSettlements = useCallback(async () => {
    setSettleLoading(true);
    try {
      const res = await api.get("/employees/wages/due", {
        params: { as_of_date: asOfDate, only_due: false, include_inactive: true },
      });
      setDueRows(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load settlements");
      setDueRows([]);
    } finally {
      setSettleLoading(false);
    }
  }, [asOfDate]);

  useEffect(() => {
    if (activeTab === "settlements") loadSettlements();
  }, [activeTab, loadSettlements]);

  const filtered = employees.filter((e) =>
    String(e.employee_name || "").toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (emp) => {
    setEditingId(emp?.employee_id || null);
    setForm({
      employee_code: String(emp?.employee_code || ""),
      employee_name: String(emp?.employee_name || ""),
      mobile: String(emp?.mobile || ""),
      designation: String(emp?.designation || ""),
      wage_type: String(emp?.wage_type || "DAILY"),
      daily_wage: String(emp?.daily_wage || ""),
      monthly_wage: String(emp?.monthly_wage || ""),
      join_date: String(emp?.join_date || todayIso()),
      notes: String(emp?.notes || ""),
      active: emp?.active !== false,
    });
    setShowForm(true);
  };

  const saveEmployee = async () => {
    if (!form.employee_name.trim()) return Alert.alert("Validation", "Employee name required");
    setSaving(true);
    try {
      const payload = {
        employee_code: form.employee_code.trim() || null,
        employee_name: form.employee_name.trim(),
        mobile: form.mobile.trim() || null,
        designation: form.designation.trim() || null,
        wage_type: form.wage_type,
        daily_wage: Number(form.daily_wage || 0),
        monthly_wage: Number(form.monthly_wage || 0),
        join_date: form.join_date || null,
        notes: form.notes.trim() || null,
        active: Boolean(form.active),
      };
      if (isAdmin && branchId) payload.branch_id = branchId;
      if (editingId) await api.put(`/employees/${editingId}`, payload);
      else await api.post("/employees", payload);
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      await load(true);
      await loadWageSummary();
      Alert.alert("Saved", editingId ? "Employee updated successfully." : "Employee added successfully.");
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to save employee");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (emp) => {
    if (!canManage) return;
    const isActive = emp?.active !== false;
    Alert.alert(
      isActive ? "Deactivate Employee" : "Restore Employee",
      isActive ? "Deactivate this employee?" : "Restore this employee?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: isActive ? "Deactivate" : "Restore",
          style: isActive ? "destructive" : "default",
          onPress: async () => {
            try {
              if (isActive) await api.delete(`/employees/${emp.employee_id}`);
              else await api.post(`/employees/${emp.employee_id}/restore`);
              await load(true);
              await loadWageSummary();
              if (activeTab === "settlements") await loadSettlements();
            } catch (err) {
              Alert.alert("Error", err?.response?.data?.detail || "Failed to update employee status");
            }
          },
        },
      ]
    );
  };

  const settlementRows = useMemo(
    () => dueRows.filter((r) => String(r?.employee_name || "").toLowerCase().includes(search.toLowerCase())),
    [dueRows, search]
  );

  const openSettlement = async (row) => {
    setSelectedSettlement(row);
    setSettlementSummary(null);
    setPayments([]);
    setPaymentForm((p) => ({ ...p, amount: String(Math.max(0, Number(row?.due_till_as_of || 0))) }));
    try {
      const [sumRes, payRes] = await Promise.all([
        api.get(`/employees/${row.employee_id}/wage-summary`, {
          params: { to_date: asOfDate, as_of_date: asOfDate },
        }),
        api.get(`/employees/${row.employee_id}/payments`),
      ]);
      setSettlementSummary(sumRes?.data || null);
      setPayments(Array.isArray(payRes?.data) ? payRes.data : []);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load settlement details");
    }
  };

  const makeSettlement = async () => {
    if (!selectedSettlement?.employee_id) return;
    const amount = Number(paymentForm.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert("Validation", "Enter valid settlement amount");
      return;
    }
    setSettling(true);
    try {
      await api.post(`/employees/${selectedSettlement.employee_id}/payments`, {
        amount,
        payment_mode: paymentForm.payment_mode,
        payment_date: asOfDate,
        notes: paymentForm.notes || null,
      });
      await loadSettlements();
      await openSettlement(selectedSettlement);
      Alert.alert("Saved", "Payment settlement recorded.");
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to settle payment");
    } finally {
      setSettling(false);
    }
  };

  const renderEmployee = ({ item: emp }) => (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{String(emp.employee_name || "?")[0].toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.empName}>{emp.employee_name}</Text>
          <Text style={styles.empMeta}>
            {emp.designation || "No designation"} · {emp.wage_type}
          </Text>
          {emp.mobile && <Text style={styles.empMeta}>📞 {emp.mobile}</Text>}
        </View>
        <View style={styles.wageWrap}>
          <Text style={styles.wageAmt}>
            {fmt(emp.wage_type === "MONTHLY" ? emp.monthly_wage : emp.daily_wage)}
          </Text>
          <Text style={styles.wageLabel}>
            {emp.wage_type === "MONTHLY" ? "/mo" : "/day"}
          </Text>
        </View>
      </View>
      {canManage && (
        <View style={styles.actionsRow}>
          <Pressable style={styles.actionBtn} onPress={() => openEdit(emp)}>
            <Text style={styles.actionBtnText}>Edit</Text>
          </Pressable>
          <Pressable style={[styles.actionBtn, emp?.active === false ? styles.restoreBtn : styles.deactivateBtn]} onPress={() => toggleActive(emp)}>
            <Text style={[styles.actionBtnText, { color: "#fff" }]}>{emp?.active === false ? "Restore" : "Deactivate"}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  const renderSettlement = ({ item: row }) => (
    <Pressable style={styles.card} onPress={() => openSettlement(row)}>
      <View style={styles.cardRow}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{String(row?.employee_name || "?")[0].toUpperCase()}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.empName}>{row?.employee_name}</Text>
          <Text style={styles.empMeta}>Earned: {fmt(row?.earned_till_as_of)} · Paid: {fmt(row?.paid_till_as_of)}</Text>
        </View>
        <View style={styles.wageWrap}>
          <Text style={[styles.wageAmt, { color: Number(row?.due_till_as_of || 0) > 0 ? "#dc2626" : "#059669" }]}>{fmt(row?.due_till_as_of)}</Text>
          <Text style={styles.wageLabel}>Due</Text>
        </View>
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}> 
      <View style={styles.tabRow}>
        <Pressable style={[styles.tabBtn, activeTab === "employees" && styles.tabBtnActive]} onPress={() => setActiveTab("employees")}>
          <Text style={[styles.tabTxt, activeTab === "employees" && styles.tabTxtActive]}>Employees</Text>
        </Pressable>
        <Pressable style={[styles.tabBtn, activeTab === "settlements" && styles.tabBtnActive]} onPress={() => setActiveTab("settlements")}>
          <Text style={[styles.tabTxt, activeTab === "settlements" && styles.tabTxtActive]}>Settlements</Text>
        </Pressable>
        <Pressable style={styles.tabBtn} onPress={() => navigation.navigate("EmployeeAttendance") }>
          <Text style={styles.tabTxt}>Attendance</Text>
        </Pressable>
      </View>

      {activeTab === "employees" && (
        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Active</Text>
            <Text style={styles.kpiValue}>{employees.filter((e) => e.active !== false).length}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Total Due</Text>
            <Text style={[styles.kpiValue, { color: "#dc2626" }]}>{fmt(wageSummary.due_till_as_of)}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Total Earned</Text>
            <Text style={styles.kpiValue}>{fmt(wageSummary.earned_till_as_of)}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Total Paid</Text>
            <Text style={styles.kpiValue}>{fmt(wageSummary.paid_till_as_of)}</Text>
          </View>
        </View>
      )}

      {isAdmin && branches.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingLeft: 14 }} contentContainerStyle={{ gap: 8, paddingRight: 14 }}>
          {branches.map((b) => (
            <Pressable
              key={b.branch_id}
              style={[styles.chip, branchId === b.branch_id && styles.chipActive]}
              onPress={() => setBranchId(b.branch_id)}
            >
              <Text style={[styles.chipText, branchId === b.branch_id && styles.chipTextActive]}>{b.branch_name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <View style={styles.headerBar}>
        {activeTab === "settlements" ? (
          <TextInput
            style={styles.dateInput}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#94a3b8"
            value={asOfDate}
            onChangeText={setAsOfDate}
          />
        ) : null}
        <TextInput
          style={[styles.searchInput, { flex: 1 }]}
          placeholder={activeTab === "settlements" ? "Search settlement…" : "Search employee…"}
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
        />
        {canManage && activeTab === "employees" && (
          <Pressable style={styles.addBtn} onPress={openCreate}>
            <Text style={styles.addBtnText}>+ Add</Text>
          </Pressable>
        )}
        {activeTab === "settlements" && (
          <Pressable style={styles.addBtn} onPress={loadSettlements}>
            <Text style={styles.addBtnText}>Refresh</Text>
          </Pressable>
        )}
      </View>

      {activeTab === "employees" && (
        <View style={styles.filterRow}>
          {[{ k: "active", t: "ACTIVE" }, { k: "inactive", t: "INACTIVE" }, { k: "all", t: "ALL" }].map((s) => (
            <Pressable
              key={s.k}
              style={[styles.chip, statusFilter === s.k && styles.chipActive]}
              onPress={() => setStatusFilter(s.k)}
            >
              <Text style={[styles.chipText, statusFilter === s.k && styles.chipTextActive]}>{s.t}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>
      ) : activeTab === "settlements" ? (
        settleLoading ? (
          <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>
        ) : (
          <FlatList
            data={settlementRows}
            keyExtractor={(e) => String(e.employee_id)}
            renderItem={renderSettlement}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadSettlements} colors={["#2563eb"]} />}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyIcon}>💵</Text>
                <Text style={styles.emptyTitle}>No wage rows found</Text>
              </View>
            }
          />
        )
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(e) => String(e.employee_id)}
          renderItem={renderEmployee}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={["#2563eb"]} />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyIcon}>👤</Text>
              <Text style={styles.emptyTitle}>No employees found</Text>
            </View>
          }
        />
      )}

      {/* Add Employee Modal */}
      <Modal transparent visible={showForm} animationType="slide" onRequestClose={() => setShowForm(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editingId ? "Edit Employee" : "Add Employee"}</Text>

            {[
              { key: "employee_code", label: "Employee Code", placeholder: "e.g. EMP001" },
              { key: "employee_name", label: "Full Name *", placeholder: "Employee name" },
              { key: "mobile", label: "Mobile", placeholder: "10-digit mobile", keyboardType: "phone-pad" },
              { key: "designation", label: "Designation", placeholder: "e.g. Cashier" },
            ].map((f) => (
              <View key={f.key}>
                <Text style={styles.label}>{f.label}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={f.placeholder}
                  placeholderTextColor="#94a3b8"
                  keyboardType={f.keyboardType || "default"}
                  value={form[f.key]}
                  onChangeText={(v) => setForm((p) => ({ ...p, [f.key]: v }))}
                />
              </View>
            ))}

            <Text style={styles.label}>Wage Type</Text>
            <View style={styles.chipRow}>
              {WAGE_TYPES.map((w) => (
                <Pressable
                  key={w}
                  style={[styles.chip, form.wage_type === w && styles.chipActive]}
                  onPress={() => setForm((p) => ({ ...p, wage_type: w }))}
                >
                  <Text style={[styles.chipText, form.wage_type === w && styles.chipTextActive]}>{w}</Text>
                </Pressable>
              ))}
            </View>

            {form.wage_type === "DAILY" && (
              <>
                <Text style={styles.label}>Daily Wage (₹)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor="#94a3b8"
                  value={form.daily_wage}
                  onChangeText={(v) => setForm((p) => ({ ...p, daily_wage: v.replace(/[^\d.]/g, "") }))}
                />
              </>
            )}
            {form.wage_type === "MONTHLY" && (
              <>
                <Text style={styles.label}>Monthly Wage (₹)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor="#94a3b8"
                  value={form.monthly_wage}
                  onChangeText={(v) => setForm((p) => ({ ...p, monthly_wage: v.replace(/[^\d.]/g, "") }))}
                />
              </>
            )}

            <Text style={styles.label}>Join Date</Text>
            <TextInput
              style={styles.input}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#94a3b8"
              value={form.join_date}
              onChangeText={(v) => setForm((p) => ({ ...p, join_date: v }))}
            />
            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={styles.input}
              placeholder="Optional"
              placeholderTextColor="#94a3b8"
              value={form.notes}
              onChangeText={(v) => setForm((p) => ({ ...p, notes: v }))}
            />
            <Pressable style={styles.activeRow} onPress={() => setForm((p) => ({ ...p, active: !p.active }))}>
              <Text style={styles.activeLabel}>Active</Text>
              <View style={[styles.toggleTrack, form.active && styles.toggleTrackOn]}>
                <View style={[styles.toggleThumb, form.active && styles.toggleThumbOn]} />
              </View>
            </Pressable>

            <View style={styles.modalBtns}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowForm(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.saveBtn, saving && styles.btnDisabled]}
                disabled={saving}
                onPress={saveEmployee}
              >
                <Text style={styles.saveBtnText}>{saving ? "Saving…" : editingId ? "Update" : "Save"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={Boolean(selectedSettlement)} animationType="slide" onRequestClose={() => setSelectedSettlement(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Employee Settlement</Text>
            <Text style={styles.label}>{selectedSettlement?.employee_name || ""}</Text>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Earned</Text>
              <Text style={styles.summaryValue}>{fmt(settlementSummary?.earned_till_as_of ?? selectedSettlement?.earned_till_as_of)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Paid</Text>
              <Text style={styles.summaryValue}>{fmt(settlementSummary?.paid_till_as_of ?? selectedSettlement?.paid_till_as_of)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Due</Text>
              <Text style={[styles.summaryValue, { color: theme.danger }]}>{fmt(settlementSummary?.due_till_as_of ?? selectedSettlement?.due_till_as_of)}</Text>
            </View>

            <Text style={styles.label}>Settle Amount</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={paymentForm.amount}
              placeholder="0"
              placeholderTextColor="#94a3b8"
              onChangeText={(v) => setPaymentForm((p) => ({ ...p, amount: v.replace(/[^\d.]/g, "") }))}
            />
            <Text style={styles.label}>Payment Mode</Text>
            <View style={styles.chipRow}>
              {PAYMENT_MODES.map((m) => (
                <Pressable key={m} style={[styles.chip, paymentForm.payment_mode === m && styles.chipActive]} onPress={() => setPaymentForm((p) => ({ ...p, payment_mode: m }))}>
                  <Text style={[styles.chipText, paymentForm.payment_mode === m && styles.chipTextActive]}>{m}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={styles.input}
              value={paymentForm.notes}
              placeholder="Optional"
              placeholderTextColor="#94a3b8"
              onChangeText={(v) => setPaymentForm((p) => ({ ...p, notes: v }))}
            />

            <View style={styles.modalBtns}>
              <Pressable style={styles.cancelBtn} onPress={() => setSelectedSettlement(null)}>
                <Text style={styles.cancelBtnText}>Close</Text>
              </Pressable>
              <Pressable style={[styles.saveBtn, settling && styles.btnDisabled]} onPress={makeSettlement} disabled={settling}>
                <Text style={styles.saveBtnText}>{settling ? "Saving…" : "Settle"}</Text>
              </Pressable>
            </View>

            {payments.length > 0 && (
              <View style={{ marginTop: 8 }}>
                <Text style={styles.label}>Recent Payments</Text>
                <ScrollView style={{ maxHeight: 160 }}>
                  {payments.slice(0, 12).map((p) => (
                    <View key={String(p.payment_id)} style={styles.paymentRow}>
                      <Text style={styles.paymentDate}>{String(p.payment_date || "")}</Text>
                      <Text style={styles.paymentMode}>{String(p.payment_mode || "")}</Text>
                      <Text style={styles.paymentAmount}>{fmt(p.amount)}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f6fb" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  tabRow: { flexDirection: "row", gap: 8, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 4 },
  tabBtn: {
    borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 999, paddingHorizontal: 14,
    paddingVertical: 8, backgroundColor: "#ffffff",
  },
  tabBtnActive: { backgroundColor: "#6366f1", borderColor: "#2563eb" },
  tabTxt: { color: "#4b5563", fontSize: 12, fontWeight: "700" },
  tabTxtActive: { color: "#fff" },
  kpiRow: { flexDirection: "row", gap: 8, paddingHorizontal: 14, paddingTop: 10, flexWrap: "wrap" },
  kpiCard: { flexGrow: 1, minWidth: "22%", backgroundColor: "#fff", borderRadius: 12, borderWidth: 1.5, borderColor: "#e4e9f2", paddingVertical: 10, paddingHorizontal: 8, alignItems: "center" },
  kpiLabel: { fontSize: 9, fontWeight: "700", color: "#9ca3af", textTransform: "uppercase", textAlign: "center" },
  kpiValue: { fontSize: 14, fontWeight: "900", color: "#0a0f1e", marginTop: 2 },
  activeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginTop: 4 },
  activeLabel: { fontSize: 13, fontWeight: "600", color: "#0a0f1e" },
  toggleTrack: { width: 40, height: 22, borderRadius: 11, backgroundColor: "#e2e8f0", padding: 2, justifyContent: "center" },
  toggleTrackOn: { backgroundColor: "#6366f1" },
  toggleThumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: "#fff" },
  toggleThumbOn: { transform: [{ translateX: 18 }] },
  headerBar: { paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", gap: 8, alignItems: "center" },
  dateInput: {
    borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12,
    backgroundColor: "#ffffff", paddingHorizontal: 12, paddingVertical: 10, color: "#0a0f1e", width: 126,
  },
  searchInput: {
    borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12,
    backgroundColor: "#ffffff", paddingHorizontal: 13, paddingVertical: 10, color: "#0a0f1e",
    shadowColor: "#0a0f1e", shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  addBtn: {
    backgroundColor: "#6366f1", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10,
    shadowColor: "#2563eb", shadowOpacity: 0.35, shadowRadius: 8, elevation: 4,
  },
  addBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 14, paddingBottom: 10 },
  chip: {
    borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 999,
    paddingHorizontal: 14, paddingVertical: 7, backgroundColor: "#f8f9fd",
  },
  chipActive: { backgroundColor: "#6366f1", borderColor: "#2563eb" },
  chipText: { color: "#4b5563", fontSize: 12, fontWeight: "700" },
  chipTextActive: { color: "#fff" },
  list: { padding: 14, gap: 10, paddingTop: 0, paddingBottom: 28 },
  card: {
    backgroundColor: "#ffffff", borderRadius: 18, borderWidth: 1.5,
    borderColor: "#e4e9f2", padding: 14,
    shadowColor: "#0a0f1e", shadowOpacity: 0.07, shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: "#eef2ff",
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#e4e9f2",
  },
  avatarText: { color: "#6366f1", fontSize: 18, fontWeight: "900" },
  empName: { fontWeight: "800", color: "#0a0f1e", fontSize: 14 },
  empMeta: { color: "#9ca3af", fontSize: 12, marginTop: 2 },
  wageWrap: { alignItems: "flex-end" },
  wageAmt: { fontSize: 16, fontWeight: "900", color: "#10b981" },
  wageLabel: { fontSize: 11, color: "#9ca3af", fontWeight: "700", textTransform: "uppercase" },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  actionBtn: {
    flex: 1, borderRadius: 10, paddingVertical: 9, alignItems: "center",
    backgroundColor: "#f4f6fb", borderWidth: 1.5, borderColor: "#e4e9f2",
  },
  actionBtnText: { fontSize: 12, fontWeight: "700", color: "#4b5563" },
  deactivateBtn: { backgroundColor: "#ef4444", borderColor: "#dc2626" },
  restoreBtn: { backgroundColor: "#6366f1", borderColor: "#2563eb" },
  emptyWrap: { alignItems: "center", paddingTop: 64, gap: 10 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { color: "#9ca3af", fontSize: 16, fontWeight: "700" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(2,6,23,0.55)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: "#ffffff", borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 22, gap: 10, maxHeight: "92%",
    shadowColor: "#0a0f1e", shadowOpacity: 0.2, shadowRadius: 24, elevation: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: "900", color: "#0a0f1e", marginBottom: 4, letterSpacing: -0.3 },
  label: { fontSize: 11, fontWeight: "700", color: "#4b5563", textTransform: "uppercase", letterSpacing: 0.5 },
  input: {
    borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12, backgroundColor: "#f8f9fd",
    paddingHorizontal: 13, paddingVertical: 12, color: "#0a0f1e", fontSize: 14,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 8 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#e4e9f2" },
  summaryLabel: { fontSize: 12, fontWeight: "700", color: "#4b5563" },
  summaryValue: { fontSize: 13, fontWeight: "800", color: "#0a0f1e" },
  paymentRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, marginTop: 6,
    backgroundColor: "#f8f9fd",
  },
  paymentDate: { fontSize: 11, color: "#4b5563", width: 90 },
  paymentMode: { fontSize: 11, color: "#0a0f1e", fontWeight: "700", flex: 1, textAlign: "center" },
  paymentAmount: { fontSize: 12, color: "#10b981", fontWeight: "800", width: 80, textAlign: "right" },
  cancelBtn: {
    flex: 1, backgroundColor: "#f4f6fb", borderRadius: 14, paddingVertical: 13,
    alignItems: "center", borderWidth: 1.5, borderColor: "#e4e9f2",
  },
  cancelBtnText: { color: "#4b5563", fontWeight: "700" },
  saveBtn: {
    flex: 2, backgroundColor: "#6366f1", borderRadius: 14, paddingVertical: 13, alignItems: "center",
    shadowColor: "#2563eb", shadowOpacity: 0.35, shadowRadius: 10, elevation: 5,
  },
  saveBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
});
