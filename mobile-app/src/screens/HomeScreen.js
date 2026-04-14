import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import api from "../api/client";
import { buildMobileMenu, modulesToPermMap } from "../auth/rbac";
import { WEB_APP_BASE } from "../config/api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import useOnlineStatus from "../hooks/useOnlineStatus";
import { getPendingCount } from "../offline/queue";
import { syncOfflineQueue } from "../offline/sync";
import appLogo from "../../assets/app_logo.png";

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
  employee_settlements: "#7c3aed",
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

const isAbsoluteUrl = (v) => /^https?:\/\//i.test(String(v || ""));

const slugifyShopName = (value) => {
  const s = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]+/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return s || "shop";
};

const resolveShopLogoUrl = (shop) => {
  const logoUrl = String(shop?.logo_url || "").trim();
  if (logoUrl) {
    if (isAbsoluteUrl(logoUrl) || logoUrl.startsWith("data:")) return logoUrl;
    const base = String(WEB_APP_BASE || "").replace(/\/+$/, "");
    return logoUrl.startsWith("/") ? `${base}${logoUrl}` : `${base}/${logoUrl}`;
  }

  const shopId = shop?.shop_id;
  const shopName = shop?.shop_name;
  if (!shopId || !shopName) return "";

  const filename = `logo_${slugifyShopName(shopName)}_${shopId}.png`;
  const base = String(WEB_APP_BASE || "").replace(/\/+$/, "");
  return `${base}/shop-logos/${filename}`;
};

