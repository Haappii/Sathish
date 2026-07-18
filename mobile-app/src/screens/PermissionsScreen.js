import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import api from "../api/client";

export default function PermissionsScreen() {
  const [modules, setModules] = useState([]);
  const [roles, setRoles] = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [permMap, setPermMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [savingRole, setSavingRole] = useState(false);

  const loadPermsForRole = useCallback(async (roleId) => {
    if (!roleId) return;
    try {
      const res = await api.get("/permissions/", { params: { role_id: roleId } });
      const map = {};
      (Array.isArray(res.data) ? res.data : []).forEach((row) => {
        map[row.module] = { can_read: !!row.can_read, can_write: !!row.can_write };
      });
      setPermMap(map);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load permissions");
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const enabledRes = await api.get("/permissions/enabled").catch(() => null);
      if (enabledRes && enabledRes.data?.enabled === false) {
        await api.post("/permissions/bootstrap").catch(() => {});
      }
      const [modRes, roleRes] = await Promise.all([
        api.get("/permissions/modules"),
        api.get("/roles/"),
      ]);
      const mods = Array.isArray(modRes.data) ? modRes.data : [];
      const rls = Array.isArray(roleRes.data) ? roleRes.data : [];
      setModules(mods);
      setRoles(rls);
      const firstRole = rls.find((r) => String(r.role_name || "").toLowerCase() !== "admin") || rls[0];
      if (firstRole) {
        setSelectedRoleId(firstRole.role_id);
        await loadPermsForRole(firstRole.role_id);
      }
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load permissions setup");
    } finally {
      setLoading(false);
    }
  }, [loadPermsForRole]);

  useEffect(() => { load(); }, [load]);

  const selectRole = async (roleId) => {
    setSelectedRoleId(roleId);
    await loadPermsForRole(roleId);
  };

  const toggleModule = async (moduleKey) => {
    const current = permMap[moduleKey];
    const nextOn = !(current?.can_read && current?.can_write);
    setPermMap((p) => ({ ...p, [moduleKey]: { can_read: nextOn, can_write: nextOn } }));
    try {
      await api.post("/permissions/upsert", { role_id: selectedRoleId, module: moduleKey, can_read: nextOn, can_write: nextOn });
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to update permission");
      loadPermsForRole(selectedRoleId);
    }
  };

  const createRole = async () => {
    if (!newRoleName.trim()) return Alert.alert("Validation", "Role name is required");
    setSavingRole(true);
    try {
      await api.post("/roles/", { role_name: newRoleName.trim() });
      setRoleModalOpen(false);
      setNewRoleName("");
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to create role");
    } finally {
      setSavingRole(false);
    }
  };

  const deleteRole = (role) => {
    Alert.alert("Delete Role", `Delete role "${role.role_name}"? This fails if users are assigned to it.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await api.delete(`/roles/${role.role_id}`); load(); }
        catch (err) { Alert.alert("Error", err?.response?.data?.detail || "Failed to delete role"); }
      }},
    ]);
  };

  if (loading) {
    return <SafeAreaView style={st.safe}><View style={st.center}><ActivityIndicator size="large" color="#6366f1" /></View></SafeAreaView>;
  }

  const selectedRole = roles.find((r) => r.role_id === selectedRoleId);
  const isAdminRole = String(selectedRole?.role_name || "").toLowerCase() === "admin";

  return (
    <SafeAreaView style={st.safe}>
      <View style={st.roleBar}>
        <FlatList
          horizontal
          data={roles}
          keyExtractor={(r) => String(r.role_id)}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 14 }}
          renderItem={({ item }) => (
            <Pressable
              style={[st.roleChip, selectedRoleId === item.role_id && st.roleChipActive]}
              onLongPress={() => String(item.role_name).toLowerCase() !== "admin" && deleteRole(item)}
              onPress={() => selectRole(item.role_id)}
            >
              <Text style={[st.roleChipText, selectedRoleId === item.role_id && st.roleChipTextActive]}>{item.role_name}</Text>
            </Pressable>
          )}
          ListFooterComponent={
            <Pressable style={st.addRoleChip} onPress={() => setRoleModalOpen(true)}>
              <Text style={st.addRoleChipText}>+ Role</Text>
            </Pressable>
          }
        />
      </View>

      {isAdminRole ? (
        <View style={st.center}><Text style={st.emptyTitle}>Admin always has full access</Text></View>
      ) : (
        <FlatList
          data={modules}
          keyExtractor={(m) => m.key}
          contentContainerStyle={st.list}
          renderItem={({ item }) => {
            const on = !!(permMap[item.key]?.can_read && permMap[item.key]?.can_write);
            return (
              <View style={st.moduleRow}>
                <Text style={st.moduleLabel}>{item.label}</Text>
                <Switch value={on} onValueChange={() => toggleModule(item.key)} trackColor={{ true: "#6366f1" }} disabled={busy} />
              </View>
            );
          }}
        />
      )}

      <Modal visible={roleModalOpen} animationType="slide" transparent onRequestClose={() => setRoleModalOpen(false)}>
        <Pressable style={st.modalBackdrop} onPress={() => setRoleModalOpen(false)}>
          <Pressable style={st.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={st.modalTitle}>New Role</Text>
            <TextInput style={st.input} placeholder="Role name" placeholderTextColor="#94a3b8" value={newRoleName} onChangeText={setNewRoleName} />
            <View style={st.modalActions}>
              <Pressable style={st.cancelBtn} onPress={() => setRoleModalOpen(false)}><Text style={st.cancelBtnText}>Cancel</Text></Pressable>
              <Pressable style={st.saveBtn} disabled={savingRole} onPress={createRole}>
                {savingRole ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.saveBtnText}>Create</Text>}
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
  roleBar: { paddingVertical: 12 },
  roleChip: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: "#fff" },
  roleChipActive: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  roleChipText: { fontSize: 12, fontWeight: "700", color: "#4b5563" },
  roleChipTextActive: { color: "#fff" },
  addRoleChip: { borderWidth: 1.5, borderColor: "#6366f1", borderStyle: "dashed", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, marginLeft: 4 },
  addRoleChipText: { fontSize: 12, fontWeight: "700", color: "#6366f1" },
  list: { paddingHorizontal: 14, paddingBottom: 24, gap: 4 },
  moduleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#fff", borderRadius: 12, borderWidth: 1.5, borderColor: "#e4e9f2", paddingHorizontal: 14, paddingVertical: 12, marginBottom: 6 },
  moduleLabel: { fontSize: 13, fontWeight: "600", color: "#374151", flex: 1, marginRight: 8 },
  emptyTitle: { color: "#9ca3af", fontSize: 14, fontWeight: "700" },
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
