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

const STATUS_META = {
  available: { label: "Available", bg: "#dcfce7", text: "#15803d", border: "#86efac" },
  occupied:  { label: "Occupied",  bg: "#fee2e2", text: "#b91c1c", border: "#fca5a5" },
  reserved:  { label: "Reserved",  bg: "#fef3c7", text: "#b45309", border: "#fcd34d" },
  paid:      { label: "Paid",      bg: "#dbeafe", text: "#1d4ed8", border: "#93c5fd" },
  free:      { label: "Available", bg: "#dcfce7", text: "#15803d", border: "#86efac" },
  default:   { label: "Unknown",   bg: "#f1f5f9", text: "#475569", border: "#e2e8f0" },
};

const normalizeStatus = (value) => {
  const status = String(value || "").trim().toLowerCase();
  if (status === "free") return "available";
  return status || "available";
};

export default function TableGridScreen({ navigation }) {
  const [tables, setTables]       = useState([]);
  const [sections, setSections]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter]       = useState("all");

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await api.get("/table-billing/tables");
      const raw = res.data?.tables ?? res.data ?? [];
      setTables(raw);

      // Build section list
      const sectionMap = {};
      for (const t of raw) {
        const sname = t.section_name || "Main Area";
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

  const openTable = (table) => {
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
    <SafeAreaView style={styles.safe}>
      {/* Summary + Filter */}
      <View style={styles.filterBar}>
        {["all", "available", "occupied", "reserved"].map((f) => (
          <Pressable
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
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
                    return (
                      <Pressable
                        key={table.table_id}
                        style={[styles.tableCard, { backgroundColor: meta.bg, borderColor: meta.border }]}
                        onPress={() => openTable(table)}
                      >
                        <Text style={[styles.tableName, { color: meta.text }]}>
                          {table.table_name}
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
  safe:   { flex: 1, backgroundColor: "#f1f5f9" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  filterBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    padding: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  filterChip: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#f8fafc",
  },
  filterChipActive: { backgroundColor: "#1d4ed8", borderColor: "#1d4ed8" },
  filterText:       { color: "#475569", fontSize: 12, fontWeight: "600" },
  filterTextActive: { color: "#fff" },
  sectionHeader: { fontWeight: "700", fontSize: 14, color: "#64748b", marginBottom: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tableCard: {
    width: "30%",
    minWidth: 90,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1.5,
    alignItems: "center",
    gap: 3,
  },
  tableName:     { fontWeight: "800", fontSize: 15, textAlign: "center" },
  tableStatus:   { fontSize: 11, fontWeight: "600" },
  tableCapacity: { fontSize: 10, opacity: 0.7 },
  orderHint:     { fontSize: 10, fontWeight: "600" },
  empty: { color: "#94a3b8" },
});
