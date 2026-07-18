import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import api from "../api/client";
import { useAuth } from "../context/AuthContext";

const STATUS_META = {
  PENDING:   { label: "Pending",   color: "#f59e0b" },
  CONFIRMED: { label: "Confirmed", color: "#2563eb" },
  SEATED:    { label: "Seated",    color: "#059669" },
  CANCELLED: { label: "Cancelled", color: "#dc2626" },
  NO_SHOW:   { label: "No Show",   color: "#6b7280" },
};
const STATUS_KEYS = Object.keys(STATUS_META);
const PAY_META = {
  PAID:   { label: "Paid",          color: "#059669" },
  UNPAID: { label: "Awaiting Pay",  color: "#d97706" },
};
const todayStr = () => new Date().toISOString().split("T")[0];

const EMPTY_FORM = { customer_name: "", mobile: "", email: "", table_id: "", time: "19:00", guests: "2", notes: "" };

export default function ReservationsScreen() {
  const { session } = useAuth();
  const [date, setDate] = useState(session?.app_date || todayStr());
  const [rows, setRows] = useState([]);
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [modalOpen, setModalOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState("");

  const load = useCallback(async (isRefresh) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params = { reservation_date: date };
      if (session?.branch_id) params.branch_id = session.branch_id;
      const res = await api.get("/reservations/", { params });
      setRows(Array.isArray(res.data) ? res.data : []);
      if (session?.branch_id) {
        const tRes = await api.get(`/tables/branch/${session.branch_id}`);
        setTables(Array.isArray(tRes.data) ? tRes.data : []);
      }
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load reservations");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [date, session?.branch_id]);

  useEffect(() => { load(); }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  const openNew = () => {
    setEditRow(null);
    setForm({ ...EMPTY_FORM });
    setModalOpen(true);
  };

  const openEdit = (r) => {
    setEditRow(r);
    setForm({
      customer_name: r.customer_name || "",
      mobile: r.mobile || "",
      email: r.email || "",
      table_id: r.table_id ? String(r.table_id) : "",
      time: r.reservation_time || "19:00",
      guests: r.guests ? String(r.guests) : "1",
      notes: r.notes || "",
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.customer_name.trim()) return Alert.alert("Validation", "Customer name is required");
    if (!form.mobile.trim()) return Alert.alert("Validation", "Mobile is required");
    if (!form.time) return Alert.alert("Validation", "Time is required");
    setSaving(true);
    try {
      const payload = {
        customer_name: form.customer_name.trim(),
        mobile: form.mobile.trim(),
        email: form.email.trim() || null,
        table_id: form.table_id ? Number(form.table_id) : null,
        reservation_date: date,
        reservation_time: form.time,
        guests: form.guests ? Number(form.guests) : 1,
        notes: form.notes.trim() || null,
      };
      if (editRow) {
        await api.put(`/reservations/${editRow.reservation_id}`, payload);
      } else {
        await api.post("/reservations/", { ...payload, branch_id: session?.branch_id });
      }
      setModalOpen(false);
      setEditRow(null);
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to save reservation");
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (r, status, cancel_reason = "") => {
    setBusyId(r.reservation_id);
    try {
      await api.put(`/reservations/${r.reservation_id}/status`, { status, cancel_reason });
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to update status");
    } finally {
      setBusyId(null);
    }
  };

  const submitCancel = () => {
    if (!cancelTarget) return;
    setStatus(cancelTarget, "CANCELLED", cancelReason.trim());
    setCancelTarget(null);
    setCancelReason("");
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
    const actions = [];
    if (r.status === "PENDING") {
      actions.push({ label: r.payment_status === "PAID" ? "Approve" : "Confirm", status: "CONFIRMED" });
    }
    if (r.status === "CONFIRMED") {
      actions.push({ label: "Seated", status: "SEATED" });
    }
    if (["PENDING", "CONFIRMED"].includes(r.status)) {
      actions.push({ label: "No Show", status: "NO_SHOW" });
      actions.push({ label: "Cancel", status: "CANCELLED", withReason: true });
    }
    return actions;
  };

  const counts = STATUS_KEYS.reduce((acc, k) => {
    acc[k] = rows.filter((r) => r.status === k).length;
    return acc;
  }, {});
  const filteredRows = statusFilter === "ALL" ? rows : rows.filter((r) => r.status === statusFilter);
  const tableName = (id) => tables.find((t) => String(t.table_id) === String(id))?.table_name || (id ? `#${id}` : "—");

  const renderItem = ({ item }) => {
    const statusMeta = STATUS_META[item.status] || STATUS_META.PENDING;
    const payMeta = PAY_META[item.payment_status] || PAY_META.UNPAID;
    return (
      <View style={st.card}>
        <View style={st.cardTop}>
          <Text style={st.name}>{item.customer_name}</Text>
          <View style={[st.badge, { backgroundColor: `${statusMeta.color}22` }]}>
            <Text style={[st.badgeText, { color: statusMeta.color }]}>{statusMeta.label}</Text>
          </View>
        </View>
        <Text style={st.meta}>
          {item.reservation_time} · {item.guests} guest{item.guests === 1 ? "" : "s"}{item.mobile ? ` · ${item.mobile}` : ""}
        </Text>
        <Text style={st.meta}>Table: {tableName(item.table_id)}</Text>
        {item.notes ? <Text style={st.meta} numberOfLines={1}>{item.notes}</Text> : null}
        <View style={[st.badge, { alignSelf: "flex-start", backgroundColor: `${payMeta.color}18` }]}>
          <Text style={[st.badgeText, { color: payMeta.color }]}>{payMeta.label}</Text>
        </View>
        <View style={st.actionsRow}>
          {nextActions(item).map((a) => (
            <Pressable
              key={a.status}
              disabled={busyId === item.reservation_id}
              style={[st.actionBtn, { backgroundColor: `${STATUS_META[a.status]?.color || "#6b7280"}18` }]}
              onPress={() => {
                if (a.withReason) {
                  setCancelTarget(item);
                  setCancelReason("");
                } else {
                  setStatus(item, a.status);
                }
              }}
            >
              <Text style={[st.actionBtnText, { color: STATUS_META[a.status]?.color || "#6b7280" }]}>{a.label}</Text>
            </Pressable>
          ))}
          <Pressable style={[st.actionBtn, { backgroundColor: "#eef2ff" }]} onPress={() => openEdit(item)}>
            <Text style={[st.actionBtnText, { color: "#4338ca" }]}>Edit</Text>
          </Pressable>
          <Pressable style={[st.actionBtn, { backgroundColor: "#f1f3f9" }]} onPress={() => remove(item)}>
            <Text style={[st.actionBtnText, { color: "#6b7280" }]}>Delete</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={st.safe}>
      <View style={st.dateRow}>
        <TextInput style={st.dateInput} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor="#94a3b8" onSubmitEditing={() => load()} />
        <Pressable style={st.todayBtn} onPress={() => setDate(todayStr())}><Text style={st.todayBtnText}>Today</Text></Pressable>
      </View>

      {/* Status summary cards as filter toggles */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.summaryRow} contentContainerStyle={{ gap: 8, paddingHorizontal: 14 }}>
        <Pressable
          style={[st.summaryCard, statusFilter === "ALL" && st.summaryCardActive]}
          onPress={() => setStatusFilter("ALL")}
        >
          <Text style={st.summaryCount}>{rows.length}</Text>
          <Text style={st.summaryLabel}>All</Text>
        </Pressable>
        {STATUS_KEYS.map((k) => (
          <Pressable
            key={k}
            style={[st.summaryCard, statusFilter === k && st.summaryCardActive, { borderColor: STATUS_META[k].color }]}
            onPress={() => setStatusFilter(statusFilter === k ? "ALL" : k)}
          >
            <Text style={[st.summaryCount, { color: STATUS_META[k].color }]}>{counts[k] || 0}</Text>
            <Text style={[st.summaryLabel, { color: STATUS_META[k].color }]}>{STATUS_META[k].label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? (
        <View style={st.center}><ActivityIndicator size="large" color="#6366f1" /></View>
      ) : (
        <FlatList
          data={filteredRows}
          keyExtractor={(r, i) => String(r.reservation_id || i)}
          renderItem={renderItem}
          contentContainerStyle={st.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          ListEmptyComponent={<View style={st.emptyWrap}><Text style={st.emptyIcon}>📅</Text><Text style={st.emptyTitle}>No reservations on this date</Text></View>}
        />
      )}

      <Pressable style={st.fab} onPress={openNew}>
        <Text style={st.fabText}>+ New Reservation</Text>
      </Pressable>

      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
        <Pressable style={st.modalBackdrop} onPress={() => setModalOpen(false)}>
          <Pressable style={st.modalSheet} onPress={(e) => e.stopPropagation()}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={st.modalTitle}>{editRow ? "Edit Reservation" : "New Reservation"} ({date})</Text>
              <TextInput style={st.input} placeholder="Customer name *" placeholderTextColor="#94a3b8" value={form.customer_name} onChangeText={(v) => setForm((f) => ({ ...f, customer_name: v }))} />
              <TextInput style={st.input} placeholder="Mobile *" placeholderTextColor="#94a3b8" keyboardType="phone-pad" value={form.mobile} onChangeText={(v) => setForm((f) => ({ ...f, mobile: v }))} />
              <TextInput style={st.input} placeholder="Email (optional)" placeholderTextColor="#94a3b8" autoCapitalize="none" keyboardType="email-address" value={form.email} onChangeText={(v) => setForm((f) => ({ ...f, email: v }))} />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput style={[st.input, { flex: 1 }]} placeholder="Time (HH:MM) *" placeholderTextColor="#94a3b8" value={form.time} onChangeText={(v) => setForm((f) => ({ ...f, time: v }))} />
                <TextInput style={[st.input, { width: 70 }]} placeholder="Guests" placeholderTextColor="#94a3b8" keyboardType="numeric" value={form.guests} onChangeText={(v) => setForm((f) => ({ ...f, guests: v }))} />
              </View>
              <Text style={st.sectionLabel}>Table (optional)</Text>
              <View style={st.chipRow}>
                <Pressable style={[st.chip, !form.table_id && st.chipActive]} onPress={() => setForm((f) => ({ ...f, table_id: "" }))}>
                  <Text style={[st.chipText, !form.table_id && st.chipTextActive]}>Not assigned</Text>
                </Pressable>
                {tables.filter((t) => t.status === "FREE" || String(t.table_id) === String(form.table_id)).map((t) => (
                  <Pressable key={t.table_id} style={[st.chip, String(form.table_id) === String(t.table_id) && st.chipActive]} onPress={() => setForm((f) => ({ ...f, table_id: String(t.table_id) }))}>
                    <Text style={[st.chipText, String(form.table_id) === String(t.table_id) && st.chipTextActive]}>{t.table_name}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput style={st.input} placeholder="Notes (optional)" placeholderTextColor="#94a3b8" value={form.notes} onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))} />
              <View style={st.modalActions}>
                <Pressable style={st.cancelBtn} onPress={() => setModalOpen(false)}><Text style={st.cancelBtnText}>Cancel</Text></Pressable>
                <Pressable style={st.saveBtn} disabled={saving} onPress={save}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.saveBtnText}>{editRow ? "Update Reservation" : "Create"}</Text>}
                </Pressable>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Cancel with reason modal */}
      <Modal visible={Boolean(cancelTarget)} animationType="fade" transparent onRequestClose={() => setCancelTarget(null)}>
        <View style={st.modalBackdrop}>
          <View style={st.modalSheet}>
            <Text style={st.modalTitle}>Cancel Reservation</Text>
            <Text style={st.sectionLabel}>Reason (optional)</Text>
            <TextInput style={st.input} placeholder="Why is it being cancelled?" placeholderTextColor="#94a3b8" value={cancelReason} onChangeText={setCancelReason} />
            <View style={st.modalActions}>
              <Pressable style={st.cancelBtn} onPress={() => setCancelTarget(null)}><Text style={st.cancelBtnText}>Back</Text></Pressable>
              <Pressable style={[st.saveBtn, { backgroundColor: "#dc2626" }]} onPress={submitCancel}>
                <Text style={st.saveBtnText}>Confirm Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
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
  summaryRow: { flexGrow: 0, marginTop: 4 },
  summaryCard: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 14, backgroundColor: "#fff", paddingHorizontal: 14, paddingVertical: 8, alignItems: "center", minWidth: 74 },
  summaryCardActive: { backgroundColor: "#f8f9fd" },
  summaryCount: { fontSize: 16, fontWeight: "900", color: "#0a0f1e" },
  summaryLabel: { fontSize: 10, fontWeight: "700", color: "#6b7280", textTransform: "uppercase" },
  list: { padding: 14, paddingTop: 10, paddingBottom: 90, gap: 10 },
  card: { backgroundColor: "#fff", borderRadius: 16, borderWidth: 1.5, borderColor: "#e4e9f2", padding: 12, gap: 5 },
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
  input: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12, backgroundColor: "#f8f9fd", paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: "#0a0f1e", marginBottom: 8 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 6 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: "#f1f3f9", alignItems: "center" },
  cancelBtnText: { color: "#4b5563", fontWeight: "700", fontSize: 13 },
  saveBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: "#6366f1", alignItems: "center" },
  saveBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
});
