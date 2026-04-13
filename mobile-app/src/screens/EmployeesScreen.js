import { useCallback, useEffect, useState } from "react";
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

const WAGE_TYPES = ["DAILY", "MONTHLY", "ON_DEMAND"];
const fmt = (n) => `₹${Number(n || 0).toFixed(2)}`;

export default function EmployeesScreen() {
  const { session } = useAuth();
  const isAdmin = String(session?.role_name || session?.role || "").toLowerCase() === "admin";

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ACTIVE");

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    employee_name: "",
    mobile: "",
    designation: "",
    wage_type: "DAILY",
    daily_wage: "",
    monthly_wage: "",
  });

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await api.get("/employees", { params: { status: statusFilter } });
      setEmployees(res?.data || []);
    } catch (err) {
      if (!silent) Alert.alert("Error", err?.response?.data?.detail || "Failed to load employees");
      setEmployees([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const filtered = employees.filter((e) =>
    String(e.employee_name || "").toLowerCase().includes(search.toLowerCase())
  );

  const saveEmployee = async () => {
    if (!form.employee_name.trim()) return Alert.alert("Validation", "Employee name required");
    setSaving(true);
    try {
      await api.post("/employees", {
        employee_name: form.employee_name.trim(),
        mobile: form.mobile.trim() || null,
        designation: form.designation.trim() || null,
        wage_type: form.wage_type,
        daily_wage: Number(form.daily_wage || 0),
        monthly_wage: Number(form.monthly_wage || 0),
      });
      setShowForm(false);
      setForm({ employee_name: "", mobile: "", designation: "", wage_type: "DAILY", daily_wage: "", monthly_wage: "" });
      await load(true);
      Alert.alert("Saved", "Employee added successfully.");
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to save employee");
    } finally {
      setSaving(false);
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
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerBar}>
        <TextInput
          style={[styles.searchInput, { flex: 1 }]}
          placeholder="Search employee…"
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
        />
        {isAdmin && (
          <Pressable style={styles.addBtn} onPress={() => setShowForm(true)}>
            <Text style={styles.addBtnText}>+ Add</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.filterRow}>
        {["ACTIVE", "INACTIVE"].map((s) => (
          <Pressable
            key={s}
            style={[styles.chip, statusFilter === s && styles.chipActive]}
            onPress={() => setStatusFilter(s)}
          >
            <Text style={[styles.chipText, statusFilter === s && styles.chipTextActive]}>{s}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#0b57d0" /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(e) => String(e.employee_id)}
          renderItem={renderEmployee}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={["#0b57d0"]} />
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
            <Text style={styles.modalTitle}>Add Employee</Text>

            {[
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

            <View style={styles.modalBtns}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowForm(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.saveBtn, saving && styles.btnDisabled]}
                disabled={saving}
                onPress={saveEmployee}
              >
                <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f3f6ff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerBar: { padding: 12, flexDirection: "row", gap: 8, alignItems: "center" },
  searchInput: {
    borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10,
    backgroundColor: "#fff", paddingHorizontal: 12, paddingVertical: 10, color: "#0b1220",
  },
  addBtn: {
    backgroundColor: "#0b57d0", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
  },
  addBtnText: { color: "#fff", fontWeight: "700" },
  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingBottom: 8 },
  chip: {
    borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 999,
    paddingHorizontal: 14, paddingVertical: 6, backgroundColor: "#fff",
  },
  chipActive: { backgroundColor: "#0b57d0", borderColor: "#0b57d0" },
  chipText: { color: "#334155", fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  list: { padding: 12, gap: 8, paddingTop: 0, paddingBottom: 24 },
  card: {
    backgroundColor: "#fff", borderRadius: 12, borderWidth: 1,
    borderColor: "#d9e3ff", padding: 12,
  },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: "#d7e4ff",
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { color: "#0b57d0", fontSize: 18, fontWeight: "800" },
  empName: { fontWeight: "800", color: "#0b1220", fontSize: 14 },
  empMeta: { color: "#64748b", fontSize: 12, marginTop: 1 },
  wageWrap: { alignItems: "flex-end" },
  wageAmt: { fontSize: 15, fontWeight: "800", color: "#059669" },
  wageLabel: { fontSize: 11, color: "#64748b" },
  emptyWrap: { alignItems: "center", paddingTop: 60, gap: 8 },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { color: "#64748b", fontSize: 16, fontWeight: "700" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(2,6,23,0.5)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, gap: 8, maxHeight: "90%",
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: "#0b1220", marginBottom: 4 },
  label: { fontSize: 12, fontWeight: "700", color: "#334155" },
  input: {
    borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10, backgroundColor: "#ffffff",
    paddingHorizontal: 12, paddingVertical: 10, color: "#0b1220",
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 8 },
  cancelBtn: {
    flex: 1, backgroundColor: "#d9e3ff", borderRadius: 10, paddingVertical: 12, alignItems: "center",
  },
  cancelBtnText: { color: "#334155", fontWeight: "700" },
  saveBtn: {
    flex: 2, backgroundColor: "#0b57d0", borderRadius: 10, paddingVertical: 12, alignItems: "center",
  },
  saveBtnText: { color: "#fff", fontWeight: "800" },
  btnDisabled: { opacity: 0.5 },
});
