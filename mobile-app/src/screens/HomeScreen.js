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
import { useAuth } from "../context/AuthContext";
import useOnlineStatus from "../hooks/useOnlineStatus";
import { getPendingCount } from "../offline/queue";
import { syncOfflineQueue } from "../offline/sync";

export default function HomeScreen({ navigation }) {
  const { session, logout } = useAuth();
  const { isOnline } = useOnlineStatus();

  const [shopName, setShopName]     = useState("Haappii Billing");
  const [isHotel, setIsHotel]       = useState(false);
  const [permsEnabled, setPermsEnabled] = useState(false);
  const [permMap, setPermMap]       = useState(null);
  const [loading, setLoading]       = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing]       = useState(false);

  const roleLower = String(session?.role_name || session?.role || "").toLowerCase();

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

        // Refresh offline pending count
        const count = await getPendingCount();
        setPendingCount(count);
      } catch (err) {
        if (!mounted) return;
        const msg = err?.response?.data?.detail || "Failed to load home";
        Alert.alert("Error", String(msg));
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
      if (result.synced > 0)
        Alert.alert("Synced", `${result.synced} offline bill(s) uploaded.`);
    } finally {
      setSyncing(false);
    }
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
      {/* Offline Banner */}
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>⚡ Offline — bills will sync when reconnected</Text>
        </View>
      )}
      {isOnline && pendingCount > 0 && (
        <Pressable style={styles.syncBanner} onPress={handleSync} disabled={syncing}>
          <Text style={styles.syncBannerText}>
            {syncing ? "Syncing…" : `📤 ${pendingCount} bill(s) pending upload — tap to sync`}
          </Text>
        </Pressable>
      )}

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.head}>
          <Text style={styles.shop}>{shopName}</Text>
          <Text style={styles.meta}>
            {session?.user_name || "User"}  ·  {session?.role_name || session?.role || "role"}
          </Text>
          {isHotel && (
            <View style={styles.hotelBadge}>
              <Text style={styles.hotelBadgeText}>Hotel Mode</Text>
            </View>
          )}
        </View>

        {/* Menu Grid */}
        <View style={styles.grid}>
          {menus.length === 0 ? (
            <Text style={styles.empty}>No menus available for your role.</Text>
          ) : (
            menus.map((m) => (
              <Pressable
                key={m.key}
                style={styles.tile}
                onPress={() => navigation.navigate(m.route)}
              >
                <Text style={styles.tileIcon}>{m.icon || "☰"}</Text>
                <Text style={styles.tileLabel}>{m.title}</Text>
              </Pressable>
            ))
          )}
        </View>

        {/* Logout */}
        <Pressable style={styles.logout} onPress={logout}>
          <Text style={styles.logoutText}>Logout</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: "#f1f5f9" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 14, gap: 14 },

  head: {
    borderRadius: 16,
    backgroundColor: "#1d4ed8",
    padding: 16,
    gap: 4,
  },
  shop:  { color: "#fff", fontSize: 22, fontWeight: "800" },
  meta:  { color: "#bfdbfe" },
  hotelBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#fbbf24",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 6,
  },
  hotelBadgeText: { color: "#78350f", fontWeight: "700", fontSize: 12 },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  tile: {
    width: "47%",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  tileIcon:  { fontSize: 32 },
  tileLabel: { fontWeight: "700", color: "#1e293b", textAlign: "center", fontSize: 13 },

  logout: {
    borderRadius: 12,
    backgroundColor: "#b91c1c",
    paddingVertical: 14,
    alignItems: "center",
  },
  logoutText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  empty: { color: "#94a3b8", textAlign: "center", padding: 20 },
  offlineBanner: { backgroundColor: "#92400e", padding: 10, alignItems: "center" },
  offlineBannerText: { color: "#fef3c7", fontWeight: "700", fontSize: 13 },
  syncBanner: { backgroundColor: "#1d4ed8", padding: 10, alignItems: "center" },
  syncBannerText: { color: "#fff", fontWeight: "700", fontSize: 13 },
});
