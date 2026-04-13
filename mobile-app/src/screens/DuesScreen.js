import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
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
import { useAuth } from "../context/AuthContext";

const PAYMENT_MODES = ["cash", "card", "upi", "bank"];
const fmt = (n) => `₹${Number(n || 0).toFixed(2)}`;
const getDueAmount = (row) => Number(row?.outstanding_amount ?? row?.pending_amount ?? row?.due_amount ?? 0);

export default function DuesScreen() {
  const { session } = useAuth();
  const roleLower = String(session?.role_name || session?.role || "").toLowerCase();
  const isAdmin = roleLower === "admin";

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [paying, setPaying] = useState(null); // invoice_number being paid
  const [payAmount, setPayAmount] = useState("");
  const [payMode, setPayMode] = useState("cash");
  const [payRef, setPayRef] = useState("");
  const [saving, setSaving] = useState(false);
  const [viewingDue, setViewingDue] = useState(null); // due being viewed with items

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const params = {};
      if (search) params.q = search;
      const res = await api.get("/dues/open", { params });
      setRows(res?.data || []);
    } catch (err) {
      if (!silent) Alert.alert("Error", err?.response?.data?.detail || "Failed to load dues");
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search]);

  useEffect(() => { load(); }, []);

  const openPay = (row) => {
    setPaying(row.invoice_number);
    setPayAmount(String(getDueAmount(row).toFixed(2)));
    setPayMode("cash");
    setPayRef("");
  };

  const submitPay = async () => {
    const amount = Number(payAmount || 0);
    if (!amount || amount <= 0) return Alert.alert("Validation", "Enter valid amount");
    setSaving(true);
    try {
      await api.post("/dues/pay", {
        invoice_number: paying,
        amount,
        payment_mode: payMode,
        reference_no: payRef || null,
      });
      Alert.alert("Recorded", "Payment recorded successfully.");
      setPaying(null);
      await load(true);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Payment failed");
    } finally {
      setSaving(false);
    }
  };

  const totalDue = rows.reduce((s, r) => s + getDueAmount(r), 0);

  const renderRow = ({ item: row }) => (
    <Pressable style={styles.card} onPress={() => setViewingDue(row)}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.invNo}>{row.invoice_number}</Text>
          <Text style={styles.customer}>{row.customer_name || "Walk-in"}</Text>
          {row.mobile && <Text style={styles.meta}>📞 {row.mobile}</Text>}
          {row.created_time && (
            <Text style={styles.meta}>📅 {String(row.created_time).split("T")[0]}</Text>
          )}
        </View>
        <View style={styles.amtWrap}>
          <Text style={styles.dueAmt}>{fmt(getDueAmount(row))}</Text>
          <Text style={styles.dueLabel}>due</Text>
        </View>
      </View>
      <Pressable style={styles.payBtn} onPress={() => openPay(row)}>
        <Text style={styles.payBtnText}>Record Payment</Text>
      </Pressable>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.safe}>
      {/* Summary banner */}
      {rows.length > 0 && (
        <View style={styles.summaryBanner}>
          <Text style={styles.summaryText}>
            {rows.length} open due{rows.length !== 1 ? "s" : ""} · Total: {fmt(totalDue)}
          </Text>
        </View>
      )}

      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search customer or invoice…"
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={() => load()}
          returnKeyType="search"
        />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0b57d0" />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => String(r.invoice_number)}
          renderItem={renderRow}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={["#0b57d0"]} />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyIcon}>✅</Text>
              <Text style={styles.emptyTitle}>No open dues</Text>
              <Text style={styles.emptyMsg}>All accounts are settled.</Text>
            </View>
          }
        />
      )}

      {/* Pay Modal */}
      <Modal transparent visible={!!paying} animationType="slide" onRequestClose={() => setPaying(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Record Payment</Text>
            <Text style={styles.modalSub}>Invoice: {paying}</Text>

            <Text style={styles.label}>Amount (₹)</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={payAmount}
              onChangeText={(v) => setPayAmount(v.replace(/[^\d.]/g, ""))}
              placeholder="0.00"
              placeholderTextColor="#94a3b8"
            />

            <Text style={styles.label}>Payment Mode</Text>
            <View style={styles.modeRow}>
              {PAYMENT_MODES.map((m) => (
                <Pressable
                  key={m}
                  style={[styles.modeBtn, payMode === m && styles.modeBtnActive]}
                  onPress={() => setPayMode(m)}
                >
                  <Text style={[styles.modeTxt, payMode === m && styles.modeTxtActive]}>
                    {m.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Reference No. (optional)</Text>
            <TextInput
              style={styles.input}
              value={payRef}
              onChangeText={setPayRef}
              placeholder="UTR / Cheque no."
              placeholderTextColor="#94a3b8"
            />

            <View style={styles.modalBtns}>
              <Pressable style={styles.cancelModalBtn} onPress={() => setPaying(null)}>
                <Text style={styles.cancelModalTxt}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmBtn, saving && styles.btnDisabled]}
                disabled={saving}
                onPress={submitPay}
              >
                <Text style={styles.confirmBtnTxt}>{saving ? "Saving…" : "Save Payment"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Invoice Details Modal */}
      <Modal transparent visible={!!viewingDue} animationType="slide" onRequestClose={() => setViewingDue(null)}>
        <SafeAreaView style={styles.detailsModalSafe}>
          <View style={styles.detailsModalHeader}>
            <Text style={styles.detailsModalTitle}>Invoice Details</Text>
            <Pressable onPress={() => setViewingDue(null)}>
              <Text style={styles.detailsModalClose}>✕ Close</Text>
            </Pressable>
          </View>
          {viewingDue && (
            <ScrollView contentContainerStyle={styles.detailsModalBody} showsVerticalScrollIndicator={true}>
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Invoice Information</Text>
                <Text style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Invoice:</Text> {viewingDue.invoice_number}
                </Text>
                <Text style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Customer:</Text> {viewingDue.customer_name || "Walk-in"}
                </Text>
                {viewingDue.mobile && (
                  <Text style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Mobile:</Text> {viewingDue.mobile}
                  </Text>
                )}
                {viewingDue.created_time && (
                  <Text style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Date:</Text>{" "}
                    {String(viewingDue.created_time).split("T")[0]}
                  </Text>
                )}
                <Text style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Payment Mode:</Text>{" "}
                  {String(viewingDue.payment_mode || "N/A").toUpperCase()}
                </Text>
              </View>

              {viewingDue.items && viewingDue.items.length > 0 && (
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Items ({viewingDue.items.length})</Text>
                  {viewingDue.items.map((item, idx) => (
                    <View key={idx} style={styles.itemCard}>
                      <View style={styles.itemHeader}>
                        <Text style={styles.itemName}>{item.item_name}</Text>
                        <Text style={styles.itemAmount}>{fmt(item.amount)}</Text>
                      </View>
                      <View style={styles.itemDetails}>
                        <Text style={styles.itemQty}>Qty: {item.quantity}</Text>
                        <Text style={styles.itemPrice}>₹{Number(item.price).toFixed(2)} each</Text>
                        {item.tax_amount && (
                          <Text style={styles.itemTax}>Tax: {fmt(item.tax_amount)}</Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              )}

              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Amounts</Text>
                <View style={styles.amountRow}>
                  <Text style={styles.amountLabel}>Original Amount:</Text>
                  <Text style={styles.amountValue}>{fmt(viewingDue.original_amount)}</Text>
                </View>
                {Number(viewingDue.tax_amt) > 0 && (
                  <View style={styles.amountRow}>
                    <Text style={styles.amountLabel}>Tax:</Text>
                    <Text style={styles.amountValue}>{fmt(viewingDue.tax_amt)}</Text>
                  </View>
                )}
                {Number(viewingDue.discounted_amt) > 0 && (
                  <View style={styles.amountRow}>
                    <Text style={styles.amountLabel}>Discount:</Text>
                    <Text style={styles.amountValue}>-{fmt(viewingDue.discounted_amt)}</Text>
                  </View>
                )}
                <View style={styles.amountRow}>
                  <Text style={styles.amountLabel}>Paid Amount:</Text>
                  <Text style={styles.amountValue}>{fmt(viewingDue.paid_amount)}</Text>
                </View>
                {Number(viewingDue.returns_amount) > 0 && (
                  <View style={styles.amountRow}>
                    <Text style={styles.amountLabel}>Returns:</Text>
                    <Text style={styles.amountValue}>-{fmt(viewingDue.returns_amount)}</Text>
                  </View>
                )}
                <View style={[styles.amountRow, styles.outstandingRow]}>
                  <Text style={styles.outstandingLabel}>Outstanding Amount:</Text>
                  <Text style={styles.outstandingValue}>{fmt(viewingDue.outstanding_amount)}</Text>
                </View>
              </View>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f3f6ff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  summaryBanner: { backgroundColor: "#dc2626", padding: 10, alignItems: "center" },
  summaryText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  searchBar: { padding: 12 },
  searchInput: {
    borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10,
    backgroundColor: "#fff", paddingHorizontal: 12, paddingVertical: 10, color: "#0b1220",
  },
  list: { padding: 12, gap: 8, paddingTop: 0, paddingBottom: 24 },
  card: {
    backgroundColor: "#fff", borderRadius: 12, borderWidth: 1,
    borderColor: "#d9e3ff", padding: 12, gap: 8,
  },
  cardTop: { flexDirection: "row", alignItems: "flex-start" },
  invNo: { fontWeight: "800", color: "#1e293b", fontSize: 14 },
  customer: { color: "#334155", fontWeight: "600", marginTop: 2 },
  meta: { color: "#94a3b8", fontSize: 12, marginTop: 2 },
  amtWrap: { alignItems: "flex-end" },
  dueAmt: { fontSize: 18, fontWeight: "800", color: "#dc2626" },
  dueLabel: { fontSize: 11, color: "#64748b" },
  payBtn: {
    backgroundColor: "#059669", borderRadius: 8, paddingVertical: 9, alignItems: "center",
  },
  payBtnText: { color: "#fff", fontWeight: "700" },
  emptyWrap: { alignItems: "center", paddingTop: 60, gap: 8 },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontSize: 17, fontWeight: "800", color: "#0b1220" },
  emptyMsg: { color: "#64748b", fontSize: 14 },
  modalBackdrop: {
    flex: 1, backgroundColor: "rgba(2,6,23,0.5)", justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, gap: 10,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: "#0b1220" },
  modalSub: { color: "#64748b", fontSize: 13 },
  label: { fontSize: 12, fontWeight: "700", color: "#334155" },
  input: {
    borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10, backgroundColor: "#ffffff",
    paddingHorizontal: 12, paddingVertical: 10, color: "#0b1220",
  },
  modeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  modeBtn: {
    borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 7, backgroundColor: "#fff",
  },
  modeBtnActive: { backgroundColor: "#0b57d0", borderColor: "#0b57d0" },
  modeTxt: { fontSize: 12, fontWeight: "700", color: "#334155" },
  modeTxtActive: { color: "#fff" },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 4 },
  cancelModalBtn: {
    flex: 1, backgroundColor: "#d9e3ff", borderRadius: 10, paddingVertical: 12, alignItems: "center",
  },
  cancelModalTxt: { color: "#334155", fontWeight: "700" },
  confirmBtn: {
    flex: 2, backgroundColor: "#059669", borderRadius: 10, paddingVertical: 12, alignItems: "center",
  },
  confirmBtnTxt: { color: "#fff", fontWeight: "800" },
  btnDisabled: { opacity: 0.5 },
  detailsModalSafe: { flex: 1, backgroundColor: "#f3f6ff" },
  detailsModalHeader: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  detailsModalTitle: { fontSize: 16, fontWeight: "800", color: "#0b1220" },
  detailsModalClose: { fontSize: 14, fontWeight: "700", color: "#0b57d0" },
  detailsModalBody: { padding: 16, gap: 12, paddingBottom: 24 },
  detailSection: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d9e3ff",
    padding: 12,
    gap: 8,
  },
  detailSectionTitle: { fontSize: 13, fontWeight: "800", color: "#0b1220" },
  detailRow: { fontSize: 12, color: "#334155", marginVertical: 2 },
  detailLabel: { fontWeight: "700", color: "#1e293b" },
  itemCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 10,
    marginVertical: 4,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  itemName: { fontSize: 12, fontWeight: "700", color: "#1e293b", flex: 1 },
  itemAmount: { fontSize: 12, fontWeight: "700", color: "#0b57d0" },
  itemDetails: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  itemQty: { fontSize: 11, color: "#64748b" },
  itemPrice: { fontSize: 11, color: "#64748b" },
  itemTax: { fontSize: 11, color: "#64748b" },
  amountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
  },
  amountLabel: { fontSize: 12, color: "#334155", fontWeight: "600" },
  amountValue: { fontSize: 12, color: "#1e293b", fontWeight: "700" },
  outstandingRow: {
    borderBottomWidth: 0,
    backgroundColor: "#fef3c7",
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 6,
    marginTop: 4,
  },
  outstandingLabel: { fontSize: 13, fontWeight: "800", color: "#857e00" },
  outstandingValue: { fontSize: 13, fontWeight: "800", color: "#92400e" },
});
