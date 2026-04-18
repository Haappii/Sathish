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
  safe: { flex: 1, backgroundColor: "#f0f4ff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 14 },
  card: {
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#dde6f7",
    borderRadius: 18,
    padding: 16,
    gap: 10,
    shadowColor: "#1a2463", shadowOpacity: 0.07, shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  title: { fontSize: 16, fontWeight: "900", color: "#0c1228" },
  sub: { color: "#4a5a78", fontWeight: "600" },
  meta: { color: "#8896ae", fontSize: 12, fontWeight: "600" },
  refreshBtn: {
    marginTop: 8,
    backgroundColor: "#2563eb",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    shadowColor: "#2563eb", shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  refreshTxt: { color: "#fff", fontWeight: "800" },
});
