import { useCallback, useEffect, useMemo, useState } from "react";
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


const STATUSES = ["PRESENT", "ABSENT", "HALF_DAY", "LEAVE"];

const STATUS_COLOR = {
  PRESENT: "#059669",
  ABSENT: "#dc2626",
  HALF_DAY: "#d97706",
  LEAVE: "#7c3aed",
};

const fmt = (n) => `₹${Number(n || 0).toFixed(2)}`;

export default function EmployeeAttendanceScreen() {
  const { theme } = useTheme();
  const { session } = useAuth();
  const [attendanceDate, setAttendanceDate] = useState(session?.app_date || new Date().toISOString().split("T")[0]);
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState({}); // employee_id -> {status, worked_units, wage}
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/shop/details")
      .then((res) => {
        if (res?.data?.app_date) setAttendanceDate(res.data.app_date);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/employees");
      const rows = res?.data || [];
      setEmployees(rows);
      const init = {};
      rows.forEach((emp) => {
        init[emp.employee_id] = {
          status: "PRESENT",
          worked_units: "1",
          wage: String(emp.daily_wage || 0),
        };
      });
      setAttendance(init);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load employees");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setField = (empId, field, value) => {
    setAttendance((p) => ({
      ...p,
      [empId]: { ...(p[empId] || {}), [field]: value },
    }));
  };

  const filtered = useMemo(
    () => employees.filter((e) => String(e.employee_name || "").toLowerCase().includes(search.toLowerCase())),
    [employees, search]
  );

  const summary = useMemo(() => {
    let present = 0, absent = 0, half = 0, leave = 0, totalPayroll = 0;
    Object.values(attendance).forEach((row) => {
      if (row.status === "PRESENT") present++;
      else if (row.status === "ABSENT") absent++;
      else if (row.status === "HALF_DAY") half++;
      else if (row.status === "LEAVE") leave++;
      if (row.status !== "ABSENT") {
        totalPayroll += Number(row.wage || 0) * Number(row.worked_units || 1);
      }
    });
    return { present, absent, half, leave, totalPayroll };
  }, [attendance]);

  const payableFor = (row) => (row.status === "ABSENT" ? 0 : Number(row.wage || 0) * Number(row.worked_units || 1));

  const saveAttendance = async () => {
    setSaving(true);
    try {
      const requests = filtered.map((emp) => {
        const row = attendance[emp.employee_id] || { status: "PRESENT", worked_units: 1, wage: 0 };
        return api.post(`/employees/${emp.employee_id}/attendance`, {
          attendance_date: attendanceDate,
          status: row.status,
          worked_units: Number(row.worked_units || 1),
          wage_amount: row.status === "ABSENT" ? 0 : Number(row.wage || 0) * Number(row.worked_units || 1),
        });
      });
      await Promise.all(requests);
      Alert.alert("Saved", `Payroll attendance submitted for ${attendanceDate}`);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to save attendance");
    } finally {
      setSaving(false);
    }
  };

  const bumpUnits = (empId, delta) => {
    const current = Number(attendance[empId]?.worked_units || 0);
    const next = Math.max(0, Math.round((current + delta) * 2) / 2);
    setField(empId, "worked_units", String(next));
  };

  const renderEmployee = ({ item: emp }) => {
    const row = attendance[emp.employee_id] || { status: "PRESENT", worked_units: "1", wage: "0" };
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{String(emp.employee_name || "?")[0].toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.empName}>{emp.employee_name}</Text>
            <Text style={styles.empMeta}>{emp.designation || emp.wage_type}</Text>
          </View>
          <Text style={styles.payable}>{fmt(payableFor(row))}</Text>
        </View>

        <View style={styles.statusRow}>
          {STATUSES.map((s) => (
            <Pressable
              key={s}
              style={[
                styles.statusBtn,
                row.status === s && { backgroundColor: STATUS_COLOR[s], borderColor: STATUS_COLOR[s] },
              ]}
              onPress={() => setField(emp.employee_id, "status", s)}
            >
              <Text style={[styles.statusTxt, row.status === s && { color: "#fff" }]}>
                {s.replace("_", " ")}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.fieldRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Worked Units</Text>
            <View style={styles.stepperRow}>
              <Pressable style={styles.stepperBtn} onPress={() => bumpUnits(emp.employee_id, -0.5)}>
                <Text style={styles.stepperBtnText}>−</Text>
              </Pressable>
              <TextInput
                style={styles.unitsInput}
                keyboardType="numeric"
                value={row.worked_units}
                onChangeText={(v) => setField(emp.employee_id, "worked_units", v.replace(/[^\d.]/g, ""))}
              />
              <Pressable style={styles.stepperBtn} onPress={() => bumpUnits(emp.employee_id, 0.5)}>
                <Text style={styles.stepperBtnText}>+</Text>
              </Pressable>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Daily Wage (₹)</Text>
            <TextInput
              style={styles.wageInput}
              keyboardType="numeric"
              value={row.wage}
              onChangeText={(v) => setField(emp.employee_id, "wage", v.replace(/[^\d.]/g, ""))}
            />
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <View style={styles.dateInput}>
          <Text style={styles.dateInputText}>{attendanceDate}</Text>
        </View>
        <TextInput
          style={[styles.searchInput, { flex: 1 }]}
          placeholder="Search…"
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <View style={styles.summaryRow}>
        <SummaryTile label="Present" value={summary.present} color="#059669" />
        <SummaryTile label="Absent" value={summary.absent} color="#dc2626" />
        <SummaryTile label="Half Day" value={summary.half} color="#d97706" />
        <SummaryTile label="Leave" value={summary.leave} color="#7c3aed" />
      </View>
      <View style={styles.payrollTotal}>
        <Text style={styles.payrollTotalLabel}>Total Payroll</Text>
        <Text style={styles.payrollTotalValue}>{fmt(summary.totalPayroll)}</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(e) => String(e.employee_id)}
          renderItem={renderEmployee}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyTitle}>No employees found</Text>
            </View>
          }
          ListFooterComponent={
            filtered.length > 0 ? (
              <Pressable
                style={[styles.saveBtn, saving && styles.btnDisabled]}
                disabled={saving}
                onPress={saveAttendance}
              >
                <Text style={styles.saveBtnText}>
                  {saving ? "Submitting…" : "Submit Payroll Attendance"}
                </Text>
              </Pressable>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

function SummaryTile({ label, value, color }) {
  return (
    <View style={styles.summaryTile}>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f6fb" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: { paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", gap: 10 },
  dateInput: {
    borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12,
    backgroundColor: "#eef1f8", paddingHorizontal: 12, paddingVertical: 10, justifyContent: "center",
  },
  dateInputText: { color: "#4b5563", fontWeight: "700", fontSize: 13 },
  searchInput: {
    borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12,
    backgroundColor: "#ffffff", paddingHorizontal: 13, paddingVertical: 10, color: "#0a0f1e",
    shadowColor: "#0a0f1e", shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  summaryRow: { flexDirection: "row", gap: 8, paddingHorizontal: 14 },
  summaryTile: { flex: 1, backgroundColor: "#fff", borderRadius: 12, borderWidth: 1.5, borderColor: "#e4e9f2", paddingVertical: 10, alignItems: "center" },
  summaryValue: { fontSize: 18, fontWeight: "900" },
  summaryLabel: { fontSize: 10, fontWeight: "700", color: "#9ca3af", textTransform: "uppercase", marginTop: 2 },
  payrollTotal: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#0a0f1e", borderRadius: 14, marginHorizontal: 14, marginTop: 10, paddingHorizontal: 16, paddingVertical: 12 },
  payrollTotalLabel: { color: "#9ca3af", fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
  payrollTotalValue: { color: "#fff", fontSize: 18, fontWeight: "900" },
  list: { padding: 14, gap: 10, paddingBottom: 28 },
  card: {
    backgroundColor: "#ffffff", borderRadius: 18, borderWidth: 1.5,
    borderColor: "#e4e9f2", padding: 14, gap: 12,
    shadowColor: "#0a0f1e", shadowOpacity: 0.07, shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: "#eef2ff",
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#e4e9f2",
  },
  avatarText: { color: "#6366f1", fontSize: 17, fontWeight: "900" },
  empName: { fontWeight: "800", color: "#0a0f1e", fontSize: 14 },
  empMeta: { color: "#9ca3af", fontSize: 12, marginTop: 2 },
  payable: { fontSize: 15, fontWeight: "900", color: "#059669" },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statusBtn: {
    borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#f8f9fd",
  },
  statusTxt: { fontSize: 11, fontWeight: "700", color: "#4b5563" },
  fieldRow: { flexDirection: "row", gap: 12 },
  fieldLabel: { fontSize: 10, fontWeight: "700", color: "#9ca3af", textTransform: "uppercase", marginBottom: 5 },
  stepperRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepperBtn: { width: 30, height: 34, borderRadius: 8, borderWidth: 1.5, borderColor: "#e4e9f2", alignItems: "center", justifyContent: "center", backgroundColor: "#f8f9fd" },
  stepperBtnText: { fontSize: 16, fontWeight: "900", color: "#4b5563" },
  unitsInput: {
    flex: 1, borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 8, textAlign: "center",
    color: "#0a0f1e", backgroundColor: "#f8f9fd", fontSize: 14, fontWeight: "700",
  },
  wageInput: {
    borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8, textAlign: "center",
    color: "#0a0f1e", backgroundColor: "#f8f9fd", fontSize: 14, fontWeight: "700",
  },
  saveBtn: {
    margin: 14, backgroundColor: "#6366f1", borderRadius: 14,
    paddingVertical: 15, alignItems: "center",
    shadowColor: "#6366f1", shadowOpacity: 0.35, shadowRadius: 10, elevation: 5,
  },
  saveBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  btnDisabled: { opacity: 0.5 },
  emptyWrap: { alignItems: "center", paddingTop: 64, gap: 10 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { color: "#9ca3af", fontSize: 16, fontWeight: "700" },
});
