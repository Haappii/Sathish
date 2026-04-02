import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
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

const CATEGORIES = ["Food", "Maintenance", "Salary", "Utilities", "Rent", "Other"];

const TODAY = new Date().toISOString().slice(0, 10);

export default function ExpensesScreen() {
  const [expenses, setExpenses]   = useState([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addModal, setAddModal]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [form, setForm] = useState({ category: "Other", description: "", amount: "" });

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await api.get("/expenses/", { params: { date_from: TODAY, date_to: TODAY } });
      const list = res.data?.expenses ?? res.data ?? [];
      setExpenses(list);
      setTotal(list.reduce((s, e) => s + Number(e.amount || 0), 0));
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load expenses");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveExpense = async () => {
    const amount = parseFloat(form.amount);
    if (!form.description.trim()) return Alert.alert("Validation", "Description is required");
    if (isNaN(amount) || amount <= 0) return Alert.alert("Validation", "Enter a valid amount");
    setSaving(true);
    try {
      await api.post("/expenses/", {
        category: form.category,
        description: form.description.trim(),
        amount,
        expense_date: TODAY,
      });
      setAddModal(false);
      setForm({ category: "Other", description: "", amount: "" });
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to save expense");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.topLabel}>Today's Expenses</Text>
          <Text style={styles.topTotal}>₹{fmt(total)}</Text>
        </View>
        <Pressable style={styles.addBtn} onPress={() => setAddModal(true)}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 14, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        >
          {expenses.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.empty}>No expenses recorded today.</Text>
            </View>
          ) : (
            expenses.map((exp, i) => (
              <View key={exp.expense_id ?? i} style={styles.card}>
                <View style={styles.cardLeft}>
                  <View style={styles.catBadge}>
                    <Text style={styles.catText}>{exp.category || "Other"}</Text>
                  </View>
                  <View>
                    <Text style={styles.description} numberOfLines={2}>{exp.description}</Text>
                    <Text style={styles.meta}>{exp.expense_date || TODAY}</Text>
                  </View>
                </View>
                <Text style={styles.amount}>₹{fmt(exp.amount)}</Text>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Add Expense Modal */}
      <Modal visible={addModal} animationType="slide" transparent onRequestClose={() => setAddModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.overlay}>
          <Pressable style={styles.overlayBg} onPress={() => setAddModal(false)} />
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Add Expense</Text>

            {/* Category Selector */}
            <Text style={styles.fieldLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {CATEGORIES.map((cat) => (
                <Pressable
                  key={cat}
                  style={[styles.catChip, form.category === cat && styles.catChipActive]}
                  onPress={() => setForm((f) => ({ ...f, category: cat }))}
                >
                  <Text style={[styles.catChipText, form.category === cat && styles.catChipTextActive]}>
                    {cat}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.fieldLabel}>Description *</Text>
            <TextInput
              style={styles.input}
              value={form.description}
              onChangeText={(t) => setForm((f) => ({ ...f, description: t }))}
              placeholder="e.g. Vegetable purchase"
              placeholderTextColor="#94a3b8"
            />

            <Text style={styles.fieldLabel}>Amount (₹) *</Text>
            <TextInput
              style={styles.input}
              value={form.amount}
              onChangeText={(t) => setForm((f) => ({ ...f, amount: t }))}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#94a3b8"
            />

            <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
              <Pressable style={[styles.btn, { backgroundColor: "#e2e8f0", flex: 1 }]} onPress={() => setAddModal(false)}>
                <Text style={[styles.btnText, { color: "#475569" }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.btn, { flex: 1 }]} onPress={saveExpense} disabled={saving}>
                <Text style={styles.btnText}>{saving ? "Saving…" : "Save"}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function fmt(n) {
  return Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

const styles = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: "#f1f5f9" },
  center:   { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  topBar:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 14, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  topLabel: { color: "#64748b", fontSize: 12 },
  topTotal: { fontSize: 22, fontWeight: "800", color: "#b45309" },
  addBtn:   { backgroundColor: "#1d4ed8", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  addBtnText: { color: "#fff", fontWeight: "700" },
  card: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  cardLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  catBadge: { backgroundColor: "#fef3c7", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  catText:  { color: "#b45309", fontWeight: "600", fontSize: 12 },
  description: { fontWeight: "600", color: "#0f172a", maxWidth: 200 },
  meta:     { color: "#94a3b8", fontSize: 12, marginTop: 2 },
  amount:   { fontWeight: "800", color: "#b91c1c", fontSize: 16 },
  overlay:  { flex: 1, justifyContent: "flex-end" },
  overlayBg: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  modal: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: "#0f172a", marginBottom: 14 },
  fieldLabel: { color: "#64748b", fontSize: 12, marginBottom: 6, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#f8fafc",
    color: "#0f172a",
    marginBottom: 12,
  },
  catChip: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    backgroundColor: "#f8fafc",
  },
  catChipActive: { backgroundColor: "#1d4ed8", borderColor: "#1d4ed8" },
  catChipText:  { color: "#475569", fontWeight: "600" },
  catChipTextActive: { color: "#fff" },
  btn:     { backgroundColor: "#1d4ed8", borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "700" },
  empty:   { color: "#94a3b8" },
});
