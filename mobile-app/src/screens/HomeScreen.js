import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
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
let autoDetectPrinter = () => {};
try { autoDetectPrinter = require("../utils/printerAutoDetect").autoDetectPrinter; } catch {}
import appLogo from "../../assets/app_logo.png";

const TILE_COLORS = {
  sales_billing:     { bg: "#eef2ff", accent: "#6366f1", icon: "🧾" },
  billing_history:   { bg: "#f5f3ff", accent: "#8b5cf6", icon: "📋" },
  customers:         { bg: "#ecfeff", accent: "#06b6d4", icon: "👥" },
  table_billing:     { bg: "#ecfdf5", accent: "#10b981", icon: "🍽️" },
  order_live:        { bg: "#ecfdf5", accent: "#10b981", icon: "🔔" },
  kot_management:    { bg: "#f0fdfa", accent: "#14b8a6", icon: "🎫" },
  qr_order_accept:   { bg: "#faf5ff", accent: "#a855f7", icon: "📱" },
  held_invoices:     { bg: "#fffbeb", accent: "#f59e0b", icon: "📌" },
  inventory:         { bg: "#ecfdf5", accent: "#10b981", icon: "📦" },
  dues:              { bg: "#fff7ed", accent: "#f97316", icon: "💳" },
  returns:           { bg: "#fef2f2", accent: "#ef4444", icon: "↩️" },
  expenses:          { bg: "#fef2f2", accent: "#ef4444", icon: "💸" },
  loyalty:           { bg: "#fdf2f8", accent: "#ec4899", icon: "🎁" },
  employees:         { bg: "#f5f3ff", accent: "#8b5cf6", icon: "👔" },
  employee_settlements: { bg: "#f5f3ff", accent: "#7c3aed", icon: "💰" },
  employee_attendance:  { bg: "#f5f3ff", accent: "#8b5cf6", icon: "📝" },
  analytics:         { bg: "#fff7ed", accent: "#f97316", icon: "📈" },
  supplier_ledger:   { bg: "#eef2ff", accent: "#6366f1", icon: "🚚" },
  advance_orders:    { bg: "#ecfeff", accent: "#06b6d4", icon: "📋" },
  cash_drawer:       { bg: "#fffbeb", accent: "#f59e0b", icon: "🏧" },
  day_close:         { bg: "#f8fafc", accent: "#64748b", icon: "🌙" },
  reports:           { bg: "#ecfeff", accent: "#06b6d4", icon: "📊" },
  online_orders:     { bg: "#ecfdf5", accent: "#10b981", icon: "🛒" },
  deleted_invoices:  { bg: "#fef2f2", accent: "#ef4444", icon: "🗑️" },
  dashboard:         { bg: "#eef2ff", accent: "#6366f1", icon: "📊" },
  settings:          { bg: "#f8fafc", accent: "#64748b", icon: "⚙️" },
};

