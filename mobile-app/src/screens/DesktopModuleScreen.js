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
  safe: { flex: 1, backgroundColor: "#f3f6ff", alignItems: "center", justifyContent: "center", padding: 16 },
  card: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#d9e3ff",
    padding: 14,
    gap: 10,
  },
  title: { fontSize: 16, fontWeight: "800", color: "#0b1220" },
  sub: { color: "#334155" },
  url: { color: "#0b57d0", fontSize: 12 },
  btn: {
    marginTop: 6,
    backgroundColor: "#0b57d0",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "700" },
});
