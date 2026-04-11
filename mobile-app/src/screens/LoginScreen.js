import { useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuth } from "../context/AuthContext";

export default function LoginScreen() {
  const { login } = useAuth();
  const [form, setForm] = useState({
    shop_id: "",
    username: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!form.shop_id.trim()) {
      Alert.alert("Validation", "Enter Shop ID");
      return;
    }
    if (!form.username.trim() || !form.password) {
      Alert.alert("Validation", "Enter username and password");
      return;
    }

    setLoading(true);
    try {
      await login(form);
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.message || "Login failed";
      Alert.alert("Login Failed", String(msg));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.container}
      >
        <View style={styles.heroGlow} />
        <View style={styles.card}>
          <Image source={require("../../assets/app_logo.png")} style={styles.logo} resizeMode="contain" />
          <Text style={styles.brand}>HAAPPII BILLING</Text>
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Sign in to continue billing</Text>

          <TextInput
            style={styles.input}
            placeholder="Shop ID"
            value={form.shop_id}
            onChangeText={(v) => setForm((p) => ({ ...p, shop_id: v }))}
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder="Username"
            value={form.username}
            onChangeText={(v) => setForm((p) => ({ ...p, username: v }))}
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            secureTextEntry
            value={form.password}
            onChangeText={(v) => setForm((p) => ({ ...p, password: v }))}
          />

          <Pressable
            style={[styles.button, loading && styles.buttonDisabled]}
            disabled={loading}
            onPress={submit}
          >
            <Text style={styles.buttonText}>{loading ? "Signing In..." : "Login"}</Text>
          </Pressable>
        </View>
        <Text style={styles.version}>v2.0.0</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#eef2ff" },
  container: { flex: 1, justifyContent: "center", padding: 20 },
  heroGlow: {
    position: "absolute",
    top: -120,
    left: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "#bfdbfe",
    opacity: 0.45,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 22,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  logo: { width: 70, height: 70, alignSelf: "center", marginBottom: 6 },
  brand: { fontSize: 12, fontWeight: "800", color: "#1d4ed8", letterSpacing: 1.2, textAlign: "center" },
  title: { fontSize: 28, fontWeight: "800", color: "#0f172a", textAlign: "center", marginTop: 6 },
  subtitle: { marginTop: 4, marginBottom: 18, textAlign: "center", color: "#64748b" },
  input: {
    borderWidth: 1.2,
    borderColor: "#dbeafe",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    backgroundColor: "#f8fafc",
    color: "#0f172a",
  },
  button: {
    marginTop: 8,
    backgroundColor: "#1d4ed8",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.65 },
  buttonText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  version: { position: "absolute", bottom: 24, alignSelf: "center", color: "#64748b", fontWeight: "700" },
});
