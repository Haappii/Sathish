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
const STATUS_COLOR = {
  REQUESTED: "#f59e0b", APPROVED: "#6366f1", DISPATCHED: "#0ea5e9",
  RECEIVED: "#059669", REJECTED: "#dc2626", CANCELLED: "#9ca3af",
};

export default function StockTransfersScreen() {
  const { session } = useAuth();
  const roleLower = String(session?.role_name || session?.role || "").toLowerCase();
  const isAdmin = roleLower === "admin";
  const isManager = roleLower === "manager";
  const currentBranchId = Number(session?.branch_id || 0);

  const [rows, setRows] = useState([]);
  const [branches, setBranches] = useState([]);
  const [items, setItems] = useState([]);
  const [isHotel, setIsHotel] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [toBranchId, setToBranchId] = useState("");
  const [transferItems, setTransferItems] = useState([{ item_id: "", quantity: "" }]);
  const [transferNotes, setTransferNotes] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async (isRefresh) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await api.get("/stock-transfers/list");
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load transfers");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const branchEndpoint = isAdmin ? "/branch/list" : "/branch/active";
    api.get(branchEndpoint).then((r) => setBranches(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    api.get("/shop/details").then((r) => {
      const shopData = r?.data || {};
      const hotel = String(shopData?.billing_type || shopData?.shop_type || "").toLowerCase() === "hotel";
      setIsHotel(hotel);
      api.get("/items/").then((ir) => {
        const allItems = Array.isArray(ir.data) ? ir.data : [];
        setItems(hotel ? allItems.filter((it) => !!it?.is_raw_material) : allItems.filter((it) => !it?.is_raw_material));
      }).catch(() => {});
    }).catch(() => {
      api.get("/items/").then((r) => setItems(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    });
  }, [isAdmin]);

  useEffect(() => { load(); }, [load]);

  const addRow = () => setTransferItems((p) => [...p, { item_id: "", quantity: "" }]);
  const removeRow = (i) => setTransferItems((p) => p.filter((_, idx) => idx !== i));
  const updateRow = (i, field, val) => setTransferItems((p) => p.map((r, idx) => (idx === i ? { ...r, [field]: val } : r)));

  const createTransfer = async () => {
    if (!toBranchId) return Alert.alert("Validation", "Select a destination branch");
    const validItems = transferItems.filter((r) => r.item_id && r.quantity);
    if (!validItems.length) return Alert.alert("Validation", "Add at least one item");
    setCreating(true);
    try {
      await api.post("/stock-transfers/", {
        to_branch_id: Number(toBranchId),
        items: validItems.map((r) => ({ item_id: Number(r.item_id), quantity: Number(r.quantity) })),
        notes: transferNotes.trim() || null,
      });
      setCreateOpen(false);
      setToBranchId(""); setTransferItems([{ item_id: "", quantity: "" }]); setTransferNotes("");
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to create transfer");
    } finally {
      setCreating(false);
    }
  };

  const doAction = async (transfer, action) => {
    setBusyId(transfer.transfer_id);
    try {
      await api.post(`/stock-transfers/${transfer.transfer_id}/${action}`);
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || `Failed to ${action}`);
    } finally {
      setBusyId(null);
    }
  };

  const actionsFor = (t) => {
    const actions = [];
    if (isAdmin && t.status === "REQUESTED") {
      actions.push({ key: "approve", label: "Approve", color: "#059669" }, { key: "reject", label: "Reject", color: "#dc2626" });
    }
    if ((isAdmin || (isManager && Number(t.from_branch_id) === currentBranchId)) && t.status === "APPROVED") {
      actions.push({ key: "dispatch", label: "Dispatch", color: "#0ea5e9" });
    }
    if ((isAdmin || (isManager && Number(t.to_branch_id) === currentBranchId)) && t.status === "DISPATCHED") {
      actions.push({ key: "receive", label: "Receive", color: "#059669" });
    }
    if (isAdmin && ["REQUESTED", "APPROVED"].includes(t.status)) {
      actions.push({ key: "cancel", label: "Cancel", color: "#9ca3af" });
    }
    return actions;
  };

  const renderItem = ({ item }) => {
    const expanded = expandedId === item.transfer_id;
    return (
      <View style={st.card}>
        <Pressable onPress={() => setExpandedId(expanded ? null : item.transfer_id)}>
          <View style={st.cardTop}>
            <Text style={st.transferNo}>{item.transfer_number}</Text>
            <View style={[st.badge, { backgroundColor: `${STATUS_COLOR[item.status] || "#9ca3af"}22` }]}>
              <Text style={[st.badgeText, { color: STATUS_COLOR[item.status] || "#9ca3af" }]}>{item.status}</Text>
            </View>
          </View>
          <Text style={st.meta}>Branch #{item.from_branch_id} → #{item.to_branch_id} · {fmtDate(item.created_at)}</Text>
          {item.notes ? <Text style={st.meta} numberOfLines={1}>{item.notes}</Text> : null}
        </Pressable>
        {expanded && (item.items || []).map((li, i) => (
          <Text key={i} style={st.lineItem}>• {li.item_name || `Item #${li.item_id}`} × {li.quantity}</Text>
        ))}
        <View style={st.actionsRow}>
          {actionsFor(item).map((a) => (
            <Pressable
              key={a.key}
              disabled={busyId === item.transfer_id}
              style={[st.actionBtn, { backgroundColor: `${a.color}18` }]}
              onPress={() => doAction(item, a.key)}
            >
              {busyId === item.transfer_id ? <ActivityIndicator size="small" color={a.color} /> : <Text style={[st.actionBtnText, { color: a.color }]}>{a.label}</Text>}
            </Pressable>
          ))}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={st.safe}>
      {loading ? (
        <View style={st.center}><ActivityIndicator size="large" color="#6366f1" /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r, i) => String(r.transfer_id || i)}
          renderItem={renderItem}
          contentContainerStyle={st.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          ListEmptyComponent={<View style={st.emptyWrap}><Text style={st.emptyIcon}>🚚</Text><Text style={st.emptyTitle}>No stock transfers</Text></View>}
        />
      )}

      <Pressable style={st.fab} onPress={() => setCreateOpen(true)}>
        <Text style={st.fabText}>+ New Transfer</Text>
      </Pressable>

      <Modal visible={createOpen} animationType="slide" onRequestClose={() => setCreateOpen(false)}>
        <SafeAreaView style={st.safe}>
          <View style={st.detailHeader}>
            <Pressable onPress={() => setCreateOpen(false)}><Text style={st.backLink}>‹ Cancel</Text></Pressable>
            <Text style={st.detailTitle}>New Stock Transfer</Text>
          </View>
          <FlatList
            data={transferItems}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={{ padding: 14, gap: 10 }}
            ListHeaderComponent={
              <View style={{ gap: 10, marginBottom: 6 }}>
                <Text style={st.sectionLabel}>To Branch</Text>
                <View style={st.chipRow}>
                  {branches.filter((b) => Number(b.branch_id) !== currentBranchId).map((b) => (
                    <Pressable key={b.branch_id} style={[st.chip, String(toBranchId) === String(b.branch_id) && st.chipActive]} onPress={() => setToBranchId(String(b.branch_id))}>
                      <Text style={[st.chipText, String(toBranchId) === String(b.branch_id) && st.chipTextActive]}>{b.branch_name}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={st.sectionLabel}>Items</Text>
              </View>
            }
            renderItem={({ item: row, index }) => (
              <View style={st.itemRow}>
                <TextInput
                  style={[st.input, { flex: 1.4 }]}
                  placeholder="Item ID or name"
                  placeholderTextColor="#94a3b8"
                  value={row.item_id ? String(items.find((it) => String(it.item_id) === String(row.item_id))?.item_name || row.item_id) : ""}
                  onChangeText={(v) => {
                    const match = items.find((it) => it.item_name.toLowerCase() === v.toLowerCase());
                    updateRow(index, "item_id", match ? String(match.item_id) : v);
                  }}
                />
                <TextInput style={[st.input, { width: 70 }]} placeholder="Qty" placeholderTextColor="#94a3b8" keyboardType="numeric" value={row.quantity} onChangeText={(v) => updateRow(index, "quantity", v)} />
                <Pressable onPress={() => removeRow(index)}><Text style={st.removeText}>✕</Text></Pressable>
              </View>
            )}
            ListFooterComponent={
              <View style={{ gap: 10 }}>
                <Pressable style={st.addRowBtn} onPress={addRow}><Text style={st.addRowBtnText}>+ Add Item</Text></Pressable>
                <TextInput style={st.input} placeholder="Notes (optional)" placeholderTextColor="#94a3b8" value={transferNotes} onChangeText={setTransferNotes} />
              </View>
            }
          />
          <View style={st.detailActions}>
            <Pressable style={st.completeBtn} disabled={creating} onPress={createTransfer}>
              {creating ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.completeBtnText}>Submit Request</Text>}
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f6fb" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 14, paddingBottom: 90, gap: 10 },
  card: { backgroundColor: "#fff", borderRadius: 16, borderWidth: 1.5, borderColor: "#e4e9f2", padding: 12, gap: 6 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  transferNo: { fontSize: 14, fontWeight: "800", color: "#0a0f1e" },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 10, fontWeight: "800" },
  meta: { fontSize: 11, color: "#9ca3af" },
  lineItem: { fontSize: 12, color: "#374151", marginTop: 4 },
  actionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  actionBtnText: { fontSize: 11, fontWeight: "800" },
  emptyWrap: { alignItems: "center", paddingTop: 50, gap: 10 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { color: "#9ca3af", fontSize: 15, fontWeight: "700" },
  fab: { position: "absolute", right: 16, bottom: 20, backgroundColor: "#6366f1", borderRadius: 999, paddingHorizontal: 20, paddingVertical: 14, elevation: 4 },
  fabText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  detailHeader: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14 },
  backLink: { color: "#6366f1", fontWeight: "700", fontSize: 13 },
  detailTitle: { fontSize: 16, fontWeight: "800", color: "#0a0f1e" },
  sectionLabel: { fontSize: 11, fontWeight: "800", color: "#9ca3af", textTransform: "uppercase" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#f8f9fd" },
  chipActive: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  chipText: { fontSize: 11, fontWeight: "700", color: "#4b5563" },
  chipTextActive: { color: "#fff" },
  input: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12, backgroundColor: "#f8f9fd", paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, color: "#0a0f1e" },
  itemRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  removeText: { color: "#dc2626", fontSize: 16, fontWeight: "800", paddingHorizontal: 6 },
  addRowBtn: { paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: "#e4e9f2", borderStyle: "dashed", alignItems: "center" },
  addRowBtnText: { color: "#6366f1", fontWeight: "700", fontSize: 12 },
  detailActions: { padding: 14, borderTopWidth: 1, borderTopColor: "#e4e9f2" },
  completeBtn: { paddingVertical: 13, borderRadius: 12, backgroundColor: "#6366f1", alignItems: "center" },
  completeBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
});
