import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import api from "../api/client";
import { buildMobileMenu, modulesToPermMap } from "../auth/rbac";
import PrinterSettingsModal from "../components/PrinterSettingsModal";
import { useAuth } from "../context/AuthContext";
import useOnlineStatus from "../hooks/useOnlineStatus";
import { getPendingCount } from "../offline/queue";
import { syncOfflineQueue } from "../offline/sync";

const TILE_ACCENT = {
  sales_billing: "#3b82f6",
  billing_history: "#3b82f6",
  customers: "#0ea5e9",
  table_billing: "#06b6d4",
  order_live: "#06b6d4",
  kot_management: "#06b6d4",
  qr_order_accept: "#06b6d4",
  held_invoices: "#0284c7",
  inventory: "#10b981",
  dues: "#f59e0b",
  returns: "#f97316",
  expenses: "#ef4444",
  loyalty: "#ec4899",
  employees: "#8b5cf6",
  employee_attendance: "#8b5cf6",
  analytics: "#f97316",
  supplier_ledger: "#6366f1",
};

const formatBizDate = (dateStr) => {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]} ${y}`;
};

export default function HomeScreen({ navigation }) {
  const { session, logout } = useAuth();
  const { isOnline } = useOnlineStatus();

  const [shopName, setShopName]         = useState("Haappii Billing");
  const [isHotel, setIsHotel]           = useState(false);
  const [permsEnabled, setPermsEnabled] = useState(false);
  const [permMap, setPermMap]           = useState(null);
  const [loading, setLoading]           = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing]           = useState(false);
  const [showPrinterSettings, setShowPrinterSettings] = useState(false);

  const roleLower      = String(session?.role_name || session?.role || "").toLowerCase();
  const branchName     = String(session?.branch_name || "").trim();
  const shopBranchLabel = branchName ? `${shopName} - ${branchName}` : shopName;
  const bizDateLabel   = formatBizDate(session?.app_date);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const [shopRes, permRes] = await Promise.all([
          api.get("/shop/details"),
          api.get("/permissions/my"),
        ]);
        if (!mounted) return;
        const shopData = shopRes?.data || {};
        setShopName(shopData.shop_name || "Haappii Billing");
        const billingType = String(shopData.billing_type || shopData.shop_type || "").toLowerCase();
        setIsHotel(billingType === "hotel");
        setPermsEnabled(Boolean(permRes?.data?.enabled));
        setPermMap(modulesToPermMap(permRes?.data?.modules));
        const count = await getPendingCount();
        setPendingCount(count);
      } catch (err) {
        if (!mounted) return;
        setPermMap({});
        Alert.alert("Error", String(err?.response?.data?.detail || "Failed to load home"));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const menus = useMemo(
    () => buildMobileMenu({ roleLower, permsEnabled, permMap, isHotel }),
    [roleLower, permsEnabled, permMap, isHotel]
  );

  const handleSync = async () => {
    if (syncing || !isOnline) return;
    setSyncing(true);
    try {
      const result = await syncOfflineQueue();
      const remaining = await getPendingCount();
      setPendingCount(remaining);
      if (result.synced > 0) Alert.alert("Synced", `${result.synced} offline bill(s) uploaded.`);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Banners */}
      {!isOnline && (
        <View style={styles.bannerOffline}>
          <Text style={styles.bannerText}>Offline Mode - bills sync when reconnected</Text>
        </View>
      )}
      {isOnline && pendingCount > 0 && (
        <Pressable style={styles.bannerSync} onPress={handleSync} disabled={syncing}>
          <Text style={styles.bannerText}>
            {syncing ? "Syncing..." : `${pendingCount} pending bill(s) - tap to sync`}
          </Text>
        </Pressable>
      )}

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header Card */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.shopName} numberOfLines={1}>{shopBranchLabel}</Text>
              <View style={styles.userRow}>
                <Text style={styles.userText}>{session?.user_name || "User"}</Text>
                <View style={styles.roleBadge}>
                  <Text style={styles.roleText}>
                    {(session?.role_name || session?.role || "").toUpperCase()}
                  </Text>
                </View>
              </View>
            </View>
            <Pressable style={styles.logoutBtn} onPress={logout}>
              <Text style={styles.logoutText}>Logout</Text>
            </Pressable>
          </View>
          <View style={styles.headerDivider} />
          <View style={styles.headerFooter}>
            <View>
              <Text style={styles.bizDateLabel}>BUSINESS DATE</Text>
              <Text style={styles.bizDateValue}>{bizDateLabel}</Text>
            </View>
            <View style={[styles.statusPill, isOnline ? styles.statusOnline : styles.statusOffline]}>
              <View style={[styles.statusDot, { backgroundColor: isOnline ? "#4ade80" : "#f87171" }]} />
              <Text style={styles.statusText}>{isOnline ? "Online" : "Offline"}</Text>
            </View>
          </View>
        </View>

        {/* Menu Grid */}
        {menus.length === 0 ? (
          <Text style={styles.empty}>No menus available for your role.</Text>
        ) : (
          <View style={styles.grid}>
            {menus.map((m) => {
              const accent = TILE_ACCENT[m.key] || "#6366f1";
              return (
                <Pressable
                  key={m.key}
                  style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
                  onPress={() => navigation.navigate(m.route, m.params || undefined)}
                >
                  <View style={[styles.iconWrap, { backgroundColor: accent + "1a" }]}>
                    <Text style={styles.tileIcon}>{m.icon || "Menu"}</Text>
                  </View>
                  <Text style={styles.tileLabel}>{m.title}</Text>
                  <View style={[styles.tileAccentBar, { backgroundColor: accent }]} />
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Printer Settings */}
        <Pressable style={styles.printerBtn} onPress={() => setShowPrinterSettings(true)}>
          <Text style={styles.printerBtnText}>Printer Settings</Text>
        </Pressable>
      </ScrollView>

      <PrinterSettingsModal
        visible={showPrinterSettings}
        onClose={() => setShowPrinterSettings(false)}
        onSaved={() => Alert.alert("Saved", "Printer settings updated.")}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: "#f0f4f8" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 16, gap: 16, paddingBottom: 32 },

  // Banners
  bannerOffline: { backgroundColor: "#92400e", paddingVertical: 10, alignItems: "center" },
  bannerSync:    { backgroundColor: "#1d4ed8", paddingVertical: 10, alignItems: "center" },
  bannerText:    { color: "#fff", fontWeight: "700", fontSize: 13 },

  // Header
  header: {
    backgroundColor: "#0f172a",
    borderRadius: 20,
    padding: 18,
    shadowColor: "#0f172a",
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 10,
  },
  headerRow:     { flexDirection: "row", alignItems: "flex-start" },
  shopName:      { color: "#f8fafc", fontSize: 17, fontWeight: "800", marginBottom: 7 },
  userRow:       { flexDirection: "row", alignItems: "center", gap: 8 },
  userText:      { color: "#94a3b8", fontSize: 13, fontWeight: "600" },
  roleBadge:     { backgroundColor: "#1e3a5f", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  roleText:      { color: "#60a5fa", fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  logoutBtn:     {
    backgroundColor: "#1e293b",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#334155",
  },
  logoutText:    { color: "#f87171", fontWeight: "700", fontSize: 13 },
  headerDivider: { height: 1, backgroundColor: "#1e293b", marginVertical: 14 },
  headerFooter:  { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  bizDateLabel:  { color: "#475569", fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  bizDateValue:  { color: "#e2e8f0", fontSize: 15, fontWeight: "700", marginTop: 3 },
  statusPill:    { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  statusOnline:  { backgroundColor: "#052e16" },
  statusOffline: { backgroundColor: "#450a0a" },
  statusDot:     { width: 7, height: 7, borderRadius: 4 },
  statusText:    { color: "#f8fafc", fontSize: 12, fontWeight: "600" },

  // Grid
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: {
    width: "47%",
    backgroundColor: "#ffffff",
    borderRadius: 18,
    paddingVertical: 20,
    paddingHorizontal: 12,
    alignItems: "center",
    gap: 10,
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
    overflow: "hidden",
    position: "relative",
  },
  tilePressed:   { opacity: 0.8, transform: [{ scale: 0.96 }] },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  tileIcon:      { fontSize: 28 },
  tileLabel:     { fontWeight: "700", color: "#1e293b", textAlign: "center", fontSize: 12.5, lineHeight: 17 },
  tileAccentBar: { position: "absolute", bottom: 0, left: 0, right: 0, height: 3 },

  // Footer
  printerBtn: {
    borderRadius: 14,
    backgroundColor: "#1e293b",
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  printerBtnText: { color: "#64748b", fontWeight: "700", fontSize: 14, letterSpacing: 0.3 },
  empty: { color: "#94a3b8", textAlign: "center", padding: 20 },
});
