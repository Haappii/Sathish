import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

const fmt = (v) => `₹${Number(v || 0).toFixed(2)}`;

const STATUS_COLORS = {
  PENDING: "#d97706",
  CONFIRMED: "#0b57d0",
  READY: "#7c3aed",
  COMPLETED: "#059669",
  CANCELLED: "#dc2626",
};
const STATUS_LIST = ["PENDING", "CONFIRMED", "READY", "COMPLETED", "CANCELLED"];
const PAYMENT_MODES = ["CASH", "UPI", "CARD"];

function StatusBadge({ status }) {
  return (
    <View style={[styles.badge, { backgroundColor: (STATUS_COLORS[status] || "#64748b") + "20" }]}>
      <Text style={[styles.badgeText, { color: STATUS_COLORS[status] || "#64748b" }]}>{status}</Text>
    </View>
  );
}

const EMPTY_FORM = {
  customer_name: "",
  customer_phone: "",
  expected_date: "",
  expected_time: "",
  total_amount: "",
  advance_amount: "",
  advance_payment_mode: "CASH",
  notes: "",
};

export default function AdvanceOrdersScreen() {
  const { session } = useAuth();
  const today = session?.app_date || new Date().toISOString().split("T")[0];

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterDate, setFilterDate] = useState(today);
  const [filterStatus, setFilterStatus] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pmPicker, setPmPicker] = useState(false);
  const [statusPicker, setStatusPicker] = useState(null); // order_id

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const params = {};
      if (filterDate) params.expected_date = filterDate;
      if (filterStatus) params.status = filterStatus;
      const res = await api.get("/advance-orders/", { params });
      setOrders(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      if (!silent) Alert.alert("Error", err?.response?.data?.detail || "Failed to load advance orders");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filterDate, filterStatus]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditId(null);
    setForm({ ...EMPTY_FORM, expected_date: filterDate || today });
    setShowForm(true);
  };

  const openEdit = (order) => {
    setEditId(order.order_id);
    setForm({
      customer_name: order.customer_name || "",
      customer_phone: order.customer_phone || "",
      expected_date: order.expected_date || "",
      expected_time: order.expected_time || "",
      total_amount: String(order.total_amount || ""),
      advance_amount: String(order.advance_amount || ""),
      advance_payment_mode: order.advance_payment_mode || "CASH",
      notes: order.notes || "",
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.customer_name.trim()) return Alert.alert("Validation", "Customer name is required");
    if (!form.expected_date) return Alert.alert("Validation", "Expected date is required");
    setSaving(true);
    try {
      const payload = {
        ...form,
        total_amount: parseFloat(form.total_amount || 0),
        advance_amount: parseFloat(form.advance_amount || 0),
      };
      if (editId) {
        await api.put(`/advance-orders/${editId}`, payload);
      } else {
        await api.post("/advance-orders/", payload);
      }
      setShowForm(false);
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      await api.put(`/advance-orders/${orderId}`, { status: newStatus });
      setStatusPicker(null);
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to update");
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Filters */}
      <View style={styles.filterBar}>
        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>DATE</Text>
          <TextInput
            style={styles.filterInput}
            value={filterDate}
            onChangeText={setFilterDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#94a3b8"
          />
        </View>
        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>STATUS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.statusRow}>
              {["", ...STATUS_LIST].map((s) => (
                <Pressable
                  key={s || "all"}
                  style={[styles.statusChip, filterStatus === s && styles.statusChipActive]}
                  onPress={() => setFilterStatus(s)}
                >
                  <Text style={[styles.statusChipText, filterStatus === s && styles.statusChipTextActive]}>
                    {s || "All"}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
      </View>

      {/* New Order Button */}
      <View style={styles.actionBar}>
        <Pressable style={styles.newBtn} onPress={openCreate}>
          <Text style={styles.newBtnText}>+ New Advance Order</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#0b57d0" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={["#0b57d0"]} />}
        >
          {orders.length === 0 ? (
            <Text style={styles.empty}>No advance orders for this date/filter</Text>
          ) : orders.map((o) => (
            <View key={o.order_id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardName}>{o.customer_name}</Text>
                  {o.customer_phone ? <Text style={styles.cardPhone}>{o.customer_phone}</Text> : null}
                  <Text style={styles.cardDate}>
                    {o.expected_date}{o.expected_time ? ` at ${o.expected_time}` : ""}
                  </Text>
                </View>
                <StatusBadge status={o.status} />
              </View>

              <View style={styles.cardAmounts}>
                <View style={styles.amtBlock}>
                  <Text style={styles.amtLabel}>TOTAL</Text>
                  <Text style={styles.amtValue}>{fmt(o.total_amount)}</Text>
                </View>
                <View style={styles.amtBlock}>
                  <Text style={styles.amtLabel}>ADVANCE</Text>
                  <Text style={[styles.amtValue, { color: "#059669" }]}>{fmt(o.advance_amount)}</Text>
                </View>
                {o.advance_payment_mode ? (
                  <View style={styles.amtBlock}>
                    <Text style={styles.amtLabel}>MODE</Text>
                    <Text style={styles.amtValue}>{o.advance_payment_mode}</Text>
                  </View>
                ) : null}
              </View>

              {o.notes ? <Text style={styles.cardNotes}>{o.notes}</Text> : null}

              {o.status !== "COMPLETED" && o.status !== "CANCELLED" && (
                <View style={styles.cardActions}>
                  <Pressable style={styles.actionBtn} onPress={() => openEdit(o)}>
                    <Text style={styles.actionBtnText}>Edit</Text>
                  </Pressable>
                  <Pressable style={[styles.actionBtn, styles.actionBtnPrimary]} onPress={() => setStatusPicker(o.order_id)}>
                    <Text style={[styles.actionBtnText, { color: "#fff" }]}>Update Status</Text>
                  </Pressable>
                </View>
              )}

              {/* Status picker */}
              {statusPicker === o.order_id && (
                <View style={styles.statusPickerBar}>
                  {STATUS_LIST.map((s) => (
                    <Pressable
                      key={s}
                      style={[styles.statusChip, { marginBottom: 4 }]}
                      onPress={() => handleStatusChange(o.order_id, s)}
                    >
                      <Text style={[styles.statusChipText, { color: STATUS_COLORS[s] || "#64748b" }]}>{s}</Text>
                    </Pressable>
                  ))}
                  <Pressable onPress={() => setStatusPicker(null)}>
                    <Text style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Cancel</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Create / Edit Modal */}
      <Modal visible={showForm} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editId ? "Edit Advance Order" : "New Advance Order"}</Text>
              <Pressable onPress={() => setShowForm(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody}>
              <Text style={styles.fieldLabel}>Customer Name *</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="Customer name"
                placeholderTextColor="#94a3b8"
                value={form.customer_name}
                onChangeText={(v) => setForm({ ...form, customer_name: v })}
              />
              <Text style={styles.fieldLabel}>Phone</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="Phone number"
                placeholderTextColor="#94a3b8"
                keyboardType="phone-pad"
                value={form.customer_phone}
                onChangeText={(v) => setForm({ ...form, customer_phone: v })}
              />
              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Expected Date *</Text>
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#94a3b8"
                    value={form.expected_date}
                    onChangeText={(v) => setForm({ ...form, expected_date: v })}
                  />
                </View>
                <View style={{ width: 8 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Time (HH:MM)</Text>
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="e.g. 14:30"
                    placeholderTextColor="#94a3b8"
                    value={form.expected_time}
                    onChangeText={(v) => setForm({ ...form, expected_time: v })}
                  />
                </View>
              </View>
              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Total Amount (₹)</Text>
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="0.00"
                    placeholderTextColor="#94a3b8"
                    keyboardType="decimal-pad"
                    value={form.total_amount}
                    onChangeText={(v) => setForm({ ...form, total_amount: v })}
                  />
                </View>
                <View style={{ width: 8 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Advance Paid (₹)</Text>
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="0.00"
                    placeholderTextColor="#94a3b8"
                    keyboardType="decimal-pad"
                    value={form.advance_amount}
                    onChangeText={(v) => setForm({ ...form, advance_amount: v })}
                  />
                </View>
              </View>
              <Text style={styles.fieldLabel}>Payment Mode</Text>
              <View style={styles.pmRow}>
                {PAYMENT_MODES.map((m) => (
                  <Pressable
                    key={m}
                    style={[styles.pmChip, form.advance_payment_mode === m && styles.pmChipActive]}
                    onPress={() => setForm({ ...form, advance_payment_mode: m })}
                  >
                    <Text style={[styles.pmChipText, form.advance_payment_mode === m && styles.pmChipTextActive]}>{m}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.fieldLabel}>Notes</Text>
              <TextInput
                style={[styles.fieldInput, { height: 64, textAlignVertical: "top" }]}
                placeholder="Special instructions…"
                placeholderTextColor="#94a3b8"
                multiline
                value={form.notes}
                onChangeText={(v) => setForm({ ...form, notes: v })}
              />
              <View style={styles.modalActions}>
                <Pressable style={styles.cancelBtn} onPress={() => setShowForm(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
                  <Text style={styles.saveBtnText}>{saving ? "Saving…" : editId ? "Update" : "Create"}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f3f6ff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  filterBar: { backgroundColor: "#fff", padding: 12, borderBottomWidth: 1, borderBottomColor: "#e2e8f0", gap: 8 },
  filterGroup: { gap: 4 },
  filterLabel: { fontSize: 9, fontWeight: "700", color: "#94a3b8", letterSpacing: 0.5 },
  filterInput: {
    borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 6, fontSize: 13, color: "#0b1220",
    backgroundColor: "#f8fafc",
  },
  statusRow: { flexDirection: "row", gap: 6 },
  statusChip: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999, borderWidth: 1, borderColor: "#cbd5e1",
    backgroundColor: "#fff",
  },
  statusChipActive: { backgroundColor: "#0b57d0", borderColor: "#0b57d0" },
  statusChipText: { fontSize: 11, fontWeight: "700", color: "#334155" },
  statusChipTextActive: { color: "#fff" },
  actionBar: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  newBtn: { backgroundColor: "#0b57d0", borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  newBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  list: { padding: 12, gap: 10, paddingBottom: 32 },
  empty: { textAlign: "center", color: "#94a3b8", marginTop: 40, fontSize: 13 },
  card: { backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#d9e3ff", padding: 12, gap: 8 },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  cardName: { fontWeight: "800", fontSize: 14, color: "#0b1220" },
  cardPhone: { fontSize: 12, color: "#64748b" },
  cardDate: { fontSize: 12, color: "#94a3b8" },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 10, fontWeight: "800" },
  cardAmounts: { flexDirection: "row", gap: 16 },
  amtBlock: { gap: 1 },
  amtLabel: { fontSize: 9, fontWeight: "700", color: "#94a3b8", letterSpacing: 0.5 },
  amtValue: { fontSize: 14, fontWeight: "800", color: "#0b1220" },
  cardNotes: { fontSize: 12, color: "#64748b", fontStyle: "italic" },
  cardActions: { flexDirection: "row", gap: 8 },
  actionBtn: { flex: 1, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, paddingVertical: 7, alignItems: "center" },
  actionBtnPrimary: { backgroundColor: "#0b57d0", borderColor: "#0b57d0" },
  actionBtnText: { fontSize: 12, fontWeight: "700", color: "#334155" },
  statusPickerBar: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingTop: 4 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "90%", paddingBottom: 32 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  modalTitle: { fontSize: 15, fontWeight: "800", color: "#0b1220" },
  modalClose: { fontSize: 18, color: "#94a3b8" },
  modalBody: { padding: 16, gap: 4, paddingBottom: 16 },
  fieldLabel: { fontSize: 11, fontWeight: "700", color: "#64748b", marginBottom: 4, marginTop: 8 },
  fieldInput: {
    borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: "#0b1220",
    backgroundColor: "#f8fafc",
  },
  row2: { flexDirection: "row", alignItems: "flex-start" },
  pmRow: { flexDirection: "row", gap: 8, marginVertical: 4 },
  pmChip: { flex: 1, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, paddingVertical: 8, alignItems: "center", backgroundColor: "#fff" },
  pmChipActive: { backgroundColor: "#0b57d0", borderColor: "#0b57d0" },
  pmChipText: { fontSize: 12, fontWeight: "700", color: "#334155" },
  pmChipTextActive: { color: "#fff" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  cancelBtnText: { fontSize: 13, fontWeight: "700", color: "#334155" },
  saveBtn: { flex: 1, backgroundColor: "#0b57d0", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  saveBtnText: { fontSize: 13, fontWeight: "800", color: "#fff" },
});
