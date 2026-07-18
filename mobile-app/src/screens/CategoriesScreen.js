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

export default function CategoriesScreen() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (isRefresh) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await api.get("/category/");
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load categories");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditingId(null); setName(""); setModalOpen(true); };
  const openEdit = (c) => { setEditingId(c.category_id); setName(c.category_name || ""); setModalOpen(true); };

  const save = async () => {
    if (!name.trim()) return Alert.alert("Validation", "Category name is required");
    setSaving(true);
    try {
      if (editingId) await api.put(`/category/${editingId}`, { category_name: name.trim().toUpperCase() });
      else await api.post("/category/", { category_name: name.trim().toUpperCase() });
      setModalOpen(false);
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to save category");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (c) => {
    try {
      await api.put(`/category/${c.category_id}`, { category_status: !c.category_status });
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to update");
    }
  };

  const renderItem = ({ item }) => (
    <View style={st.row}>
      <Pressable style={{ flex: 1 }} onPress={() => openEdit(item)}>
        <Text style={st.name}>{item.category_name}</Text>
      </Pressable>
      <Pressable style={[st.badge, item.category_status ? st.badgeOn : st.badgeOff]} onPress={() => toggleStatus(item)}>
        <Text style={st.badgeText}>{item.category_status ? "Active" : "Inactive"}</Text>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={st.safe}>
      {loading ? (
        <View style={st.center}><ActivityIndicator size="large" color="#6366f1" /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r, i) => String(r.category_id || i)}
          renderItem={renderItem}
          contentContainerStyle={st.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          ListEmptyComponent={<View style={st.emptyWrap}><Text style={st.emptyIcon}>🗂️</Text><Text style={st.emptyTitle}>No categories yet</Text></View>}
        />
      )}
      <Pressable style={st.fab} onPress={openNew}><Text style={st.fabText}>+ New Category</Text></Pressable>

      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
        <Pressable style={st.modalBackdrop} onPress={() => setModalOpen(false)}>
          <Pressable style={st.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={st.modalTitle}>{editingId ? "Edit Category" : "New Category"}</Text>
            <TextInput style={st.input} placeholder="Category name" placeholderTextColor="#94a3b8" autoCapitalize="characters" value={name} onChangeText={setName} />
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
  list: { padding: 14, paddingBottom: 90, gap: 8 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#fff", borderRadius: 14, borderWidth: 1.5, borderColor: "#e4e9f2", padding: 14 },
  name: { fontSize: 14, fontWeight: "700", color: "#0a0f1e" },
  badge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 },
  badgeOn: { backgroundColor: "#ecfdf5" }, badgeOff: { backgroundColor: "#f1f5f9" },
  badgeText: { fontSize: 11, fontWeight: "800", color: "#374151" },
  emptyWrap: { alignItems: "center", paddingTop: 50, gap: 10 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { color: "#9ca3af", fontSize: 15, fontWeight: "700" },
  fab: { position: "absolute", right: 16, bottom: 20, backgroundColor: "#6366f1", borderRadius: 999, paddingHorizontal: 20, paddingVertical: 14, elevation: 4 },
  fabText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(10,15,30,0.45)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#fff", borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, gap: 10 },
  modalTitle: { fontSize: 16, fontWeight: "800", color: "#0a0f1e" },
  input: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12, backgroundColor: "#f8f9fd", paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: "#0a0f1e" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 6 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: "#f1f3f9", alignItems: "center" },
  cancelBtnText: { color: "#4b5563", fontWeight: "700", fontSize: 13 },
  saveBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: "#6366f1", alignItems: "center" },
  saveBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
});