const formatBizDate = (dateStr) => {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]} ${y}`;
};
const isAbsoluteUrl = (v) => /^https?:\/\//i.test(String(v || ""));
const slugify = (v) => String(v || "").trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]+/g, "").replace(/_+/g, "_").replace(/^_+|_+$/g, "") || "shop";
const resolveLogoUrl = (shop) => {
  const logo = String(shop?.logo_url || "").trim();
  if (logo) {
    if (isAbsoluteUrl(logo) || logo.startsWith("data:")) return logo;
    const base = String(WEB_APP_BASE || "").replace(/\/+$/, "");
    return logo.startsWith("/") ? `${base}${logo}` : `${base}/${logo}`;
  }
  if (!shop?.shop_id || !shop?.shop_name) return "";
  return `${String(WEB_APP_BASE || "").replace(/\/+$/, "")}/shop-logos/logo_${slugify(shop.shop_name)}_${shop.shop_id}.png`;
};

export default function HomeScreen({ navigation }) {
  const { session, logout } = useAuth();
  const { theme, preference, setPreference } = useTheme();
  const { isOnline } = useOnlineStatus();

  const [shopName, setShopName] = useState("Haappii Billing");
  const [trialDays, setTrialDays] = useState(null);
  const [isHotel, setIsHotel] = useState(false);
  const [permsEnabled, setPermsEnabled] = useState(false);
  const [permMap, setPermMap] = useState(null);
  const [enabledModules, setEnabledModules] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [shopLogoUri, setShopLogoUri] = useState("");

  const roleLower = String(session?.role_name || session?.role || "").toLowerCase();
  const branchName = String(session?.branch_name || "").trim();
  const shopLabel = branchName ? `${shopName} · ${branchName}` : shopName;
  const bizDate = formatBizDate(session?.app_date);
  const themeLabels = { light: "Light", dark: "Dark", system: "System" };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <Pressable style={[st.navBtn, { borderColor: "rgba(255,255,255,0.1)" }]} onPress={() => setSidebarVisible(true)}>
          <Text style={{ color: "#fff", fontSize: 18, fontWeight: "800" }}>☰</Text>
        </Pressable>
      ),
      headerRight: () => null,
    });
  }, [navigation]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [shopRes, permRes, modulesRes] = await Promise.all([
          api.get("/shop/details"),
          api.get("/permissions/my"),
          api.get("/shop/modules").catch(() => null),
        ]);
        if (!alive) return;
        const sd = shopRes?.data || {};
        setShopName(sd.shop_name || "Haappii Billing");
        setShopLogoUri(resolveLogoUrl(sd));
        setIsHotel(String(sd.billing_type || sd.shop_type || "").toLowerCase() === "hotel");
        const expiresOn = sd.expires_on || sd.paid_until;
        if (expiresOn) {
          const exp = new Date(expiresOn);
          const now = new Date(); now.setHours(0,0,0,0);
          const diff = Math.ceil((exp - now) / (1000*60*60*24));
          if (diff <= 30) setTrialDays(diff);
        }
        setPermsEnabled(Boolean(permRes?.data?.enabled));
        setPermMap(modulesToPermMap(permRes?.data?.modules));
        if (modulesRes?.data?.configured) setEnabledModules(new Set(modulesRes.data.enabled_modules || []));
        else setEnabledModules(null);
        setPendingCount(await getPendingCount());
      } catch (err) {
        if (!alive) return;
        setPermMap({});
        Alert.alert("Error", String(err?.response?.data?.detail || "Failed to load home"));
      } finally { if (alive) setLoading(false); }
    })();
    autoDetectPrinter();
    return () => { alive = false; };
  }, []);

  const menus = useMemo(() => buildMobileMenu({ roleLower, permsEnabled, permMap, isHotel }), [roleLower, permsEnabled, permMap, isHotel]);

  const PREMIUM_LOCKED = [
    { key: "customers", title: "Customers & Dues", icon: "👥" },
    { key: "loyalty", title: "Loyalty & Coupons", icon: "🎁" },
    { key: "employees", title: "Employees", icon: "👔" },
    { key: "expenses", title: "Expenses", icon: "💸" },
    { key: "returns", title: "Returns", icon: "↩️" },
    { key: "reports", title: "Reports", icon: "📊" },
    { key: "analytics", title: "Analytics", icon: "📈" },
    { key: "cash_drawer", title: "Cash Drawer", icon: "💰" },
    { key: "table_billing", title: "Table Billing", icon: "🍽️" },
    { key: "online_orders", title: "Online Orders", icon: "🛒" },
    { key: "advance_orders", title: "Advance Orders", icon: "📋" },
    { key: "supplier_ledger", title: "Suppliers", icon: "🚚" },
  ];
  const lockedTiles = useMemo(() => enabledModules ? PREMIUM_LOCKED.filter((m) => !enabledModules.has(m.key)) : [], [enabledModules]);

  const handleSync = async () => {
    if (syncing || !isOnline) return;
    setSyncing(true);
    try {
      const r = await syncOfflineQueue();
      setPendingCount(await getPendingCount());
      if (r.synced > 0) Alert.alert("Synced", `${r.synced} offline bill(s) uploaded.`);
    } finally { setSyncing(false); }
  };

  if (loading) return (
    <SafeAreaView style={[st.safe, { backgroundColor: theme.background }]}>
      <View style={st.center}><ActivityIndicator size="large" color={theme.accent} /></View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={[st.safe, { backgroundColor: theme.background }]}>
      {!isOnline && (
        <View style={st.bannerOff}>
          <View style={st.bannerDot} /><Text style={st.bannerTxt}>Offline — bills sync when reconnected</Text>
        </View>
      )}
      {isOnline && pendingCount > 0 && (
        <Pressable style={st.bannerSync} onPress={handleSync} disabled={syncing}>
          <Text style={st.bannerTxt}>{syncing ? "Syncing..." : `${pendingCount} pending bill(s) — tap to sync`}</Text>
        </Pressable>
      )}

      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={st.hero}>
          <View style={st.heroGlow1} />
          <View style={st.heroGlow2} />
          <View style={st.heroTop}>
            <View style={{ flex: 1 }}>
              <Text style={st.heroShop} numberOfLines={1}>{shopLabel}</Text>
              <View style={st.heroMeta}>
                <Text style={st.heroUser}>{session?.user_name || "User"}</Text>
                <View style={st.heroBadge}>
                  <Text style={st.heroBadgeText}>{(session?.role_name || session?.role || "").toUpperCase()}</Text>
                </View>
              </View>
            </View>
            <View style={[st.statusChip, isOnline ? st.statusOn : st.statusOff]}>
              <View style={[st.statusDot, { backgroundColor: isOnline ? "#34d399" : "#f87171" }]} />
              <Text style={[st.statusText, { color: isOnline ? "#34d399" : "#f87171" }]}>{isOnline ? "Online" : "Offline"}</Text>
            </View>
          </View>
          {trialDays !== null && (
            <View style={[st.trialBadge, trialDays <= 7 ? st.trialUrgent : st.trialNormal]}>
              <Text style={[st.trialText, trialDays <= 7 ? st.trialTextUrgent : st.trialTextNormal]}>
                {trialDays < 0 ? "Trial expired" : trialDays === 0 ? "Trial ends today" : `${trialDays} day${trialDays !== 1 ? "s" : ""} left in trial`}
              </Text>
            </View>
          )}
          <View style={st.heroDivider} />
          <View style={st.heroBottom}>
            <View>
              <Text style={st.heroDateLabel}>BUSINESS DATE</Text>
              <Text style={st.heroDateValue}>{bizDate}</Text>
            </View>
          </View>
        </View>

        {/* Quick Actions */}
        {menus.length > 0 && <Text style={st.sectionTitle}>Quick Actions</Text>}

        {menus.length === 0 ? (
          <Text style={st.empty}>No menus available for your role.</Text>
        ) : (
          <View style={st.grid}>
            {menus.map((m) => {
              const tc = TILE_COLORS[m.key] || { bg: "#eef2ff", accent: "#6366f1", icon: "📋" };
              return (
                <Pressable key={m.key} style={({ pressed }) => [st.tile, pressed && st.tilePressed]}
                  onPress={() => navigation.navigate(m.route, m.params || undefined)}>
                  <View style={[st.tileIconBox, { backgroundColor: tc.bg }]}>
                    <Text style={st.tileIconText}>{m.icon || tc.icon}</Text>
                  </View>
                  <Text style={st.tileName} numberOfLines={2}>{m.title}</Text>
                  <View style={[st.tileBar, { backgroundColor: tc.accent }]} />
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Locked */}
        {lockedTiles.length > 0 && (
          <>
            <Text style={[st.sectionTitle, { color: "#f59e0b" }]}>Upgrade to Unlock</Text>
            <View style={st.grid}>
              {lockedTiles.map((m) => (
                <View key={m.key} style={[st.tile, { opacity: 0.45 }]}>
                  <View style={[st.tileIconBox, { backgroundColor: "#f3f4f6" }]}>
                    <Text style={st.tileIconText}>{m.icon}</Text>
                  </View>
                  <Text style={[st.tileName, { color: "#9ca3af" }]} numberOfLines={2}>{m.title}</Text>
                  <View style={st.proBadge}><Text style={st.proText}>PRO</Text></View>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {/* Sidebar */}
      <Modal visible={sidebarVisible} animationType="fade" transparent onRequestClose={() => setSidebarVisible(false)}>
        <View style={StyleSheet.absoluteFill}>
          <View style={st.sidebar}>
            <View style={st.sideHead}>
              <View style={st.sideLogoBox}>
                <Image source={shopLogoUri ? { uri: shopLogoUri } : appLogo} style={st.sideLogo} resizeMode="contain" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.sideShop} numberOfLines={1}>{shopName}</Text>
                <Text style={st.sideMeta}>{session?.branch_name || "Main Branch"}</Text>
                <Text style={st.sideMeta2}>{session?.user_name || "User"}</Text>
              </View>
            </View>
            <View style={st.sideDivider} />

            {[
              { label: "⚙️  Settings", action: () => { setSidebarVisible(false); navigation.navigate("Settings"); } },
              { label: `🎨  Theme: ${themeLabels[preference]}`, action: () => { setSidebarVisible(false); Alert.alert("Theme", "Choose appearance", [
                { text: "Light", onPress: () => setPreference("light") },
                { text: "Dark", onPress: () => setPreference("dark") },
                { text: "System", onPress: () => setPreference("system") },
                { text: "Cancel", style: "cancel" },
              ]); } },
            ].map((item) => (
              <Pressable key={item.label} style={st.sideBtn} onPress={item.action}>
                <Text style={st.sideBtnText}>{item.label}</Text>
              </Pressable>
            ))}

            <Pressable style={[st.sideBtn, { borderColor: "rgba(239,68,68,0.2)", backgroundColor: "rgba(239,68,68,0.06)" }]}
              onPress={() => { setSidebarVisible(false); logout(); }}>
              <Text style={[st.sideBtnText, { color: "#ef4444" }]}>🚪  Logout</Text>
            </Pressable>
          </View>
          <Pressable style={st.sideBackdrop} onPress={() => setSidebarVisible(false)} />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 16, paddingBottom: 44 },
  navBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)" },

  // Banners
  bannerOff: { backgroundColor: "#7f1d1d", paddingVertical: 12, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  bannerSync: { backgroundColor: "#4338ca", paddingVertical: 12, paddingHorizontal: 16, alignItems: "center" },
  bannerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fca5a5" },
  bannerTxt: { color: "#fff", fontWeight: "700", fontSize: 13 },

  // Hero
  hero: {
    backgroundColor: "#0c1220", borderRadius: 28, padding: 24, marginBottom: 24,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", overflow: "hidden",
    shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 12,
  },
  heroGlow1: { position: "absolute", right: -50, top: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: "#6366f1", opacity: 0.08 },
  heroGlow2: { position: "absolute", left: -60, bottom: -70, width: 200, height: 200, borderRadius: 100, backgroundColor: "#a855f7", opacity: 0.05 },
  heroTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  heroShop: { color: "#fff", fontSize: 22, fontWeight: "900", letterSpacing: -0.3, marginBottom: 10 },
  heroMeta: { flexDirection: "row", alignItems: "center", gap: 10 },
  heroUser: { color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: "600" },
  heroBadge: { backgroundColor: "rgba(99,102,241,0.15)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: "rgba(99,102,241,0.2)" },
  heroBadgeText: { color: "#818cf8", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  statusChip: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1 },
  statusOn: { backgroundColor: "rgba(52,211,153,0.08)", borderColor: "rgba(52,211,153,0.2)" },
  statusOff: { backgroundColor: "rgba(248,113,113,0.08)", borderColor: "rgba(248,113,113,0.2)" },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: "700" },
  trialBadge: { alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, marginTop: 14, borderWidth: 1 },
  trialNormal: { backgroundColor: "rgba(99,102,241,0.1)", borderColor: "rgba(99,102,241,0.2)" },
  trialUrgent: { backgroundColor: "rgba(245,158,11,0.1)", borderColor: "rgba(245,158,11,0.2)" },
  trialText: { fontSize: 12, fontWeight: "700" },
  trialTextNormal: { color: "#818cf8" },
  trialTextUrgent: { color: "#f59e0b" },
  heroDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.06)", marginVertical: 18 },
  heroBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  heroDateLabel: { color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  heroDateValue: { color: "#fff", fontSize: 20, fontWeight: "800", marginTop: 4, letterSpacing: -0.3 },

  // Section
  sectionTitle: { color: "#64748b", fontSize: 13, fontWeight: "800", letterSpacing: 0.8, marginBottom: 14, marginTop: 8, paddingHorizontal: 4 },

  // Grid
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: {
    width: "23%", backgroundColor: "#fff", borderRadius: 20, paddingTop: 18, paddingBottom: 14, paddingHorizontal: 8,
    alignItems: "center", gap: 10,
    shadowColor: "#0f172a", shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3,
    overflow: "hidden", position: "relative",
  },
  tilePressed: { transform: [{ scale: 0.94 }], opacity: 0.85 },
  tileIconBox: { width: 52, height: 52, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  tileIconText: { fontSize: 26 },
  tileName: { fontWeight: "700", color: "#1e293b", textAlign: "center", fontSize: 10, lineHeight: 14 },
  tileBar: { position: "absolute", top: 0, left: 12, right: 12, height: 3, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  proBadge: { position: "absolute", top: 6, right: 4, backgroundColor: "#fef3c7", borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: "#fcd34d" },
  proText: { fontSize: 7, fontWeight: "900", color: "#b45309", letterSpacing: 0.5 },

  // Sidebar
  sidebar: {
    width: "78%", maxWidth: 320, backgroundColor: "#0f1729", height: "100%",
    paddingHorizontal: 20, paddingTop: 48, paddingBottom: 28, gap: 12,
    borderRightWidth: 1, borderRightColor: "rgba(255,255,255,0.06)",
  },
  sideBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)", zIndex: -1 },
  sideHead: { flexDirection: "row", alignItems: "center", gap: 14 },
  sideLogoBox: { width: 52, height: 52, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  sideLogo: { width: 44, height: 44 },
  sideShop: { color: "#fff", fontSize: 16, fontWeight: "900" },
  sideMeta: { color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: "600", marginTop: 3 },
  sideMeta2: { color: "rgba(255,255,255,0.3)", fontSize: 11, fontWeight: "500", marginTop: 1 },
  sideDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.06)", marginVertical: 8 },
  sideBtn: { borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: "rgba(255,255,255,0.03)" },
  sideBtnText: { color: "rgba(255,255,255,0.8)", fontSize: 14, fontWeight: "600" },

  empty: { color: "#94a3b8", textAlign: "center", padding: 24, fontSize: 14 },
});
