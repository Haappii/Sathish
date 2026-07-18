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

const STATUS_FLOW = { ASSIGNED: "PICKED_UP", PICKED_UP: "DELIVERED" };
const STATUS_LABEL = { ASSIGNED: "Mark Picked Up", PICKED_UP: "Mark Delivered" };
const STATUS_COLOR = { ASSIGNED: "#f59e0b", PICKED_UP: "#0ea5e9", DELIVERED: "#059669", FAILED: "#dc2626" };
const STATUS_TABS = ["", "ASSIGNED", "PICKED_UP", "DELIVERED", "FAILED"];

export default function DeliveryManagementScreen() {
  const [assignments, setAssignments] = useState([]);
  const [boys, setBoys] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const [boyModalOpen, setBoyModalOpen] = useState(false);
  const [boyName, setBoyName] = useState("");
  const [boyMobile, setBoyMobile] = useState("");
  const [savingBoy, setSavingBoy] = useState(false);

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedBoyId, setSelectedBoyId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [address, setAddress] = useState("");
  const [assignNotes, setAssignNotes] = useState("");
  const [assigning, setAssigning] = useState(false);

  const [allAssignments, setAllAssignments] = useState([]);

  const load = useCallback(async (isRefresh) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      const [aRes, bRes, allRes] = await Promise.all([
        api.get("/delivery/assignments", { params }),
        api.get("/delivery/boys"),
        api.get("/delivery/assignments"),
      ]);
      setAssignments(Array.isArray(aRes.data) ? aRes.data : []);
      setBoys(Array.isArray(bRes.data) ? bRes.data : []);
      setAllAssignments(Array.isArray(allRes.data) ? allRes.data : []);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load delivery data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter]);

  const tabCounts = STATUS_TABS.reduce((acc, s) => {
    if (!s) return acc;
    acc[s] = allAssignments.filter((a) => a.status === s).length;
    return acc;
  }, {});

  useEffect(() => { load(); }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const addBoy = async () => {
    if (!boyName.trim()) return Alert.alert("Validation", "Name is required");
    setSavingBoy(true);
    try {
      await api.post("/delivery/boys", { name: boyName.trim(), mobile: boyMobile.trim() });
      setBoyModalOpen(false); setBoyName(""); setBoyMobile("");
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to add delivery boy");
    } finally {
      setSavingBoy(false);
    }
  };

  const toggleBoyActive = async (boy) => {
    try {
      await api.put(`/delivery/boys/${boy.delivery_boy_id}`, { is_active: !boy.is_active });
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to update");
    }
  };

  const createAssignment = async () => {
    if (!selectedBoyId || !customerName.trim() || !address.trim()) return Alert.alert("Validation", "Delivery boy, customer name, and address are required");
    setAssigning(true);
    try {
      await api.post("/delivery/assignments", {
        delivery_boy_id: Number(selectedBoyId),
        customer_name: customerName.trim(),
        mobile: customerMobile.trim(),
        address: address.trim(),
        notes: assignNotes.trim() || null,
      });
      setAssignModalOpen(false);
      setSelectedBoyId(""); setCustomerName(""); setCustomerMobile(""); setAddress(""); setAssignNotes("");
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to assign delivery");
    } finally {
      setAssigning(false);
    }
  };

  const advanceStatus = async (a) => {
    const next = STATUS_FLOW[a.status];
    if (!next) return;
    setBusyId(a.assignment_id);
    try {
      await api.put(`/delivery/assignments/${a.assignment_id}/status`, { status: next });
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to update status");
    } finally {
      setBusyId(null);
    }
  };

  const markFailed = (a) => {
    Alert.alert("Mark Failed", "Mark this delivery as failed?", [
      { text: "Cancel", style: "cancel" },
      { text: "Mark Failed", style: "destructive", onPress: async () => {
        setBusyId(a.assignment_id);
        try { await api.put(`/delivery/assignments/${a.assignment_id}/status`, { status: "FAILED" }); load(); }
        catch (err) { Alert.alert("Error", err?.response?.data?.detail || "Failed to update"); }
        finally { setBusyId(null); }
      }},
    ]);
  };

  const renderItem = ({ item }) => (
    <View style={st.card}>
      <View style={st.cardTop}>
        <Text style={st.customerName}>{item.customer_name}</Text>
        <View style={[st.badge, { backgroundColor: `${STATUS_COLOR[item.status] || "#9ca3af"}22` }]}>
          <Text style={[st.badgeText, { color: STATUS_COLOR[item.status] || "#9ca3af" }]}>{item.status}</Text>
        </View>
      </View>
      <Text style={st.meta}>{item.mobile}</Text>
      <Text style={st.meta} numberOfLines={2}>{item.address}</Text>
      <Text style={st.meta}>Rider: {item.delivery_boy_name || "—"}{item.delivery_boy_mobile ? ` (${item.delivery_boy_mobile})` : ""}</Text>
      {item.notes ? <Text style={st.notesText}>📝 {item.notes}</Text> : null}
      <Text style={st.timeMeta}>
        Assigned: {item.assigned_at ? new Date(item.assigned_at).toLocaleTimeString() : "—"}
        {item.picked_up_at ? ` · Picked: ${new Date(item.picked_up_at).toLocaleTimeString()}` : ""}
        {item.delivered_at ? ` · Delivered: ${new Date(item.delivered_at).toLocaleTimeString()}` : ""}
      </Text>
      <View style={st.actionsRow}>
        {STATUS_FLOW[item.status] && (
          <Pressable style={[st.actionBtn, { backgroundColor: `${STATUS_COLOR[item.status]}18` }]} disabled={busyId === item.assignment_id} onPress={() => advanceStatus(item)}>
            {busyId === item.assignment_id ? <ActivityIndicator size="small" color={STATUS_COLOR[item.status]} /> : <Text style={[st.actionBtnText, { color: STATUS_COLOR[item.status] }]}>{STATUS_LABEL[item.status]}</Text>}
          </Pressable>
        )}
        {item.status === "ASSIGNED" && (
          <Pressable style={[st.actionBtn, { backgroundColor: "#fef2f2" }]} onPress={() => markFailed(item)}>
            <Text style={[st.actionBtnText, { color: "#dc2626" }]}>Mark Failed</Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={st.safe}>
      <View style={st.filterCard}>
        <View style={st.chipRow}>
          {STATUS_TABS.map((s) => (
            <Pressable key={s || "all"} style={[st.chip, statusFilter === s && st.chipActive]} onPress={() => setStatusFilter(s)}>
              <Text style={[st.chipText, statusFilter === s && st.chipTextActive]}>
                {s || "All"}{s ? ` (${tabCounts[s] || 0})` : ""}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={st.center}><ActivityIndicator size="large" color="#6366f1" /></View>
      ) : (
        <FlatList
          data={assignments}
          keyExtractor={(r, i) => String(r.assignment_id || i)}
          renderItem={renderItem}
          contentContainerStyle={st.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          ListEmptyComponent={<View style={st.emptyWrap}><Text style={st.emptyIcon}>🛵</Text><Text style={st.emptyTitle}>No deliveries</Text></View>}
        />
      )}

      <View style={st.fabRow}>
        <Pressable style={[st.fab, st.fabSecondary]} onPress={() => setBoyModalOpen(true)}>
          <Text style={st.fabSecondaryText}>+ Rider</Text>
        </Pressable>
        <Pressable style={st.fab} onPress={() => setAssignModalOpen(true)}>
          <Text style={st.fabText}>+ Assign Delivery</Text>
        </Pressable>
      </View>

      <Modal visible={boyModalOpen} animationType="slide" transparent onRequestClose={() => setBoyModalOpen(false)}>
        <Pressable style={st.modalBackdrop} onPress={() => setBoyModalOpen(false)}>
          <Pressable style={st.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={st.modalTitle}>Delivery Riders</Text>
            {boys.map((b) => (
              <View key={b.delivery_boy_id} style={st.boyRow}>
                <View>
                  <Text style={st.boyName}>{b.name}</Text>
                  <Text style={st.meta}>{b.mobile}</Text>
                </View>
                <Pressable onPress={() => toggleBoyActive(b)}>
                  <Text style={b.is_active ? st.boyActive : st.boyInactive}>{b.is_active ? "Active" : "Inactive"}</Text>
                </Pressable>
              </View>
            ))}
            <TextInput style={st.input} placeholder="New rider name" placeholderTextColor="#94a3b8" value={boyName} onChangeText={setBoyName} />
            <TextInput style={st.input} placeholder="Mobile" placeholderTextColor="#94a3b8" keyboardType="phone-pad" value={boyMobile} onChangeText={setBoyMobile} />
            <View style={st.modalActions}>
              <Pressable style={st.cancelBtn} onPress={() => setBoyModalOpen(false)}><Text style={st.cancelBtnText}>Close</Text></Pressable>
              <Pressable style={st.saveBtn} disabled={savingBoy} onPress={addBoy}>
                {savingBoy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.saveBtnText}>Add Rider</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={assignModalOpen} animationType="slide" transparent onRequestClose={() => setAssignModalOpen(false)}>
        <Pressable style={st.modalBackdrop} onPress={() => setAssignModalOpen(false)}>
          <Pressable style={st.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={st.modalTitle}>Assign Delivery</Text>
            <Text style={st.sectionLabel}>Rider</Text>
            <View style={st.chipRow}>
              {boys.filter((b) => b.is_active).map((b) => (
                <Pressable key={b.delivery_boy_id} style={[st.chip, String(selectedBoyId) === String(b.delivery_boy_id) && st.chipActive]} onPress={() => setSelectedBoyId(String(b.delivery_boy_id))}>
                  <Text style={[st.chipText, String(selectedBoyId) === String(b.delivery_boy_id) && st.chipTextActive]}>{b.name}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput style={st.input} placeholder="Customer name" placeholderTextColor="#94a3b8" value={customerName} onChangeText={setCustomerName} />
            <TextInput style={st.input} placeholder="Mobile" placeholderTextColor="#94a3b8" keyboardType="phone-pad" value={customerMobile} onChangeText={setCustomerMobile} />
            <TextInput style={st.input} placeholder="Delivery address" placeholderTextColor="#94a3b8" value={address} onChangeText={setAddress} />
            <TextInput style={st.input} placeholder="Notes (optional)" placeholderTextColor="#94a3b8" value={assignNotes} onChangeText={setAssignNotes} />
            <View style={st.modalActions}>
              <Pressable style={st.cancelBtn} onPress={() => setAssignModalOpen(false)}><Text style={st.cancelBtnText}>Cancel</Text></Pressable>
              <Pressable style={st.saveBtn} disabled={assigning} onPress={createAssignment}>
                {assigning ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.saveBtnText}>Assign</Text>}
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
  filterCard: { paddingHorizontal: 14, paddingTop: 10 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#fff" },
  chipActive: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  chipText: { fontSize: 11, fontWeight: "700", color: "#4b5563" },
  chipTextActive: { color: "#fff" },
  list: { padding: 14, paddingBottom: 100, gap: 10 },
  card: { backgroundColor: "#fff", borderRadius: 16, borderWidth: 1.5, borderColor: "#e4e9f2", padding: 12, gap: 3 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  customerName: { fontSize: 14, fontWeight: "800", color: "#0a0f1e", flex: 1 },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 10, fontWeight: "800" },
  meta: { fontSize: 12, color: "#6b7280" },
  notesText: { fontSize: 11, color: "#d97706", fontWeight: "600" },
  timeMeta: { fontSize: 10, color: "#9ca3af", fontWeight: "600" },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  actionBtnText: { fontSize: 11, fontWeight: "800" },
  emptyWrap: { alignItems: "center", paddingTop: 50, gap: 10 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { color: "#9ca3af", fontSize: 15, fontWeight: "700" },
  fabRow: { position: "absolute", right: 16, bottom: 20, flexDirection: "row", gap: 10 },
  fab: { backgroundColor: "#6366f1", borderRadius: 999, paddingHorizontal: 18, paddingVertical: 14, elevation: 4 },
  fabSecondary: { backgroundColor: "#fff", borderWidth: 1.5, borderColor: "#6366f1" },
  fabText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  fabSecondaryText: { color: "#6366f1", fontWeight: "800", fontSize: 13 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(10,15,30,0.45)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#fff", borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, gap: 10, maxHeight: "85%" },
  modalTitle: { fontSize: 16, fontWeight: "800", color: "#0a0f1e" },
  sectionLabel: { fontSize: 11, fontWeight: "800", color: "#9ca3af", textTransform: "uppercase" },
  boyRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#f1f3f9" },
  boyName: { fontSize: 13, fontWeight: "700", color: "#0a0f1e" },
  boyActive: { color: "#059669", fontWeight: "700", fontSize: 12 },
  boyInactive: { color: "#9ca3af", fontWeight: "700", fontSize: 12 },
  input: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12, backgroundColor: "#f8f9fd", paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: "#0a0f1e" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 6 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: "#f1f3f9", alignItems: "center" },
  cancelBtnText: { color: "#4b5563", fontWeight: "700", fontSize: 13 },
  saveBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: "#6366f1", alignItems: "center" },
  saveBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
});
