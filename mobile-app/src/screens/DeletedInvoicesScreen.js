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
import { useTheme } from "../context/ThemeContext";


const fmtMoney = (v) => `Rs. ${Number(v || 0).toFixed(2)}`;

function displayDate(v) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

const pad = (n) => String(n).padStart(2, "0");

export default function DeletedInvoicesScreen() {
  const { theme } = useTheme();
  const { session } = useAuth();
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [deletedInvoices, setDeletedInvoices] = useState([]);
  const [selectedArchive, setSelectedArchive] = useState(null);
  const [appDateYMD, setAppDateYMD] = useState("");

  const toYMD = (v) => {
    if (!v) return "";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  };
  const isToday = (v) => !!appDateYMD && toYMD(v) === appDateYMD;

  useEffect(() => {
    api.get("/shop/details")
      .then((r) => {
        const d = r?.data?.app_date;
        if (d) setAppDateYMD(String(d).slice(0, 10));
      })
      .catch(() => {});
  }, []);

  const loadDeletedInvoices = useCallback(async (withLoader = true) => {
    if (withLoader) setLoading(true);
    else setRefreshing(true);

    try {
      const res = await api.get("/invoice/archive/list");
      const rows = Array.isArray(res?.data) ? res.data : [];
      setDeletedInvoices(rows.filter((r) => r?.delete_reason === "Deleted"));
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
    if (!isToday(selectedArchive.created_time)) {
      Alert.alert("Not Allowed", "This invoice can only be restored on the same business date it was deleted.");
      return;
    }

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
                {!isToday(r.created_time) && (
                  <View style={styles.pastDatePill}>
                    <Text style={styles.pastDatePillText}>Past Date</Text>
                  </View>
                )}
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
                {isToday(selectedArchive.created_time) ? (
                  <Pressable
                    style={[styles.restoreBtn, restoring && styles.disabledBtn]}
                    disabled={restoring}
                    onPress={() => handleRestore(selectedArchive.archive_id)}
                  >
                    <Text style={styles.restoreBtnText}>
                      {restoring ? "Restoring..." : "Restore Invoice"}
                    </Text>
                  </Pressable>
                ) : (
                  <View style={styles.pastDateBanner}>
                    <Text style={styles.pastDateBannerText}>
                      Restore is only available on the same business date the invoice was deleted.
                    </Text>
                  </View>
                )}
              </View>
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f6fb" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 14, gap: 12, paddingBottom: 24 },
  section: {
    borderRadius: 18, backgroundColor: "#ffffff", borderWidth: 1.5,
    borderColor: "#e4e9f2", padding: 14, gap: 10,
    shadowColor: "#0a0f1e", shadowOpacity: 0.07, shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: "#0a0f1e" },
  input: {
    borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12,
    paddingHorizontal: 13, paddingVertical: 12, backgroundColor: "#f8f9fd",
    color: "#0a0f1e", fontSize: 14,
  },
  refreshBtn: {
    backgroundColor: "#6366f1", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, alignItems: "center",
    shadowColor: "#6366f1", shadowOpacity: 0.35, shadowRadius: 10, elevation: 5,
  },
  refreshTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },
  empty: { color: "#9ca3af", fontSize: 14, textAlign: "center", paddingVertical: 24, fontWeight: "600" },
  row: {
    borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 16, padding: 14,
    marginVertical: 4, flexDirection: "row", alignItems: "center",
    backgroundColor: "#ffffff",
    shadowColor: "#0a0f1e", shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  invNo: { fontSize: 14, fontWeight: "800", color: "#0a0f1e" },
  sub: { fontSize: 12, color: "#9ca3af", marginTop: 2 },
  deletedBy: { fontSize: 11, color: "#ef4444", marginTop: 4, fontWeight: "700" },
  pastDatePill: {
    alignSelf: "flex-start", backgroundColor: "#f1f5f9", borderRadius: 999,
    paddingHorizontal: 9, paddingVertical: 2, marginTop: 5,
  },
  pastDatePillText: { fontSize: 10, fontWeight: "700", color: "#64748b" },
  pastDateBanner: {
    backgroundColor: "#f8f9fd", borderWidth: 1.5, borderColor: "#e4e9f2",
    borderRadius: 14, padding: 14,
  },
  pastDateBannerText: { color: "#6b7280", fontSize: 13, fontWeight: "600", textAlign: "center" },
  amount: { fontSize: 14, fontWeight: "800", color: "#6366f1", marginLeft: 8 },
  modalSafe: { flex: 1, backgroundColor: "#f4f6fb" },
  modalHead: {
    backgroundColor: "#0a0f1e",
    paddingHorizontal: 16, paddingVertical: 14,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  modalTitle: { fontSize: 16, fontWeight: "800", color: "#fff" },
  close: { fontSize: 14, color: "#93c5fd", fontWeight: "700" },
  modalBody: { padding: 16, gap: 10, paddingBottom: 24 },
  detailLine: { fontSize: 13, color: "#4b5563", marginVertical: 4, fontWeight: "600" },
  totalLine: { fontSize: 13, color: "#4b5563", marginVertical: 4, fontWeight: "700" },
  totalBig: { fontSize: 16, fontWeight: "900", color: "#0a0f1e", marginVertical: 10 },
  actions: { gap: 10, marginTop: 18 },
  restoreBtn: {
    backgroundColor: "#10b981", borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14, alignItems: "center",
    shadowColor: "#10b981", shadowOpacity: 0.35, shadowRadius: 10, elevation: 5,
  },
  restoreBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  disabledBtn: { opacity: 0.6 },
});
