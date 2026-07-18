import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import api from "../api/client";
import { useAuth } from "../context/AuthContext";

const DEFAULT_DENOMINATIONS = [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1];

const roundDenom = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
};

const normalizeDenominations = (values) => {
  const source = Array.isArray(values) && values.length ? values : DEFAULT_DENOMINATIONS;
  const unique = new Map();
  source.forEach((v) => {
    const r = roundDenom(v);
    if (r == null) return;
    unique.set(String(r), r);
  });
  const normalized = Array.from(unique.values()).sort((a, b) => b - a);
  return normalized.length ? normalized : [...DEFAULT_DENOMINATIONS];
};

const formatDenom = (v) => {
  const r = roundDenom(v);
  if (r == null) return "";
  return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/\.?0+$/, "");
};

export default function CashDenominationsScreen() {
  const { session } = useAuth();
  const userRole = session?.role || session?.role_name || "";
  const isAdmin = ["admin", "super admin"].includes(String(userRole).trim().toLowerCase());

  const [denominations, setDenominations] = useState([...DEFAULT_DENOMINATIONS]);
  const [newValue, setNewValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/shop/details");
      setDenominations(normalizeDenominations(res?.data?.cash_denominations));
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load denomination settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addDenomination = () => {
    if (!isAdmin) return;
    const value = Number(newValue);
    if (!Number.isFinite(value) || value <= 0) return Alert.alert("Validation", "Enter a valid denomination value");
    setDenominations(normalizeDenominations([...denominations, value]));
    setNewValue("");
  };

  const removeDenomination = (value) => {
    if (!isAdmin) return;
    if (denominations.length <= 1) return Alert.alert("Validation", "Keep at least one denomination");
    setDenominations(denominations.filter((d) => Number(d) !== Number(value)));
  };

  const resetToDefault = () => {
    if (!isAdmin) return;
    setDenominations([...DEFAULT_DENOMINATIONS]);
  };

  const save = async () => {
    if (!isAdmin) return;
    setSaving(true);
    try {
      await api.post("/shop/", { cash_denominations: denominations }, { headers: { "x-user-role": userRole } });
      Alert.alert("Saved", "Denomination settings saved");
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <SafeAreaView style={st.safe}><View style={st.center}><ActivityIndicator size="large" color="#0B3C8C" /></View></SafeAreaView>;
  }

  const denoms = normalizeDenominations(denominations);

  return (
    <SafeAreaView style={st.safe}>
      <ScrollView contentContainerStyle={st.scroll}>
        {!isAdmin && (
          <View style={st.warnBanner}>
            <Text style={st.warnText}>⚠️ Only Admin can change denomination settings.</Text>
          </View>
        )}

        {/* Active denominations */}
        <View style={st.card}>
          <View style={st.cardHeader}>
            <View>
              <Text style={st.cardTitle}>Active Denominations</Text>
              <Text style={st.cardSub}>{denoms.length} denomination{denoms.length !== 1 ? "s" : ""} configured</Text>
            </View>
            <Pressable style={[st.resetBtn, !isAdmin && st.disabled]} disabled={!isAdmin} onPress={resetToDefault}>
              <Text style={st.resetBtnText}>Reset to Default</Text>
            </Pressable>
          </View>

          <View style={st.chipGrid}>
            {denoms.map((value) => (
              <View key={String(value)} style={st.chip}>
                <Text style={st.chipText}>₹{formatDenom(value)}</Text>
                <Pressable
                  disabled={!isAdmin || denoms.length <= 1}
                  onPress={() => removeDenomination(value)}
                  style={[st.removeBtn, (!isAdmin || denoms.length <= 1) && st.disabled]}
                >
                  <Text style={st.removeText}>✕</Text>
                </Pressable>
              </View>
            ))}
          </View>

          <View style={st.addRow}>
            <TextInput
              style={[st.input, !isAdmin && st.inputDisabled]}
              placeholder="Add new (e.g. 2000)"
              placeholderTextColor="#94a3b8"
              keyboardType="numeric"
              value={newValue}
              onChangeText={setNewValue}
              onSubmitEditing={addDenomination}
              editable={isAdmin}
            />
            <Pressable style={[st.addBtn, !isAdmin && st.disabled]} disabled={!isAdmin || !newValue.trim()} onPress={addDenomination}>
              <Text style={st.addBtnText}>Add</Text>
            </Pressable>
          </View>

          <Text style={st.hint}>
            These denominations appear as rows in the cash counting grid during shift close and day close.
            Add or remove values to match your counter setup.
          </Text>
        </View>

        {/* Preview */}
        <View style={st.card}>
          <Text style={st.cardTitle}>Preview — Cash Count Grid</Text>
          <Text style={st.cardSub}>How the denomination table will look during cash closing</Text>
          <View style={st.previewGrid}>
            <View style={st.previewHeaderRow}>
              <Text style={st.previewHeaderText}>Note / Coin</Text>
              <Text style={[st.previewHeaderText, { textAlign: "center" }]}>Count</Text>
              <Text style={[st.previewHeaderText, { textAlign: "right" }]}>Amount</Text>
            </View>
            {denoms.map((denom) => (
              <View key={String(denom)} style={st.previewRow}>
                <Text style={st.previewLabel}>₹{formatDenom(denom)}</Text>
                <View style={st.previewInputBox} />
                <Text style={st.previewAmount}>—</Text>
              </View>
            ))}
            <View style={st.previewTotalRow}>
              <Text style={st.previewTotalLabel}>Total</Text>
              <Text style={st.previewAmount}>—</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={st.footer}>
        <Pressable style={[st.saveBtn, (!isAdmin || saving) && st.disabled]} disabled={saving || !isAdmin} onPress={save}>
          {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.saveBtnText}>Save Changes</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f6fb" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 14, gap: 12, paddingBottom: 24 },
  warnBanner: { backgroundColor: "#fffbeb", borderWidth: 1.5, borderColor: "#fde68a", borderRadius: 12, padding: 12 },
  warnText: { color: "#b45309", fontSize: 12, fontWeight: "700" },
  card: {
    backgroundColor: "#fff", borderRadius: 18, borderWidth: 1.5, borderColor: "#e4e9f2",
    padding: 16, gap: 12,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  cardTitle: { fontSize: 14, fontWeight: "800", color: "#0a0f1e" },
  cardSub: { fontSize: 11, color: "#9ca3af", marginTop: 2, fontWeight: "600" },
  resetBtn: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  resetBtnText: { fontSize: 11, fontWeight: "700", color: "#4b5563" },
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "#eff6ff", borderWidth: 1.5, borderColor: "#bfdbfe", borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 8, minWidth: "30%", gap: 6,
  },
  chipText: { fontSize: 13, fontWeight: "800", color: "#1e3a8a" },
  removeBtn: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff", borderWidth: 1, borderColor: "#bfdbfe",
    alignItems: "center", justifyContent: "center",
  },
  removeText: { color: "#dc2626", fontSize: 11, fontWeight: "800" },
  addRow: { flexDirection: "row", gap: 8 },
  input: {
    flex: 1, borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12, backgroundColor: "#f8f9fd",
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: "#0a0f1e",
  },
  inputDisabled: { backgroundColor: "#f1f3f9", color: "#9ca3af" },
  addBtn: { backgroundColor: "#0B3C8C", borderRadius: 12, paddingHorizontal: 18, justifyContent: "center" },
  addBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  hint: { fontSize: 11, color: "#9ca3af", lineHeight: 16 },
  previewGrid: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 14, overflow: "hidden" },
  previewHeaderRow: {
    flexDirection: "row", backgroundColor: "#f8f9fd", paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: "#e4e9f2",
  },
  previewHeaderText: { flex: 1, fontSize: 10, fontWeight: "800", color: "#9ca3af", textTransform: "uppercase" },
  previewRow: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: "#f4f6fb", gap: 8,
  },
  previewLabel: { flex: 1, fontSize: 13, fontWeight: "700", color: "#0a0f1e" },
  previewInputBox: { flex: 1, height: 26, borderWidth: 1, borderColor: "#e4e9f2", borderRadius: 8, backgroundColor: "#f8f9fd" },
  previewAmount: { flex: 1, textAlign: "right", fontSize: 12, color: "#cbd5e1" },
  previewTotalRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: "#f8f9fd", paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 2, borderTopColor: "#e4e9f2",
  },
  previewTotalLabel: { fontSize: 12, fontWeight: "800", color: "#374151" },
  footer: { flexDirection: "row", gap: 10, padding: 14, borderTopWidth: 1, borderTopColor: "#e4e9f2", backgroundColor: "#fff" },
  saveBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: "#0B3C8C", alignItems: "center" },
  saveBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  disabled: { opacity: 0.4 },
});
