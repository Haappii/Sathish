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
import { useTheme } from "../context/ThemeContext";

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

const denomKey = (v) => {
  const r = roundDenom(v);
  if (r == null) return "";
  return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/\.?0+$/, "");
};

const buildDenomCounts = (denominations) =>
  Object.fromEntries(normalizeDenominations(denominations).map((v) => [denomKey(v), ""]));

const calcDenomTotal = (denominations, counts) =>
  normalizeDenominations(denominations).reduce((total, v) => {
    const count = Number(counts?.[denomKey(v)] || 0);
    return total + v * (Number.isFinite(count) ? count : 0);
  }, 0);

export default function CashDrawerScreen() {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const [shift, setShift] = useState(null);
  const [movements, setMovements] = useState([]);
  const [summary, setSummary] = useState(null);
  const [denominations, setDenominations] = useState(DEFAULT_DENOMINATIONS);

  // modal: null | "open" | "topup" | "withdrawal" | "close"
  const [modal, setModal] = useState(null);

  const [openingCash, setOpeningCash] = useState("");
  const [movAmount, setMovAmount] = useState("");
  const [movReason, setMovReason] = useState("");
  const [denomCounts, setDenomCounts] = useState({});
  const [closingNotes, setClosingNotes] = useState("");

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [shiftRes, shopRes] = await Promise.all([
        api.get("/cash-drawer/current"),
        api.get("/shop/details").catch(() => ({ data: {} })),
      ]);
      const data = shiftRes.data || {};
      setShift(data.shift || null);
      setMovements(data.movements || []);
      setSummary(data.summary || null);
      setDenominations(normalizeDenominations(shopRes.data?.cash_denominations));
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load cash drawer");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openModalFor = (type) => {
    setMovAmount("");
    setMovReason("");
    setOpeningCash("");
    if (type === "close") {
      setDenomCounts(buildDenomCounts(denominations));
      setClosingNotes("");
    }
    setModal(type);
  };
  const closeModal = () => setModal(null);

  const handleOpenShift = async () => {
    const amt = parseFloat(openingCash);
    if (isNaN(amt) || amt < 0) return Alert.alert("Validation", "Enter a valid opening cash amount (0 or more)");
    setActionLoading(true);
    try {
      await api.post("/cash-drawer/open", { opening_cash: amt });
      closeModal();
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to open shift");
    } finally {
      setActionLoading(false);
    }
  };

  const handleMovement = async (movType) => {
    const amt = parseFloat(movAmount);
    if (isNaN(amt) || amt <= 0) return Alert.alert("Validation", "Enter a valid amount greater than 0");
    setActionLoading(true);
    try {
      await api.post("/cash-drawer/movement", {
        movement_type: movType,
        amount: amt,
        reason: movReason.trim() || null,
      });
      closeModal();
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to record movement");
    } finally {
      setActionLoading(false);
    }
  };

  const denomTotal = calcDenomTotal(denominations, denomCounts);
  const expectedCash = Number(summary?.expected_cash || 0);
  const closingDiff = denomTotal - expectedCash;
  const denoms = normalizeDenominations(denominations);
  const hasCounts = denoms.some((d) => Number(denomCounts[denomKey(d)] || 0) > 0);

  const handleCloseShift = () => {
    if (!hasCounts) return Alert.alert("Validation", "Enter at least one denomination count before closing");
    Alert.alert("Confirm", "Are you sure you want to close the cash drawer?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Close Shift",
        style: "destructive",
        onPress: async () => {
          setActionLoading(true);
          try {
            const counts = {};
            denoms.forEach((d) => {
              const key = denomKey(d);
              const val = Number(denomCounts[key] || 0);
              if (val > 0) counts[key] = val;
            });
            await api.post("/cash-drawer/close", {
              denomination_counts: counts,
              closing_notes: closingNotes.trim() || null,
            });
            closeModal();
            load();
          } catch (err) {
            Alert.alert("Error", err?.response?.data?.detail || "Failed to close shift");
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  };

  const setCount = (key, val) => {
    const n = parseInt(val, 10);
    setDenomCounts((prev) => ({ ...prev, [key]: isNaN(n) || n < 0 ? "" : String(n) }));
  };

  const isOpen = shift?.status === "OPEN";

  return (
    <SafeAreaView style={styles.safe}>
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 14, gap: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        >
          {!isOpen ? (
            <View style={styles.noShiftCard}>
              <Text style={styles.noShiftIcon}>🔓</Text>
              <Text style={styles.noShiftTitle}>No open shift</Text>
              <Text style={styles.noShiftSub}>Open a shift to start recording cash transactions</Text>
              <Pressable style={[styles.btn, { backgroundColor: "#16a34a", marginTop: 6 }]} onPress={() => openModalFor("open")}>
                <Text style={styles.btnText}>Open Shift</Text>
              </Pressable>
              {shift?.closed_at && (
                <Text style={styles.lastClosed}>Last shift closed: {fmtTime(shift.closed_at)}</Text>
              )}
            </View>
          ) : (
            <>
              {/* Shift Info Card */}
              <View style={styles.statusCard}>
                <View style={styles.statusRow}>
                  <View>
                    <Text style={styles.statusLabel}>Current Shift</Text>
                    <Text style={styles.statusTime}>Opened: {fmtTime(shift.opened_at)}</Text>
                  </View>
                  <Pressable style={[styles.smallBtn, { backgroundColor: theme.danger }]} onPress={() => openModalFor("close")}>
                    <Text style={styles.smallBtnText}>Close Shift</Text>
                  </Pressable>
                </View>

                {summary && (
                  <View style={styles.amountGrid}>
                    <AmountBox label="Opening Cash" value={summary.opening_cash} />
                    <AmountBox label="Cash Sales" value={summary.cash_sales} color="#059669" />
                    <AmountBox label="Collections" value={summary.cash_collections} color="#059669" />
                    <AmountBox label="Cash Top-Up" value={summary.cash_top_up} color="#0B3C8C" />
                    <AmountBox label="Withdrawal" value={summary.cash_withdrawal} color="#b45309" />
                    <AmountBox label="Cash Refunds" value={summary.cash_refunds} color="#b45309" />
                  </View>
                )}

                <View style={styles.expectedBox}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.expectedLabel}>Expected Cash in Drawer</Text>
                    <Text style={styles.expectedSub}>Opening + Sales + Top-Up + Collections − Refunds − Withdrawal</Text>
                  </View>
                  <Text style={styles.expectedValue}>₹{fmt(summary?.expected_cash)}</Text>
                </View>

                <View style={styles.actionRow}>
                  <Pressable style={[styles.actionBtn, { backgroundColor: "#16a34a" }]} onPress={() => openModalFor("topup")}>
                    <Text style={styles.btnText}>+ Cash Top-Up</Text>
                  </Pressable>
                  <Pressable style={[styles.actionBtn, { backgroundColor: "#b45309" }]} onPress={() => openModalFor("withdrawal")}>
                    <Text style={styles.btnText}>− Cash Withdrawal</Text>
                  </Pressable>
                </View>
              </View>

              {/* Movement History */}
              {movements.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Movement History ({movements.length})</Text>
                  {movements.map((m) => (
                    <View key={m.movement_id} style={styles.txnRow}>
                      <View>
                        <Text style={styles.txnDesc}>{m.movement_type === "IN" ? "Top-Up" : "Withdrawal"}</Text>
                        {m.reason ? <Text style={styles.txnTime}>{m.reason}</Text> : null}
                        <Text style={styles.txnTime}>{fmtTime(m.created_at)}</Text>
                      </View>
                      <Text style={[styles.txnAmount, { color: m.movement_type === "IN" ? "#15803d" : "#b45309" }]}>
                        {m.movement_type === "IN" ? "+" : "−"}₹{fmt(m.amount)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* Open Shift Modal */}
      <Modal visible={modal === "open"} animationType="slide" transparent onRequestClose={closeModal}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.overlay}>
          <Pressable style={styles.overlayBg} onPress={closeModal} />
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Open Cash Shift</Text>
            <Text style={styles.modalHint}>Enter the opening cash amount already in the drawer.</Text>
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
              <Pressable style={[styles.modalBtn, { backgroundColor: theme.background, flex: 1 }]} onPress={closeModal}>
                <Text style={[styles.btnText, { color: theme.textSub }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, { backgroundColor: "#16a34a", flex: 1 }]} onPress={handleOpenShift} disabled={actionLoading}>
                <Text style={styles.btnText}>{actionLoading ? "Opening…" : "Open Shift"}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Top-Up / Withdrawal Modal */}
      <Modal visible={modal === "topup" || modal === "withdrawal"} animationType="slide" transparent onRequestClose={closeModal}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.overlay}>
          <Pressable style={styles.overlayBg} onPress={closeModal} />
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{modal === "topup" ? "Cash Top-Up" : "Cash Withdrawal"}</Text>
            <Text style={styles.modalHint}>
              {modal === "topup"
                ? "Record cash added into the drawer (e.g. petty cash replenishment)."
                : "Record cash removed from the drawer (e.g. deposited to bank, given to manager)."}
            </Text>
            <Text style={styles.fieldLabel}>{modal === "topup" ? "Top-Up Amount (₹)" : "Withdrawal Amount (₹)"}</Text>
            <TextInput
              style={styles.input}
              value={movAmount}
              onChangeText={setMovAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#94a3b8"
              autoFocus
            />
            <Text style={styles.fieldLabel}>Reason (optional)</Text>
            <TextInput
              style={[styles.input, { fontSize: 14, fontWeight: "500", paddingVertical: 12 }]}
              value={movReason}
              onChangeText={setMovReason}
              placeholder={modal === "topup" ? "e.g. Petty cash refill" : "e.g. Bank deposit, Manager collection"}
              placeholderTextColor="#94a3b8"
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable style={[styles.modalBtn, { backgroundColor: theme.background, flex: 1 }]} onPress={closeModal}>
                <Text style={[styles.btnText, { color: theme.textSub }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: modal === "topup" ? "#16a34a" : "#b45309", flex: 1 }]}
                onPress={() => handleMovement(modal === "topup" ? "IN" : "OUT")}
                disabled={actionLoading}
              >
                <Text style={styles.btnText}>{actionLoading ? "Saving…" : modal === "topup" ? "Add Top-Up" : "Record Withdrawal"}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Close Shift Modal */}
      <Modal visible={modal === "close"} animationType="slide" transparent onRequestClose={closeModal}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.overlay}>
          <Pressable style={styles.overlayBg} onPress={closeModal} />
          <View style={[styles.modal, { maxHeight: "88%" }]}>
            <Text style={styles.modalTitle}>Close Shift — Cash Count</Text>
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 12 }}>
              <View style={styles.miniSummaryRow}>
                <View style={[styles.miniSummaryBox, { backgroundColor: "#ecfdf5", borderColor: "#a7f3d0" }]}>
                  <Text style={[styles.miniSummaryLabel, { color: "#059669" }]}>Top-Ups</Text>
                  <Text style={[styles.miniSummaryValue, { color: "#047857" }]}>+₹{fmt(summary?.cash_top_up)}</Text>
                </View>
                <View style={[styles.miniSummaryBox, { backgroundColor: "#fffbeb", borderColor: "#fde68a" }]}>
                  <Text style={[styles.miniSummaryLabel, { color: "#b45309" }]}>Withdrawals</Text>
                  <Text style={[styles.miniSummaryValue, { color: "#92400e" }]}>−₹{fmt(summary?.cash_withdrawal)}</Text>
                </View>
              </View>

              <View style={styles.expectedBoxSmall}>
                <Text style={styles.expectedLabelSmall}>Expected Cash</Text>
                <Text style={styles.expectedValueSmall}>₹{fmt(expectedCash)}</Text>
              </View>

              <View>
                <Text style={styles.denomTitle}>Enter Denomination Counts</Text>
                <View style={styles.denomGrid}>
                  <View style={styles.denomHeaderRow}>
                    <Text style={styles.denomHeaderText}>Denom</Text>
                    <Text style={[styles.denomHeaderText, { textAlign: "center" }]}>Count</Text>
                    <Text style={[styles.denomHeaderText, { textAlign: "right" }]}>Amount</Text>
                  </View>
                  {denoms.map((d) => {
                    const key = denomKey(d);
                    const cnt = Number(denomCounts[key] || 0);
                    const subtotal = d * cnt;
                    return (
                      <View key={key} style={styles.denomRow}>
                        <Text style={styles.denomLabel}>₹{key}</Text>
                        <TextInput
                          style={styles.denomInput}
                          value={denomCounts[key] ?? ""}
                          onChangeText={(v) => setCount(key, v)}
                          keyboardType="number-pad"
                          placeholder="0"
                          placeholderTextColor="#94a3b8"
                        />
                        <Text style={styles.denomAmount}>{subtotal > 0 ? `₹${fmt(subtotal)}` : "—"}</Text>
                      </View>
                    );
                  })}
                  <View style={styles.denomTotalRow}>
                    <Text style={styles.denomTotalLabel}>Physical Total</Text>
                    <Text style={styles.denomTotalValue}>{hasCounts ? `₹${fmt(denomTotal)}` : "—"}</Text>
                  </View>
                </View>
              </View>

              {hasCounts && (
                <View
                  style={[
                    styles.diffBox,
                    Math.abs(closingDiff) < 0.01
                      ? { backgroundColor: "#ecfdf5", borderColor: "#a7f3d0" }
                      : closingDiff > 0
                      ? { backgroundColor: "#eff6ff", borderColor: "#bfdbfe" }
                      : { backgroundColor: "#fef2f2", borderColor: "#fecaca" },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.diffTitle,
                        { color: Math.abs(closingDiff) < 0.01 ? "#047857" : closingDiff > 0 ? "#1d4ed8" : "#b91c1c" },
                      ]}
                    >
                      {Math.abs(closingDiff) < 0.01 ? "✓ Cash tallied perfectly" : closingDiff > 0 ? "Cash Over" : "Cash Short"}
                    </Text>
                    <Text style={styles.diffSub}>Expected ₹{fmt(expectedCash)} · Physical ₹{fmt(denomTotal)}</Text>
                  </View>
                  {Math.abs(closingDiff) >= 0.01 && (
                    <Text style={[styles.diffValue, { color: closingDiff > 0 ? "#1d4ed8" : "#b91c1c" }]}>
                      {closingDiff > 0 ? "+" : ""}₹{fmt(closingDiff)}
                    </Text>
                  )}
                </View>
              )}

              <View>
                <Text style={styles.fieldLabel}>Closing Notes (optional)</Text>
                <TextInput
                  style={[styles.input, { fontSize: 13, fontWeight: "500", minHeight: 60, textAlignVertical: "top" }]}
                  value={closingNotes}
                  onChangeText={setClosingNotes}
                  placeholder="Any remarks for end-of-shift…"
                  placeholderTextColor="#94a3b8"
                  multiline
                />
              </View>
            </ScrollView>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <Pressable style={[styles.modalBtn, { backgroundColor: theme.background, flex: 1 }]} onPress={closeModal}>
                <Text style={[styles.btnText, { color: theme.textSub }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: theme.danger, flex: 1, opacity: !hasCounts ? 0.5 : 1 }]}
                onPress={handleCloseShift}
                disabled={actionLoading || !hasCounts}
              >
                <Text style={styles.btnText}>{actionLoading ? "Closing…" : "Close Shift"}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function AmountBox({ label, value, color }) {
  return (
    <View style={styles.amountBox}>
      <Text style={styles.amountLabel}>{label}</Text>
      <Text style={[styles.amountValue, color && { color }]}>₹{fmt(value)}</Text>
    </View>
  );
}

function fmt(n) {
  return Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function fmtTime(dt) {
  if (!dt) return "";
  return new Date(dt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: "#f4f6fb" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  noShiftCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 26,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#e4e9f2",
    gap: 6,
    shadowColor: "#0a0f1e", shadowOpacity: 0.08, shadowRadius: 14,
    shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
  noShiftIcon: { fontSize: 34, marginBottom: 4 },
  noShiftTitle: { fontWeight: "800", fontSize: 16, color: "#0a0f1e" },
  noShiftSub: { color: "#9ca3af", fontSize: 12, textAlign: "center", fontWeight: "600" },
  lastClosed: { color: "#9ca3af", fontSize: 11, marginTop: 8 },
  statusCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    borderColor: "#e4e9f2",
    gap: 12,
    shadowColor: "#0a0f1e", shadowOpacity: 0.08, shadowRadius: 14,
    shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
  statusRow:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statusLabel: { fontWeight: "800", fontSize: 15, color: "#0a0f1e" },
  statusTime:  { color: "#9ca3af", fontSize: 12, fontWeight: "600", marginTop: 2 },
  smallBtn: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9 },
  smallBtnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  amountGrid:  { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  amountBox: {
    width: "31%",
    backgroundColor: "#f8f9fd",
    borderRadius: 14,
    padding: 10,
    borderWidth: 1.5,
    borderColor: "#e4e9f2",
  },
  amountLabel: { color: "#9ca3af", fontSize: 9, marginBottom: 3, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3 },
  amountValue: { fontWeight: "800", color: "#0a0f1e", fontSize: 14 },
  expectedBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#eff6ff",
    borderWidth: 1.5,
    borderColor: "#bfdbfe",
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  expectedLabel: { fontSize: 11, fontWeight: "800", color: "#374151", textTransform: "uppercase", letterSpacing: 0.4 },
  expectedSub: { fontSize: 10, color: "#9ca3af", marginTop: 2 },
  expectedValue: { fontWeight: "900", fontSize: 18, color: "#0B3C8C" },
  actionRow:   { flexDirection: "row", gap: 10 },
  actionBtn:   { flex: 1, borderRadius: 14, paddingVertical: 13, alignItems: "center", shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  btn:         { borderRadius: 14, paddingVertical: 14, alignItems: "center", paddingHorizontal: 24, shadowOpacity: 0.3, shadowRadius: 10, elevation: 5 },
  btnText:     { color: "#fff", fontWeight: "800", fontSize: 14 },
  section: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.5,
    borderColor: "#e4e9f2",
    gap: 8,
    shadowColor: "#0a0f1e", shadowOpacity: 0.07, shadowRadius: 12, elevation: 4,
  },
  sectionTitle: { fontWeight: "800", fontSize: 14, color: "#0a0f1e" },
  txnRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f4f6fb",
  },
  txnDesc:   { fontWeight: "700", color: "#0a0f1e", fontSize: 13 },
  txnTime:   { color: "#9ca3af", fontSize: 11, marginTop: 2 },
  txnAmount: { fontWeight: "800", fontSize: 15 },
  overlay:   { flex: 1, justifyContent: "flex-end" },
  overlayBg: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  modal: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 22,
    paddingBottom: 34,
    gap: 12,
    shadowColor: "#0a0f1e", shadowOpacity: 0.2, shadowRadius: 24, elevation: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: "900", color: "#0a0f1e", letterSpacing: -0.3 },
  modalHint: { fontSize: 12, color: "#9ca3af", fontWeight: "600", marginTop: -6 },
  fieldLabel: { color: "#4b5563", fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  input: {
    borderWidth: 1.5,
    borderColor: "#e4e9f2",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: "#f8f9fd",
    color: "#0a0f1e",
    fontSize: 20,
    fontWeight: "700",
  },
  modalBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center", shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  miniSummaryRow: { flexDirection: "row", gap: 10 },
  miniSummaryBox: { flex: 1, borderRadius: 12, borderWidth: 1.5, padding: 10, alignItems: "center" },
  miniSummaryLabel: { fontSize: 11, fontWeight: "700" },
  miniSummaryValue: { fontSize: 14, fontWeight: "800", marginTop: 2 },
  expectedBoxSmall: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: "#eff6ff", borderWidth: 1.5, borderColor: "#bfdbfe", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
  },
  expectedLabelSmall: { fontSize: 12, fontWeight: "700", color: "#1d4ed8" },
  expectedValueSmall: { fontSize: 15, fontWeight: "800", color: "#1e3a8a" },
  denomTitle: { fontSize: 12, fontWeight: "800", color: "#374151", marginBottom: 6 },
  denomGrid: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 14, overflow: "hidden" },
  denomHeaderRow: {
    flexDirection: "row", backgroundColor: "#f8f9fd", paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: "#e4e9f2",
  },
  denomHeaderText: { flex: 1, fontSize: 10, fontWeight: "800", color: "#9ca3af", textTransform: "uppercase" },
  denomRow: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: "#f4f6fb", gap: 8,
  },
  denomLabel: { flex: 1, fontSize: 13, fontWeight: "700", color: "#0a0f1e" },
  denomInput: {
    flex: 1, textAlign: "center", borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 10,
    paddingVertical: 6, fontSize: 13, fontWeight: "700", color: "#0a0f1e", backgroundColor: "#fff",
  },
  denomAmount: { flex: 1, textAlign: "right", fontSize: 13, fontWeight: "700", color: "#374151" },
  denomTotalRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: "#f8f9fd", paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 2, borderTopColor: "#e4e9f2",
  },
  denomTotalLabel: { fontSize: 12, fontWeight: "800", color: "#374151" },
  denomTotalValue: { fontSize: 14, fontWeight: "800", color: "#0a0f1e" },
  diffBox: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 14, padding: 12, gap: 8 },
  diffTitle: { fontSize: 12, fontWeight: "800" },
  diffSub: { fontSize: 10, color: "#9ca3af", marginTop: 2 },
  diffValue: { fontSize: 15, fontWeight: "800" },
});
