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
import { useTheme } from "../context/ThemeContext";


const PAYMENT_MODES = ["cash", "card", "upi", "bank"];
const fmt = (n) => `₹${Number(n || 0).toFixed(2)}`;
const getDueAmount = (row) => Number(row?.outstanding_amount ?? row?.pending_amount ?? row?.due_amount ?? 0);

export default function DuesScreen() {
  const { theme } = useTheme();
  const { session } = useAuth();
  const roleLower = String(session?.role_name || session?.role || "").toLowerCase();
  const isAdmin = roleLower === "admin";

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState("");
  const [branchPickerOpen, setBranchPickerOpen] = useState(false);
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
      if (isAdmin && branchId) params.branch_id = Number(branchId);
      const res = await api.get("/dues/open", { params });
      setRows(res?.data || []);
    } catch (err) {
      if (!silent) Alert.alert("Error", err?.response?.data?.detail || "Failed to load dues");
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, isAdmin, branchId]);

  useEffect(() => {
    if (!isAdmin) return;
    api.get("/branch/active").then((res) => setBranches(res?.data || [])).catch(() => {});
  }, [isAdmin]);

  useEffect(() => { load(); }, [branchId]);

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
        {isAdmin && (
          <Pressable style={styles.branchFilterBtn} onPress={() => setBranchPickerOpen(true)}>
            <Text style={styles.branchFilterTxt}>
              {branchId
                ? (branches.find((b) => String(b.branch_id) === String(branchId))?.branch_name || "Branch")
                : "All Branches"}
            </Text>
          </Pressable>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => String(r.invoice_number)}
          renderItem={renderRow}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={["#2563eb"]} />
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

      {/* Branch Picker Modal */}
      <Modal transparent visible={branchPickerOpen} animationType="fade" onRequestClose={() => setBranchPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setBranchPickerOpen(false)}>
          <View style={styles.branchModalCard}>
            <Text style={styles.modalTitle}>Filter by Branch</Text>
            <Pressable
              style={styles.branchOption}
              onPress={() => { setBranchId(""); setBranchPickerOpen(false); }}
            >
              <Text style={styles.branchOptionText}>All Branches</Text>
            </Pressable>
            {branches.map((b) => (
              <Pressable
                key={b.branch_id}
                style={styles.branchOption}
                onPress={() => { setBranchId(String(b.branch_id)); setBranchPickerOpen(false); }}
              >
                <Text style={styles.branchOptionText}>{b.branch_name}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

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
  safe: { flex: 1, backgroundColor: "#f4f6fb" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  summaryBanner: {
    backgroundColor: "#ef4444", padding: 12, alignItems: "center",
    shadowColor: "#ef4444", shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  summaryText: { color: "#fff", fontWeight: "800", fontSize: 13, letterSpacing: 0.2 },
  searchBar: { padding: 14, paddingBottom: 8, gap: 8 },
  searchInput: {
    borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 14,
    backgroundColor: "#ffffff", paddingHorizontal: 14, paddingVertical: 12, color: "#0a0f1e",
    fontSize: 14, shadowColor: "#0a0f1e", shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  branchFilterBtn: {
    alignSelf: "flex-start", borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12,
    backgroundColor: "#ffffff", paddingHorizontal: 14, paddingVertical: 9,
  },
  branchFilterTxt: { color: "#6366f1", fontWeight: "700", fontSize: 12 },
  branchModalCard: {
    backgroundColor: "#ffffff", borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 18, gap: 4, width: "100%",
  },
  branchOption: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f4f6fb" },
  branchOptionText: { fontSize: 14, fontWeight: "600", color: "#0a0f1e" },
  list: { padding: 14, gap: 10, paddingTop: 0, paddingBottom: 28 },
  card: {
    backgroundColor: "#ffffff", borderRadius: 18, borderWidth: 1.5,
    borderColor: "#e4e9f2", padding: 14, gap: 10,
    shadowColor: "#0a0f1e", shadowOpacity: 0.07, shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  cardTop: { flexDirection: "row", alignItems: "flex-start" },
  invNo: { fontWeight: "800", color: "#0a0f1e", fontSize: 14 },
  customer: { color: "#4b5563", fontWeight: "600", marginTop: 2 },
  meta: { color: "#9ca3af", fontSize: 12, marginTop: 2 },
  amtWrap: { alignItems: "flex-end" },
  dueAmt: { fontSize: 20, fontWeight: "900", color: "#ef4444" },
  dueLabel: { fontSize: 11, color: "#9ca3af", fontWeight: "700", textTransform: "uppercase" },
  payBtn: {
    backgroundColor: "#10b981", borderRadius: 13, paddingVertical: 11, alignItems: "center",
    shadowColor: "#10b981", shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  payBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  emptyWrap: { alignItems: "center", paddingTop: 64, gap: 10 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { fontSize: 17, fontWeight: "800", color: "#0a0f1e" },
  emptyMsg: { color: "#9ca3af", fontSize: 14 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(2,6,23,0.55)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: "#ffffff", borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 22, paddingBottom: 44, gap: 12,
    shadowColor: "#0a0f1e", shadowOpacity: 0.2, shadowRadius: 24, elevation: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: "900", color: "#0a0f1e", letterSpacing: -0.3 },
  modalSub: { color: "#9ca3af", fontSize: 13, fontWeight: "600" },
  label: { fontSize: 11, fontWeight: "700", color: "#4b5563", textTransform: "uppercase", letterSpacing: 0.5 },
  input: {
    borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12, backgroundColor: "#f8f9fd",
    paddingHorizontal: 13, paddingVertical: 12, color: "#0a0f1e", fontSize: 14,
  },
  modeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  modeBtn: {
    borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8, backgroundColor: "#f8f9fd",
  },
  modeBtnActive: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  modeTxt: { fontSize: 12, fontWeight: "700", color: "#4b5563" },
  modeTxtActive: { color: "#fff" },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 4 },
  cancelModalBtn: {
    flex: 1, backgroundColor: "#f4f6fb", borderRadius: 14, paddingVertical: 13,
    alignItems: "center", borderWidth: 1.5, borderColor: "#e4e9f2",
  },
  cancelModalTxt: { color: "#4b5563", fontWeight: "700" },
  confirmBtn: {
    flex: 2, backgroundColor: "#10b981", borderRadius: 14, paddingVertical: 13, alignItems: "center",
    shadowColor: "#10b981", shadowOpacity: 0.35, shadowRadius: 10, elevation: 5,
  },
  confirmBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
  detailsModalSafe: { flex: 1, backgroundColor: "#f4f6fb" },
  detailsModalHeader: {
    backgroundColor: "#0a0f1e",
    paddingHorizontal: 16, paddingVertical: 14,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  detailsModalTitle: { fontSize: 16, fontWeight: "800", color: "#fff" },
  detailsModalClose: { fontSize: 14, fontWeight: "700", color: "#93c5fd" },
  detailsModalBody: { padding: 16, gap: 12, paddingBottom: 28 },
  detailSection: {
    backgroundColor: "#ffffff", borderRadius: 18, borderWidth: 1.5,
    borderColor: "#e4e9f2", padding: 14, gap: 8,
    shadowColor: "#0a0f1e", shadowOpacity: 0.06, shadowRadius: 10, elevation: 3,
  },
  detailSectionTitle: { fontSize: 13, fontWeight: "800", color: "#0a0f1e", textTransform: "uppercase", letterSpacing: 0.3 },
  detailRow: { fontSize: 13, color: "#4b5563", marginVertical: 2 },
  detailLabel: { fontWeight: "700", color: "#0a0f1e" },
  itemCard: {
    backgroundColor: "#f8f9fd", borderRadius: 12, borderWidth: 1.5,
    borderColor: "#e4e9f2", padding: 10, marginVertical: 4,
  },
  itemHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  itemName: { fontSize: 12, fontWeight: "700", color: "#0a0f1e", flex: 1 },
  itemAmount: { fontSize: 12, fontWeight: "800", color: "#6366f1" },
  itemDetails: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  itemQty: { fontSize: 11, color: "#9ca3af" },
  itemPrice: { fontSize: 11, color: "#9ca3af" },
  itemTax: { fontSize: 11, color: "#9ca3af" },
  amountRow: {
    flexDirection: "row", justifyContent: "space-between",
    paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: "#f4f6fb",
  },
  amountLabel: { fontSize: 12, color: "#4b5563", fontWeight: "600" },
  amountValue: { fontSize: 12, color: "#0a0f1e", fontWeight: "700" },
  outstandingRow: {
    borderBottomWidth: 0, backgroundColor: "#fffbeb",
    paddingHorizontal: 10, paddingVertical: 10, borderRadius: 10, marginTop: 4,
  },
  outstandingLabel: { fontSize: 13, fontWeight: "800", color: "#d97706" },
  outstandingValue: { fontSize: 13, fontWeight: "800", color: "#92400e" },
});
