import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import api from "../api/client";

const BLANK = { code: "", name: "", discount_type: "PERCENT", value: "", min_bill_amount: "", max_discount: "", start_date: "", end_date: "" };
const fmtDate = (v) => (v ? String(v).split("T")[0] : "-");

export default function CouponsScreen() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [validateCode, setValidateCode] = useState("");
  const [validateAmount, setValidateAmount] = useState("");
  const [validateResult, setValidateResult] = useState(null);
  const [validating, setValidating] = useState(false);

  const load = useCallback(async (isRefresh) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await api.get("/coupons/");
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load coupons");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.code.trim() || !form.value) return Alert.alert("Validation", "Code and value are required");
    setSaving(true);
    try {
      await api.post("/coupons/", {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        discount_type: form.discount_type,
        value: Number(form.value),
        min_bill_amount: form.min_bill_amount ? Number(form.min_bill_amount) : 0,
        max_discount: form.max_discount ? Number(form.max_discount) : null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
      });
      setModalOpen(false);
      setForm(BLANK);
      Alert.alert("Success", "Coupon created");
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to create coupon");
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (coupon) => {
    Alert.alert("Deactivate Coupon", `Deactivate "${coupon.code}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Deactivate", style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/coupons/${coupon.coupon_id}`);
            load();
          } catch (err) {
            Alert.alert("Error", err?.response?.data?.detail || "Failed to deactivate");
          }
        },
      },
    ]);
  };

  const validate = async () => {
    if (!validateCode.trim() || !validateAmount) return Alert.alert("Validation", "Enter code and bill amount");
    setValidating(true);
    setValidateResult(null);
    try {
      const res = await api.get(`/coupons/validate/${validateCode.trim().toUpperCase()}`, { params: { amount: validateAmount } });
      setValidateResult(res.data);
    } catch (err) {
      setValidateResult({ error: err?.response?.data?.detail || "Invalid coupon" });
    } finally {
      setValidating(false);
    }
  };

  const isExpired = (c) => c.end_date && new Date(c.end_date) < new Date();

  const renderItem = ({ item }) => {
    const expired = isExpired(item);
    return (
      <View style={st.card}>
        <View style={st.cardTop}>
          <Text style={st.code}>{item.code}</Text>
          <View style={[st.badge, item.active === false ? st.badgeOff : expired ? st.badgeWarn : st.badgeOn]}>
            <Text style={st.badgeText}>{item.active === false ? "Inactive" : expired ? "Expired" : "Active"}</Text>
          </View>
        </View>
        {item.name ? <Text style={st.name}>{item.name}</Text> : null}
        <Text style={st.value}>
          {item.discount_type === "PERCENT" ? `${item.value}% off` : `₹${item.value} off`}
          {item.min_bill_amount ? ` · Min bill ₹${item.min_bill_amount}` : ""}
        </Text>
        <Text style={st.meta}>{fmtDate(item.start_date)} to {fmtDate(item.end_date)}</Text>
        {item.active !== false && (
          <Pressable style={st.deactivateBtn} onPress={() => deactivate(item)}>
            <Text style={st.deactivateBtnText}>Deactivate</Text>
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={st.safe}>
      <View style={st.validateCard}>
        <Text style={st.validateTitle}>Validate Coupon</Text>
        <View style={st.validateRow}>
          <TextInput style={[st.input, { flex: 1 }]} placeholder="CODE" placeholderTextColor="#94a3b8" autoCapitalize="characters" value={validateCode} onChangeText={setValidateCode} />
          <TextInput style={[st.input, { width: 90 }]} placeholder="Amount" placeholderTextColor="#94a3b8" keyboardType="numeric" value={validateAmount} onChangeText={setValidateAmount} />
          <Pressable style={st.validateBtn} disabled={validating} onPress={validate}>
            {validating ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.validateBtnText}>Check</Text>}
          </Pressable>
        </View>
        {validateResult && (
          <Text style={validateResult.error ? st.validateError : st.validateOk}>
            {validateResult.error || `Valid — Discount: ₹${Number(validateResult.discount_amount || 0).toFixed(2)}`}
          </Text>
        )}
      </View>

      {loading ? (
        <View style={st.center}><ActivityIndicator size="large" color="#6366f1" /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r, i) => String(r.coupon_id || i)}
          renderItem={renderItem}
          numColumns={1}
          contentContainerStyle={st.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          ListEmptyComponent={<View style={st.emptyWrap}><Text style={st.emptyIcon}>🏷️</Text><Text style={st.emptyTitle}>No coupons yet</Text></View>}
        />
      )}

      <Pressable style={st.fab} onPress={() => setModalOpen(true)}>
        <Text style={st.fabText}>+ New Coupon</Text>
      </Pressable>

      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={st.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setModalOpen(false)} />
          <View style={st.modalSheet}>
            <Text style={st.modalTitle}>New Coupon</Text>
            <TextInput style={st.input} placeholder="Code (e.g. SAVE10)" placeholderTextColor="#94a3b8" autoCapitalize="characters" value={form.code} onChangeText={(v) => setForm((p) => ({ ...p, code: v }))} />
            <TextInput style={st.input} placeholder="Name (optional)" placeholderTextColor="#94a3b8" value={form.name} onChangeText={(v) => setForm((p) => ({ ...p, name: v }))} />
            <View style={st.chipRow}>
              {["PERCENT", "FLAT"].map((t) => (
                <Pressable key={t} style={[st.chip, form.discount_type === t && st.chipActive]} onPress={() => setForm((p) => ({ ...p, discount_type: t }))}>
                  <Text style={[st.chipText, form.discount_type === t && st.chipTextActive]}>{t === "PERCENT" ? "% Percent" : "₹ Flat"}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput style={st.input} placeholder="Value" placeholderTextColor="#94a3b8" keyboardType="numeric" value={form.value} onChangeText={(v) => setForm((p) => ({ ...p, value: v }))} />
            <TextInput style={st.input} placeholder="Min Bill Amount (optional)" placeholderTextColor="#94a3b8" keyboardType="numeric" value={form.min_bill_amount} onChangeText={(v) => setForm((p) => ({ ...p, min_bill_amount: v }))} />
            <TextInput style={st.input} placeholder="Max Discount (optional)" placeholderTextColor="#94a3b8" keyboardType="numeric" value={form.max_discount} onChangeText={(v) => setForm((p) => ({ ...p, max_discount: v }))} />
            <View style={st.dateRow}>
              <TextInput style={[st.input, { flex: 1 }]} placeholder="Start (YYYY-MM-DD)" placeholderTextColor="#94a3b8" value={form.start_date} onChangeText={(v) => setForm((p) => ({ ...p, start_date: v }))} />
              <TextInput style={[st.input, { flex: 1 }]} placeholder="End (YYYY-MM-DD)" placeholderTextColor="#94a3b8" value={form.end_date} onChangeText={(v) => setForm((p) => ({ ...p, end_date: v }))} />
            </View>
            <View style={st.modalActions}>
              <Pressable style={st.cancelBtn} onPress={() => { setModalOpen(false); setForm(BLANK); }}>
                <Text style={st.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={st.saveBtn} disabled={saving} onPress={save}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.saveBtnText}>Create</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f6fb" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  validateCard: { backgroundColor: "#fff", margin: 14, marginBottom: 8, borderRadius: 16, borderWidth: 1.5, borderColor: "#e4e9f2", padding: 12, gap: 8 },
  validateTitle: { fontSize: 12, fontWeight: "800", color: "#6b7280", textTransform: "uppercase" },
  validateRow: { flexDirection: "row", gap: 8 },
  validateBtn: { backgroundColor: "#6366f1", borderRadius: 12, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  validateBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  validateOk: { color: "#059669", fontWeight: "700", fontSize: 12 },
  validateError: { color: "#dc2626", fontWeight: "700", fontSize: 12 },
  list: { padding: 14, paddingTop: 6, paddingBottom: 90, gap: 10 },
  card: { backgroundColor: "#fff", borderRadius: 16, borderWidth: 1.5, borderColor: "#e4e9f2", padding: 14, gap: 4 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  code: { fontSize: 16, fontWeight: "900", color: "#0a0f1e", letterSpacing: 0.5 },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  badgeOn: { backgroundColor: "#ecfdf5" }, badgeOff: { backgroundColor: "#f1f5f9" }, badgeWarn: { backgroundColor: "#fef2f2" },
  badgeText: { fontSize: 10, fontWeight: "800" },
  name: { fontSize: 13, color: "#374151" },
  value: { fontSize: 13, color: "#059669", fontWeight: "700" },
  meta: { fontSize: 11, color: "#9ca3af" },
  deactivateBtn: { marginTop: 6, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: "#fef2f2" },
  deactivateBtnText: { color: "#dc2626", fontSize: 11, fontWeight: "700" },
  emptyWrap: { alignItems: "center", paddingTop: 50, gap: 10 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { color: "#9ca3af", fontSize: 15, fontWeight: "700" },
  fab: { position: "absolute", right: 16, bottom: 20, backgroundColor: "#6366f1", borderRadius: 999, paddingHorizontal: 20, paddingVertical: 14, elevation: 4 },
  fabText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(10,15,30,0.45)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#fff", borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, gap: 10, maxHeight: "85%" },
  modalTitle: { fontSize: 16, fontWeight: "800", color: "#0a0f1e", marginBottom: 4 },
  input: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12, backgroundColor: "#f8f9fd", paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: "#0a0f1e" },
  dateRow: { flexDirection: "row", gap: 8 },
  chipRow: { flexDirection: "row", gap: 8 },
  chip: { flex: 1, borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12, paddingVertical: 9, alignItems: "center", backgroundColor: "#f8f9fd" },
  chipActive: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  chipText: { fontSize: 12, fontWeight: "700", color: "#4b5563" },
  chipTextActive: { color: "#fff" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 6 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: "#f1f3f9", alignItems: "center" },
  cancelBtnText: { color: "#4b5563", fontWeight: "700", fontSize: 13 },
  saveBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: "#6366f1", alignItems: "center" },
  saveBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
});
