import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { apiBaseHint, API_BASE } from "../config/api";
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
        <View style={styles.card}>
          <Text style={styles.title}>HAAPPII BILLING</Text>
          <Text style={styles.subtitle}>Mobile v2.0.0 - Phase 1</Text>

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

          <Text style={styles.hint}>API: {API_BASE}</Text>
          {apiBaseHint() ? <Text style={styles.warn}>{apiBaseHint()}</Text> : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#dbeafe" },
  container: { flex: 1, justifyContent: "center", padding: 20 },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  title: { fontSize: 22, fontWeight: "800", color: "#1d4ed8", textAlign: "center" },
  subtitle: { marginTop: 4, marginBottom: 14, textAlign: "center", color: "#475569" },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    backgroundColor: "#fff",
  },
  button: {
    marginTop: 4,
    backgroundColor: "#1d4ed8",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.65 },
  buttonText: { color: "#fff", fontWeight: "700" },
  hint: { marginTop: 12, fontSize: 12, color: "#334155" },
  warn: { marginTop: 6, fontSize: 12, color: "#b45309" },
});
