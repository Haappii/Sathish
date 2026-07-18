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
import { useAuth } from "../context/AuthContext";

const BLANK = { user_name: "", password: "", name: "", role: "", branch_id: "" };

export default function UsersScreen() {
  const { session } = useAuth();
  const isAdmin = String(session?.role_name || session?.role || "").toLowerCase() === "admin";

  const [rows, setRows] = useState([]);
  const [roles, setRoles] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (isRefresh) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [uRes, rRes, bRes] = await Promise.all([
        api.get("/users/"),
        api.get("/roles/active"),
        api.get("/branch/scoped"),
      ]);
      setRows(Array.isArray(uRes.data) ? uRes.data : []);
      setRoles(Array.isArray(rRes.data) ? rRes.data : []);
      setBranches(Array.isArray(bRes.data) ? bRes.data : []);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load users");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditingId(null);
    setForm({ ...BLANK, branch_id: !isAdmin && session?.branch_id ? String(session.branch_id) : "" });
    setModalOpen(true);
  };
  const openEdit = (u) => {
    setEditingId(u.user_id);
    setForm({ user_name: u.user_name || "", password: "", name: u.name || "", role: String(u.role ?? ""), branch_id: String(u.branch_id ?? "") });
    setModalOpen(true);
  };

  const availableRoles = isAdmin ? roles : roles.filter((r) => String(r.role_name || "").toLowerCase() !== "admin");

  const save = async () => {
    if (!form.user_name.trim() || !form.role) return Alert.alert("Validation", "Username and role are required");
    if (!editingId && !form.password) return Alert.alert("Validation", "Password is required for new users");
    setSaving(true);
    try {
      const payload = {
        user_name: form.user_name.trim(), name: form.name.trim(),
        role: Number(form.role), branch_id: form.branch_id ? Number(form.branch_id) : null,
      };
      if (form.password) payload.password = form.password;
      if (editingId) await api.put(`/users/${editingId}`, payload);
      else await api.post("/users/", payload);
      setModalOpen(false);
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to save user");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (u) => {
    try {
      await api.put(`/users/${u.user_id}`, { status: !u.status });
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to update");
    }
  };

  const resetLogin = (u) => {
    Alert.alert("Reset Login", `Force "${u.user_name}" to log in again on all devices?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Reset", onPress: async () => {
        try { await api.put(`/users/${u.user_id}`, { login_status: false }); Alert.alert("Done", "Login reset"); }
        catch (err) { Alert.alert("Error", err?.response?.data?.detail || "Failed to reset"); }
      }},
    ]);
  };

  const renderItem = ({ item }) => (
    <View style={st.card}>
      <View style={st.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={st.name}>{item.name || item.user_name}</Text>
          <Text style={st.meta}>@{item.user_name} · {roles.find((r) => r.role_id === item.role)?.role_name || `Role #${item.role}`}</Text>
        </View>
        <Switch value={!!item.status} onValueChange={() => toggleStatus(item)} trackColor={{ true: "#6366f1" }} />
      </View>
      <View style={st.actionsRow}>
        <Pressable style={st.editBtn} onPress={() => openEdit(item)}><Text style={st.editBtnText}>Edit</Text></Pressable>
        <Pressable style={st.resetBtn} onPress={() => resetLogin(item)}><Text style={st.resetBtnText}>Reset Login</Text></Pressable>
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
          keyExtractor={(r, i) => String(r.user_id || i)}
          renderItem={renderItem}
          contentContainerStyle={st.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          ListEmptyComponent={<View style={st.emptyWrap}><Text style={st.emptyIcon}>👤</Text><Text style={st.emptyTitle}>No users yet</Text></View>}
        />
      )}
      <Pressable style={st.fab} onPress={openNew}><Text style={st.fabText}>+ New User</Text></Pressable>

      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
        <Pressable style={st.modalBackdrop} onPress={() => setModalOpen(false)}>
          <Pressable style={st.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={st.modalTitle}>{editingId ? "Edit User" : "New User"}</Text>
            <TextInput style={st.input} placeholder="Username" placeholderTextColor="#94a3b8" autoCapitalize="none" value={form.user_name} onChangeText={(v) => setForm((p) => ({ ...p, user_name: v }))} />
            <TextInput style={st.input} placeholder="Full name" placeholderTextColor="#94a3b8" value={form.name} onChangeText={(v) => setForm((p) => ({ ...p, name: v }))} />
            <TextInput style={st.input} placeholder={editingId ? "New password (leave blank to keep)" : "Password"} placeholderTextColor="#94a3b8" secureTextEntry value={form.password} onChangeText={(v) => setForm((p) => ({ ...p, password: v }))} />
            <Text style={st.sectionLabel}>Role</Text>
            <View style={st.chipRow}>
              {availableRoles.map((r) => (
                <Pressable key={r.role_id} style={[st.chip, String(form.role) === String(r.role_id) && st.chipActive]} onPress={() => setForm((p) => ({ ...p, role: String(r.role_id) }))}>
                  <Text style={[st.chipText, String(form.role) === String(r.role_id) && st.chipTextActive]}>{r.role_name}</Text>
                </Pressable>
              ))}
            </View>
            {isAdmin && branches.length > 0 && (
              <>
                <Text style={st.sectionLabel}>Branch</Text>
                <View style={st.chipRow}>
                  {branches.map((b) => (
                    <Pressable key={b.branch_id} style={[st.chip, String(form.branch_id) === String(b.branch_id) && st.chipActive]} onPress={() => setForm((p) => ({ ...p, branch_id: String(b.branch_id) }))}>
                      <Text style={[st.chipText, String(form.branch_id) === String(b.branch_id) && st.chipTextActive]}>{b.branch_name}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}
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
  cardTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { fontSize: 14, fontWeight: "800", color: "#0a0f1e" },
  meta: { fontSize: 11, color: "#6b7280" },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  editBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: "#eef2ff" },
  editBtnText: { color: "#6366f1", fontSize: 11, fontWeight: "800" },
  resetBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: "#fff7ed" },
  resetBtnText: { color: "#f97316", fontSize: 11, fontWeight: "800" },
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
