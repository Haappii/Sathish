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

export default function CashDrawerScreen() {
  const [drawer, setDrawer]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [txns, setTxns]         = useState([]);
  const [openModal, setOpenModal]  = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [openingCash, setOpeningCash] = useState("");
  const [closingCash, setClosingCash] = useState("");
  const [saving, setSaving]     = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [drawerRes, txnRes] = await Promise.all([
        api.get("/cash-drawer/current").catch(() => ({ data: null })),
        api.get("/cash-drawer/transactions").catch(() => ({ data: [] })),
      ]);
      setDrawer(drawerRes.data);
      setTxns(txnRes.data?.transactions ?? txnRes.data ?? []);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load cash drawer");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openDrawer = async () => {
    const amount = parseFloat(openingCash);
    if (isNaN(amount) || amount < 0) return Alert.alert("Validation", "Enter opening cash amount");
    setSaving(true);
    try {
      await api.post("/cash-drawer/open", { opening_cash: amount });
      setOpenModal(false);
      setOpeningCash("");
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to open drawer");
    } finally {
      setSaving(false);
    }
  };

  const closeDrawer = async () => {
    const amount = parseFloat(closingCash);
    if (isNaN(amount) || amount < 0) return Alert.alert("Validation", "Enter closing cash amount");
    Alert.alert("Confirm", "Are you sure you want to close the cash drawer?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Close Drawer",
        style: "destructive",
        onPress: async () => {
          setSaving(true);
          try {
            await api.post("/cash-drawer/close", { closing_cash: amount });
            setCloseModal(false);
            setClosingCash("");
            load();
          } catch (err) {
            Alert.alert("Error", err?.response?.data?.detail || "Failed to close drawer");
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const isOpen = drawer?.status === "OPEN" || drawer?.is_open;

  return (
    <SafeAreaView style={styles.safe}>
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 14, gap: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        >
          {/* Status Card */}
          <View style={[styles.statusCard, { borderColor: isOpen ? "#6ee7b7" : "#dde6f7" }]}>
            <Text style={styles.statusLabel}>Cash Drawer</Text>
            <View style={styles.statusRow}>
              <Text style={[styles.statusBadge, { backgroundColor: isOpen ? "#dcfce7" : "#f0f4ff", color: isOpen ? "#15803d" : "#4a5a78" }]}>
                {isOpen ? "OPEN" : "CLOSED"}
              </Text>
              {drawer?.opened_at && (
                <Text style={styles.statusTime}>Opened: {fmtTime(drawer.opened_at)}</Text>
              )}
            </View>

            {drawer ? (
              <View style={styles.amountGrid}>
                <AmountBox label="Opening Cash" value={drawer.opening_cash} />
                <AmountBox label="Cash Sales"   value={drawer.cash_sales} />
                <AmountBox label="Cash In"      value={drawer.cash_in} />
                <AmountBox label="Cash Out"     value={drawer.cash_out} />
                <AmountBox label="Expected"     value={drawer.expected_closing} highlight />
                {drawer.closing_cash != null && (
                  <AmountBox label="Closing Cash" value={drawer.closing_cash} />
                )}
              </View>
            ) : (
              <Text style={styles.noDrawer}>No active shift. Open the cash drawer to start.</Text>
            )}

            <View style={styles.actionRow}>
              {!isOpen ? (
                <Pressable style={[styles.btn, { backgroundColor: "#16a34a" }]} onPress={() => setOpenModal(true)}>
                  <Text style={styles.btnText}>Open Drawer</Text>
                </Pressable>
              ) : (
                <Pressable style={[styles.btn, { backgroundColor: "#b91c1c" }]} onPress={() => setCloseModal(true)}>
                  <Text style={styles.btnText}>Close Drawer</Text>
                </Pressable>
              )}
            </View>
          </View>

          {/* Recent Transactions */}
          {txns.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Today's Transactions</Text>
              {txns.slice(0, 20).map((t, i) => (
                <View key={t.id ?? i} style={styles.txnRow}>
                  <View>
                    <Text style={styles.txnDesc}>{t.description || t.type}</Text>
                    <Text style={styles.txnTime}>{fmtTime(t.created_at)}</Text>
                  </View>
                  <Text style={[styles.txnAmount, { color: t.type === "OUT" ? "#b91c1c" : "#15803d" }]}>
                    {t.type === "OUT" ? "-" : "+"}₹{fmt(t.amount)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* Open Drawer Modal */}
      <Modal visible={openModal} animationType="slide" transparent onRequestClose={() => setOpenModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.overlay}>
          <Pressable style={styles.overlayBg} onPress={() => setOpenModal(false)} />
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Open Cash Drawer</Text>
            <Text style={styles.fieldLabel}>Opening Cash (₹)</Text>
            <TextInput
              style={styles.input}
              value={openingCash}
              onChangeText={setOpeningCash}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#94a3b8"
              autoFocus
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable style={[styles.modalBtn, { backgroundColor: "#f0f4ff", flex: 1 }]} onPress={() => setOpenModal(false)}>
                <Text style={[styles.btnText, { color: "#4a5a78" }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, { backgroundColor: "#16a34a", flex: 1 }]} onPress={openDrawer} disabled={saving}>
                <Text style={styles.btnText}>{saving ? "Opening…" : "Open"}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Close Drawer Modal */}
      <Modal visible={closeModal} animationType="slide" transparent onRequestClose={() => setCloseModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.overlay}>
          <Pressable style={styles.overlayBg} onPress={() => setCloseModal(false)} />
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Close Cash Drawer</Text>
            <Text style={styles.fieldLabel}>Closing Cash in Hand (₹)</Text>
            <TextInput
              style={styles.input}
              value={closingCash}
              onChangeText={setClosingCash}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#94a3b8"
              autoFocus
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable style={[styles.modalBtn, { backgroundColor: "#f0f4ff", flex: 1 }]} onPress={() => setCloseModal(false)}>
                <Text style={[styles.btnText, { color: "#4a5a78" }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, { backgroundColor: "#b91c1c", flex: 1 }]} onPress={closeDrawer} disabled={saving}>
                <Text style={styles.btnText}>{saving ? "Closing…" : "Close"}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function AmountBox({ label, value, highlight }) {
  return (
    <View style={[styles.amountBox, highlight && { backgroundColor: "#eff4ff", borderColor: "#93c5fd" }]}>
      <Text style={styles.amountLabel}>{label}</Text>
      <Text style={[styles.amountValue, highlight && { color: "#2563eb" }]}>₹{fmt(value)}</Text>
    </View>
  );
}

function fmt(n) {
  return Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function fmtTime(dt) {
  if (!dt) return "";
  return new Date(dt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: "#f0f4ff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  statusCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    borderColor: "#dde6f7",
    gap: 12,
    shadowColor: "#1a2463", shadowOpacity: 0.08, shadowRadius: 14,
    shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
  statusLabel: { fontWeight: "800", fontSize: 16, color: "#0c1228" },
  statusRow:   { flexDirection: "row", alignItems: "center", gap: 10 },
  statusBadge: { fontWeight: "800", paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, overflow: "hidden" },
  statusTime:  { color: "#8896ae", fontSize: 13, fontWeight: "600" },
  amountGrid:  { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  amountBox: {
    width: "47%",
    backgroundColor: "#f6f8fe",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.5,
    borderColor: "#dde6f7",
  },
  amountLabel: { color: "#8896ae", fontSize: 10, marginBottom: 3, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  amountValue: { fontWeight: "800", color: "#0c1228", fontSize: 16 },
  noDrawer:    { color: "#8896ae", textAlign: "center", paddingVertical: 12, fontWeight: "600" },
  actionRow:   { flexDirection: "row" },
  btn:         { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: "center", shadowOpacity: 0.3, shadowRadius: 10, elevation: 5 },
  btnText:     { color: "#fff", fontWeight: "800", fontSize: 14 },
  section: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.5,
    borderColor: "#dde6f7",
    gap: 8,
    shadowColor: "#1a2463", shadowOpacity: 0.07, shadowRadius: 12, elevation: 4,
  },
  sectionTitle: { fontWeight: "800", fontSize: 14, color: "#0c1228" },
  txnRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f4ff",
  },
  txnDesc:   { fontWeight: "700", color: "#0c1228", fontSize: 13 },
  txnTime:   { color: "#8896ae", fontSize: 12, marginTop: 2 },
  txnAmount: { fontWeight: "800", fontSize: 15 },
  overlay:   { flex: 1, justifyContent: "flex-end" },
  overlayBg: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  modal: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 22,
    paddingBottom: 44,
    gap: 12,
    shadowColor: "#0c1228", shadowOpacity: 0.2, shadowRadius: 24, elevation: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: "900", color: "#0c1228", letterSpacing: -0.3 },
  fieldLabel: { color: "#4a5a78", fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  input: {
    borderWidth: 1.5,
    borderColor: "#d0dcf0",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: "#f6f8fe",
    color: "#0c1228",
    fontSize: 20,
    fontWeight: "700",
  },
  modalBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center", shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
});
