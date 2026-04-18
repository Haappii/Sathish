import { useEffect } from "react";
import {
  Alert,
  Linking,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { WEB_APP_BASE } from "../config/api";

function joinUrl(base, path) {
  const b = String(base || "").replace(/\/+$/, "");
  const p = String(path || "").startsWith("/") ? String(path || "") : `/${String(path || "")}`;
  return `${b}${p}`;
}

export default function DesktopModuleScreen({ route }) {
  const title = route?.params?.title || "Module";
  const path = route?.params?.path || "/home";
  const url = joinUrl(WEB_APP_BASE, path);

  const openInBrowser = async () => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert("Open Failed", "Unable to open module URL.");
        return;
      }
      await Linking.openURL(url);
    } catch (err) {
      Alert.alert("Open Failed", err?.message || "Unable to open module.");
    }
  };

  useEffect(() => {
    openInBrowser();
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub}>This module opens the exact desktop/web screen.</Text>
        <Text style={styles.url}>{url}</Text>
        <Pressable style={styles.btn} onPress={openInBrowser}>
          <Text style={styles.btnText}>Open {title}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f0f4ff", alignItems: "center", justifyContent: "center", padding: 16 },
  card: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "#dde6f7",
    padding: 16,
    gap: 12,
    shadowColor: "#1a2463", shadowOpacity: 0.08, shadowRadius: 14,
    shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
  title: { fontSize: 17, fontWeight: "900", color: "#0c1228", letterSpacing: -0.2 },
  sub: { color: "#4a5a78", fontWeight: "600", fontSize: 13 },
  url: { color: "#2563eb", fontSize: 12, fontWeight: "600" },
  btn: {
    marginTop: 4,
    backgroundColor: "#2563eb",
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
    shadowColor: "#2563eb", shadowOpacity: 0.35, shadowRadius: 10, elevation: 5,
  },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
