import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import api from "../api/client";

export default function CustomersScreen() {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch]       = useState("");
  const [loading, setLoading]     = useState(true);
  const [addModal, setAddModal]   = useState(false);
  const [detailModal, setDetailModal] = useState(null); // selected customer
  const [saving, setSaving]       = useState(false);

  // Add form state
  const [form, setForm] = useState({ name: "", mobile: "", email: "", address: "" });

  const debounceRef = useRef(null);

  const dueAmount = (row) => Number(row?.outstanding_amount ?? row?.pending_amount ?? row?.due_amount ?? 0);

  const fetchCustomers = useCallback(async (q = "") => {
    setLoading(true);
    try {
      const customerReq = q
        ? api.get("/customers/search", { params: { q } })
        : api.get("/customers/");
      const [custRes, duesRes] = await Promise.all([
        customerReq,
        api.get("/dues/open").catch(() => ({ data: [] })),
      ]);

      const baseCustomers = custRes.data?.customers ?? custRes.data ?? [];
      const openDues = duesRes?.data || [];

      const dueByCustomerId = {};
      const dueByMobile = {};
      for (const d of openDues) {
        const amt = dueAmount(d);
        if (amt <= 0) continue;
        if (d.customer_id) {
          dueByCustomerId[d.customer_id] = Number(dueByCustomerId[d.customer_id] || 0) + amt;
        }
        if (d.mobile) {
          dueByMobile[d.mobile] = Number(dueByMobile[d.mobile] || 0) + amt;
        }
      }

      const merged = baseCustomers.map((c) => {
        const byId = Number(dueByCustomerId[c.customer_id] || 0);
        const byMobile = Number(dueByMobile[c.mobile] || 0);
        return {
          ...c,
          due_amount: byId > 0 ? byId : byMobile,
        };
      });

      setCustomers(merged);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load customers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  const onSearch = (text) => {
    setSearch(text);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchCustomers(text), 400);
  };

  const openDetail = async (customer) => {
    try {
      const res = await api.get(`/customers/${customer.customer_id}`);
      setDetailModal({ ...res.data, due_amount: customer?.due_amount ?? 0 });
    } catch {
      setDetailModal(customer);
    }
  };

  const saveCustomer = async () => {
    if (!form.name.trim()) return Alert.alert("Validation", "Name is required");
    if (!form.mobile.trim() || form.mobile.length < 10)
      return Alert.alert("Validation", "Enter a valid mobile number");
    setSaving(true);
    try {
      await api.post("/customers/", {
        customer_name: form.name.trim(),
        mobile: form.mobile.trim(),
        email: form.email.trim() || null,
        address: form.address.trim() || null,
      });
      setAddModal(false);
      setForm({ name: "", mobile: "", email: "", address: "" });
      fetchCustomers(search);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to add customer");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Search bar */}
      <View style={styles.topBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or mobile…"
          value={search}
          onChangeText={onSearch}
          returnKeyType="search"
          placeholderTextColor="#94a3b8"
        />
        <Pressable style={styles.addBtn} onPress={() => setAddModal(true)}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" /></View>
      ) : customers.length === 0 ? (
        <View style={styles.center}><Text style={styles.empty}>No customers found.</Text></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }}>
          {customers.map((c) => (
            <Pressable key={c.customer_id} style={styles.card} onPress={() => openDetail(c)}>
              <View style={styles.cardLeft}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{(c.customer_name || "?")[0].toUpperCase()}</Text>
                </View>
                <View>
                  <Text style={styles.name}>{c.customer_name}</Text>
                  <Text style={styles.mobile}>{c.mobile}</Text>
                </View>
              </View>
              <View style={styles.cardRight}>
                {(c.wallet_balance ?? 0) > 0 && (
                  <View style={styles.walletBadge}>
                    <Text style={styles.walletText}>₹{fmt(c.wallet_balance)} wallet</Text>
                  </View>
                )}
                {(c.due_amount ?? 0) > 0 && (
                  <View style={styles.dueBadge}>
                    <Text style={styles.dueText}>₹{fmt(c.due_amount)} due</Text>
                  </View>
                )}
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Customer Detail Modal */}
      <Modal visible={!!detailModal} animationType="slide" transparent onRequestClose={() => setDetailModal(null)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{detailModal?.customer_name}</Text>
            <DetailRow label="Mobile"  value={detailModal?.mobile} />
            <DetailRow label="Email"   value={detailModal?.email} />
            <DetailRow label="Address" value={detailModal?.address || detailModal?.address_line1} />
            <DetailRow label="Points"  value={String(detailModal?.loyalty_points ?? 0)} />
            <DetailRow label="Wallet"  value={`₹${fmt(detailModal?.wallet_balance)}`} />
            <DetailRow label="Total Due" value={`₹${fmt(detailModal?.due_amount)}`} />
            <Pressable style={styles.closeBtn} onPress={() => setDetailModal(null)}>
              <Text style={styles.closeBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Add Customer Modal */}
      <Modal visible={addModal} animationType="slide" transparent onRequestClose={() => setAddModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.overlay}>
          <Pressable style={styles.overlayBg} onPress={Keyboard.dismiss} />
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Add Customer</Text>
            <Field label="Name *"   value={form.name}    onChangeText={(t) => setForm((f) => ({ ...f, name: t }))} />
            <Field label="Mobile *" value={form.mobile}  onChangeText={(t) => setForm((f) => ({ ...f, mobile: t }))} keyboardType="phone-pad" />
            <Field label="Email"    value={form.email}   onChangeText={(t) => setForm((f) => ({ ...f, email: t }))} keyboardType="email-address" />
            <Field label="Address"  value={form.address} onChangeText={(t) => setForm((f) => ({ ...f, address: t }))} />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
              <Pressable style={[styles.closeBtn, { flex: 1, backgroundColor: "#f0f4ff", borderWidth: 1.5, borderColor: "#dde6f7" }]} onPress={() => setAddModal(false)}>
                <Text style={[styles.closeBtnText, { color: "#4a5a78" }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.closeBtn, { flex: 1 }]} onPress={saveCustomer} disabled={saving}>
                <Text style={styles.closeBtnText}>{saving ? "Saving…" : "Save"}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function DetailRow({ label, value }) {
  if (!value) return null;
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#f0f4ff" }}>
      <Text style={{ color: "#8896ae", fontSize: 13, fontWeight: "600" }}>{label}</Text>
      <Text style={{ fontWeight: "700", color: "#0c1228", fontSize: 13 }}>{value}</Text>
    </View>
  );
}

function Field({ label, value, onChangeText, keyboardType }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: "#4a5a78", marginBottom: 5, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</Text>
      <TextInput
        style={{ borderWidth: 1.5, borderColor: "#d0dcf0", borderRadius: 12, paddingHorizontal: 13, paddingVertical: 12, backgroundColor: "#f6f8fe", color: "#0c1228", fontSize: 14 }}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType || "default"}
        placeholderTextColor="#8896ae"
      />
    </View>
  );
}

function fmt(n) {
  return Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: "#f0f4ff" },
  center:  { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar:  { flexDirection: "row", padding: 14, gap: 10 },
  searchInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#d0dcf0",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#fff",
    color: "#0c1228",
    fontSize: 14,
    shadowColor: "#1a2463",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  addBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 14,
    paddingHorizontal: 18,
    justifyContent: "center",
    shadowColor: "#2563eb",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  addBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  card: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: "#dde6f7",
    shadowColor: "#1a2463",
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  cardLeft:  { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  cardRight: { alignItems: "flex-end", gap: 5 },
  avatar: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: "#eef2ff",
    alignItems: "center", justifyContent: "center",
    borderWidth: 2,
    borderColor: "#dde6f7",
  },
  avatarText: { color: "#2563eb", fontWeight: "900", fontSize: 18 },
  name:   { fontWeight: "800", color: "#0c1228", fontSize: 15 },
  mobile: { color: "#4a5a78", fontSize: 13, marginTop: 2 },
  walletBadge: { backgroundColor: "#ecfdf5", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1, borderColor: "#6ee7b7" },
  walletText:  { color: "#059669", fontWeight: "700", fontSize: 12 },
  dueBadge: { backgroundColor: "#fef2f2", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1, borderColor: "#fca5a5" },
  dueText:  { color: "#dc2626", fontWeight: "700", fontSize: 12 },
  overlay: { flex: 1, justifyContent: "flex-end" },
  overlayBg: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  modal: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 22,
    paddingBottom: 44,
    shadowColor: "#0c1228",
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: "900", color: "#0c1228", marginBottom: 16, letterSpacing: -0.3 },
  closeBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    shadowColor: "#2563eb",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },
  closeBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  empty: { color: "#8896ae", fontSize: 15 },
});
