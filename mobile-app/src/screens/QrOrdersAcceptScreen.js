import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { printKotTokenSlip } from "../utils/printInvoice";
import { useTheme } from "../context/ThemeContext";


function dt(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

export default function QrOrdersAcceptScreen({ navigation }) {
  const { theme } = useTheme();
  const { session } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState({});
  const [shopDetails, setShopDetails] = useState({});
  const [branchDetails, setBranchDetails] = useState({});

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const branchPromise = session?.branch_id
        ? api.get(`/branch/${session.branch_id}`).catch(() => null)
        : Promise.resolve(null);
      const [res, shopRes, branchRes] = await Promise.all([
        api.get("/qr-orders/pending"),
        api.get("/shop/details").catch(() => null),
        branchPromise,
      ]);
      setRows(Array.isArray(res?.data) ? res.data : []);
      setShopDetails(shopRes?.data || {});
      setBranchDetails(branchRes?.data || {});
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load QR orders");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session?.branch_id]);

  useEffect(() => {
    load();
    // Auto-refresh every 5s to match web QrOrders polling cadence.
    const id = setInterval(() => load(false), 5000);
    return () => clearInterval(id);
  }, [load]);

  const kotRequired = branchDetails?.kot_required !== false;

  // Group pending orders by table (matches web's table-grouped layout).
  const grouped = (() => {
    const by = {};
    for (const r of rows) {
      const key = String(r.table_id || "0");
      if (!by[key]) by[key] = [];
      by[key].push(r);
    }
    return Object.values(by).sort((a, b) =>
      String(a[0]?.table_name || "").localeCompare(String(b[0]?.table_name || ""))
    );
  })();

  const doAccept = async (row) => {
    const id = row?.qr_order_id;
    if (!id) return;
    setBusy((prev) => ({ ...prev, [id]: "accept" }));
    try {
      const res = await api.post(`/qr-orders/${id}/accept`);
      const orderId = res?.data?.order_id;

      if (orderId && kotRequired) {
        try {
          const kotRes = await api.post(`/kot/create/${orderId}`);
          const kotItems = Array.isArray(kotRes?.data?.items) ? kotRes.data.items : (row.items || []);
          if (kotItems.length > 0) {
            await printKotTokenSlip(
              {
                tokenNumber: String(orderId),
                items: kotItems.map((it) => ({
                  item_name: it.item_name || `Item ${it.item_id}`,
                  quantity: it.quantity,
                })),
                customerName: row.customer_name || "",
              },
              { shop: shopDetails, branch: branchDetails, shopName: shopDetails?.shop_name || "Haappii Billing" }
            );
          }
        } catch {
          // ignore KOT/print errors, order was already accepted
        }
      }

      await load(true);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to accept QR order");
    } finally {
      setBusy((prev) => ({ ...prev, [id]: "" }));
    }
  };

  const doReject = async (row) => {
    const id = row?.qr_order_id;
    if (!id) return;
    setBusy((prev) => ({ ...prev, [id]: "reject" }));
    try {
      await api.post(`/qr-orders/${id}/reject`);
      await load(true);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to reject QR order");
    } finally {
      setBusy((prev) => ({ ...prev, [id]: "" }));
    }
  };

  const action = (row, type) => {
    if (type === "reject") {
      Alert.alert("Reject Order", "Reject this order?", [
        { text: "No", style: "cancel" },
        { text: "Yes, Reject", style: "destructive", onPress: () => doReject(row) },
      ]);
      return;
    }
    doAccept(row);
  };

  const openTable = (tableId, tableName) => {
    navigation.navigate("TableOrder", {
      table: { table_id: tableId, table_name: tableName },
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator size="large" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      >
        <Text style={styles.header}>Pending QR Orders ({rows.length})</Text>

        {rows.length === 0 ? <Text style={styles.empty}>No pending QR orders.</Text> : null}

        {grouped.map((list) => {
          const tableId = list[0]?.table_id;
          const tableName = list[0]?.table_name;
          return (
            <View key={String(tableId)} style={styles.tableGroup}>
              <View style={styles.tableGroupHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tableGroupTitle}>{tableName ? `Table ${tableName}` : `Table #${tableId}`}</Text>
                  <Text style={styles.tableGroupSub}>{list.length} pending {list.length === 1 ? "order" : "orders"}</Text>
                </View>
                <Pressable style={styles.openTableBtn} onPress={() => openTable(tableId, tableName)}>
                  <Text style={styles.openTableBtnText}>Open Table</Text>
                </Pressable>
              </View>

              {list.map((row) => (
                <View key={String(row.qr_order_id)} style={styles.card}>
                  <Text style={styles.title}>#{row.qr_order_id} • Table {row.table_name || row.table_id}</Text>
                  <Text style={styles.meta}>{row.customer_name || "Walk-in"} • {row.mobile || "-"}</Text>
                  <Text style={styles.meta}>Created: {dt(row.created_at)}</Text>

                  <View style={styles.itemBox}>
                    {(row.items || []).map((it, idx) => (
                      <View key={`${row.qr_order_id}-${idx}`} style={styles.itemRow}>
                        <Text style={styles.itemName}>{it.item_name || `Item ${it.item_id}`}</Text>
                        <Text style={styles.itemQty}>x{it.quantity}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.btnRow}>
                    <Pressable
                      style={[styles.btn, styles.rejectBtn]}
                      onPress={() => action(row, "reject")}
                      disabled={Boolean(busy[row.qr_order_id])}
                    >
                      <Text style={styles.btnText}>{busy[row.qr_order_id] === "reject" ? "Rejecting..." : "Reject"}</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.btn, styles.acceptBtn]}
                      onPress={() => action(row, "accept")}
                      disabled={Boolean(busy[row.qr_order_id])}
                    >
                      <Text style={styles.btnText}>
                        {busy[row.qr_order_id] === "accept" ? "Accepting..." : kotRequired ? "Accept + KOT" : "Accept"}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f6fb" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 14, gap: 12, paddingBottom: 24 },
  header: { fontWeight: "900", fontSize: 17, color: "#0a0f1e", letterSpacing: -0.2 },
  empty: { color: "#9ca3af", fontSize: 14, fontWeight: "600" },
  tableGroup: { gap: 10 },
  tableGroupHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  tableGroupTitle: { fontWeight: "900", fontSize: 15, color: "#0a0f1e" },
  tableGroupSub: { fontSize: 11, color: "#6b7280", fontWeight: "600" },
  openTableBtn: {
    borderWidth: 1,
    borderColor: "#e4e9f2",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#ffffff",
  },
  openTableBtnText: { color: "#334155", fontWeight: "700", fontSize: 12 },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "#e4e9f2",
    padding: 16,
    gap: 8,
    shadowColor: "#0a0f1e",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  title: { fontWeight: "900", color: "#0a0f1e", fontSize: 15 },
  meta: { color: "#4b5563", fontSize: 13 },
  itemBox: {
    marginTop: 6,
    gap: 5,
    backgroundColor: "#f8f9fd",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#e4e9f2",
    padding: 10,
  },
  itemRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  itemName: { color: "#0a0f1e", flex: 1, paddingRight: 8, fontSize: 13, fontWeight: "600" },
  itemQty: { color: "#4b5563", fontWeight: "800", fontSize: 13 },
  btnRow: { marginTop: 10, flexDirection: "row", gap: 10 },
  btn: { flex: 1, alignItems: "center", paddingVertical: 13, borderRadius: 13 },
  rejectBtn: {
    backgroundColor: "#ef4444",
    shadowColor: "#ef4444",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  acceptBtn: {
    backgroundColor: "#6366f1",
    shadowColor: "#6366f1",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
