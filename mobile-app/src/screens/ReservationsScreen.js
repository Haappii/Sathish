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

const STATUS_COLOR = { PENDING: "#f59e0b", CONFIRMED: "#6366f1", SEATED: "#059669", CANCELLED: "#dc2626", NO_SHOW: "#9ca3af" };
const todayStr = () => new Date().toISOString().split("T")[0];

export default function ReservationsScreen() {
  const { session } = useAuth();
  const [date, setDate] = useState(session?.app_date || todayStr());
  const [rows, setRows] = useState([]);
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [mobile, setMobile] = useState("");
  const [tableId, setTableId] = useState("");
  const [time, setTime] = useState("");
  const [guests, setGuests] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (isRefresh) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params = { reservation_date: date };
      if (session?.branch_id) params.branch_id = session.branch_id;
      const res = await api.get("/reservations/", { params });
      setRows(Array.isArray(res.data) ? res.data : []);
      if (session?.branch_id) {
        const tRes = await api.get(`/tables/branch/${session.branch_id}`);
        setTables(Array.isArray(tRes.data) ? tRes.data.filter((t) => t.status === "FREE" || !t.status) : []);
      }
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load reservations");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [date, session?.branch_id]);

  useEffect(() => { load(); }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    if (!customerName.trim() || !time) return Alert.alert("Validation", "Customer name and time are required");
    setSaving(true);
    try {
      await api.post("/reservations/", {
        customer_name: customerName.trim(),
        mobile: mobile.trim(),
        table_id: tableId ? Number(tableId) : null,
        reservation_date: date,
        reservation_time: time,
        guests: guests ? Number(guests) : 1,
        notes: notes.trim() || null,
      });
      setModalOpen(false);
      setCustomerName(""); setMobile(""); setTableId(""); setTime(""); setGuests(""); setNotes("");
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to create reservation");
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (r, status) => {
    setBusyId(r.reservation_id);
    try {
      await api.put(`/reservations/${r.reservation_id}/status`, { status });
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to update status");
    } finally {
      setBusyId(null);
    }
  };

  const remove = (r) => {
    Alert.alert("Delete Reservation", `Delete reservation for "${r.customer_name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await api.delete(`/reservations/${r.reservation_id}`); load(); }
        catch (err) { Alert.alert("Error", err?.response?.data?.detail || "Failed to delete"); }
      }},
    ]);
  };

  const nextActions = (r) => {
    if (r.status === "PENDING") return [{ label: "Confirm", status: "CONFIRMED" }, { label: "Cancel", status: "CANCELLED" }];
    if (r.status === "CONFIRMED") return [{ label: "Seat", status: "SEATED" }, { label: "No Show", status: "NO_SHOW" }, { label: "Cancel", status: "CANCELLED" }];
    return [];
  };

  const renderItem = ({ item }) => (
    <View style={st.card}>
      <View style={st.cardTop}>
        <Text style={st.name}>{item.customer_name}</Text>
        <View style={[st.badge, { backgroundColor: `${STATUS_COLOR[item.status] || "#9ca3af"}22` }]}>
          <Text style={[st.badgeText, { color: STATUS_COLOR[item.status] || "#9ca3af" }]}>{item.status}</Text>
        </View>
      </View>
      <Text style={st.meta}>{item.reservation_time} · {item.guests} guest{item.guests === 1 ? "" : "s"}{item.mobile ? ` · ${item.mobile}` : ""}</Text>
      {item.notes ? <Text style={st.meta} numberOfLines={1}>{item.notes}</Text> : null}
      <View style={st.actionsRow}>
        {nextActions(item).map((a) => (
          <Pressable
            key={a.status}
            disabled={busyId === item.reservation_id}
            style={[st.actionBtn, { backgroundColor: `${STATUS_COLOR[a.status]}18` }]}
            onPress={() => setStatus(item, a.status)}
          >
            <Text style={[st.actionBtnText, { color: STATUS_COLOR[a.status] }]}>{a.label}</Text>
          </Pressable>
        ))}
        <Pressable style={[st.actionBtn, { backgroundColor: "#f1f3f9" }]} onPress={() => remove(item)}>
          <Text style={[st.actionBtnText, { color: "#6b7280" }]}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={st.safe}>
      <View style={st.dateRow}>
        <TextInput style={st.dateInput} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor="#94a3b8" onSubmitEditing={() => load()} />
        <Pressable style={st.todayBtn} onPress={() => setDate(todayStr())}><Text style={st.todayBtnText}>Today</Text></Pressable>
      </View>

      {loading ? (
        <View style={st.center}><ActivityIndicator size="large" color="#6366f1" /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r, i) => String(r.reservation_id || i)}
          renderItem={renderItem}
          contentContainerStyle={st.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          ListEmptyComponent={<View style={st.emptyWrap}><Text style={st.emptyIcon}>📅</Text><Text style={st.emptyTitle}>No reservations on this date</Text></View>}
        />
      )}

      <Pressable style={st.fab} onPress={() => setModalOpen(true)}>
        <Text style={st.fabText}>+ New Reservation</Text>
      </Pressable>

      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
        <Pressable style={st.modalBackdrop} onPress={() => setModalOpen(false)}>
          <Pressable style={st.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={st.modalTitle}>New Reservation ({date})</Text>
            <TextInput style={st.input} placeholder="Customer name" placeholderTextColor="#94a3b8" value={customerName} onChangeText={setCustomerName} />
            <TextInput style={st.input} placeholder="Mobile" placeholderTextColor="#94a3b8" keyboardType="phone-pad" value={mobile} onChangeText={setMobile} />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput style={[st.input, { flex: 1 }]} placeholder="Time (HH:MM)" placeholderTextColor="#94a3b8" value={time} onChangeText={setTime} />
              <TextInput style={[st.input, { width: 70 }]} placeholder="Guests" placeholderTextColor="#94a3b8" keyboardType="numeric" value={guests} onChangeText={setGuests} />
            </View>
            {tables.length > 0 && (
              <>
                <Text style={st.sectionLabel}>Table (optional)</Text>
                <View style={st.chipRow}>
                  {tables.map((t) => (
                    <Pressable key={t.table_id} style={[st.chip, String(tableId) === String(t.table_id) && st.chipActive]} onPress={() => setTableId(String(t.table_id))}>
                      <Text style={[st.chipText, String(tableId) === String(t.table_id) && st.chipTextActive]}>{t.table_name}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}
            <TextInput style={st.input} placeholder="Notes (optional)" placeholderTextColor="#94a3b8" value={notes} onChangeText={setNotes} />
            <View style={st.modalActions}>
              <Pressable style={st.cancelBtn} onPress={() => setModalOpen(false)}><Text style={st.cancelBtnText}>Cancel</Text></Pressable>
              <Pressable style={st.saveBtn} disabled={saving} onPress={create}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.saveBtnText}>Create</Text>}
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
  dateRow: { flexDirection: "row", gap: 8, padding: 14, paddingBottom: 6 },
  dateInput: { flex: 1, borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12, backgroundColor: "#fff", paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, color: "#0a0f1e" },
  todayBtn: { backgroundColor: "#eef2ff", borderRadius: 12, paddingHorizontal: 14, justifyContent: "center" },
  todayBtnText: { color: "#6366f1", fontWeight: "700", fontSize: 12 },
  list: { padding: 14, paddingTop: 6, paddingBottom: 90, gap: 10 },
  card: { backgroundColor: "#fff", borderRadius: 16, borderWidth: 1.5, borderColor: "#e4e9f2", padding: 12, gap: 3 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontSize: 14, fontWeight: "800", color: "#0a0f1e", flex: 1 },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 10, fontWeight: "800" },
  meta: { fontSize: 12, color: "#6b7280" },
  actionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  actionBtnText: { fontSize: 11, fontWeight: "800" },
  emptyWrap: { alignItems: "center", paddingTop: 50, gap: 10 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { color: "#9ca3af", fontSize: 15, fontWeight: "700" },
  fab: { position: "absolute", right: 16, bottom: 20, backgroundColor: "#6366f1", borderRadius: 999, paddingHorizontal: 20, paddingVertical: 14, elevation: 4 },
  fabText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(10,15,30,0.45)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#fff", borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, gap: 10, maxHeight: "85%" },
  modalTitle: { fontSize: 16, fontWeight: "800", color: "#0a0f1e" },
  sectionLabel: { fontSize: 11, fontWeight: "800", color: "#9ca3af", textTransform: "uppercase" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#f8f9fd" },
  chipActive: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  chipText: { fontSize: 11, fontWeight: "700", color: "#4b5563" },
  chipTextActive: { color: "#fff" },
  input: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12, backgroundColor: "#f8f9fd", paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: "#0a0f1e" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 6 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: "#f1f3f9", alignItems: "center" },
  cancelBtnText: { color: "#4b5563", fontWeight: "700", fontSize: 13 },
  saveBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: "#6366f1", alignItems: "center" },
  saveBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
});
