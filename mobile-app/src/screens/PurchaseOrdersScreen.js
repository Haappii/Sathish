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
const fmt = (n) => `₹${Number(n || 0).toFixed(2)}`;
const STATUS_COLOR = { DRAFT: "#9ca3af", ORDERED: "#f59e0b", PARTIALLY_RECEIVED: "#0ea5e9", RECEIVED: "#059669", CANCELLED: "#dc2626" };

export default function PurchaseOrdersScreen() {
  const { session } = useAuth();
  const isAdmin = String(session?.role_name || session?.role || "").toLowerCase() === "admin";

  const [rows, setRows] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [items, setItems] = useState([]);
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(session?.branch_id ? String(session.branch_id) : "");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState([{ item_id: "", quantity: "", unit_cost: "" }]);
  const [creating, setCreating] = useState(false);

  const [receiveTarget, setReceiveTarget] = useState(null);
  const [receiveQtys, setReceiveQtys] = useState({});
  const [receiving, setReceiving] = useState(false);

  const [paymentTarget, setPaymentTarget] = useState(null);
  const [paidAmount, setPaidAmount] = useState("");
  const [payingBusy, setPayingBusy] = useState(false);

  const load = useCallback(async (isRefresh) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params = {};
      if (branchId) params.branch_id = branchId;
      const res = await api.get("/purchase-orders/", { params });
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load purchase orders");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [branchId]);

  useEffect(() => {
    if (isAdmin) api.get("/branch/active").then((r) => setBranches(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    api.get("/suppliers/").then((r) => setSuppliers(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    api.get("/items/").then((r) => setItems(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, [isAdmin]);

  useEffect(() => { load(); }, [branchId]); // eslint-disable-line react-hooks/exhaustive-deps

  const addLine = () => setLines((p) => [...p, { item_id: "", quantity: "", unit_cost: "" }]);
  const removeLine = (i) => setLines((p) => p.filter((_, idx) => idx !== i));
  const updateLine = (i, field, val) => setLines((p) => p.map((l, idx) => (idx === i ? { ...l, [field]: val } : l)));

  const createPO = async () => {
    if (!supplierId) return Alert.alert("Validation", "Select a supplier");
    const validLines = lines.filter((l) => l.item_id && l.quantity);
    if (!validLines.length) return Alert.alert("Validation", "Add at least one item");
    setCreating(true);
    try {
      const payload = {
        supplier_id: Number(supplierId),
        expected_date: expectedDate || null,
        notes: notes.trim() || null,
        items: validLines.map((l) => ({ item_id: Number(l.item_id), quantity: Number(l.quantity), unit_cost: Number(l.unit_cost || 0) })),
      };
      if (isAdmin && branchId) payload.branch_id = Number(branchId);
      await api.post("/purchase-orders/", payload);
      setCreateOpen(false);
      setSupplierId(""); setExpectedDate(""); setNotes(""); setLines([{ item_id: "", quantity: "", unit_cost: "" }]);
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to create PO");
    } finally {
      setCreating(false);
    }
  };

  const openReceive = (po) => {
    setReceiveTarget(po);
    const init = {};
    (po.items || []).forEach((l) => { init[l.item_id] = String(l.quantity - (l.quantity_received || 0)); });
    setReceiveQtys(init);
  };

  const submitReceive = async () => {
    setReceiving(true);
    try {
      const lines2 = (receiveTarget.items || [])
        .map((l) => ({ item_id: l.item_id, qty_received: Number(receiveQtys[l.item_id] || 0) }))
        .filter((l) => l.qty_received > 0);
      if (!lines2.length) { setReceiving(false); return Alert.alert("Validation", "Enter received quantities"); }
      await api.post(`/purchase-orders/${receiveTarget.po_id}/receive`, { items: lines2 });
      setReceiveTarget(null);
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to receive PO");
    } finally {
      setReceiving(false);
    }
  };

  const openPayment = (po) => { setPaymentTarget(po); setPaidAmount(String(po.paid_amount || "")); };
  const submitPayment = async () => {
    setPayingBusy(true);
    try {
      await api.post(`/purchase-orders/${paymentTarget.po_id}/payment`, { paid_amount: Number(paidAmount || 0) });
      setPaymentTarget(null);
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to update payment");
    } finally {
      setPayingBusy(false);
    }
  };

  const renderItem = ({ item }) => (
    <View style={st.card}>
      <View style={st.cardTop}>
        <Text style={st.poNo}>{item.po_number}</Text>
        <View style={[st.badge, { backgroundColor: `${STATUS_COLOR[item.status] || "#9ca3af"}22` }]}>
          <Text style={[st.badgeText, { color: STATUS_COLOR[item.status] || "#9ca3af" }]}>{item.status}</Text>
        </View>
      </View>
      <Text style={st.meta}>{item.supplier_name || `Supplier #${item.supplier_id}`} · {fmtDate(item.created_at)}</Text>
      <Text style={st.meta}>Total {fmt(item.total_amount)} · Paid {fmt(item.paid_amount)} · {item.payment_status}</Text>
      <View style={st.actionsRow}>
        {item.status !== "RECEIVED" && item.status !== "CANCELLED" && (
          <Pressable style={[st.actionBtn, { backgroundColor: "#ecfdf5" }]} onPress={() => openReceive(item)}>
            <Text style={[st.actionBtnText, { color: "#059669" }]}>Receive</Text>
          </Pressable>
        )}
        <Pressable style={[st.actionBtn, { backgroundColor: "#eef2ff" }]} onPress={() => openPayment(item)}>
          <Text style={[st.actionBtnText, { color: "#6366f1" }]}>Payment</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={st.safe}>
      {isAdmin && branches.length > 0 && (
        <View style={st.chipRow}>
          {branches.map((b) => (
            <Pressable key={b.branch_id} style={[st.chip, String(branchId) === String(b.branch_id) && st.chipActive]} onPress={() => setBranchId(String(b.branch_id))}>
              <Text style={[st.chipText, String(branchId) === String(b.branch_id) && st.chipTextActive]}>{b.branch_name}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {loading ? (
        <View style={st.center}><ActivityIndicator size="large" color="#6366f1" /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r, i) => String(r.po_id || i)}
          renderItem={renderItem}
          contentContainerStyle={st.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          ListEmptyComponent={<View style={st.emptyWrap}><Text style={st.emptyIcon}>📑</Text><Text style={st.emptyTitle}>No purchase orders</Text></View>}
        />
      )}
      <Pressable style={st.fab} onPress={() => setCreateOpen(true)}><Text style={st.fabText}>+ New PO</Text></Pressable>

      <Modal visible={createOpen} animationType="slide" onRequestClose={() => setCreateOpen(false)}>
        <SafeAreaView style={st.safe}>
          <View style={st.detailHeader}>
            <Pressable onPress={() => setCreateOpen(false)}><Text style={st.backLink}>‹ Cancel</Text></Pressable>
            <Text style={st.detailTitle}>New Purchase Order</Text>
          </View>
          <FlatList
            data={lines}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={{ padding: 14, gap: 10 }}
            ListHeaderComponent={
              <View style={{ gap: 10, marginBottom: 6 }}>
                <Text style={st.sectionLabel}>Supplier</Text>
                <View style={st.chipRow}>
                  {suppliers.map((s) => (
                    <Pressable key={s.supplier_id} style={[st.chip, String(supplierId) === String(s.supplier_id) && st.chipActive]} onPress={() => setSupplierId(String(s.supplier_id))}>
                      <Text style={[st.chipText, String(supplierId) === String(s.supplier_id) && st.chipTextActive]}>{s.supplier_name}</Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput style={st.input} placeholder="Expected date (YYYY-MM-DD)" placeholderTextColor="#94a3b8" value={expectedDate} onChangeText={setExpectedDate} />
                <TextInput style={st.input} placeholder="Notes (optional)" placeholderTextColor="#94a3b8" value={notes} onChangeText={setNotes} />
                <Text style={st.sectionLabel}>Items</Text>
              </View>
            }
            renderItem={({ item: line, index }) => (
              <View style={st.itemRow}>
                <TextInput
                  style={[st.input, { flex: 1.4 }]}
                  placeholder="Item name"
                  placeholderTextColor="#94a3b8"
                  value={line.item_id ? String(items.find((it) => String(it.item_id) === String(line.item_id))?.item_name || line.item_id) : ""}
                  onChangeText={(v) => {
                    const match = items.find((it) => it.item_name.toLowerCase() === v.toLowerCase());
                    updateLine(index, "item_id", match ? String(match.item_id) : v);
                  }}
                />
                <TextInput style={[st.input, { width: 55 }]} placeholder="Qty" placeholderTextColor="#94a3b8" keyboardType="numeric" value={line.quantity} onChangeText={(v) => updateLine(index, "quantity", v)} />
                <TextInput style={[st.input, { width: 65 }]} placeholder="Cost" placeholderTextColor="#94a3b8" keyboardType="numeric" value={line.unit_cost} onChangeText={(v) => updateLine(index, "unit_cost", v)} />
                <Pressable onPress={() => removeLine(index)}><Text style={st.removeText}>✕</Text></Pressable>
              </View>
            )}
            ListFooterComponent={<Pressable style={st.addRowBtn} onPress={addLine}><Text style={st.addRowBtnText}>+ Add Item</Text></Pressable>}
          />
          <View style={st.detailActions}>
            <Pressable style={st.completeBtn} disabled={creating} onPress={createPO}>
              {creating ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.completeBtnText}>Create PO</Text>}
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal visible={!!receiveTarget} animationType="slide" transparent onRequestClose={() => setReceiveTarget(null)}>
        <Pressable style={st.modalBackdrop} onPress={() => setReceiveTarget(null)}>
          <Pressable style={st.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={st.modalTitle}>Receive {receiveTarget?.po_number}</Text>
            {(receiveTarget?.items || []).map((l) => (
              <View key={l.item_id} style={st.itemRow}>
                <Text style={{ flex: 1, fontSize: 12, color: "#374151" }} numberOfLines={1}>{l.item_name || `Item #${l.item_id}`}</Text>
                <TextInput
                  style={[st.input, { width: 70 }]}
                  keyboardType="numeric"
                  placeholder="Qty"
                  placeholderTextColor="#94a3b8"
                  value={receiveQtys[l.item_id] ?? ""}
                  onChangeText={(v) => setReceiveQtys((p) => ({ ...p, [l.item_id]: v }))}
                />
              </View>
            ))}
            <View style={st.modalActions}>
              <Pressable style={st.cancelBtn} onPress={() => setReceiveTarget(null)}><Text style={st.cancelBtnText}>Cancel</Text></Pressable>
              <Pressable style={st.saveBtn} disabled={receiving} onPress={submitReceive}>
                {receiving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.saveBtnText}>Confirm Receive</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!paymentTarget} animationType="slide" transparent onRequestClose={() => setPaymentTarget(null)}>
        <Pressable style={st.modalBackdrop} onPress={() => setPaymentTarget(null)}>
          <Pressable style={st.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={st.modalTitle}>Payment — {paymentTarget?.po_number}</Text>
            <Text style={st.meta}>Total: {fmt(paymentTarget?.total_amount)}</Text>
            <TextInput style={st.input} placeholder="Paid amount" placeholderTextColor="#94a3b8" keyboardType="numeric" value={paidAmount} onChangeText={setPaidAmount} />
            <View style={st.modalActions}>
              <Pressable style={st.cancelBtn} onPress={() => setPaymentTarget(null)}><Text style={st.cancelBtnText}>Cancel</Text></Pressable>
              <Pressable style={st.saveBtn} disabled={payingBusy} onPress={submitPayment}>
                {payingBusy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.saveBtnText}>Save</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f6fb" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, padding: 14, paddingBottom: 4 },
  chip: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#fff" },
  chipActive: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  chipText: { fontSize: 11, fontWeight: "700", color: "#4b5563" },
  chipTextActive: { color: "#fff" },
  list: { padding: 14, paddingBottom: 90, gap: 10 },
  card: { backgroundColor: "#fff", borderRadius: 16, borderWidth: 1.5, borderColor: "#e4e9f2", padding: 12, gap: 4 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  poNo: { fontSize: 14, fontWeight: "800", color: "#0a0f1e" },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 10, fontWeight: "800" },
  meta: { fontSize: 11, color: "#6b7280" },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 8 },
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
  input: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12, backgroundColor: "#f8f9fd", paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, color: "#0a0f1e" },
  itemRow: { flexDirection: "row", gap: 6, alignItems: "center", marginBottom: 6 },
  removeText: { color: "#dc2626", fontSize: 16, fontWeight: "800", paddingHorizontal: 4 },
  addRowBtn: { paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: "#e4e9f2", borderStyle: "dashed", alignItems: "center" },
  addRowBtnText: { color: "#6366f1", fontWeight: "700", fontSize: 12 },
  detailActions: { padding: 14, borderTopWidth: 1, borderTopColor: "#e4e9f2" },
  completeBtn: { paddingVertical: 13, borderRadius: 12, backgroundColor: "#6366f1", alignItems: "center" },
  completeBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(10,15,30,0.45)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#fff", borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, gap: 10, maxHeight: "85%" },
  modalTitle: { fontSize: 16, fontWeight: "800", color: "#0a0f1e" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 6 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: "#f1f3f9", alignItems: "center" },
  cancelBtnText: { color: "#4b5563", fontWeight: "700", fontSize: 13 },
  saveBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: "#6366f1", alignItems: "center" },
  saveBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
});
