import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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

const BLANK = {
  branch_name: "", address_line1: "", city: "", state: "", pincode: "",
  discount_enabled: false, discount_type: "PERCENT", discount_value: "",
  loyalty_percent: "", upi_id: "",
  kot_print_enabled: true, receipt_print_enabled: true,
};

export default function BranchesScreen() {
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
      const res = await api.get("/branch/scoped");
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load branches");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditingId(null); setForm(BLANK); setModalOpen(true); };
  const openEdit = (b) => {
    setEditingId(b.branch_id);
    setForm({
      branch_name: b.branch_name || "", address_line1: b.address_line1 || "", city: b.city || "", state: b.state || "", pincode: b.pincode || "",
      discount_enabled: !!b.discount_enabled, discount_type: b.discount_type || "PERCENT", discount_value: String(b.discount_value ?? ""),
      loyalty_percent: String(b.loyalty_percent ?? ""), upi_id: b.upi_id || "",
      kot_print_enabled: b.kot_print_enabled !== false, receipt_print_enabled: b.receipt_print_enabled !== false,
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.branch_name.trim()) return Alert.alert("Validation", "Branch name is required");
    setSaving(true);
    try {
      const payload = {
        ...form,
        discount_value: form.discount_value ? Number(form.discount_value) : 0,
        loyalty_percent: form.loyalty_percent ? Number(form.loyalty_percent) : 0,
      };
      if (editingId) await api.put(`/branch/${editingId}`, payload);
      else await api.post("/branch/create", payload);
      setModalOpen(false);
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to save branch");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (b) => {
    const next = String(b.status).toUpperCase() === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    try {
      await api.post(`/branch/${b.branch_id}/status`, null, { params: { status: next } });
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to update status");
    }
  };

  const renderItem = ({ item }) => {
    const active = String(item.status).toUpperCase() === "ACTIVE";
    return (
      <View style={st.card}>
        <Pressable onPress={() => openEdit(item)}>
          <View style={st.cardTop}>
            <Text style={st.name}>{item.branch_name}</Text>
            <Pressable style={[st.badge, active ? st.badgeOn : st.badgeOff]} onPress={() => toggleStatus(item)}>
              <Text style={st.badgeText}>{active ? "Active" : "Inactive"}</Text>
            </Pressable>
          </View>
          <Text style={st.meta}>{[item.address_line1, item.city, item.state].filter(Boolean).join(", ") || "No address set"}</Text>
        </Pressable>
        <Pressable style={st.editBtn} onPress={() => openEdit(item)}><Text style={st.editBtnText}>Edit</Text></Pressable>
      </View>
    );
  };

  return (
    <SafeAreaView style={st.safe}>
      <View style={st.note}>
        <Text style={st.noteText}>Core branch fields only — online-order integrations (Swiggy/Zomato) and multi-UPI aren't editable here yet, use the web dashboard for those.</Text>
      </View>
      {loading ? (
        <View style={st.center}><ActivityIndicator size="large" color="#6366f1" /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r, i) => String(r.branch_id || i)}
          renderItem={renderItem}
          contentContainerStyle={st.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          ListEmptyComponent={<View style={st.emptyWrap}><Text style={st.emptyIcon}>🏬</Text><Text style={st.emptyTitle}>No branches yet</Text></View>}
        />
      )}
      <Pressable style={st.fab} onPress={openNew}><Text style={st.fabText}>+ New Branch</Text></Pressable>

      {modalOpen && (
        <SafeAreaView style={[st.safe, StyleSheet.absoluteFill]}>
          <View style={st.detailHeader}>
            <Pressable onPress={() => setModalOpen(false)}><Text style={st.backLink}>‹ Cancel</Text></Pressable>
            <Text style={st.detailTitle}>{editingId ? "Edit Branch" : "New Branch"}</Text>
          </View>
          <FlatList
            data={[1]}
            keyExtractor={() => "form"}
            contentContainerStyle={{ padding: 14, gap: 10 }}
            renderItem={() => (
              <View style={{ gap: 10 }}>
                <TextInput style={st.input} placeholder="Branch name" placeholderTextColor="#94a3b8" value={form.branch_name} onChangeText={(v) => setForm((p) => ({ ...p, branch_name: v }))} />
                <TextInput style={st.input} placeholder="Address" placeholderTextColor="#94a3b8" value={form.address_line1} onChangeText={(v) => setForm((p) => ({ ...p, address_line1: v }))} />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TextInput style={[st.input, { flex: 1 }]} placeholder="City" placeholderTextColor="#94a3b8" value={form.city} onChangeText={(v) => setForm((p) => ({ ...p, city: v }))} />
                  <TextInput style={[st.input, { flex: 1 }]} placeholder="State" placeholderTextColor="#94a3b8" value={form.state} onChangeText={(v) => setForm((p) => ({ ...p, state: v }))} />
                  <TextInput style={[st.input, { width: 90 }]} placeholder="Pincode" placeholderTextColor="#94a3b8" keyboardType="numeric" value={form.pincode} onChangeText={(v) => setForm((p) => ({ ...p, pincode: v }))} />
                </View>
                <TextInput style={st.input} placeholder="UPI ID" placeholderTextColor="#94a3b8" value={form.upi_id} onChangeText={(v) => setForm((p) => ({ ...p, upi_id: v }))} />
                <View style={st.toggleRow}>
                  <Text style={st.toggleLabel}>Discount Enabled</Text>
                  <Switch value={form.discount_enabled} onValueChange={(v) => setForm((p) => ({ ...p, discount_enabled: v }))} trackColor={{ true: "#6366f1" }} />
                </View>
                {form.discount_enabled && (
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <View style={st.chipRow}>
                      {["PERCENT", "FLAT"].map((t) => (
                        <Pressable key={t} style={[st.chip, form.discount_type === t && st.chipActive]} onPress={() => setForm((p) => ({ ...p, discount_type: t }))}>
                          <Text style={[st.chipText, form.discount_type === t && st.chipTextActive]}>{t === "PERCENT" ? "%" : "₹"}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <TextInput style={[st.input, { flex: 1 }]} placeholder="Value" placeholderTextColor="#94a3b8" keyboardType="numeric" value={form.discount_value} onChangeText={(v) => setForm((p) => ({ ...p, discount_value: v }))} />
                  </View>
                )}
                <TextInput style={st.input} placeholder="Loyalty % on bills" placeholderTextColor="#94a3b8" keyboardType="numeric" value={form.loyalty_percent} onChangeText={(v) => setForm((p) => ({ ...p, loyalty_percent: v }))} />
                <View style={st.toggleRow}>
                  <Text style={st.toggleLabel}>Print KOT</Text>
                  <Switch value={form.kot_print_enabled} onValueChange={(v) => setForm((p) => ({ ...p, kot_print_enabled: v }))} trackColor={{ true: "#6366f1" }} />
                </View>
                <View style={st.toggleRow}>
                  <Text style={st.toggleLabel}>Print Receipt</Text>
                  <Switch value={form.receipt_print_enabled} onValueChange={(v) => setForm((p) => ({ ...p, receipt_print_enabled: v }))} trackColor={{ true: "#6366f1" }} />
                </View>
              </View>
            )}
          />
          <View style={st.detailActions}>
            <Pressable style={st.completeBtn} disabled={saving} onPress={save}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.completeBtnText}>{editingId ? "Save Changes" : "Create Branch"}</Text>}
            </Pressable>
          </View>
        </SafeAreaView>
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f6fb" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  note: { backgroundColor: "#fffbeb", borderBottomWidth: 1, borderBottomColor: "#fde68a", padding: 10 },
  noteText: { fontSize: 11, color: "#92400e" },
  list: { padding: 14, paddingBottom: 90, gap: 10 },
  card: { backgroundColor: "#fff", borderRadius: 16, borderWidth: 1.5, borderColor: "#e4e9f2", padding: 12, gap: 6 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontSize: 14, fontWeight: "800", color: "#0a0f1e", flex: 1 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeOn: { backgroundColor: "#ecfdf5" }, badgeOff: { backgroundColor: "#fef2f2" },
  badgeText: { fontSize: 10, fontWeight: "800", color: "#374151" },
  meta: { fontSize: 11, color: "#6b7280" },
  editBtn: { alignSelf: "flex-start", marginTop: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: "#eef2ff" },
  editBtnText: { color: "#6366f1", fontSize: 11, fontWeight: "800" },
  emptyWrap: { alignItems: "center", paddingTop: 50, gap: 10 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { color: "#9ca3af", fontSize: 15, fontWeight: "700" },
  fab: { position: "absolute", right: 16, bottom: 20, backgroundColor: "#6366f1", borderRadius: 999, paddingHorizontal: 20, paddingVertical: 14, elevation: 4 },
  fabText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  detailHeader: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, backgroundColor: "#f4f6fb" },
  backLink: { color: "#6366f1", fontWeight: "700", fontSize: 13 },
  detailTitle: { fontSize: 16, fontWeight: "800", color: "#0a0f1e" },
  chipRow: { flexDirection: "row", gap: 6 },
  chip: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12, paddingHorizontal: 14, justifyContent: "center", backgroundColor: "#f8f9fd" },
  chipActive: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  chipText: { fontSize: 13, fontWeight: "700", color: "#4b5563" },
  chipTextActive: { color: "#fff" },
  toggleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#f8f9fd", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  toggleLabel: { fontSize: 13, fontWeight: "700", color: "#374151" },
  input: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12, backgroundColor: "#f8f9fd", paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: "#0a0f1e" },
  detailActions: { padding: 14, borderTopWidth: 1, borderTopColor: "#e4e9f2" },
  completeBtn: { paddingVertical: 13, borderRadius: 12, backgroundColor: "#6366f1", alignItems: "center" },
  completeBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
});
