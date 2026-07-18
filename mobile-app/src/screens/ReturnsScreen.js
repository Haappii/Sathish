import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
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


const RETURN_TYPES = ["REFUND", "EXCHANGE"];
const REFUND_MODES = ["CASH", "CARD", "UPI", "STORE_CREDIT"];
const REASON_CODES = ["DAMAGED", "WRONG_ITEM", "EXPIRED", "CUSTOMER_CHANGED_MIND", "OTHER"];
const fmt = (n) => `₹${Number(n || 0).toFixed(2)}`;

export default function ReturnsScreen() {
  const { theme } = useTheme();
  const { session } = useAuth();
  const businessDate = session?.app_date || new Date().toISOString().split("T")[0];
  const [isHotel, setIsHotel] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoice, setInvoice] = useState(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [saving, setSaving] = useState(false);

  const [returnType, setReturnType] = useState("REFUND");
  const [refundMode, setRefundMode] = useState("CASH");
  const [reasonCode, setReasonCode] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [qty, setQty] = useState({});
  const [condition, setCondition] = useState({});
  const [recentReturns, setRecentReturns] = useState([]);

  useEffect(() => {
    api.get("/shop/details")
      .then((res) => {
        const t = String(res?.data?.billing_type || res?.data?.shop_type || "").toLowerCase();
        setIsHotel(t === "hotel");
      })
      .catch(() => setIsHotel(false));
  }, []);

  const loadRecentReturns = async () => {
    try {
      const to = new Date(businessDate);
      const from = new Date(businessDate);
      from.setDate(from.getDate() - 30);
      const res = await api.get("/returns/list", {
        params: {
          from_date: from.toISOString().split("T")[0],
          to_date: to.toISOString().split("T")[0],
        },
      });
      setRecentReturns(Array.isArray(res?.data) ? res.data.slice(0, 10) : []);
    } catch {
      setRecentReturns([]);
    }
  };

  useEffect(() => {
    loadRecentReturns();
  }, [businessDate]);

  const loadInvoice = async () => {
    if (!invoiceNumber.trim()) return Alert.alert("Validation", "Enter invoice number");
    setLoadingInvoice(true);
    setInvoice(null);
    setQty({});
    setCondition({});
    try {
      const res = await api.get(`/invoice/by-number/${invoiceNumber.trim()}`);
      setInvoice(res?.data || null);
    } catch (err) {
      Alert.alert("Not Found", err?.response?.data?.detail || "Invoice not found");
    } finally {
      setLoadingInvoice(false);
    }
  };

  const submit = async () => {
    if (!invoice?.invoice_number) return Alert.alert("Error", "Load an invoice first");
    const items = (invoice.items || [])
      .map((i) => {
        const cond = condition[i.item_id] || "GOOD";
        const restock = isHotel ? false : cond !== "DAMAGED";
        return {
          item_id: i.item_id,
          quantity: Number(qty[i.item_id] || 0),
          condition: isHotel ? (cond === "GOOD" ? "GOOD" : "DAMAGED") : cond,
          restock,
        };
      })
      .filter((i) => i.quantity > 0);

    if (!items.length) return Alert.alert("Validation", "Enter return quantity for at least one item");

    if (refundMode === "STORE_CREDIT" && /^9{9,}$/.test(String(invoice.mobile || ""))) {
      return Alert.alert("Validation", "Valid customer mobile required for store credit");
    }

    setSaving(true);
    try {
      const payload = {
        invoice_number: invoice.invoice_number,
        return_type: returnType,
        refund_mode: refundMode,
        reason_code: reasonCode || null,
        reason: reason || null,
        note: note || null,
        items,
      };
      await api.post("/returns/", payload);
      Alert.alert("Success", "Return processed successfully.");
      loadRecentReturns();
      setInvoice(null);
      setInvoiceNumber("");
      setQty({});
      setCondition({});
      setReasonCode("");
      setReason("");
      setNote("");
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Return failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>

        {/* Invoice Lookup */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Invoice Lookup</Text>
          <View style={styles.lookupRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Invoice number…"
              placeholderTextColor="#94a3b8"
              value={invoiceNumber}
              onChangeText={setInvoiceNumber}
              autoCapitalize="characters"
            />
            <Pressable
              style={[styles.lookupBtn, loadingInvoice && styles.btnDisabled]}
              disabled={loadingInvoice}
              onPress={loadInvoice}
            >
              {loadingInvoice
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.lookupBtnText}>Load</Text>}
            </Pressable>
          </View>
        </View>

        {/* Invoice Details */}
        {invoice && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Invoice: {invoice.invoice_number}</Text>
              <Text style={styles.meta}>{invoice.customer_name} · {invoice.mobile}</Text>
              <Text style={styles.meta}>Date: {String(invoice.invoice_date || "").split("T")[0]}</Text>
              <Text style={styles.total}>Total: {fmt(invoice.total_amount || 0)}</Text>

              <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Select Return Items</Text>
              {(invoice.items || []).map((item) => (
                <View key={String(item.item_id)} style={styles.itemRow}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={styles.itemName}>{item.item_name}</Text>
                      {item.already_returned ? (
                        <View style={styles.returnedPill}>
                          <Text style={styles.returnedPillText}>Returned</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.meta}>Sold: {item.quantity} · {fmt(item.amount)}</Text>
                    <Text style={styles.meta}>Available: {Number(item.returnable_qty ?? item.quantity ?? 0)}</Text>
                    <View style={[styles.chipRow, { marginTop: 6 }]}>
                      {(isHotel ? ["GOOD", "BAD"] : ["GOOD", "DAMAGED"]).map((c) => (
                        <Pressable
                          key={c}
                          style={[styles.condChip, (condition[item.item_id] || "GOOD") === c && styles.condChipActive]}
                          onPress={() => setCondition((p) => ({ ...p, [item.item_id]: c }))}
                        >
                          <Text style={[styles.condChipText, (condition[item.item_id] || "GOOD") === c && styles.condChipTextActive]}>
                            {c === "GOOD" ? "Good" : c === "BAD" ? "Bad" : "Damaged"}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                  <TextInput
                    style={styles.qtyInput}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor="#94a3b8"
                    editable={Number(item.returnable_qty ?? item.quantity ?? 0) > 0}
                    value={qty[item.item_id] || ""}
                    onChangeText={(v) => {
                      const maxQty = Number(item.returnable_qty ?? item.quantity ?? 0);
                      const n = Math.min(Number(v || 0), maxQty);
                      setQty((p) => ({ ...p, [item.item_id]: String(n) }));
                    }}
                  />
                </View>
              ))}
            </View>

            {/* Return Options */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Return Type</Text>
              <View style={styles.chipRow}>
                {RETURN_TYPES.map((t) => (
                  <Pressable
                    key={t}
                    style={[styles.chip, returnType === t && styles.chipActive]}
                    onPress={() => setReturnType(t)}
                  >
                    <Text style={[styles.chipText, returnType === t && styles.chipTextActive]}>
                      {t.replace("_", " ")}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.sectionTitle}>Refund Mode</Text>
              <View style={styles.chipRow}>
                {REFUND_MODES.map((m) => (
                  <Pressable
                    key={m}
                    style={[styles.chip, refundMode === m && styles.chipActive]}
                    onPress={() => setRefundMode(m)}
                  >
                    <Text style={[styles.chipText, refundMode === m && styles.chipTextActive]}>
                      {m === "STORE_CREDIT" ? "STORE CREDIT" : m}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.sectionTitle}>Reason Code</Text>
              <View style={styles.chipRow}>
                {REASON_CODES.map((r) => (
                  <Pressable
                    key={r}
                    style={[styles.chip, reasonCode === r && styles.chipActive]}
                    onPress={() => setReasonCode(r)}
                  >
                    <Text style={[styles.chipText, reasonCode === r && styles.chipTextActive]}>
                      {r.replace("_", " ")}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <TextInput
                style={styles.input}
                placeholder="Reason (optional)"
                placeholderTextColor="#94a3b8"
                value={reason}
                onChangeText={setReason}
              />
              <TextInput
                style={styles.input}
                placeholder="Internal note (optional)"
                placeholderTextColor="#94a3b8"
                value={note}
                onChangeText={setNote}
              />

              <Pressable
                style={[styles.submitBtn, saving && styles.btnDisabled]}
                disabled={saving}
                onPress={submit}
              >
                <Text style={styles.submitBtnText}>{saving ? "Processing…" : "Process Return"}</Text>
              </Pressable>
            </View>

            {/* Recent Returns */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recent Returns (30 days)</Text>
              {recentReturns.length === 0 ? (
                <Text style={styles.meta}>No returns found</Text>
              ) : (
                recentReturns.map((r) => (
                  <View key={String(r.return_id)} style={styles.recentRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.recentTitle}>{r.return_number}</Text>
                      <Text style={styles.meta}>{r.invoice_number} · {r.return_type || "REFUND"} · {r.refund_mode || "CASH"}</Text>
                    </View>
                    <Text style={styles.recentAmt}>{fmt(r.refund_amount)}</Text>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f6fb" },
  container: { padding: 14, gap: 12, paddingBottom: 36 },
  section: {
    backgroundColor: "#ffffff", borderRadius: 18, borderWidth: 1.5,
    borderColor: "#e4e9f2", padding: 14, gap: 10,
    shadowColor: "#0a0f1e", shadowOpacity: 0.07, shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  sectionTitle: { fontSize: 12, fontWeight: "800", color: "#4b5563", textTransform: "uppercase", letterSpacing: 0.5 },
  lookupRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  input: {
    borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12, backgroundColor: "#f8f9fd",
    paddingHorizontal: 13, paddingVertical: 12, color: "#0a0f1e", fontSize: 14,
  },
  lookupBtn: {
    backgroundColor: "#6366f1", borderRadius: 12, paddingHorizontal: 18,
    paddingVertical: 12, alignItems: "center", justifyContent: "center",
    shadowColor: "#6366f1", shadowOpacity: 0.35, shadowRadius: 10, elevation: 5,
  },
  lookupBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  meta: { color: "#9ca3af", fontSize: 12, fontWeight: "500" },
  total: { fontSize: 16, fontWeight: "900", color: "#10b981" },
  itemRow: {
    flexDirection: "row", alignItems: "center", borderWidth: 1.5,
    borderColor: "#e4e9f2", borderRadius: 14, padding: 12, gap: 10,
    backgroundColor: "#f8f9fd",
  },
  itemName: { fontWeight: "800", color: "#0a0f1e", fontSize: 13 },
  returnedPill: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999,
    backgroundColor: "#fee2e2", borderWidth: 1, borderColor: "#fecaca",
  },
  returnedPillText: { fontSize: 10, fontWeight: "700", color: "#ef4444" },
  qtyInput: {
    width: 62, borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 9, textAlign: "center", color: "#0a0f1e",
    backgroundColor: "#ffffff", fontSize: 14, fontWeight: "700",
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 999,
    paddingHorizontal: 13, paddingVertical: 7, backgroundColor: "#f8f9fd",
  },
  chipActive: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  chipText: { color: "#4b5563", fontSize: 12, fontWeight: "700" },
  chipTextActive: { color: "#fff" },
  condChip: {
    borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 4, backgroundColor: "#ffffff",
  },
  condChipActive: { backgroundColor: "#f59e0b", borderColor: "#f59e0b" },
  condChipText: { color: "#4b5563", fontSize: 11, fontWeight: "700" },
  condChipTextActive: { color: "#fff" },
  submitBtn: {
    backgroundColor: "#ef4444", borderRadius: 14, paddingVertical: 14, alignItems: "center",
    shadowColor: "#ef4444", shadowOpacity: 0.35, shadowRadius: 10, elevation: 5,
  },
  submitBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  recentRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 14, padding: 12,
    backgroundColor: "#f8f9fd",
  },
  recentTitle: { fontWeight: "800", color: "#0a0f1e", fontSize: 12 },
  recentAmt: { fontWeight: "800", color: "#10b981", fontSize: 13 },
  btnDisabled: { opacity: 0.5 },
});
