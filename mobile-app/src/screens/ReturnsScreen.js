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

const RETURN_TYPES = ["REFUND", "EXCHANGE", "STORE_CREDIT"];
const REFUND_MODES = ["CASH", "UPI", "CARD", "BANK"];
const REASON_CODES = ["DAMAGED", "WRONG_ITEM", "QUALITY", "CUSTOMER_CHANGE", "OTHER"];
const fmt = (n) => `₹${Number(n || 0).toFixed(2)}`;

export default function ReturnsScreen() {
  const { session } = useAuth();
  const businessDate = session?.app_date || new Date().toISOString().split("T")[0];
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoice, setInvoice] = useState(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [saving, setSaving] = useState(false);

  const [returnType, setReturnType] = useState("REFUND");
  const [refundMode, setRefundMode] = useState("CASH");
  const [reasonCode, setReasonCode] = useState("OTHER");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [qty, setQty] = useState({});
  const [recentReturns, setRecentReturns] = useState([]);

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
      .map((i) => ({
        item_id: i.item_id,
        quantity: Number(qty[i.item_id] || 0),
        condition: "GOOD",
        restock: Number(qty[i.item_id] || 0) > 0,
      }))
      .filter((i) => i.quantity > 0);

    if (!items.length) return Alert.alert("Validation", "Enter return quantity for at least one item");

    setSaving(true);
    try {
      const isStoreCredit = returnType === "STORE_CREDIT";
      const payload = {
        invoice_number: invoice.invoice_number,
        return_type: isStoreCredit ? "REFUND" : returnType,
        refund_mode: returnType === "REFUND" ? refundMode : (isStoreCredit ? "STORE_CREDIT" : null),
        reason_code: reasonCode,
        reason,
        note,
        items,
      };
      await api.post("/returns/", payload);
      Alert.alert("Success", "Return processed successfully.");
      loadRecentReturns();
      setInvoice(null);
      setInvoiceNumber("");
      setQty({});
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

              {returnType === "REFUND" && (
                <>
                  <Text style={styles.sectionTitle}>Refund Mode</Text>
                  <View style={styles.chipRow}>
                    {REFUND_MODES.map((m) => (
                      <Pressable
                        key={m}
                        style={[styles.chip, refundMode === m && styles.chipActive]}
                        onPress={() => setRefundMode(m)}
                      >
                        <Text style={[styles.chipText, refundMode === m && styles.chipTextActive]}>{m}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}

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
  safe: { flex: 1, backgroundColor: "#f0f4ff" },
  container: { padding: 14, gap: 12, paddingBottom: 36 },
  section: {
    backgroundColor: "#fff", borderRadius: 18, borderWidth: 1.5,
    borderColor: "#dde6f7", padding: 14, gap: 10,
    shadowColor: "#1a2463", shadowOpacity: 0.07, shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  sectionTitle: { fontSize: 12, fontWeight: "800", color: "#4a5a78", textTransform: "uppercase", letterSpacing: 0.5 },
  lookupRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  input: {
    borderWidth: 1.5, borderColor: "#d0dcf0", borderRadius: 12, backgroundColor: "#f6f8fe",
    paddingHorizontal: 13, paddingVertical: 12, color: "#0c1228", fontSize: 14,
  },
  lookupBtn: {
    backgroundColor: "#2563eb", borderRadius: 12, paddingHorizontal: 18,
    paddingVertical: 12, alignItems: "center", justifyContent: "center",
    shadowColor: "#2563eb", shadowOpacity: 0.35, shadowRadius: 10, elevation: 5,
  },
  lookupBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  meta: { color: "#8896ae", fontSize: 12, fontWeight: "500" },
  total: { fontSize: 16, fontWeight: "900", color: "#059669" },
  itemRow: {
    flexDirection: "row", alignItems: "center", borderWidth: 1.5,
    borderColor: "#dde6f7", borderRadius: 14, padding: 12, gap: 10,
    backgroundColor: "#f6f8fe",
  },
  itemName: { fontWeight: "800", color: "#0c1228", fontSize: 13 },
  returnedPill: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999,
    backgroundColor: "#fee2e2", borderWidth: 1, borderColor: "#fecaca",
  },
  returnedPillText: { fontSize: 10, fontWeight: "700", color: "#b91c1c" },
  qtyInput: {
    width: 62, borderWidth: 1.5, borderColor: "#d0dcf0", borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 9, textAlign: "center", color: "#0c1228",
    backgroundColor: "#fff", fontSize: 14, fontWeight: "700",
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1.5, borderColor: "#d0dcf0", borderRadius: 999,
    paddingHorizontal: 13, paddingVertical: 7, backgroundColor: "#f6f8fe",
  },
  chipActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  chipText: { color: "#4a5a78", fontSize: 12, fontWeight: "700" },
  chipTextActive: { color: "#fff" },
  submitBtn: {
    backgroundColor: "#dc2626", borderRadius: 14, paddingVertical: 14, alignItems: "center",
    shadowColor: "#dc2626", shadowOpacity: 0.35, shadowRadius: 10, elevation: 5,
  },
  submitBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  recentRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderWidth: 1.5, borderColor: "#dde6f7", borderRadius: 14, padding: 12,
    backgroundColor: "#f6f8fe",
  },
  recentTitle: { fontWeight: "800", color: "#0c1228", fontSize: 12 },
  recentAmt: { fontWeight: "800", color: "#059669", fontSize: 13 },
  btnDisabled: { opacity: 0.5 },
});
