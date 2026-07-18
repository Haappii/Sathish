import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
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

const fmtDate = (v) => (v ? String(v).split("T")[0] : "");

export default function StockAuditScreen() {
  const { session } = useAuth();
  const isAdmin = String(session?.role_name || session?.role || "").toLowerCase() === "admin";

  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(session?.branch_id ? String(session.branch_id) : "");
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [notes, setNotes] = useState("");

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [counts, setCounts] = useState({});
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);

  const load = useCallback(async (isRefresh) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params = {};
      if (branchId) params.branch_id = branchId;
      const res = await api.get("/stock-audits/", { params });
      setAudits(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load audits");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [branchId]);

  useEffect(() => {
    if (isAdmin) api.get("/branch/active").then((r) => setBranches(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, [isAdmin]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const createAudit = async () => {
    setCreating(true);
    try {
      const payload = { notes: notes.trim() || null };
      if (isAdmin && branchId) payload.branch_id = Number(branchId);
      await api.post("/stock-audits/", payload);
      setNotes("");
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to create audit");
    } finally {
      setCreating(false);
    }
  };

  const openAudit = async (audit) => {
    try {
      const res = await api.get(`/stock-audits/${audit.audit_id}`);
      setDetail(res.data);
      const initCounts = {};
      (res.data?.lines || []).forEach((l) => { initCounts[l.item_id] = l.counted_qty != null ? String(l.counted_qty) : ""; });
      setCounts(initCounts);
      setDetailOpen(true);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load audit");
    }
  };

  const saveCounts = async () => {
    setSaving(true);
    try {
      const lines = (detail?.lines || []).map((l) => ({
        item_id: l.item_id,
        counted_qty: counts[l.item_id] !== "" ? Number(counts[l.item_id]) : l.system_qty,
      }));
      await api.put(`/stock-audits/${detail.audit_id}/count`, { lines });
      Alert.alert("Saved", "Counts saved");
      openAudit(detail);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to save counts");
    } finally {
      setSaving(false);
    }
  };

  const completeAudit = () => {
    Alert.alert("Complete Audit", "This will adjust stock to match counted quantities. Continue?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Complete", style: "destructive",
        onPress: async () => {
          setCompleting(true);
          try {
            const res = await api.post(`/stock-audits/${detail.audit_id}/complete`);
            Alert.alert("Completed", `${res?.data?.adjusted_lines ?? 0} item(s) adjusted`);
            setDetailOpen(false);
            load();
          } catch (err) {
            Alert.alert("Error", err?.response?.data?.detail || "Failed to complete audit");
          } finally {
            setCompleting(false);
          }
        },
      },
    ]);
  };

  const renderAudit = ({ item }) => (
    <Pressable style={st.card} onPress={() => openAudit(item)}>
      <View style={st.cardTop}>
        <Text style={st.auditNo}>{item.audit_number}</Text>
        <View style={[st.badge, item.status === "COMPLETED" ? st.badgeOn : st.badgeOff]}>
          <Text style={st.badgeText}>{item.status}</Text>
        </View>
      </View>
      {item.notes ? <Text style={st.meta} numberOfLines={1}>{item.notes}</Text> : null}
      <Text style={st.meta}>{fmtDate(item.created_at)}</Text>
    </Pressable>
  );

  const renderLine = ({ item }) => {
    const diff = counts[item.item_id] !== "" && counts[item.item_id] !== undefined
      ? Number(counts[item.item_id]) - Number(item.system_qty)
      : null;
    return (
      <View style={st.lineRow}>
        <Text style={st.lineName} numberOfLines={1}>{item.item_name}</Text>
        <Text style={st.lineSystem}>Sys: {item.system_qty}</Text>
        <TextInput
          style={st.lineInput}
          keyboardType="numeric"
          placeholder="Count"
          placeholderTextColor="#94a3b8"
          editable={detail?.status !== "COMPLETED"}
          value={counts[item.item_id] ?? ""}
          onChangeText={(v) => setCounts((p) => ({ ...p, [item.item_id]: v }))}
        />
        {diff !== null && diff !== 0 && (
          <Text style={diff > 0 ? st.diffPos : st.diffNeg}>{diff > 0 ? `+${diff}` : diff}</Text>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={st.safe}>
      <View style={st.createCard}>
        {isAdmin && branches.length > 0 && (
          <View style={st.chipRow}>
            {branches.map((b) => (
              <Pressable key={b.branch_id} style={[st.chip, String(branchId) === String(b.branch_id) && st.chipActive]} onPress={() => setBranchId(String(b.branch_id))}>
                <Text style={[st.chipText, String(branchId) === String(b.branch_id) && st.chipTextActive]}>{b.branch_name}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <View style={st.createRow}>
          <TextInput style={[st.input, { flex: 1 }]} placeholder="Notes (optional)" placeholderTextColor="#94a3b8" value={notes} onChangeText={setNotes} />
          <Pressable style={st.newBtn} disabled={creating} onPress={createAudit}>
            {creating ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.newBtnText}>+ New Audit</Text>}
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={st.center}><ActivityIndicator size="large" color="#6366f1" /></View>
      ) : (
        <FlatList
          data={audits}
          keyExtractor={(r, i) => String(r.audit_id || i)}
          renderItem={renderAudit}
          contentContainerStyle={st.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          ListEmptyComponent={<View style={st.emptyWrap}><Text style={st.emptyIcon}>📋</Text><Text style={st.emptyTitle}>No audits yet</Text></View>}
        />
      )}

      <Modal visible={detailOpen} animationType="slide" onRequestClose={() => setDetailOpen(false)}>
        <SafeAreaView style={st.safe}>
          <View style={st.detailHeader}>
            <Pressable onPress={() => setDetailOpen(false)}><Text style={st.backLink}>‹ Back</Text></Pressable>
            <Text style={st.detailTitle}>{detail?.audit_number}</Text>
          </View>
          <FlatList
            data={detail?.lines || []}
            keyExtractor={(l, i) => String(l.item_id || i)}
            renderItem={renderLine}
            contentContainerStyle={st.lineList}
            ListHeaderComponent={<View style={st.lineHead}><Text style={st.lineHeadText}>Item</Text><Text style={st.lineHeadText}>System / Count</Text></View>}
          />
          {detail?.status !== "COMPLETED" && (
            <View style={st.detailActions}>
              <Pressable style={st.saveCountsBtn} disabled={saving} onPress={saveCounts}>
                {saving ? <ActivityIndicator color="#6366f1" size="small" /> : <Text style={st.saveCountsBtnText}>Save Counts</Text>}
              </Pressable>
              <Pressable style={st.completeBtn} disabled={completing} onPress={completeAudit}>
                {completing ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.completeBtnText}>Complete Audit</Text>}
              </Pressable>
            </View>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f6fb" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  createCard: { backgroundColor: "#fff", margin: 14, marginBottom: 8, borderRadius: 16, borderWidth: 1.5, borderColor: "#e4e9f2", padding: 12, gap: 8 },
  createRow: { flexDirection: "row", gap: 8 },
  input: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12, backgroundColor: "#f8f9fd", paddingHorizontal: 12, paddingVertical: 9, color: "#0a0f1e", fontSize: 13 },
  newBtn: { backgroundColor: "#6366f1", borderRadius: 12, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  newBtnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: "#f8f9fd" },
  chipActive: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  chipText: { fontSize: 11, fontWeight: "700", color: "#4b5563" },
  chipTextActive: { color: "#fff" },
  list: { padding: 14, paddingTop: 6, paddingBottom: 24, gap: 10 },
  card: { backgroundColor: "#fff", borderRadius: 16, borderWidth: 1.5, borderColor: "#e4e9f2", padding: 12, gap: 4 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  auditNo: { fontSize: 14, fontWeight: "800", color: "#0a0f1e" },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  badgeOn: { backgroundColor: "#ecfdf5" }, badgeOff: { backgroundColor: "#eff6ff" },
  badgeText: { fontSize: 10, fontWeight: "800" },
  meta: { fontSize: 11, color: "#9ca3af" },
  emptyWrap: { alignItems: "center", paddingTop: 50, gap: 10 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { color: "#9ca3af", fontSize: 15, fontWeight: "700" },
  detailHeader: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14 },
  backLink: { color: "#6366f1", fontWeight: "700", fontSize: 13 },
  detailTitle: { fontSize: 16, fontWeight: "800", color: "#0a0f1e" },
  lineHead: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 4, paddingBottom: 6 },
  lineHeadText: { fontSize: 10, fontWeight: "800", color: "#9ca3af", textTransform: "uppercase" },
  lineList: { paddingHorizontal: 14, paddingBottom: 100, gap: 8 },
  lineRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", borderRadius: 12, borderWidth: 1.5, borderColor: "#e4e9f2", padding: 10 },
  lineName: { flex: 1, fontSize: 12, color: "#374151", fontWeight: "600" },
  lineSystem: { fontSize: 11, color: "#9ca3af", width: 60 },
  lineInput: { width: 60, borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, fontSize: 12, textAlign: "center" },
  diffPos: { color: "#059669", fontWeight: "800", fontSize: 11, width: 34, textAlign: "right" },
  diffNeg: { color: "#dc2626", fontWeight: "800", fontSize: 11, width: 34, textAlign: "right" },
  detailActions: { flexDirection: "row", gap: 10, padding: 14, borderTopWidth: 1, borderTopColor: "#e4e9f2" },
  saveCountsBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: "#eef2ff", alignItems: "center" },
  saveCountsBtnText: { color: "#6366f1", fontWeight: "800", fontSize: 13 },
  completeBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: "#059669", alignItems: "center" },
  completeBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
});
