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

const STATUS_FILTERS = ["", "ACTIVE", "REDEEMED", "VOID"];
const BLANK_CREATE = { amount: "", expires_on: "", customer_name: "", mobile: "", customer_email: "", note: "" };
const fmt = (n) => `₹${Number(n || 0).toFixed(2)}`;

export default function GiftCardsScreen() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(BLANK_CREATE);
  const [creating, setCreating] = useState(false);

  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeemCode, setRedeemCode] = useState("");
  const [redeemAmount, setRedeemAmount] = useState("");
  const [redeeming, setRedeeming] = useState(false);

  const load = useCallback(async (isRefresh) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params = { limit: 100 };
      if (q.trim()) params.q = q.trim();
      if (status) params.status = status;
      const res = await api.get("/gift-cards/list", { params });
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load gift cards");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [q, status]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const createCard = async () => {
    if (!createForm.amount) return Alert.alert("Validation", "Enter an amount");
    setCreating(true);
    try {
      const res = await api.post("/gift-cards/create", {
        amount: Number(createForm.amount),
        expires_on: createForm.expires_on || null,
        customer_name: createForm.customer_name.trim() || null,
        mobile: createForm.mobile.trim() || null,
        customer_email: createForm.customer_email.trim() || null,
        note: createForm.note.trim() || null,
      });
      setCreateOpen(false);
      setCreateForm(BLANK_CREATE);
      const emailMsg = createForm.customer_email.trim() ? ` • Email sent to ${createForm.customer_email.trim()}` : "";
      Alert.alert("Success", `Gift card created: ${res?.data?.code || ""}${emailMsg}`);
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to create gift card");
    } finally {
      setCreating(false);
    }
  };

  const redeem = async () => {
    if (!redeemCode.trim() || !redeemAmount) return Alert.alert("Validation", "Enter code and amount");
    setRedeeming(true);
    try {
      const res = await api.post("/gift-cards/redeem", { code: redeemCode.trim().toUpperCase(), amount: Number(redeemAmount), ref_type: "MANUAL" });
      Alert.alert("Redeemed", `Balance remaining: ${fmt(res?.data?.balance_amount)}`);
      setRedeemOpen(false);
      setRedeemCode(""); setRedeemAmount("");
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Redeem failed");
    } finally {
      setRedeeming(false);
    }
  };

  const renderItem = ({ item }) => (
    <View style={st.card}>
      <View style={st.cardTop}>
        <Text style={st.code}>{item.code}</Text>
        <View style={[st.badge, item.status === "ACTIVE" ? st.badgeOn : item.status === "REDEEMED" ? st.badgeMid : st.badgeOff]}>
          <Text style={st.badgeText}>{item.status}</Text>
        </View>
      </View>
      <View style={st.balanceRow}>
        <Text style={st.balance}>{fmt(item.balance_amount)}</Text>
        <Text style={st.meta}>of {fmt(item.initial_amount)}</Text>
      </View>
      {(item.customer_name || item.mobile) && (
        <Text style={st.meta}>{item.customer_name || "—"}{item.mobile ? ` · ${item.mobile}` : ""}</Text>
      )}
      {item.expires_on && <Text style={st.meta}>Expires {String(item.expires_on).split("T")[0]}</Text>}
    </View>
  );

  return (
    <SafeAreaView style={st.safe}>
      <View style={st.filterCard}>
        <TextInput style={st.searchInput} placeholder="Search by code or mobile..." placeholderTextColor="#94a3b8" value={q} onChangeText={setQ} onSubmitEditing={() => load()} />
        <View style={st.chipRow}>
          {STATUS_FILTERS.map((s) => (
            <Pressable key={s || "all"} style={[st.chip, status === s && st.chipActive]} onPress={() => { setStatus(s); load(); }}>
              <Text style={[st.chipText, status === s && st.chipTextActive]}>{s || "All"}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={st.center}><ActivityIndicator size="large" color="#6366f1" /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r, i) => String(r.gift_card_id || i)}
          renderItem={renderItem}
          contentContainerStyle={st.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          ListEmptyComponent={<View style={st.emptyWrap}><Text style={st.emptyIcon}>🎁</Text><Text style={st.emptyTitle}>No gift cards yet</Text></View>}
        />
      )}

      <View style={st.fabRow}>
        <Pressable style={[st.fab, st.fabSecondary]} onPress={() => setRedeemOpen(true)}>
          <Text style={st.fabSecondaryText}>Redeem</Text>
        </Pressable>
        <Pressable style={st.fab} onPress={() => setCreateOpen(true)}>
          <Text style={st.fabText}>+ New Card</Text>
        </Pressable>
      </View>

      <Modal visible={createOpen} animationType="slide" transparent onRequestClose={() => setCreateOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={st.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCreateOpen(false)} />
          <View style={st.modalSheet}>
            <Text style={st.modalTitle}>New Gift Card</Text>
            <TextInput style={st.input} placeholder="Amount" placeholderTextColor="#94a3b8" keyboardType="numeric" value={createForm.amount} onChangeText={(v) => setCreateForm((p) => ({ ...p, amount: v }))} />
            <TextInput style={st.input} placeholder="Expires On (YYYY-MM-DD, optional)" placeholderTextColor="#94a3b8" value={createForm.expires_on} onChangeText={(v) => setCreateForm((p) => ({ ...p, expires_on: v }))} />
            <TextInput style={st.input} placeholder="Customer Name (optional)" placeholderTextColor="#94a3b8" value={createForm.customer_name} onChangeText={(v) => setCreateForm((p) => ({ ...p, customer_name: v }))} />
            <TextInput style={st.input} placeholder="Mobile (optional)" placeholderTextColor="#94a3b8" keyboardType="phone-pad" value={createForm.mobile} onChangeText={(v) => setCreateForm((p) => ({ ...p, mobile: v }))} />
            <TextInput style={st.input} placeholder="Customer Email (sends gift card)" placeholderTextColor="#94a3b8" keyboardType="email-address" autoCapitalize="none" value={createForm.customer_email} onChangeText={(v) => setCreateForm((p) => ({ ...p, customer_email: v }))} />
            <TextInput style={st.input} placeholder="Note (optional)" placeholderTextColor="#94a3b8" value={createForm.note} onChangeText={(v) => setCreateForm((p) => ({ ...p, note: v }))} />
            <View style={st.modalActions}>
              <Pressable style={st.cancelBtn} onPress={() => setCreateOpen(false)}><Text style={st.cancelBtnText}>Cancel</Text></Pressable>
              <Pressable style={st.saveBtn} disabled={creating} onPress={createCard}>
                {creating ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.saveBtnText}>Create</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={redeemOpen} animationType="slide" transparent onRequestClose={() => setRedeemOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={st.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setRedeemOpen(false)} />
          <View style={st.modalSheet}>
            <Text style={st.modalTitle}>Redeem Gift Card</Text>
            <TextInput style={st.input} placeholder="Code" placeholderTextColor="#94a3b8" autoCapitalize="characters" value={redeemCode} onChangeText={setRedeemCode} />
            <TextInput style={st.input} placeholder="Amount to redeem" placeholderTextColor="#94a3b8" keyboardType="numeric" value={redeemAmount} onChangeText={setRedeemAmount} />
            <View style={st.modalActions}>
              <Pressable style={st.cancelBtn} onPress={() => setRedeemOpen(false)}><Text style={st.cancelBtnText}>Cancel</Text></Pressable>
              <Pressable style={st.saveBtn} disabled={redeeming} onPress={redeem}>
                {redeeming ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.saveBtnText}>Redeem</Text>}
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
  filterCard: { backgroundColor: "#fff", margin: 14, marginBottom: 8, borderRadius: 16, borderWidth: 1.5, borderColor: "#e4e9f2", padding: 12, gap: 10 },
  searchInput: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12, backgroundColor: "#f8f9fd", paddingHorizontal: 12, paddingVertical: 9, color: "#0a0f1e", fontSize: 13 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#f8f9fd" },
  chipActive: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  chipText: { fontSize: 11, fontWeight: "700", color: "#4b5563" },
  chipTextActive: { color: "#fff" },
  list: { padding: 14, paddingTop: 6, paddingBottom: 100, gap: 10 },
  card: { backgroundColor: "#fff", borderRadius: 16, borderWidth: 1.5, borderColor: "#e4e9f2", padding: 14, gap: 4 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  code: { fontSize: 15, fontWeight: "900", color: "#0a0f1e", letterSpacing: 0.5 },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  badgeOn: { backgroundColor: "#ecfdf5" }, badgeMid: { backgroundColor: "#eff6ff" }, badgeOff: { backgroundColor: "#f1f5f9" },
  badgeText: { fontSize: 10, fontWeight: "800" },
  balanceRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  balance: { fontSize: 18, fontWeight: "900", color: "#059669" },
  meta: { fontSize: 11, color: "#6b7280" },
  emptyWrap: { alignItems: "center", paddingTop: 50, gap: 10 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { color: "#9ca3af", fontSize: 15, fontWeight: "700" },
  fabRow: { position: "absolute", right: 16, bottom: 20, flexDirection: "row", gap: 10 },
  fab: { backgroundColor: "#6366f1", borderRadius: 999, paddingHorizontal: 18, paddingVertical: 14, elevation: 4 },
  fabSecondary: { backgroundColor: "#fff", borderWidth: 1.5, borderColor: "#6366f1" },
  fabText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  fabSecondaryText: { color: "#6366f1", fontWeight: "800", fontSize: 13 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(10,15,30,0.45)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#fff", borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, gap: 10, maxHeight: "85%" },
  modalTitle: { fontSize: 16, fontWeight: "800", color: "#0a0f1e", marginBottom: 4 },
  input: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12, backgroundColor: "#f8f9fd", paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: "#0a0f1e" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 6 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: "#f1f3f9", alignItems: "center" },
  cancelBtnText: { color: "#4b5563", fontWeight: "700", fontSize: 13 },
  saveBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: "#6366f1", alignItems: "center" },
  saveBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
});
