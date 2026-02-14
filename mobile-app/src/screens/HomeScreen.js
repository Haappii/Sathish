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

export default function HomeScreen({ navigation }) {
  const { session, logout } = useAuth();

  const [shopName, setShopName] = useState("Haappii Billing");
  const [permsEnabled, setPermsEnabled] = useState(false);
  const [permMap, setPermMap] = useState(null);
  const [loading, setLoading] = useState(true);

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
        setShopName(shopRes?.data?.shop_name || "Haappii Billing");
        setPermsEnabled(Boolean(permRes?.data?.enabled));
        setPermMap(modulesToPermMap(permRes?.data?.modules));
      } catch (err) {
        if (!mounted) return;
        const msg = err?.response?.data?.detail || "Failed to load mobile home";
        Alert.alert("Error", String(msg));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const menus = useMemo(
    () => buildMobileMenu({ roleLower, permsEnabled, permMap }),
    [roleLower, permsEnabled, permMap]
  );

  const doLogout = async () => {
    await logout();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.head}>
          <Text style={styles.shop}>{shopName}</Text>
          <Text style={styles.meta}>
            {session?.user_name || "User"} | {(session?.role_name || session?.role || "role")}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Phase 1</Text>
          {menus.length === 0 ? (
            <Text style={styles.empty}>No mobile menus available for this role.</Text>
          ) : (
            menus.map((m) => (
              <Pressable
                key={m.key}
                style={styles.menuButton}
                onPress={() => navigation.navigate(m.route)}
              >
                <Text style={styles.menuText}>{m.title}</Text>
              </Pressable>
            ))
          )}
        </View>

        <Pressable style={styles.logout} onPress={doLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f1f5f9" },
  scroll: { padding: 14, gap: 12 },
  loaderWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  head: {
    borderRadius: 14,
    backgroundColor: "#1d4ed8",
    padding: 14,
  },
  shop: { color: "#fff", fontSize: 20, fontWeight: "800" },
  meta: { color: "#dbeafe", marginTop: 4 },
  card: {
    borderRadius: 14,
    backgroundColor: "#fff",
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#0f172a" },
  empty: { color: "#64748b" },
  menuButton: {
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  menuText: { color: "#1e40af", fontWeight: "700" },
  logout: {
    borderRadius: 10,
    backgroundColor: "#b91c1c",
    paddingVertical: 12,
    alignItems: "center",
  },
  logoutText: { color: "#fff", fontWeight: "700" },
});
