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

const STATUSES = ["PRESENT", "ABSENT", "HALF_DAY", "LEAVE"];

const STATUS_COLOR = {
  PRESENT: "#059669",
  ABSENT: "#dc2626",
  HALF_DAY: "#d97706",
  LEAVE: "#7c3aed",
};

export default function EmployeeAttendanceScreen() {
  const { session } = useAuth();
  const businessDate = session?.app_date || new Date().toISOString().split("T")[0];
  const [attendanceDate, setAttendanceDate] = useState(businessDate);
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState({}); // employee_id -> {status, worked_units}
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedDate, setSavedDate] = useState(null);

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
          worked_units: String(emp.wage_type === "DAILY" ? 1 : 8),
        };
      });
      // Try load existing attendance for the date
      try {
        const attRes = await api.get("/employees/attendance", {
          params: { date: attendanceDate },
        });
        const existing = attRes?.data || [];
        existing.forEach((a) => {
          if (init[a.employee_id]) {
            init[a.employee_id] = {
              status: a.status || "PRESENT",
              worked_units: String(a.worked_units ?? 1),
            };
          }
        });
      } catch {
        /* No existing attendance — use defaults */
      }
      setAttendance(init);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load employees");
    } finally {
      setLoading(false);
    }
  }, [attendanceDate]);

  useEffect(() => { load(); }, [load]);

  const setField = (empId, field, value) => {
    setAttendance((p) => ({
      ...p,
      [empId]: { ...(p[empId] || {}), [field]: value },
    }));
  };

  const saveAttendance = async () => {
    setSaving(true);
    try {
      const rows = employees.map((emp) => ({
        employee_id: emp.employee_id,
        date: attendanceDate,
        status: attendance[emp.employee_id]?.status || "PRESENT",
        worked_units: Number(attendance[emp.employee_id]?.worked_units || 1),
        wage: emp.daily_wage || 0,
      }));
      await api.post("/employees/attendance/bulk", { date: attendanceDate, records: rows });
      setSavedDate(attendanceDate);
      Alert.alert("Saved", `Attendance saved for ${attendanceDate}`);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to save attendance");
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(
    () => employees.filter((e) =>
      String(e.employee_name || "").toLowerCase().includes(search.toLowerCase())
    ),
    [employees, search]
  );

  const renderEmployee = ({ item: emp }) => {
    const att = attendance[emp.employee_id] || { status: "PRESENT", worked_units: "1" };
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
          <TextInput
            style={styles.unitsInput}
            keyboardType="numeric"
            value={att.worked_units}
            onChangeText={(v) => setField(emp.employee_id, "worked_units", v.replace(/[^\d.]/g, ""))}
          />
          <Text style={styles.unitsLabel}>{emp.wage_type === "MONTHLY" ? "hrs" : "days"}</Text>
        </View>
        <View style={styles.statusRow}>
          {STATUSES.map((s) => (
            <Pressable
              key={s}
              style={[
                styles.statusBtn,
                att.status === s && { backgroundColor: STATUS_COLOR[s], borderColor: STATUS_COLOR[s] },
              ]}
              onPress={() => setField(emp.employee_id, "status", s)}
            >
              <Text style={[styles.statusTxt, att.status === s && { color: "#fff" }]}>
                {s.replace("_", " ")}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <TextInput
          style={styles.dateInput}
          value={attendanceDate}
          onChangeText={(v) => setAttendanceDate(v)}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#94a3b8"
        />
        <TextInput
          style={[styles.searchInput, { flex: 1 }]}
          placeholder="Search…"
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {savedDate === attendanceDate && (
        <View style={styles.savedBanner}>
          <Text style={styles.savedText}>✓ Attendance saved for {attendanceDate}</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#1d4ed8" /></View>
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
                  {saving ? "Saving…" : `Save Attendance — ${attendanceDate}`}
                </Text>
              </Pressable>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f1f5f9" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: { padding: 12, flexDirection: "row", gap: 8 },
  dateInput: {
    borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10,
    backgroundColor: "#fff", paddingHorizontal: 12, paddingVertical: 10, color: "#0f172a",
    width: 130,
  },
  searchInput: {
    borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10,
    backgroundColor: "#fff", paddingHorizontal: 12, paddingVertical: 10, color: "#0f172a",
  },
  savedBanner: { backgroundColor: "#dcfce7", padding: 8, alignItems: "center" },
  savedText: { color: "#166534", fontWeight: "700", fontSize: 13 },
  list: { padding: 12, gap: 8, paddingBottom: 24 },
  card: {
    backgroundColor: "#fff", borderRadius: 12, borderWidth: 1,
    borderColor: "#e2e8f0", padding: 12, gap: 10,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: "#dbeafe",
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { color: "#1d4ed8", fontSize: 16, fontWeight: "800" },
  empName: { fontWeight: "700", color: "#0f172a" },
  empMeta: { color: "#64748b", fontSize: 12 },
  unitsInput: {
    width: 50, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 6, textAlign: "center",
    color: "#0f172a", backgroundColor: "#f8fafc",
  },
  unitsLabel: { color: "#64748b", fontSize: 12, fontWeight: "600" },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  statusBtn: {
    borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5, backgroundColor: "#fff",
  },
  statusTxt: { fontSize: 11, fontWeight: "700", color: "#334155" },
  saveBtn: {
    margin: 12, backgroundColor: "#1d4ed8", borderRadius: 12,
    paddingVertical: 14, alignItems: "center",
  },
  saveBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  btnDisabled: { opacity: 0.5 },
  emptyWrap: { alignItems: "center", paddingTop: 60, gap: 8 },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { color: "#64748b", fontSize: 16, fontWeight: "700" },
});
