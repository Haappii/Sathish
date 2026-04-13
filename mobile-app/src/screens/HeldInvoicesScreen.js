import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

const fmt = (n) => `₹${Number(n || 0).toFixed(2)}`;

const normalizeHeldInvoices = (data) => {
  const list = Array.isArray(data) ? data : [];
  const filtered = list.filter((row) => {
    const orderId = Number(row?.draft_id || 0);
    const itemCount = Array.isArray(row?.items) ? row.items.length : 0;
    return Number.isFinite(orderId) && orderId > 0 && itemCount > 0;
  });

  const seen = new Set();
  return filtered.filter((row) => {
    const key = String(row?.draft_id || row?.source_draft_id || row?.draft_number || "");
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const getOrderId = (row) => {
  const raw = row?.draft_id ?? row?.source_draft_id ?? row?.id ?? null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export default function HeldInvoicesScreen() {
  const { session } = useAuth();
  const { theme } = useTheme();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const toxDate = session?.app_date || new Date().toISOString().split("T")[0];
  const todayLabel = (() => {
    const [y, m, d] = toxDate.split("-");
    const mNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${d} ${mNames[Number(m) - 1]} ${y}`;
  })();

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await api.get("/invoice/draft/list");
      setInvoices(normalizeHeldInvoices(res?.data));
    } catch (err) {
      if (!silent) {
        Alert.alert("Error", err?.response?.data?.detail || "Failed to load held invoices");
      }
      setInvoices([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleProcess = (row) => {
    const orderId = getOrderId(row);
    if (!orderId) return Alert.alert("Error", "Unable to identify this held bill.");

    Alert.alert("Process Held Bill", `Convert ${row?.draft_number || `#${orderId}`} to invoice?`, [
      { text: "No", style: "cancel" },
      {
        text: "Yes, Process",
        onPress: () => confirmProcess(row, orderId),
      },
    ]);
  };

  const confirmProcess = async (row, orderId) => {
    setBusyId(orderId);
    try {
      const res = await api.post(`/invoice/draft/convert/${orderId}`);
      const invoiceNo = String(res?.data?.invoice_number || "").trim();
      Alert.alert(
        "Processed",
        invoiceNo ? `Invoice: ${invoiceNo}` : "Invoice processed successfully."
      );
      await load(true);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to process invoice");
    } finally {
      setBusyId(null);
    }
  };

  const handleCancel = (row) => {
    const orderId = getOrderId(row);
    if (!orderId) return Alert.alert("Error", "Unable to identify this held invoice.");

    Alert.alert(
      "Delete Held Bill",
      `Delete ${row?.draft_number || `#${orderId}`} for ${row?.customer_name || "Walk-in"}?`,
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, Delete",
          style: "destructive",
          onPress: async () => {
            setBusyId(orderId);
            try {
              await api.delete(`/invoice/draft/${orderId}`);
              Alert.alert("Deleted", "Held bill deleted.");
              await load(true);
            } catch (err) {
              const status = Number(err?.response?.status || 0);
              const detail = err?.response?.data?.detail || err?.message || "Failed to cancel";
              Alert.alert("Error", status ? `${detail} (HTTP ${status})` : String(detail));
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item: row, index }) => {
    const orderId = getOrderId(row);
    const busy = busyId === orderId;
    const itemsList = Array.isArray(row?.items) ? row.items : [];
    const total = Number(row?.discounted_amt || row?.total_amount || 0);

    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <View style={styles.tokenRow}>
              <View style={styles.tokenBadge}>
                <Text style={styles.tokenText}>
                  {row?.draft_number ? row.draft_number : `#${orderId || index + 1}`}
                </Text>
              </View>
              <Text style={styles.totalText}>{fmt(total)}</Text>
            </View>
            <Text style={styles.customerText}>
              {row?.customer_name || "Walk-in"}
              {row?.mobile ? ` · ${row.mobile}` : ""}
            </Text>
            {itemsList.length > 0 && (
              <Text style={styles.itemsText}>
                {itemsList.map((it) => `${it?.item_name || `Item #${it?.item_id || "-"}`} ×${it?.quantity || 1}`).join(", ")}
              </Text>
            )}
          </View>
        </View>
        <View style={styles.actionsRow}>
          <Pressable
            style={[styles.processBtn, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={() => handleProcess(row)}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.processBtnText}>Process</Text>
            )}
          </Pressable>
          <Pressable
            style={[styles.cancelBtn, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={() => handleCancel(row)}
          >
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.accent }]}>
        <Text style={styles.headerTitle}>Held Invoices</Text>
        <Text style={[styles.headerDate, { color: theme.textSub }]}>{todayLabel}</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0b57d0" />
          <Text style={styles.loadingText}>Loading held invoices…</Text>
        </View>
      ) : (
        <FlatList
          data={invoices}
          keyExtractor={(row, idx) => String(getOrderId(row) || row?.token_number || `held-${idx}`)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={["#0b57d0"]} />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyTitle}>No held invoices</Text>
              <Text style={styles.emptyMsg}>
                There are no invoices currently on hold for today's business date.
              </Text>
            </View>
          }
          ListHeaderComponent={
            invoices.length > 0 ? (
              <Text style={[styles.countLabel, { color: theme.textSub }]}>
                {invoices.length} held bill{invoices.length !== 1 ? "s" : ""} · Pull down to refresh
              </Text>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f3f6ff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: "#64748b", fontSize: 14 },

  header: {
    backgroundColor: "#0b57d0",
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },
  headerDate: { color: "#bfdbfe", fontSize: 13, fontWeight: "600" },

  countLabel: {
    color: "#64748b",
    fontSize: 12,
    paddingHorizontal: 4,
    paddingBottom: 4,
  },

  list: { padding: 14, gap: 10, paddingBottom: 24 },

  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#d9e3ff",
    padding: 12,
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTop: { gap: 6 },
  tokenRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  tokenBadge: {
    backgroundColor: "#fef3c7",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#fbbf24",
  },
  tokenText: { color: "#92400e", fontWeight: "800", fontSize: 13 },
  totalText: { fontSize: 16, fontWeight: "800", color: "#059669" },
  customerText: { color: "#1e293b", fontWeight: "700", fontSize: 14 },
  itemsText: { color: "#64748b", fontSize: 12, marginTop: 2 },

  actionsRow: { flexDirection: "row", gap: 10 },
  processBtn: {
    flex: 1,
    backgroundColor: "#059669",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  processBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  cancelBtn: {
    flex: 1,
    backgroundColor: "#fee2e2",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#fca5a5",
  },
  cancelBtnText: { color: "#b91c1c", fontWeight: "800", fontSize: 14 },
  btnDisabled: { opacity: 0.5 },

  emptyWrap: {
    alignItems: "center",
    paddingTop: 60,
    gap: 10,
    paddingHorizontal: 30,
  },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: "#0b1220" },
  emptyMsg: { color: "#64748b", textAlign: "center", fontSize: 14, lineHeight: 20 },
});