export default function HomeScreen({ navigation }) {
  const { session, logout } = useAuth();
  const { theme, preference, setPreference } = useTheme();
  const { isOnline } = useOnlineStatus();

  const [shopName, setShopName]         = useState("Haappii Billing");
  const [isHotel, setIsHotel]           = useState(false);
  const [permsEnabled, setPermsEnabled] = useState(false);
  const [permMap, setPermMap]           = useState(null);
  const [enabledModules, setEnabledModules] = useState(null); // null = unrestricted
  const [loading, setLoading]           = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing]           = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [shopLogoUri, setShopLogoUri] = useState("");

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
      headerLeft: () => (
        <Pressable
          style={[styles.headerMenuBtn, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]}
          onPress={() => setSidebarVisible(true)}
        >
          <Text style={[styles.headerMenuText, { color: theme.accent }]}>☰</Text>
        </Pressable>
      ),
      headerRight: () => null,
    });
  }, [navigation, theme]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const [shopRes, permRes, modulesRes] = await Promise.all([
          api.get("/shop/details"),
          api.get("/permissions/my"),
          api.get("/shop/modules").catch(() => null),
        ]);
        if (!mounted) return;
        const shopData = shopRes?.data || {};
        setShopName(shopData.shop_name || "Haappii Billing");
        setShopLogoUri(resolveShopLogoUrl(shopData));
        const billingType = String(shopData.billing_type || shopData.shop_type || "").toLowerCase();
        setIsHotel(billingType === "hotel");
        setPermsEnabled(Boolean(permRes?.data?.enabled));
        setPermMap(modulesToPermMap(permRes?.data?.modules));
        if (modulesRes?.data?.configured) {
          setEnabledModules(new Set(modulesRes.data.enabled_modules || []));
        } else {
          setEnabledModules(null); // unrestricted
        }
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

  // Premium modules to advertise when shop is on free tier (modules configured but locked)
  const PREMIUM_LOCKED_TILES = [
    { key: "customers",       title: "Customers & Dues",      icon: "👥" },
    { key: "loyalty",         title: "Loyalty & Coupons",     icon: "🎁" },
    { key: "employees",       title: "Employees",             icon: "👔" },
    { key: "expenses",        title: "Expenses",              icon: "💸" },
    { key: "returns",         title: "Returns",               icon: "↩️" },
    { key: "reports",         title: "Reports",               icon: "📊" },
    { key: "analytics",       title: "Analytics",             icon: "📈" },
    { key: "cash_drawer",     title: "Cash Drawer",           icon: "💰" },
    { key: "table_billing",   title: "Table Billing",         icon: "🍽️" },
    { key: "online_orders",   title: "Online Orders",         icon: "🛒" },
    { key: "advance_orders",  title: "Advance Orders",        icon: "📋" },
    { key: "supplier_ledger", title: "Suppliers",             icon: "🚚" },
  ];

  const lockedTiles = useMemo(() => {
    if (!enabledModules) return []; // unrestricted — no locked tiles
    return PREMIUM_LOCKED_TILES.filter((m) => !enabledModules.has(m.key));
  }, [enabledModules]);

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

        {/* Locked premium tiles — upgrade CTA for free tier shops */}
        {lockedTiles.length > 0 && (
          <View style={styles.lockedSection}>
            <View style={styles.lockedHeader}>
              <Text style={styles.lockedHeaderText}>🔒  Upgrade to Unlock</Text>
            </View>
            <View style={styles.grid}>
              {lockedTiles.map((m) => (
                <View key={m.key} style={styles.lockedTile}>
                  <View style={styles.lockedIconWrap}>
                    <Text style={styles.tileIcon}>{m.icon}</Text>
                  </View>
                  <Text style={styles.lockedLabel}>{m.title}</Text>
                  <View style={styles.lockedBadge}>
                    <Text style={styles.lockedBadgeText}>PRO</Text>
                  </View>
                  <View style={[styles.tileAccentBar, { backgroundColor: "#d1d5db" }]} />
                </View>
              ))}
            </View>
          </View>
        )}

      </ScrollView>

      <Modal visible={sidebarVisible} animationType="fade" transparent onRequestClose={() => setSidebarVisible(false)}>
        <View style={styles.sidebarOverlay}>
          <View style={[styles.sidebarPanel, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <View style={styles.sidebarHead}>
              <Image source={shopLogoUri ? { uri: shopLogoUri } : appLogo} style={styles.sidebarLogo} resizeMode="contain" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.sidebarShopName, { color: theme.text }]} numberOfLines={1}>
                  {shopName || "Haappii Billing"}
                </Text>
                <Text style={[styles.sidebarMeta, { color: theme.textSub }]} numberOfLines={1}>
                  {session?.branch_name || "Main Branch"}
                </Text>
                <Text style={[styles.sidebarMeta, { color: theme.textSub }]} numberOfLines={1}>
                  {session?.user_name || "User"}
                </Text>
              </View>
            </View>

            <View style={styles.sidebarDivider} />

            <Pressable
              style={[styles.sidebarAction, { borderColor: theme.cardBorder, backgroundColor: theme.surface }]}
              onPress={() => {
                setSidebarVisible(false);
                navigation.navigate("Settings");
              }}
            >
              <Text style={[styles.sidebarActionText, { color: theme.text }]}>Settings</Text>
            </Pressable>

            <Pressable
              style={[styles.sidebarAction, { borderColor: theme.cardBorder, backgroundColor: theme.surface }]}
              onPress={() => {
                setSidebarVisible(false);
                openThemePicker();
              }}
            >
              <Text style={[styles.sidebarActionText, { color: theme.text }]}>{themeButtonLabel}</Text>
            </Pressable>

            <Pressable
              style={[styles.sidebarAction, { borderColor: "#fecaca", backgroundColor: "#fef2f2" }]}
              onPress={() => {
                setSidebarVisible(false);
                logout();
              }}
            >
              <Text style={[styles.sidebarActionText, { color: "#b91c1c" }]}>Logout</Text>
            </Pressable>
          </View>
          <Pressable style={styles.sidebarBackdrop} onPress={() => setSidebarVisible(false)} />
        </View>
      </Modal>
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
  headerMenuBtn: {
    width: 34,
    height: 34,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerMenuText: { fontSize: 16, fontWeight: "900" },
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

  sidebarOverlay: { ...StyleSheet.absoluteFillObject, flexDirection: "row" },
  sidebarBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sidebarPanel: {
    width: "78%",
    maxWidth: 320,
    borderRightWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 24,
    paddingBottom: 20,
    gap: 10,
  },
  sidebarHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  sidebarLogo: { width: 52, height: 52, borderRadius: 12 },
  sidebarShopName: { fontSize: 15, fontWeight: "800" },
  sidebarMeta: { fontSize: 12, fontWeight: "600" },
  sidebarDivider: { height: 1, backgroundColor: "#e2e8f0", marginVertical: 4 },
  sidebarAction: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  sidebarActionText: { fontSize: 13, fontWeight: "700" },

  // Locked premium tiles
  lockedSection: { gap: 12 },
  lockedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  lockedHeaderText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#d97706",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  lockedTile: {
    width: "47%",
    backgroundColor: "#f9fafb",
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 12,
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    opacity: 0.7,
    overflow: "hidden",
    position: "relative",
  },
  lockedIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3f4f6",
  },
  lockedLabel: {
    fontWeight: "700",
    color: "#9ca3af",
    textAlign: "center",
    fontSize: 12.5,
    lineHeight: 17,
  },
  lockedBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "#fef3c7",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  lockedBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#d97706",
    letterSpacing: 0.5,
  },

  empty: { color: "#94a3b8", textAlign: "center", padding: 20 },
});
