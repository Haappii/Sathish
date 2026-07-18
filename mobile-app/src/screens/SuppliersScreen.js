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

const BLANK = { supplier_name: "", phone: "", email: "", gstin: "", address_line1: "", city: "", state: "", pincode: "", contact_person: "", credit_terms_days: "" };

export default function SuppliersScreen() {
  const { session } = useAuth();
  const isAdmin = String(session?.role_name || session?.role || "").toLowerCase() === "admin";

  const [rows, setRows] = useState([]);
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (isRefresh) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params = {};
      if (isAdmin && branchId) params.branch_id = branchId;
      const res = await api.get("/suppliers/", { params });
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load suppliers");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAdmin, branchId]);

  useEffect(() => {
    if (isAdmin) api.get("/branch/active").then((r) => setBranches(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, [isAdmin]);

  useEffect(() => { load(); }, [branchId]); // eslint-disable-line react-hooks/exhaustive-deps

  const openNew = () => { setEditingId(null); setForm(BLANK); setModalOpen(true); };
  const openEdit = (s) => {
    setEditingId(s.supplier_id);
    setForm({
      supplier_name: s.supplier_name || "", phone: s.phone || "", email: s.email || "", gstin: s.gstin || "",
      address_line1: s.address_line1 || "", city: s.city || "", state: s.state || "", pincode: s.pincode || "",
      contact_person: s.contact_person || "", credit_terms_days: String(s.credit_terms_days ?? ""),
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.supplier_name.trim()) return Alert.alert("Validation", "Supplier name is required");
    setSaving(true);
    try {
      const payload = { ...form, credit_terms_days: form.credit_terms_days ? Number(form.credit_terms_days) : 0 };
      if (editingId) await api.put(`/suppliers/${editingId}`, payload);
      else await api.post("/suppliers/", payload);
      setModalOpen(false);
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to save supplier");
    } finally {
      setSaving(false);
    }
  };

  const remove = (s) => {
    Alert.alert("Delete Supplier", `Delete "${s.supplier_name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await api.delete(`/suppliers/${s.supplier_id}`); load(); }
        catch (err) { Alert.alert("Error", err?.response?.data?.detail || "Failed to delete"); }
      }},
    ]);
  };

  const renderItem = ({ item }) => (
    <View style={st.card}>
      <Pressable onPress={() => openEdit(item)}>
        <Text style={st.name}>{item.supplier_name}</Text>
        <Text style={st.meta}>{item.contact_person || "—"}{item.phone ? ` · ${item.phone}` : ""}</Text>
        {item.gstin ? <Text style={st.meta}>GSTIN: {item.gstin}</Text> : null}
      </Pressable>
      <View style={st.actionsRow}>
        <Pressable style={st.editBtn} onPress={() => openEdit(item)}><Text style={st.editBtnText}>Edit</Text></Pressable>
        <Pressable style={st.deleteBtn} onPress={() => remove(item)}><Text style={st.deleteBtnText}>Delete</Text></Pressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={st.safe}>
      {isAdmin && branches.length > 0 && (
        <View style={st.chipRow}>
          <Pressable style={[st.chip, !branchId && st.chipActive]} onPress={() => setBranchId("")}>
            <Text style={[st.chipText, !branchId && st.chipTextActive]}>All Branches</Text>
          </Pressable>
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
          keyExtractor={(r, i) => String(r.supplier_id || i)}
          renderItem={renderItem}
          contentContainerStyle={st.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          ListEmptyComponent={<View style={st.emptyWrap}><Text style={st.emptyIcon}>🚚</Text><Text style={st.emptyTitle}>No suppliers yet</Text></View>}
        />
      )}
      <Pressable style={st.fab} onPress={openNew}><Text style={st.fabText}>+ New Supplier</Text></Pressable>

      <Modal visible={modalOpen} animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <SafeAreaView style={st.safe}>
          <View style={st.detailHeader}>
            <Pressable onPress={() => setModalOpen(false)}><Text style={st.backLink}>‹ Cancel</Text></Pressable>
            <Text style={st.detailTitle}>{editingId ? "Edit Supplier" : "New Supplier"}</Text>
          </View>
          <FlatList
            data={[1]}
            keyExtractor={() => "form"}
            contentContainerStyle={{ padding: 14, gap: 10 }}
            renderItem={() => (
              <View style={{ gap: 10 }}>
                <TextInput style={st.input} placeholder="Supplier name" placeholderTextColor="#94a3b8" value={form.supplier_name} onChangeText={(v) => setForm((p) => ({ ...p, supplier_name: v }))} />
                <TextInput style={st.input} placeholder="Contact person" placeholderTextColor="#94a3b8" value={form.contact_person} onChangeText={(v) => setForm((p) => ({ ...p, contact_person: v }))} />
                <TextInput style={st.input} placeholder="Phone" placeholderTextColor="#94a3b8" keyboardType="phone-pad" value={form.phone} onChangeText={(v) => setForm((p) => ({ ...p, phone: v }))} />
                <TextInput style={st.input} placeholder="Email" placeholderTextColor="#94a3b8" keyboardType="email-address" value={form.email} onChangeText={(v) => setForm((p) => ({ ...p, email: v }))} />
                <TextInput style={st.input} placeholder="GSTIN" placeholderTextColor="#94a3b8" value={form.gstin} onChangeText={(v) => setForm((p) => ({ ...p, gstin: v }))} />
                <TextInput style={st.input} placeholder="Address" placeholderTextColor="#94a3b8" value={form.address_line1} onChangeText={(v) => setForm((p) => ({ ...p, address_line1: v }))} />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TextInput style={[st.input, { flex: 1 }]} placeholder="City" placeholderTextColor="#94a3b8" value={form.city} onChangeText={(v) => setForm((p) => ({ ...p, city: v }))} />
                  <TextInput style={[st.input, { flex: 1 }]} placeholder="State" placeholderTextColor="#94a3b8" value={form.state} onChangeText={(v) => setForm((p) => ({ ...p, state: v }))} />
                  <TextInput style={[st.input, { width: 90 }]} placeholder="Pincode" placeholderTextColor="#94a3b8" keyboardType="numeric" value={form.pincode} onChangeText={(v) => setForm((p) => ({ ...p, pincode: v }))} />
                </View>
                <TextInput style={st.input} placeholder="Credit terms (days)" placeholderTextColor="#94a3b8" keyboardType="numeric" value={form.credit_terms_days} onChangeText={(v) => setForm((p) => ({ ...p, credit_terms_days: v }))} />
              </View>
            )}
          />
          <View style={st.detailActions}>
            <Pressable style={st.completeBtn} disabled={saving} onPress={save}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.completeBtnText}>{editingId ? "Save Changes" : "Create Supplier"}</Text>}
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
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, padding: 14, paddingBottom: 4 },
  chip: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#fff" },
  chipActive: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  chipText: { fontSize: 11, fontWeight: "700", color: "#4b5563" },
  chipTextActive: { color: "#fff" },
  list: { padding: 14, paddingBottom: 90, gap: 10 },
  card: { backgroundColor: "#fff", borderRadius: 16, borderWidth: 1.5, borderColor: "#e4e9f2", padding: 12, gap: 4 },
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
  detailHeader: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14 },
  backLink: { color: "#6366f1", fontWeight: "700", fontSize: 13 },
  detailTitle: { fontSize: 16, fontWeight: "800", color: "#0a0f1e" },
  input: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12, backgroundColor: "#f8f9fd", paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: "#0a0f1e" },
  detailActions: { padding: 14, borderTopWidth: 1, borderTopColor: "#e4e9f2" },
  completeBtn: { paddingVertical: 13, borderRadius: 12, backgroundColor: "#6366f1", alignItems: "center" },
  completeBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
});
