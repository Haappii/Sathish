import { useEffect, useMemo, useState, useCallback } from "react";
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
import { useAuth } from "../context/AuthContext";

const fmtMoney = (v) => `Rs. ${Number(v || 0).toFixed(2)}`;

function displayDate(v) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export default function DeletedInvoicesScreen() {
  const { session } = useAuth();
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [deletedInvoices, setDeletedInvoices] = useState([]);
  const [selectedArchive, setSelectedArchive] = useState(null);

  const loadDeletedInvoices = useCallback(async (withLoader = true) => {
    if (withLoader) setLoading(true);
    else setRefreshing(true);

    try {
      const res = await api.get("/invoice/archive/list");
      setDeletedInvoices(res?.data || []);
    } catch (err) {
      const msg = err?.response?.data?.detail || "Failed to load deleted invoices";
      Alert.alert("Error", String(msg));
    } finally {
      if (withLoader) setLoading(false);
      else setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDeletedInvoices(true);
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return (deletedInvoices || []).filter((r) =>
      `${r.invoice_number || ""} ${r.customer_name || ""} ${r.mobile || ""} ${r.deleted_by || ""}`
        .toLowerCase()
        .includes(q)
    );
  }, [deletedInvoices, search]);

  const handleRestore = async (archiveId) => {
    if (!selectedArchive) return;

    Alert.alert(
      "Restore Invoice",
      `Restore invoice ${selectedArchive.invoice_number}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore",
          style: "default",
          onPress: async () => {
            setRestoring(true);
            try {
              await api.post(`/invoice/archive/restore/${archiveId}`);
              Alert.alert("Success", "Invoice restored successfully.");
              setSelectedArchive(null);
              await loadDeletedInvoices(false);
            } catch (err) {
              Alert.alert(
                "Error",
                err?.response?.data?.detail || "Failed to restore invoice"
              );
            } finally {
              setRestoring(false);
            }
          },
        },
      ]
    );
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
          <Text style={styles.sectionTitle}>Deleted Invoices</Text>
          
          <TextInput
            style={styles.input}
            value={search}
            onChangeText={setSearch}
            placeholder="Search invoice / customer / mobile / deleted by"
          />

          <Pressable style={styles.refreshBtn} onPress={() => loadDeletedInvoices(false)}>
            <Text style={styles.refreshTxt}>{refreshing ? "Refreshing..." : "Refresh"}</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Results ({filtered.length})</Text>
          {filtered.length === 0 ? (
            <Text style={styles.empty}>No deleted invoices found.</Text>
          ) : null}
          {filtered.map((r) => (
            <Pressable
              key={String(r.archive_id)}
              style={styles.row}
              onPress={() => setSelectedArchive(r)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.invNo}>{r.invoice_number}</Text>
                <Text style={styles.sub}>{displayDate(r.deleted_time)}</Text>
                <Text style={styles.sub}>
                  {r.customer_name || "Walk-in"} | {r.mobile || "-"}
                </Text>
                <Text style={styles.deletedBy}>
                  Deleted by: {r.deleted_by || "Unknown"}
                </Text>
              </View>
              <Text style={styles.amount}>{fmtMoney(r.total_amount)}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <Modal
        visible={Boolean(selectedArchive)}
        animationType="slide"
        onRequestClose={() => setSelectedArchive(null)}
      >
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>Deleted Invoice Details</Text>
            <Pressable onPress={() => setSelectedArchive(null)}>
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>

          {selectedArchive ? (
            <ScrollView contentContainerStyle={styles.modalBody}>
              <Text style={styles.detailLine}>
                Invoice: {selectedArchive.invoice_number}
              </Text>
              <Text style={styles.detailLine}>
                Original Date: {displayDate(selectedArchive.created_time)}
              </Text>
              <Text style={styles.detailLine}>
                Deleted Date: {displayDate(selectedArchive.deleted_time)}
              </Text>
              <Text style={styles.detailLine}>
                Customer: {selectedArchive.customer_name || "Walk-in"}
              </Text>
              <Text style={styles.detailLine}>
                Mobile: {selectedArchive.mobile || "-"}
              </Text>
              <Text style={styles.detailLine}>
                Deleted By: {selectedArchive.deleted_by || "Unknown"}
              </Text>
              <Text style={styles.detailLine}>
                Reason: {selectedArchive.delete_reason || "N/A"}
              </Text>

              <Text style={styles.totalLine}>
                Tax: {fmtMoney(selectedArchive.tax_amt)}
              </Text>
              <Text style={styles.totalLine}>
                Discount: {fmtMoney(selectedArchive.discounted_amt)}
              </Text>
              <Text style={styles.totalBig}>
                Total: {fmtMoney(selectedArchive.total_amount)}
              </Text>

              <View style={styles.actions}>
                <Pressable
                  style={[styles.restoreBtn, restoring && styles.disabledBtn]}
                  disabled={restoring}
                  onPress={() => handleRestore(selectedArchive.archive_id)}
                >
                  <Text style={styles.restoreBtnText}>
                    {restoring ? "Restoring..." : "Restore Invoice"}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f3f6ff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 12, gap: 10, paddingBottom: 20 },
  section: {
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d9e3ff",
    padding: 12,
    gap: 8,
  },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: "#0b1220" },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  refreshBtn: {
    backgroundColor: "#0b57d0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  refreshTxt: { color: "#fff", fontWeight: "700", fontSize: 13 },
  empty: { color: "#7c8ba1", fontSize: 14, textAlign: "center", paddingVertical: 20 },
  row: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    padding: 12,
    marginVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fbfdff",
  },
  invNo: { fontSize: 14, fontWeight: "700", color: "#0b1220" },
  sub: { fontSize: 12, color: "#7c8ba1", marginTop: 2 },
  deletedBy: { fontSize: 11, color: "#d32f2f", marginTop: 4, fontWeight: "500" },
  amount: { fontSize: 13, fontWeight: "700", color: "#0b57d0", marginLeft: 8 },
  modalSafe: { flex: 1, backgroundColor: "#f3f6ff" },
  modalHead: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#d9e3ff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: { fontSize: 16, fontWeight: "700", color: "#0b1220" },
  close: { fontSize: 14, color: "#0b57d0", fontWeight: "700" },
  modalBody: { padding: 12, gap: 10, paddingBottom: 20 },
  detailLine: { fontSize: 13, color: "#334155", marginVertical: 4 },
  totalLine: { fontSize: 13, color: "#334155", marginVertical: 4, fontWeight: "600" },
  totalBig: { fontSize: 15, fontWeight: "700", color: "#0b1220", marginVertical: 8 },
  actions: { gap: 8, marginTop: 16 },
  restoreBtn: {
    backgroundColor: "#4fa34d",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
  },
  restoreBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  disabledBtn: { opacity: 0.6 },
});
