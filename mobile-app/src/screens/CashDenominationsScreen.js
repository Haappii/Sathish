import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import api from "../api/client";
import { useAuth } from "../context/AuthContext";

const DEFAULT_DENOMINATIONS = [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1];

export default function CashDenominationsScreen() {
  const { session } = useAuth();
  const userRole = session?.role || session?.role_name || "User";

  const [values, setValues] = useState([]);
  const [newValue, setNewValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/shop/details");
      const list = Array.isArray(res.data?.cash_denominations) ? res.data.cash_denominations : DEFAULT_DENOMINATIONS;
      setValues(list.map(Number).sort((a, b) => b - a));
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load denominations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addValue = () => {
    const num = Number(newValue);
    if (!num || num <= 0) return Alert.alert("Validation", "Enter a valid denomination value");
    if (values.includes(num)) return Alert.alert("Validation", "That denomination already exists");
    setValues((p) => [...p, num].sort((a, b) => b - a));
    setNewValue("");
  };

  const removeValue = (v) => {
    if (values.length <= 1) return Alert.alert("Validation", "At least one denomination is required");
    setValues((p) => p.filter((x) => x !== v));
  };

  const resetDefault = () => setValues([...DEFAULT_DENOMINATIONS].sort((a, b) => b - a));

  const save = async () => {
    setSaving(true);
    try {
      await api.post("/shop/", { cash_denominations: values }, { headers: { "x-user-role": userRole } });
      Alert.alert("Saved", "Cash denominations updated");
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <SafeAreaView style={st.safe}><View style={st.center}><ActivityIndicator size="large" color="#6366f1" /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={st.safe}>
      <FlatList
        data={values}
        keyExtractor={(v) => String(v)}
        numColumns={3}
        contentContainerStyle={st.list}
        columnWrapperStyle={{ gap: 10 }}
        ListHeaderComponent={
          <View style={st.addRow}>
            <TextInput style={[st.input, { flex: 1 }]} placeholder="New denomination (e.g. 500)" placeholderTextColor="#94a3b8" keyboardType="numeric" value={newValue} onChangeText={setNewValue} onSubmitEditing={addValue} />
            <Pressable style={st.addBtn} onPress={addValue}><Text style={st.addBtnText}>Add</Text></Pressable>
          </View>
        }
        renderItem={({ item }) => (
          <View style={st.chip}>
            <Text style={st.chipText}>₹{item}</Text>
            <Pressable onPress={() => removeValue(item)}><Text style={st.removeText}>✕</Text></Pressable>
          </View>
        )}
      />
      <View style={st.footer}>
        <Pressable style={st.resetBtn} onPress={resetDefault}><Text style={st.resetBtnText}>Reset to Default</Text></Pressable>
        <Pressable style={st.saveBtn} disabled={saving} onPress={save}>
          {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.saveBtnText}>Save Changes</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f6fb" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 14, paddingBottom: 100, gap: 10 },
  addRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  input: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12, backgroundColor: "#fff", paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: "#0a0f1e" },
  addBtn: { backgroundColor: "#6366f1", borderRadius: 12, paddingHorizontal: 16, justifyContent: "center" },
  addBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  chip: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#fff", borderRadius: 12, borderWidth: 1.5, borderColor: "#e4e9f2", paddingHorizontal: 12, paddingVertical: 12, marginBottom: 10 },
  chipText: { fontSize: 14, fontWeight: "800", color: "#0a0f1e" },
  removeText: { color: "#dc2626", fontSize: 14, fontWeight: "800" },
  footer: { flexDirection: "row", gap: 10, padding: 14, borderTopWidth: 1, borderTopColor: "#e4e9f2" },
  resetBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: "#f1f3f9", alignItems: "center" },
  resetBtnText: { color: "#4b5563", fontWeight: "700", fontSize: 13 },
  saveBtn: { flex: 1.2, paddingVertical: 13, borderRadius: 12, backgroundColor: "#6366f1", alignItems: "center" },
  saveBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
});
