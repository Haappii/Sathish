import { useEffect, useMemo, useState } from "react";
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
import { formatBusinessDateLabel } from "../utils/businessDate";

const MODULE_NOTES = {
  trends: "Trends data is available in this native module shell.",
  analytics: "Analytics module runs with business-date context.",
  qr_orders: "QR order queue is available as native module shell.",
  reservations: "Reservation management module is available in-app.",
  delivery: "Delivery order module is available in-app.",
  recipes: "Recipe management module is available in-app.",
  online_orders: "Online orders module is available in-app.",
  offline_sync: "Offline sync module is available in-app.",
  drafts: "Draft bills module is available in-app.",
  returns: "Returns module is available in-app.",
  dues: "Dues module is available in-app.",
  employees: "Employee module is available in-app.",
  employee_attendance: "Attendance module is available in-app.",
  employee_onboarding: "Onboarding docs module is available in-app.",
  loyalty: "Loyalty module is available in-app.",
  gift_cards: "Gift cards module is available in-app.",
  coupons: "Coupons module is available in-app.",
  supplier_ledger: "Supplier ledger module is available in-app.",
  stock_audit: "Stock audit module is available in-app.",
  item_lots: "Item lots module is available in-app.",
  labels: "Labels/barcode module is available in-app.",
  transfers: "Stock transfers module is available in-app.",
  reports: "Reports module is available in-app.",
  feedback_review: "Feedback review module is available in-app.",
  deleted_invoices: "Deleted invoices module is available in-app.",
  inventory: "Inventory module is available in-app.",
  alerts: "Alerts module is available in-app.",
  support_tickets: "Support tickets module is available in-app.",
  admin: "Admin module is available in-app.",
};

export default function NativeModuleScreen({ route }) {
  const title = route?.params?.title || "Module";
  const moduleKey = String(route?.params?.moduleKey || "").trim();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [shop, setShop] = useState(null);
  const [permissions, setPermissions] = useState([]);

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [shopRes, permRes] = await Promise.all([
        api.get("/shop/details"),
        api.get("/permissions/my"),
      ]);
      setShop(shopRes?.data || null);
      setPermissions(Array.isArray(permRes?.data?.modules) ? permRes.data.modules : []);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load module page");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load(false);
  }, [moduleKey]);

  const modulePerm = useMemo(() => {
    const byKey = {};
    for (const p of permissions) byKey[String(p.key || "")] = p;
    return byKey;
  }, [permissions]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator size="large" /></View>
      </SafeAreaView>
    );
  }

  const perm = modulePerm[moduleKey] || null;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      >
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.sub}>{MODULE_NOTES[moduleKey] || "Native module page loaded."}</Text>
          <Text style={styles.meta}>Business Date: {formatBusinessDateLabel(shop?.app_date)}</Text>
          <Text style={styles.meta}>Shop: {shop?.shop_name || "-"}</Text>
          <Text style={styles.meta}>Module Key: {moduleKey || "-"}</Text>
          <Text style={styles.meta}>
            Permission: {perm ? `read=${Boolean(perm.can_read)} write=${Boolean(perm.can_write)}` : "not mapped"}
          </Text>

          <Pressable style={styles.refreshBtn} onPress={() => load(true)}>
            <Text style={styles.refreshTxt}>Refresh</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f1f5f9" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 12 },
  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  title: { fontSize: 16, fontWeight: "800", color: "#0f172a" },
  sub: { color: "#334155" },
  meta: { color: "#475569", fontSize: 12 },
  refreshBtn: {
    marginTop: 8,
    backgroundColor: "#1d4ed8",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  refreshTxt: { color: "#fff", fontWeight: "700" },
});
