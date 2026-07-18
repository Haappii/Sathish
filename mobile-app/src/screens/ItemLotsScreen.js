import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import api from "../api/client";
import { useAuth } from "../context/AuthContext";

const fmtDate = (v) => {
  if (!v) return "-";
  return String(v).split("T")[0];
};

export default function ItemLotsScreen() {
  const { session } = useAuth();
  const bizDate = session?.app_date || new Date().toISOString().split("T")[0];
  const isAdmin = String(session?.role_name || session?.role || "").toLowerCase() === "admin";

  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(session?.branch_id ? String(session.branch_id) : "");
  const [batchSearch, setBatchSearch] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params = {};
      if (branchId) params.branch_id = branchId;
      if (batchSearch.trim()) params.batch_no = batchSearch.trim();
      const res = await api.get("/item-lots/", { params });
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load item lots");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [branchId, batchSearch]);

  useEffect(() => {
    if (isAdmin) {
      api.get("/branch/active").then((r) => setBranches(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    }
  }, [isAdmin]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const renderItem = ({ item }) => {
    const expiry = item.expiry_date ? new Date(item.expiry_date) : null;
    const isExpired = expiry && expiry < new Date(bizDate);
    return (
      <View style={st.row}>
        <View style={{ flex: 1 }}>
          <Text style={st.itemName} numberOfLines={1}>{item.item_name}</Text>
          <Text style={st.meta}>Batch: {item.batch_no || "—"}{item.serial_no ? ` · Serial: ${item.serial_no}` : ""}</Text>
          {item.expiry_date && (
            <Text style={[st.meta, isExpired && st.expiredText]}>
              Expiry: {fmtDate(item.expiry_date)}{isExpired ? " (Expired)" : ""}
            </Text>
          )}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={st.qty}>{item.quantity}</Text>
          {item.unit_cost != null && <Text style={st.meta}>₹{Number(item.unit_cost).toFixed(2)}</Text>}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={st.safe}>
      <View style={st.filterCard}>
        <TextInput
          style={st.searchInput}
          placeholder="Search batch number..."
          placeholderTextColor="#94a3b8"
          value={batchSearch}
          onChangeText={setBatchSearch}
          onSubmitEditing={() => load()}
        />
        {isAdmin && branches.length > 0 && (
          <View style={st.chipRow}>
            <Pressable style={[st.chip, !branchId && st.chipActive]} onPress={() => setBranchId("")}>
              <Text style={[st.chipText, !branchId && st.chipTextActive]}>All Branches</Text>
            </Pressable>
            {branches.map((b) => (
              <Pressable
                key={b.branch_id}
                style={[st.chip, String(branchId) === String(b.branch_id) && st.chipActive]}
                onPress={() => setBranchId(String(b.branch_id))}
              >
                <Text style={[st.chipText, String(branchId) === String(b.branch_id) && st.chipTextActive]}>
                  {b.branch_name}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
        <Pressable style={st.applyBtn} onPress={() => load()}>
          <Text style={st.applyBtnText}>Apply Filters</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={st.center}><ActivityIndicator size="large" color="#6366f1" /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r, i) => String(r.lot_id || i)}
          renderItem={renderItem}
          contentContainerStyle={st.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          ListEmptyComponent={
            <View style={st.emptyWrap}>
              <Text style={st.emptyIcon}>🏷️</Text>
              <Text style={st.emptyTitle}>No lots found</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f6fb" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  filterCard: {
    backgroundColor: "#fff", margin: 14, marginBottom: 8, borderRadius: 16,
    borderWidth: 1.5, borderColor: "#e4e9f2", padding: 12, gap: 10,
  },
  searchInput: {
    borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12,
    backgroundColor: "#f8f9fd", paddingHorizontal: 12, paddingVertical: 9, color: "#0a0f1e", fontSize: 13,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: "#f8f9fd" },
  chipActive: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  chipText: { fontSize: 11, fontWeight: "700", color: "#4b5563" },
  chipTextActive: { color: "#fff" },
  applyBtn: { backgroundColor: "#6366f1", borderRadius: 12, paddingVertical: 10, alignItems: "center" },
  applyBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  list: { paddingHorizontal: 14, paddingBottom: 24, gap: 8 },
  row: {
    backgroundColor: "#fff", borderRadius: 14, borderWidth: 1.5, borderColor: "#e4e9f2",
    padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  itemName: { fontSize: 14, fontWeight: "700", color: "#0a0f1e" },
  meta: { fontSize: 11, color: "#6b7280", marginTop: 2 },
  expiredText: { color: "#dc2626", fontWeight: "700" },
  qty: { fontSize: 16, fontWeight: "900", color: "#10b981" },
  emptyWrap: { alignItems: "center", paddingTop: 50, gap: 10 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { color: "#9ca3af", fontSize: 15, fontWeight: "700" },
});
