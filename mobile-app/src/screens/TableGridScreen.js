/**
 * TableGridScreen — Hotel only.
 * Shows all tables for the current branch, color-coded by status.
 * Tap a table to open TableOrderScreen.
 */
import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
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
import { useTheme } from "../context/ThemeContext";

const STATUS_META = {
  available: { label: "Available", bg: "#ecfdf5", text: "#047857", border: "#6ee7b7" },
  occupied:  { label: "Occupied",  bg: "#fef2f2", text: "#dc2626", border: "#fca5a5" },
  reserved:  { label: "Reserved",  bg: "#fffbeb", text: "#b45309", border: "#fcd34d" },
  paid:      { label: "Paid",      bg: "#eff4ff", text: "#2563eb", border: "#93c5fd" },
  free:      { label: "Available", bg: "#ecfdf5", text: "#047857", border: "#6ee7b7" },
  default:   { label: "Unknown",   bg: "#f0f4ff", text: "#4a5a78", border: "#dde6f7" },
};

const normalizeStatus = (value) => {
  const status = String(value || "").trim().toLowerCase();
  if (status === "free") return "available";
  return status || "available";
};

const parseTableStartTime = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  if (typeof value === "string") {
    const fallback = new Date(value.replace(" ", "T"));
    if (!Number.isNaN(fallback.getTime())) return fallback;
  }
  return null;
};

const getTableStartTime = (table) => table?.table_start_time || table?.opened_at || null;

const runningMinutes = (tableStartTime, nowTs = Date.now()) => {
  const start = parseTableStartTime(tableStartTime);
  if (!start) return null;
  return Math.max(0, Math.floor((nowTs - start.getTime()) / 60000));
};

const formatStartTime = (tableStartTime) => {
  const d = parseTableStartTime(tableStartTime);
  if (!d) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

export default function TableGridScreen({ navigation }) {
  const { theme } = useTheme();
  const [tables, setTables]       = useState([]);
  const [sections, setSections]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter]       = useState("all");
  const [clockTick, setClockTick] = useState(0);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await api.get("/table-billing/tables");
      const raw = res.data?.tables ?? res.data ?? [];
      setTables(raw);

      // Build section list
      const sectionMap = {};
      for (const t of raw) {
        const sname = t.category_name || "Uncategorized";
        if (!sectionMap[sname]) sectionMap[sname] = [];
        sectionMap[sname].push(t);
      }
      setSections(Object.entries(sectionMap));
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load tables");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(
    useCallback(() => {
      load(true);
    }, [load])
  );

  useEffect(() => {
    const id = setInterval(() => {
      setClockTick((v) => v + 1);
    }, 30000);
    return () => clearInterval(id);
  }, []);

  const openTable = async (table) => {
    const status = normalizeStatus(table?.status);
    if (status === "paid") {
      try {
        await api.patch(`/tables/${table.table_id}/status`, { status: "FREE" });
        Alert.alert("Table Freed", `${table.table_name} is now available.`);
        load(true);
      } catch (err) {
        Alert.alert("Error", err?.response?.data?.detail || "Failed to free table");
      }
      return;
    }
    navigation.navigate("TableOrder", { table });
  };

  const filteredSections = sections.map(([name, tbls]) => [
    name,
    filter === "all" ? tbls : tbls.filter((t) => normalizeStatus(t.status) === filter),
  ]).filter(([, tbls]) => tbls.length > 0);

  const counts = {
    all:       tables.length,
    available: tables.filter((t) => normalizeStatus(t.status) === "available").length,
    occupied:  tables.filter((t) => normalizeStatus(t.status) === "occupied").length,
    reserved:  tables.filter((t) => normalizeStatus(t.status) === "reserved").length,
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}> 
      {/* Summary + Filter */}
      <View style={[styles.filterBar, { backgroundColor: theme.card, borderBottomColor: theme.cardBorder }]}> 
        {["all", "available", "occupied", "reserved"].map((f) => (
          <Pressable
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}
          >
              <Text style={[styles.filterText, { color: filter === f ? "#fff" : theme.textSub }]}>
              {f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 14, gap: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        >
          {filteredSections.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.empty}>No tables found.</Text>
            </View>
          ) : (
            filteredSections.map(([sectionName, sectionTables]) => (
              <View key={sectionName}>
                <Text style={styles.sectionHeader}>{sectionName}</Text>
                <View style={styles.grid}>
                  {sectionTables.map((table) => {
                    const status = normalizeStatus(table.status);
                    const meta = STATUS_META[status] || STATUS_META.default;
                    const startTime = getTableStartTime(table);
                    const mins = runningMinutes(startTime, Date.now() + clockTick);
                    return (
                      <Pressable
                        key={table.table_id}
                        style={[styles.tableCard, { backgroundColor: meta.bg, borderColor: meta.border }]}
                        onPress={() => openTable(table)}
                      >
                        <Text style={[styles.tableName, { color: meta.text }]}>
                          {table.category_name
                            ? <><Text style={{ fontWeight: "400", opacity: 0.65 }}>{table.category_name} · </Text>{table.table_name}</>
                            : table.table_name}
                        </Text>
                        <Text style={[styles.tableStatus, { color: meta.text }]}>
                          {meta.label}
                        </Text>
                        {table.capacity > 0 && (
                          <Text style={[styles.tableCapacity, { color: meta.text }]}>
                            {table.capacity} seats
                          </Text>
                        )}
                        {table.order_id && (
                          <Text style={[styles.orderHint, { color: meta.text }]}>
                            Order #{table.order_id}
                          </Text>
                        )}
                        {status === "occupied" && Number(table.running_total || 0) > 0 && (
                          <Text style={[styles.orderHint, { color: meta.text }]}> 
                            Total ₹{Number(table.running_total || 0).toFixed(2)}
                          </Text>
                        )}
                        {status === "occupied" && startTime && (
                          <Text style={[styles.orderHint, { color: meta.text }]}> 
                            Since {formatStartTime(startTime)} {mins !== null ? `(${mins}m)` : ""}
                          </Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: "#f0f4ff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  filterBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    padding: 14,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#dde6f7",
    shadowColor: "#1a2463",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  filterChip: {
    borderWidth: 1.5,
    borderColor: "#d0dcf0",
    borderRadius: 22,
    paddingHorizontal: 13,
    paddingVertical: 7,
    backgroundColor: "#f6f8fe",
  },
  filterChipActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  filterText:       { color: "#4a5a78", fontSize: 12, fontWeight: "700" },
  filterTextActive: { color: "#fff" },
  sectionHeader: {
    fontWeight: "800",
    fontSize: 13,
    color: "#8896ae",
    marginBottom: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tableCard: {
    width: "30%",
    minWidth: 92,
    borderRadius: 16,
    padding: 14,
    borderWidth: 2,
    alignItems: "center",
    gap: 4,
    shadowColor: "#1a2463",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  tableName:     { fontWeight: "900", fontSize: 16, textAlign: "center", letterSpacing: -0.2 },
  tableStatus:   { fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
  tableCapacity: { fontSize: 10, opacity: 0.7, fontWeight: "600" },
  orderHint:     { fontSize: 10, fontWeight: "700" },
  empty: { color: "#8896ae", fontSize: 15 },
});
