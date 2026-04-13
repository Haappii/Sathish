import { useEffect, useLayoutEffect, useMemo, useState } from "react";
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
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import useOnlineStatus from "../hooks/useOnlineStatus";
import { getPendingCount } from "../offline/queue";
import { syncOfflineQueue } from "../offline/sync";

const TILE_ACCENT = {
  sales_billing: "#2f6df6",
  billing_history: "#2f6df6",
  customers: "#0f8ec8",
  table_billing: "#0ea5a0",
  order_live: "#0ea5a0",
  kot_management: "#0ea5a0",
  qr_order_accept: "#0ea5a0",
  held_invoices: "#3568dc",
  inventory: "#1ea672",
  dues: "#c68a16",
  returns: "#de6b1f",
  expenses: "#cf3b3b",
  loyalty: "#d14ea2",
  employees: "#7d4ed9",
  employee_attendance: "#7d4ed9",
  analytics: "#de6b1f",
  supplier_ledger: "#5058e5",
  advance_orders: "#0891b2",
};

const formatBizDate = (dateStr) => {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]} ${y}`;
};

export default function HomeScreen({ navigation }) {
  const { session, logout } = useAuth();
  const { theme, preference, setPreference } = useTheme();
  const { isOnline } = useOnlineStatus();

  const [shopName, setShopName]         = useState("Haappii Billing");
  const [isHotel, setIsHotel]           = useState(false);
  const [permsEnabled, setPermsEnabled] = useState(false);
  const [permMap, setPermMap]           = useState(null);
  const [loading, setLoading]           = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing]           = useState(false);

  const roleLower      = String(session?.role_name || session?.role || "").toLowerCase();
  const branchName     = String(session?.branch_name || "").trim();
  const shopBranchLabel = branchName ? `${shopName} - ${branchName}` : shopName;
  const bizDateLabel   = formatBizDate(session?.app_date);

  const themeButtonLabel =
    preference === "light" ? "Theme: Light" : preference === "dark" ? "Theme: Dark" : "Theme: System";

  const openThemePicker = () => {
    Alert.alert("Select Theme", "Choose app appearance", [
      { text: "Light", onPress: () => setPreference("light") },
      { text: "Dark", onPress: () => setPreference("dark") },
      { text: "System", onPress: () => setPreference("system") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Pressable
            style={[
              styles.headerLogoutBtn,
              { marginRight: 2, backgroundColor: theme.surface, borderColor: theme.cardBorder },
            ]}
            onPress={() => navigation.navigate("Settings")}
          >
            <Text style={[styles.headerLogoutText, { color: theme.accent }]}>Settings</Text>
          </Pressable>
          <Pressable
            style={[
              styles.headerLogoutBtn,
              { marginRight: 2, backgroundColor: theme.surface, borderColor: theme.cardBorder },
            ]}
            onPress={openThemePicker}
          >
            <Text style={[styles.headerLogoutText, { color: theme.accent }]}>{themeButtonLabel}</Text>
          </Pressable>
          <Pressable style={[styles.headerLogoutBtn, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]} onPress={logout}>
            <Text style={[styles.headerLogoutText, { color: theme.accent }]}>Logout</Text>
          </Pressable>
        </View>
      ),
    });
  }, [navigation, logout, themeButtonLabel, theme]);

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
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
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
          <View style={styles.headerGlowA} />
          <View style={styles.headerGlowB} />
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

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: "#f3f6ff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 16, gap: 16, paddingBottom: 32 },

  // Banners
  bannerOffline: { backgroundColor: "#92400e", paddingVertical: 10, alignItems: "center" },
  bannerSync:    { backgroundColor: "#0b57d0", paddingVertical: 10, alignItems: "center" },
  bannerText:    { color: "#fff", fontWeight: "700", fontSize: 13 },

  // Header
  header: {
    backgroundColor: "#0b1220",
    borderRadius: 24,
    padding: 18,
    shadowColor: "#0b1220",
    shadowOpacity: 0.28,
    shadowRadius: 20,
    elevation: 12,
    borderWidth: 1,
    borderColor: "#1f2a3d",
    overflow: "hidden",
  },
  headerGlowA: {
    position: "absolute",
    right: -28,
    top: -18,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#1b2a48",
  },
  headerGlowB: {
    position: "absolute",
    left: -36,
    bottom: -44,
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: "#162640",
  },
  headerRow:     { flexDirection: "row", alignItems: "flex-start" },
  shopName:      { color: "#ffffff", fontSize: 18, fontWeight: "800", marginBottom: 7 },
  userRow:       { flexDirection: "row", alignItems: "center", gap: 8 },
  userText:      { color: "#94a3b8", fontSize: 13, fontWeight: "600" },
  roleBadge:     { backgroundColor: "#1f3e66", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  roleText:      { color: "#60a5fa", fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  headerLogoutBtn: {
    backgroundColor: "#edf2ff",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#d3defc",
    marginRight: 4,
  },
  headerLogoutText: { color: "#0b57d0", fontWeight: "700", fontSize: 12 },
  headerDivider: { height: 1, backgroundColor: "#1e293b", marginVertical: 14 },
  headerFooter:  { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  bizDateLabel:  { color: "#64748b", fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  bizDateValue:  { color: "#d9e3ff", fontSize: 15, fontWeight: "700", marginTop: 3 },
  statusPill:    { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  statusOnline:  { backgroundColor: "#052e16" },
  statusOffline: { backgroundColor: "#450a0a" },
  statusDot:     { width: 7, height: 7, borderRadius: 4 },
  statusText:    { color: "#ffffff", fontSize: 12, fontWeight: "600" },

  // Grid
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: {
    width: "47%",
    backgroundColor: "#ffffff",
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 12,
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#e4ebff",
    shadowColor: "#172554",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 5,
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
  tileLabel:     { fontWeight: "700", color: "#0f172a", textAlign: "center", fontSize: 12.5, lineHeight: 17 },
  tileAccentBar: { position: "absolute", bottom: 0, left: 0, right: 0, height: 4 },

  empty: { color: "#94a3b8", textAlign: "center", padding: 20 },
});
