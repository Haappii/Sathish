import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import api from "../api/client";

const pad = (n) => String(n).padStart(2, "0");
const toYmd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtMoney = (v) => `Rs. ${Number(v || 0).toFixed(2)}`;

const dateRanges = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 Days" },
  { key: "30d", label: "Last 30 Days" },
];

function parseBusinessDate(appDate) {
  if (!appDate || typeof appDate !== "string") return new Date();
  const [y, m, d] = appDate.slice(0, 10).split("-").map((v) => Number(v));
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
}

function getRange(mode, appDate) {
  const to = parseBusinessDate(appDate);
  const from = new Date(to);
  if (mode === "7d") from.setDate(from.getDate() - 6);
  if (mode === "30d") from.setDate(from.getDate() - 29);
  return { from_date: toYmd(from), to_date: toYmd(to) };
}

function displayDate(v) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export default function SalesHistoryScreen() {
  const [range, setRange] = useState("today");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [businessDate, setBusinessDate] = useState(null);

  const [rows, setRows] = useState([]);
  const [activeInvoice, setActiveInvoice] = useState(null);

  const loadRows = async (withLoader = true) => {
    if (withLoader) setLoading(true);
    else setRefreshing(true);

    try {
      let activeBusinessDate = businessDate;
      if (!activeBusinessDate) {
        const shopRes = await api.get("/shop/details");
        activeBusinessDate = shopRes?.data?.app_date || null;
        setBusinessDate(activeBusinessDate);
      }
      const params = getRange(range, activeBusinessDate);
      const res = await api.get("/invoice/list", { params });
      setRows(res?.data || []);
    } catch (err) {
      const msg = err?.response?.data?.detail || "Failed to load invoices";
      Alert.alert("Error", String(msg));
    } finally {
      if (withLoader) setLoading(false);
      else setRefreshing(false);
    }
  };

  useEffect(() => {
    loadRows(true);
  }, [range, businessDate]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return (rows || []).filter((r) =>
      `${r.invoice_number || ""} ${r.customer_name || ""} ${r.mobile || ""}`
        .toLowerCase()
        .includes(q)
    );
  }, [rows, search]);

  const openInvoice = async (invoiceNo) => {
    try {
      const res = await api.get(`/invoice/by-number/${invoiceNo}`);
      setActiveInvoice(res?.data || null);
    } catch (err) {
      const msg = err?.response?.data?.detail || "Failed to load invoice details";
      Alert.alert("Error", String(msg));
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Filters</Text>
          {businessDate ? (
            <Text style={styles.businessDate}>Business Date: {String(businessDate).slice(0, 10)}</Text>
          ) : null}
          <View style={styles.rangeRow}>
            {dateRanges.map((r) => (
              <Pressable
                key={r.key}
                style={[styles.rangeBtn, range === r.key && styles.rangeBtnActive]}
                onPress={() => setRange(r.key)}
              >
                <Text style={[styles.rangeTxt, range === r.key && styles.rangeTxtActive]}>
                  {r.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            style={styles.input}
            value={search}
            onChangeText={setSearch}
            placeholder="Search invoice / customer / mobile"
          />

          <Pressable style={styles.refreshBtn} onPress={() => loadRows(false)}>
            <Text style={styles.refreshTxt}>{refreshing ? "Refreshing..." : "Refresh"}</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Invoices ({filtered.length})</Text>
          {filtered.length === 0 ? <Text style={styles.empty}>No invoices found.</Text> : null}
          {filtered.map((r) => (
            <Pressable
              key={String(r.invoice_id)}
              style={styles.row}
              onPress={() => openInvoice(r.invoice_number)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.invNo}>{r.invoice_number}</Text>
                <Text style={styles.sub}>{displayDate(r.created_time)}</Text>
                <Text style={styles.sub}>
                  {r.customer_name || "Walk-in"} | {r.mobile || "-"}
                </Text>
              </View>
              <Text style={styles.amount}>{fmtMoney(r.total_amount)}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <Modal
        visible={Boolean(activeInvoice)}
        animationType="slide"
        onRequestClose={() => setActiveInvoice(null)}
      >
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>Invoice Details</Text>
            <Pressable onPress={() => setActiveInvoice(null)}>
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>

          {activeInvoice ? (
            <ScrollView contentContainerStyle={styles.modalBody}>
              <Text style={styles.detailLine}>Invoice: {activeInvoice.invoice_number}</Text>
              <Text style={styles.detailLine}>
                Date: {displayDate(activeInvoice.created_time)}
              </Text>
              <Text style={styles.detailLine}>
                Customer: {activeInvoice.customer_name || "Walk-in"}
              </Text>
              <Text style={styles.detailLine}>Mobile: {activeInvoice.mobile || "-"}</Text>
              <Text style={styles.detailLine}>
                Payment: {String(activeInvoice.payment_mode || "cash").toUpperCase()}
              </Text>

              <View style={styles.itemsBox}>
                <Text style={styles.itemsTitle}>Items</Text>
                {(activeInvoice.items || []).map((it, idx) => (
                  <View key={`${it.item_id}-${idx}`} style={styles.itemRow}>
                    <Text style={{ flex: 1 }}>
                      {it.item_name} x {it.quantity}
                    </Text>
                    <Text>{fmtMoney(it.amount)}</Text>
                  </View>
                ))}
              </View>

              <Text style={styles.totalLine}>Tax: {fmtMoney(activeInvoice.tax_amt)}</Text>
              <Text style={styles.totalLine}>Discount: {fmtMoney(activeInvoice.discounted_amt)}</Text>
              <Text style={styles.totalBig}>Total: {fmtMoney(activeInvoice.total_amount)}</Text>
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f1f5f9" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 12, gap: 10, paddingBottom: 20 },
  section: {
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 12,
    gap: 8,
  },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: "#0f172a" },
  businessDate: { color: "#1d4ed8", fontWeight: "700", fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  rangeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  rangeBtn: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  rangeBtnActive: { backgroundColor: "#1d4ed8", borderColor: "#1d4ed8" },
  rangeTxt: { fontSize: 12, fontWeight: "700", color: "#334155" },
  rangeTxtActive: { color: "#fff" },
  refreshBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#e2e8f0",
  },
  refreshTxt: { fontWeight: "700", color: "#334155" },
  empty: { color: "#64748b" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#fff",
  },
  invNo: { fontWeight: "800", color: "#0f172a" },
  sub: { marginTop: 2, color: "#475569", fontSize: 12 },
  amount: { marginLeft: 8, fontWeight: "800", color: "#047857" },
  modalSafe: { flex: 1, backgroundColor: "#f8fafc" },
  modalHead: {
    padding: 14,
    borderBottomWidth: 1,
    borderColor: "#e2e8f0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
  },
  modalTitle: { fontSize: 16, fontWeight: "800", color: "#0f172a" },
  close: { color: "#1d4ed8", fontWeight: "700" },
  modalBody: { padding: 14, gap: 8 },
  detailLine: { color: "#334155" },
  itemsBox: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    padding: 10,
    gap: 8,
    backgroundColor: "#fff",
  },
  itemsTitle: { fontWeight: "800", color: "#0f172a" },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  totalLine: { marginTop: 3, color: "#334155" },
  totalBig: { marginTop: 8, fontSize: 18, fontWeight: "800", color: "#047857" },
});
