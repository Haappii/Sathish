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
import { useTheme } from "../context/ThemeContext";

const emptyForm = {
  customer_id: null,
  customer_name: "",
  mobile: "",
  email: "",
  gst_number: "",
  address_line1: "",
  address_line2: "",
  city: "",
  state: "",
  pincode: "",
  status: "ACTIVE",
};

export default function CustomersScreen() {
  const { theme } = useTheme();
  const [customers, setCustomers] = useState([]);
  const [search, setSearch]       = useState("");
  const [loading, setLoading]     = useState(true);
  const [formModal, setFormModal] = useState(false);
  const [saving, setSaving]       = useState(false);

  const [form, setForm] = useState(emptyForm);
  const isEditing = !!form.customer_id;

  const [dues, setDues] = useState([]);
  const [duesLoading, setDuesLoading] = useState(false);

  const debounceRef = useRef(null);

  const fetchCustomers = useCallback(async (q = "") => {
    setLoading(true);
    try {
      const res = await api.get("/customers/search", { params: { q: q || undefined, limit: 200 } });
      setCustomers(res.data?.customers ?? res.data ?? []);
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

  const loadDues = async (mobile) => {
    if (!mobile || String(mobile).replace(/\D/g, "").length < 10) {
      setDues([]);
      return;
    }
    setDuesLoading(true);
    try {
      const res = await api.get("/dues/open", { params: { q: mobile } });
      setDues(res.data || []);
    } catch {
      setDues([]);
    } finally {
      setDuesLoading(false);
    }
  };

  const openNew = () => {
    setForm(emptyForm);
    setDues([]);
    setFormModal(true);
  };

  const openEdit = (c) => {
    setForm({
      ...emptyForm,
      ...c,
      customer_id: c.customer_id ?? null,
      status: c.status || "ACTIVE",
    });
    setFormModal(true);
    loadDues(c.mobile);
  };

  const update = (patch) => setForm((f) => ({ ...f, ...patch }));

  const saveCustomer = async () => {
    if (!form.customer_name?.trim()) return Alert.alert("Validation", "Customer name is required");
    if (!form.mobile?.trim()) return Alert.alert("Validation", "Mobile is required");
    setSaving(true);
    try {
      const payload = {
        customer_name: form.customer_name?.trim(),
        mobile: form.mobile?.trim(),
        email: form.email?.trim() || null,
        gst_number: form.gst_number?.trim() || null,
        address_line1: form.address_line1?.trim() || null,
        address_line2: form.address_line2?.trim() || null,
        city: form.city?.trim() || null,
        state: form.state?.trim() || null,
        pincode: form.pincode?.trim() || null,
        status: form.status || "ACTIVE",
      };
      if (isEditing) payload.customer_id = form.customer_id;
      await api.post("/customers/", payload);
      setFormModal(false);
      setForm(emptyForm);
      setDues([]);
      fetchCustomers(search);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to save customer");
    } finally {
      setSaving(false);
    }
  };

  const totalOutstanding = dues.reduce((s, d) => s + Number(d.outstanding_amount || 0), 0);

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
        <Pressable style={styles.addBtn} onPress={openNew}>
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
            <Pressable key={c.customer_id} style={styles.card} onPress={() => openEdit(c)}>
              <View style={styles.cardLeft}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{(c.customer_name || "?")[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{c.customer_name}</Text>
                  {!!c.email && <Text style={styles.subtle}>{c.email}</Text>}
                  <Text style={styles.mobile}>{c.mobile}</Text>
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 3, flexWrap: "wrap" }}>
                    {!!c.gst_number && <Text style={styles.subtle}>GST: {c.gst_number}</Text>}
                    {!!c.city && <Text style={styles.subtle}>{c.city}</Text>}
                  </View>
                </View>
              </View>
              <View style={styles.cardRight}>
                <View style={[styles.statusBadge, c.status === "INACTIVE" && styles.statusBadgeInactive]}>
                  <Text style={[styles.statusText, c.status === "INACTIVE" && styles.statusTextInactive]}>
                    {c.status || "ACTIVE"}
                  </Text>
                </View>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Customer Form Modal */}
      <Modal visible={formModal} animationType="slide" transparent onRequestClose={() => setFormModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.overlay}>
          <Pressable style={styles.overlayBg} onPress={Keyboard.dismiss} />
          <View style={[styles.modal, { maxHeight: "88%" }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>{isEditing ? "Edit Customer" : "New Customer"}</Text>

              <Text style={styles.sectionLabel}>Basic Info</Text>
              <Field label="Full Name *" value={form.customer_name} onChangeText={(t) => update({ customer_name: t })} />
              <Field label="Mobile *" value={form.mobile} onChangeText={(t) => update({ mobile: t })} keyboardType="phone-pad" />
              <Field label="Email" value={form.email} onChangeText={(t) => update({ email: t })} keyboardType="email-address" />
              <Field label="GST Number" value={form.gst_number} onChangeText={(t) => update({ gst_number: t })} />

              <Text style={styles.sectionLabel}>Status</Text>
              <View style={styles.chipRow}>
                {["ACTIVE", "INACTIVE"].map((s) => (
                  <Pressable
                    key={s}
                    style={[styles.chip, form.status === s && styles.chipActive]}
                    onPress={() => update({ status: s })}
                  >
                    <Text style={[styles.chipText, form.status === s && styles.chipTextActive]}>{s}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.sectionLabel}>Address</Text>
              <Field label="Address Line 1" value={form.address_line1} onChangeText={(t) => update({ address_line1: t })} />
              <Field label="Address Line 2" value={form.address_line2} onChangeText={(t) => update({ address_line2: t })} />
              <Field label="City" value={form.city} onChangeText={(t) => update({ city: t })} />
              <Field label="State" value={form.state} onChangeText={(t) => update({ state: t })} />
              <Field label="Pincode" value={form.pincode} onChangeText={(t) => update({ pincode: t })} keyboardType="number-pad" />

              {isEditing && (
                <View style={{ marginTop: 6 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={styles.sectionLabel}>Open Dues</Text>
                    {duesLoading && <ActivityIndicator size="small" />}
                  </View>
                  {dues.length === 0 ? (
                    <Text style={styles.hint}>No open dues for this customer</Text>
                  ) : (
                    <>
                      {dues.map((d) => (
                        <View key={d.due_id} style={styles.dueRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.dueInvoice}>{d.invoice_number}</Text>
                            <Text style={styles.hint}>
                              Orig ₹{Number(d.original_amount || 0).toFixed(2)} · Paid ₹{Number(d.paid_amount || 0).toFixed(2)}
                            </Text>
                          </View>
                          <Text style={styles.dueAmount}>₹{Number(d.outstanding_amount || 0).toFixed(2)}</Text>
                        </View>
                      ))}
                      <View style={[styles.dueRow, { borderTopWidth: 1.5, borderTopColor: theme.cardBorder }]}>
                        <Text style={styles.dueTotalLabel}>Total Outstanding</Text>
                        <Text style={styles.dueAmount}>₹{totalOutstanding.toFixed(2)}</Text>
                      </View>
                    </>
                  )}
                </View>
              )}

              <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                <Pressable
                  style={[styles.closeBtn, { flex: 1, backgroundColor: theme.background, borderWidth: 1.5, borderColor: theme.cardBorder }]}
                  onPress={() => { setFormModal(false); setForm(emptyForm); setDues([]); }}
                >
                  <Text style={[styles.closeBtnText, { color: theme.textSub }]}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.closeBtn, { flex: 1 }]} onPress={saveCustomer} disabled={saving}>
                  <Text style={styles.closeBtnText}>{saving ? "Saving…" : isEditing ? "Update" : "Save"}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function Field({ label, value, onChangeText, keyboardType }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.fieldInput}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType || "default"}
        placeholderTextColor="#8896ae"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: "#f4f6fb" },
  center:  { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar:  { flexDirection: "row", padding: 14, gap: 10 },
  searchInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#e4e9f2",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#ffffff",
    color: "#0a0f1e",
    fontSize: 14,
    shadowColor: "#0a0f1e",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  addBtn: {
    backgroundColor: "#6366f1",
    borderRadius: 14,
    paddingHorizontal: 18,
    justifyContent: "center",
    shadowColor: "#6366f1",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  addBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  card: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: "#e4e9f2",
    shadowColor: "#0a0f1e",
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  cardLeft:  { flexDirection: "row", alignItems: "flex-start", gap: 12, flex: 1 },
  cardRight: { alignItems: "flex-end", gap: 5 },
  avatar: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: "#eef2ff",
    alignItems: "center", justifyContent: "center",
    borderWidth: 2,
    borderColor: "#e4e9f2",
  },
  avatarText: { color: "#6366f1", fontWeight: "900", fontSize: 18 },
  name:   { fontWeight: "800", color: "#0a0f1e", fontSize: 15 },
  mobile: { color: "#4b5563", fontSize: 13, marginTop: 2 },
  subtle: { color: "#9ca3af", fontSize: 11.5 },
  statusBadge: { backgroundColor: "#ecfdf5", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1, borderColor: "#6ee7b7" },
  statusBadgeInactive: { backgroundColor: "#f3f4f6", borderColor: "#d1d5db" },
  statusText:  { color: "#10b981", fontWeight: "700", fontSize: 11 },
  statusTextInactive: { color: "#6b7280" },
  overlay: { flex: 1, justifyContent: "flex-end" },
  overlayBg: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  modal: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 22,
    paddingBottom: 44,
    shadowColor: "#0a0f1e",
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: "900", color: "#0a0f1e", marginBottom: 16, letterSpacing: -0.3 },
  sectionLabel: { fontSize: 11, fontWeight: "800", color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginTop: 4 },
  fieldLabel: { color: "#4b5563", marginBottom: 5, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  fieldInput: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12, paddingHorizontal: 13, paddingVertical: 12, backgroundColor: "#f8f9fd", color: "#0a0f1e", fontSize: 14 },
  chipRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: "#e4e9f2", backgroundColor: "#f8f9fd" },
  chipActive: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  chipText: { color: "#4b5563", fontWeight: "700", fontSize: 12 },
  chipTextActive: { color: "#fff" },
  hint: { color: "#9ca3af", fontSize: 12, marginBottom: 6 },
  dueRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 },
  dueInvoice: { fontWeight: "700", color: "#0a0f1e", fontSize: 13 },
  dueTotalLabel: { fontWeight: "700", color: "#4b5563", fontSize: 12 },
  dueAmount: { fontWeight: "800", color: "#ef4444", fontSize: 13 },
  closeBtn: {
    backgroundColor: "#6366f1",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    shadowColor: "#6366f1",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },
  closeBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  empty: { color: "#9ca3af", fontSize: 15 },
});
