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

function Field({ label, ...props }) {
  return (
    <View style={fieldStyles.wrap}>
      <Text style={fieldStyles.label}>{label}</Text>
      <TextInput style={fieldStyles.input} placeholderTextColor="#475569" {...props} />
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  wrap:  { marginBottom: 14 },
  label: { color: "#94a3b8", fontSize: 11, fontWeight: "700", letterSpacing: 0.8, marginBottom: 6, textTransform: "uppercase" },
  input: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    color: "#f1f5f9",
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#334155",
  },
});

export default function LoginScreen() {
  const { login } = useAuth();
  const [form, setForm] = useState({ shop_id: "", username: "", password: "" });
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!form.shop_id.trim()) { Alert.alert("Validation", "Enter Shop ID"); return; }
    if (!form.username.trim() || !form.password) { Alert.alert("Validation", "Enter username and password"); return; }
    setLoading(true);
    try {
      await login(form);
    } catch (err) {
      Alert.alert("Login Failed", String(err?.response?.data?.detail || err?.message || "Login failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Ambient glow orbs */}
      <View style={styles.orb1} />
      <View style={styles.orb2} />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.container}
      >
        {/* Logo + Brand */}
        <View style={styles.brandArea}>
          <View style={styles.logoRing}>
            <Image source={require("../../assets/app_logo.png")} style={styles.logo} resizeMode="contain" />
          </View>
          <Text style={styles.brand}>HAAPPII BILLING</Text>
          <Text style={styles.tagline}>Smart Billing for Modern Shops</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sign In</Text>

          <Field
            label="Shop ID"
            placeholder="Enter your shop ID"
            value={form.shop_id}
            onChangeText={(v) => setForm((p) => ({ ...p, shop_id: v }))}
            autoCapitalize="none"
            keyboardType="default"
          />
          <Field
            label="Username"
            placeholder="Enter username"
            value={form.username}
            onChangeText={(v) => setForm((p) => ({ ...p, username: v }))}
            autoCapitalize="none"
          />
          <Field
            label="Password"
            placeholder="Enter password"
            value={form.password}
            onChangeText={(v) => setForm((p) => ({ ...p, password: v }))}
            secureTextEntry
          />

          <Pressable
            style={[styles.button, loading && styles.buttonDisabled]}
            disabled={loading}
            onPress={submit}
          >
            <Text style={styles.buttonText}>{loading ? "Signing Inâ€¦" : "Login"}</Text>
          </Pressable>
        </View>

        <Text style={styles.version}>v2.0.0</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#060d1a" },
  orb1: {
    position: "absolute", top: -80, left: -60,
    width: 260, height: 260, borderRadius: 130,
    backgroundColor: "#1d4ed8", opacity: 0.15,
  },
  orb2: {
    position: "absolute", bottom: 40, right: -80,
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: "#7c3aed", opacity: 0.12,
  },
  container: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },

  // Brand
  brandArea: { alignItems: "center", marginBottom: 32 },
  logoRing: {
    width: 84, height: 84, borderRadius: 24,
    backgroundColor: "#0f172a",
    borderWidth: 1.5, borderColor: "#1e3a5f",
    alignItems: "center", justifyContent: "center",
    marginBottom: 14,
    shadowColor: "#3b82f6", shadowOpacity: 0.3, shadowRadius: 16, elevation: 8,
  },
  logo:    { width: 54, height: 54 },
  brand:   { color: "#f8fafc", fontSize: 13, fontWeight: "800", letterSpacing: 2.5, marginBottom: 4 },
  tagline: { color: "#475569", fontSize: 13, fontWeight: "500" },

  // Card
  card: {
    backgroundColor: "#0f172a",
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: "#1e293b",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
  cardTitle: { color: "#f8fafc", fontSize: 22, fontWeight: "800", marginBottom: 22 },

  // Button
  button: {
    marginTop: 6,
    backgroundColor: "#2563eb",
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    shadowColor: "#2563eb",
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 6,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontWeight: "800", fontSize: 16, letterSpacing: 0.3 },

  version: { textAlign: "center", color: "#1e293b", fontWeight: "700", marginTop: 28 },
});

