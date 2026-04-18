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
import { formatBusinessDateLabel, toBusinessYmd } from "../utils/businessDate";

const CATEGORIES = ["Food", "Maintenance", "Salary", "Utilities", "Rent", "Other"];

export default function ExpensesScreen() {
  const [expenses, setExpenses]   = useState([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addModal, setAddModal]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [form, setForm] = useState({ category: "Other", description: "", amount: "" });
  const [businessDate, setBusinessDate] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const shopRes = await api.get("/shop/details");
      const appDate = shopRes?.data?.app_date || null;
      setBusinessDate(appDate);
      const ymd = toBusinessYmd(appDate);
      const res = await api.get("/expenses/list", { params: { from_date: ymd, to_date: ymd } });
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
        note: form.description.trim(),
        amount,
        expense_date: toBusinessYmd(businessDate),
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
          <Text style={styles.bizDate}>{formatBusinessDateLabel(businessDate)}</Text>
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
                    <Text style={styles.description} numberOfLines={2}>{exp.note || exp.description}</Text>
                    <Text style={styles.meta}>{exp.expense_date || toBusinessYmd(businessDate)}</Text>
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
              <Pressable style={[styles.btn, { backgroundColor: "#f0f4ff", flex: 1, borderWidth: 1.5, borderColor: "#dde6f7" }]} onPress={() => setAddModal(false)}>
                <Text style={[styles.btnText, { color: "#4a5a78" }]}>Cancel</Text>
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
  safe:     { flex: 1, backgroundColor: "#f0f4ff" },
  center:   { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  topBar: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14, backgroundColor: "#0c1228",
  },
  topLabel: { color: "#7a8fa8", fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  bizDate:  { color: "#93c5fd", fontSize: 11, fontWeight: "700", marginTop: 2 },
  topTotal: { fontSize: 24, fontWeight: "900", color: "#f0a820", marginTop: 2 },
  addBtn: {
    backgroundColor: "#2563eb", borderRadius: 14, paddingHorizontal: 18, paddingVertical: 10,
    shadowColor: "#2563eb", shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
  addBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  card: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: "#fff", borderRadius: 18, padding: 14,
    borderWidth: 1.5, borderColor: "#dde6f7",
    shadowColor: "#1a2463", shadowOpacity: 0.07, shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  cardLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  catBadge: { backgroundColor: "#fef3c7", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: "#fde68a" },
  catText:  { color: "#b45309", fontWeight: "700", fontSize: 12 },
  description: { fontWeight: "700", color: "#0c1228", maxWidth: 200, fontSize: 13 },
  meta:     { color: "#8896ae", fontSize: 12, marginTop: 2 },
  amount:   { fontWeight: "900", color: "#dc2626", fontSize: 16 },
  overlay:  { flex: 1, justifyContent: "flex-end" },
  overlayBg: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  modal: {
    backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 22, paddingBottom: 44,
    shadowColor: "#0c1228", shadowOpacity: 0.2, shadowRadius: 24, elevation: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: "900", color: "#0c1228", marginBottom: 16, letterSpacing: -0.3 },
  fieldLabel: { color: "#4a5a78", fontSize: 11, marginBottom: 6, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  input: {
    borderWidth: 1.5, borderColor: "#d0dcf0", borderRadius: 12,
    paddingHorizontal: 13, paddingVertical: 12, backgroundColor: "#f6f8fe",
    color: "#0c1228", fontSize: 14, marginBottom: 12,
  },
  catChip: {
    borderWidth: 1.5, borderColor: "#d0dcf0", borderRadius: 999,
    paddingHorizontal: 13, paddingVertical: 7, marginRight: 8, backgroundColor: "#f6f8fe",
  },
  catChipActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  catChipText:   { color: "#4a5a78", fontWeight: "700", fontSize: 12 },
  catChipTextActive: { color: "#fff" },
  btn: {
    backgroundColor: "#2563eb", borderRadius: 14, paddingVertical: 14, alignItems: "center",
    shadowColor: "#2563eb", shadowOpacity: 0.35, shadowRadius: 10, elevation: 5,
  },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  empty:   { color: "#8896ae", fontSize: 14 },
});
