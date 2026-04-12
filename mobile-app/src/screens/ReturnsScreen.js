import { useState } from "react";
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

const RETURN_TYPES = ["REFUND", "EXCHANGE", "STORE_CREDIT"];
const REFUND_MODES = ["CASH", "UPI", "CARD", "BANK"];
const REASON_CODES = ["DAMAGED", "WRONG_ITEM", "QUALITY", "CUSTOMER_CHANGE", "OTHER"];
const fmt = (n) => `₹${Number(n || 0).toFixed(2)}`;

export default function ReturnsScreen() {
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
      const payload = {
        invoice_number: invoice.invoice_number,
        return_type: returnType,
        refund_mode: returnType === "REFUND" ? refundMode : null,
        reason_code: reasonCode,
        reason,
        note,
        items,
      };
      await api.post("/returns/", payload);
      Alert.alert("Success", "Return processed successfully.");
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
                    <Text style={styles.itemName}>{item.item_name}</Text>
                    <Text style={styles.meta}>Sold: {item.quantity} · {fmt(item.amount)}</Text>
                  </View>
                  <TextInput
                    style={styles.qtyInput}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor="#94a3b8"
                    value={qty[item.item_id] || ""}
                    onChangeText={(v) => {
                      const n = Math.min(Number(v || 0), Number(item.quantity));
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
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f1f5f9" },
  container: { padding: 12, gap: 10, paddingBottom: 32 },
  section: {
    backgroundColor: "#fff", borderRadius: 12, borderWidth: 1,
    borderColor: "#e2e8f0", padding: 12, gap: 8,
  },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: "#0f172a" },
  lookupRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  input: {
    borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10, backgroundColor: "#f8fafc",
    paddingHorizontal: 12, paddingVertical: 10, color: "#0f172a",
  },
  lookupBtn: {
    backgroundColor: "#1d4ed8", borderRadius: 10, paddingHorizontal: 16,
    paddingVertical: 10, alignItems: "center", justifyContent: "center",
  },
  lookupBtnText: { color: "#fff", fontWeight: "700" },
  meta: { color: "#64748b", fontSize: 12 },
  total: { fontSize: 15, fontWeight: "800", color: "#059669" },
  itemRow: {
    flexDirection: "row", alignItems: "center", borderWidth: 1,
    borderColor: "#e2e8f0", borderRadius: 10, padding: 10, gap: 8,
  },
  itemName: { fontWeight: "700", color: "#0f172a" },
  qtyInput: {
    width: 60, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 8, textAlign: "center", color: "#0f172a",
    backgroundColor: "#f8fafc",
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#fff",
  },
  chipActive: { backgroundColor: "#1d4ed8", borderColor: "#1d4ed8" },
  chipText: { color: "#334155", fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  submitBtn: {
    backgroundColor: "#dc2626", borderRadius: 10, paddingVertical: 13, alignItems: "center",
  },
  submitBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  btnDisabled: { opacity: 0.5 },
});
