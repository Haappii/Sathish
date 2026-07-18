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
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import api from "../api/client";

const REPORT_TYPES = [
  { key: "daily_sales", label: "Daily Sales" },
  { key: "item_sales", label: "Item Sales" },
  { key: "gst_summary", label: "GST Summary" },
];
const BLANK = { name: "", report_type: "daily_sales", send_time: "09:00", recipient_email: "" };

export default function MailSchedulerScreen() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (isRefresh) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await api.get("/mail-scheduler/");
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load schedules");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditingId(null); setForm(BLANK); setModalOpen(true); };
  const openEdit = (r) => {
    setEditingId(r.schedule_id);
    setForm({ name: r.name || "", report_type: r.report_type || "daily_sales", send_time: r.send_time || "09:00", recipient_email: r.recipient_email || "" });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.recipient_email.trim()) return Alert.alert("Validation", "Name and recipient email are required");
    setSaving(true);
    try {
      if (editingId) await api.put(`/mail-scheduler/${editingId}`, form);
      else await api.post("/mail-scheduler/", { ...form, is_active: true });
      setModalOpen(false);
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to save schedule");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (r) => {
    try {
      await api.put(`/mail-scheduler/${r.schedule_id}`, { is_active: !r.is_active });
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to update");
    }
  };

  const remove = (r) => {
    Alert.alert("Delete Schedule", `Delete "${r.name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await api.delete(`/mail-scheduler/${r.schedule_id}`); load(); }
        catch (err) { Alert.alert("Error", err?.response?.data?.detail || "Failed to delete"); }
      }},
    ]);
  };

  const renderItem = ({ item }) => (
    <View style={st.card}>
      <View style={st.cardTop}>
        <Text style={st.name}>{item.name}</Text>
        <Switch value={!!item.is_active} onValueChange={() => toggleActive(item)} trackColor={{ true: "#6366f1" }} />
      </View>
      <Text style={st.meta}>{REPORT_TYPES.find((t) => t.key === item.report_type)?.label || item.report_type} · {item.send_time}</Text>
      <Text style={st.meta}>{item.recipient_email}</Text>
      <View style={st.actionsRow}>
        <Pressable style={st.editBtn} onPress={() => openEdit(item)}><Text style={st.editBtnText}>Edit</Text></Pressable>
        <Pressable style={st.deleteBtn} onPress={() => remove(item)}><Text style={st.deleteBtnText}>Delete</Text></Pressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={st.safe}>
      {loading ? (
        <View style={st.center}><ActivityIndicator size="large" color="#6366f1" /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r, i) => String(r.schedule_id || i)}
          renderItem={renderItem}
          contentContainerStyle={st.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          ListEmptyComponent={<View style={st.emptyWrap}><Text style={st.emptyIcon}>📧</Text><Text style={st.emptyTitle}>No scheduled reports</Text></View>}
        />
      )}
      <Pressable style={st.fab} onPress={openNew}><Text style={st.fabText}>+ New Schedule</Text></Pressable>

      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
        <Pressable style={st.modalBackdrop} onPress={() => setModalOpen(false)}>
          <Pressable style={st.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={st.modalTitle}>{editingId ? "Edit Schedule" : "New Schedule"}</Text>
            <TextInput style={st.input} placeholder="Name" placeholderTextColor="#94a3b8" value={form.name} onChangeText={(v) => setForm((p) => ({ ...p, name: v }))} />
            <View style={st.chipRow}>
              {REPORT_TYPES.map((t) => (
                <Pressable key={t.key} style={[st.chip, form.report_type === t.key && st.chipActive]} onPress={() => setForm((p) => ({ ...p, report_type: t.key }))}>
                  <Text style={[st.chipText, form.report_type === t.key && st.chipTextActive]}>{t.label}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput style={st.input} placeholder="Send time (HH:MM)" placeholderTextColor="#94a3b8" value={form.send_time} onChangeText={(v) => setForm((p) => ({ ...p, send_time: v }))} />
            <TextInput style={st.input} placeholder="Recipient email" placeholderTextColor="#94a3b8" keyboardType="email-address" value={form.recipient_email} onChangeText={(v) => setForm((p) => ({ ...p, recipient_email: v }))} />
            <View style={st.modalActions}>
              <Pressable style={st.cancelBtn} onPress={() => setModalOpen(false)}><Text style={st.cancelBtnText}>Cancel</Text></Pressable>
              <Pressable style={st.saveBtn} disabled={saving} onPress={save}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.saveBtnText}>Save</Text>}
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
  list: { padding: 14, paddingBottom: 90, gap: 10 },
  card: { backgroundColor: "#fff", borderRadius: 16, borderWidth: 1.5, borderColor: "#e4e9f2", padding: 12, gap: 4 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontSize: 14, fontWeight: "800", color: "#0a0f1e" },
  meta: { fontSize: 11, color: "#6b7280" },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  editBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: "#eef2ff" },
  editBtnText: { color: "#6366f1", fontSize: 11, fontWeight: "800" },
  deleteBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: "#fef2f2" },
  deleteBtnText: { color: "#dc2626", fontSize: 11, fontWeight: "800" },
  emptyWrap: { alignItems: "center", paddingTop: 50, gap: 10 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { color: "#9ca3af", fontSize: 15, fontWeight: "700" },
  fab: { position: "absolute", right: 16, bottom: 20, backgroundColor: "#6366f1", borderRadius: 999, paddingHorizontal: 20, paddingVertical: 14, elevation: 4 },
  fabText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(10,15,30,0.45)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#fff", borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, gap: 10 },
  modalTitle: { fontSize: 16, fontWeight: "800", color: "#0a0f1e" },
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
