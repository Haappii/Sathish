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

export default function EmployeeAttendanceScreen() {
  const { theme } = useTheme();
  const { session } = useAuth();
  const businessDate = session?.app_date || new Date().toISOString().split("T")[0];
  const [attendanceDate, setAttendanceDate] = useState(businessDate);
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState({}); // employee_id -> {status, worked_units}
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [markedEmployeeMap, setMarkedEmployeeMap] = useState({}); // employee_id -> true

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
        const marked = {};
        existing.forEach((a) => {
          marked[a.employee_id] = true;
          if (init[a.employee_id]) {
            init[a.employee_id] = {
              status: a.status || "PRESENT",
              worked_units: String(a.worked_units ?? 1),
            };
          }
        });
        setMarkedEmployeeMap(marked);
      } catch {
        /* No existing attendance — use defaults */
        setMarkedEmployeeMap({});
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
        status: attendance[emp.employee_id]?.status || "PRESENT",
        worked_units: Number(attendance[emp.employee_id]?.worked_units || 1),
        wage_amount: Number(emp.daily_wage || 0),
      }));
      await api.post("/employees/attendance/bulk", {
        attendance_date: attendanceDate,
        items: rows,
      });
      const marked = {};
      rows.forEach((r) => { marked[r.employee_id] = true; });
      setMarkedEmployeeMap(marked);
      Alert.alert("Saved", `Attendance saved for ${attendanceDate}`);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to save attendance");
    } finally {
      setSaving(false);
    }
  };

  const allSaved = useMemo(
    () => employees.length > 0 && employees.every((e) => markedEmployeeMap[e.employee_id]),
    [employees, markedEmployeeMap]
  );

  const filtered = useMemo(
    () => employees.filter((e) =>
      !markedEmployeeMap[e.employee_id] &&
      String(e.employee_name || "").toLowerCase().includes(search.toLowerCase())
    ),
    [employees, search, markedEmployeeMap]
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

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>
      ) : allSaved ? (
        <View style={styles.alreadySavedWrap}>
          <Text style={styles.alreadySavedIcon}>✅</Text>
          <Text style={styles.alreadySavedTitle}>Attendance Already Recorded</Text>
          <Text style={styles.alreadySavedMsg}>
            Attendance for {attendanceDate} has already been saved for all employees.
          </Text>
        </View>
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
  safe: { flex: 1, backgroundColor: "#f4f6fb" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: { paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", gap: 10 },
  dateInput: {
    borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12,
    backgroundColor: "#ffffff", paddingHorizontal: 12, paddingVertical: 10, color: "#0a0f1e", width: 136,
  },
  searchInput: {
    borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12,
    backgroundColor: "#ffffff", paddingHorizontal: 13, paddingVertical: 10, color: "#0a0f1e",
    shadowColor: "#0a0f1e", shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
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
  unitsInput: {
    width: 52, borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 8, textAlign: "center",
    color: "#0a0f1e", backgroundColor: "#f8f9fd", fontSize: 14, fontWeight: "700",
  },
  unitsLabel: { color: "#9ca3af", fontSize: 12, fontWeight: "700" },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statusBtn: {
    borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#f8f9fd",
  },
  statusTxt: { fontSize: 11, fontWeight: "700", color: "#4b5563" },
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
  alreadySavedWrap: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingHorizontal: 32, gap: 14,
  },
  alreadySavedIcon: { fontSize: 56 },
  alreadySavedTitle: { fontSize: 18, fontWeight: "900", color: "#10b981", textAlign: "center" },
  alreadySavedMsg: { fontSize: 14, color: "#9ca3af", textAlign: "center", lineHeight: 22 },
});
