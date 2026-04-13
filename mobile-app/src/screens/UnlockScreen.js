import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuth } from "../context/AuthContext";

export default function UnlockScreen() {
  const { session, securityConfig, unlockWithPin, unlockWithBiometric, unlockWithPassword } = useAuth();
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [busy, setBusy] = useState(false);

  const unlockByPin = async () => {
    const normalized = String(pin || "").trim();
    if (!normalized) {
      Alert.alert("PIN Required", "Enter your security PIN.");
      return;
    }
    setBusy(true);
    try {
      const ok = await unlockWithPin(normalized);
      if (!ok) {
        Alert.alert("Invalid PIN", "Entered PIN is incorrect.");
      }
    } finally {
      setBusy(false);
    }
  };

  const unlockByBiometric = async () => {
    setBusy(true);
    try {
      const result = await unlockWithBiometric();
      if (!result?.ok) {
        Alert.alert("Biometric Failed", String(result?.reason || "Unable to authenticate."));
      }
    } finally {
      setBusy(false);
    }
  };

  const unlockByPassword = async () => {
    const pwd = String(password || "");
    if (!pwd) {
      Alert.alert("Password Required", "Enter your account password.");
      return;
    }
    setBusy(true);
    try {
      const result = await unlockWithPassword(pwd);
      if (!result?.ok) {
        Alert.alert("Login Failed", String(result?.reason || "Unable to login with password."));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.card}>
        <Text style={styles.title}>Welcome Back</Text>
        <Text style={styles.subTitle} numberOfLines={1}>
          {session?.shop_id ? `Shop ${session.shop_id}` : "Haappii Billing"}
          {session?.user_name ? ` - ${session.user_name}` : ""}
        </Text>

        {securityConfig?.pinEnabled ? (
          <>
            <Text style={styles.label}>Enter PIN</Text>
            <TextInput
              style={styles.input}
              value={pin}
              onChangeText={setPin}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              placeholder="PIN"
              placeholderTextColor="#94a3b8"
            />
            <Pressable style={[styles.primaryBtn, busy && styles.disabled]} onPress={unlockByPin} disabled={busy}>
              <Text style={styles.primaryBtnText}>{busy ? "Please wait..." : "Unlock with PIN"}</Text>
            </Pressable>
          </>
        ) : null}

        {securityConfig?.biometricEnabled ? (
          <Pressable style={[styles.secondaryBtn, busy && styles.disabled]} onPress={unlockByBiometric} disabled={busy}>
            <Text style={styles.secondaryBtnText}>Unlock with Biometric</Text>
          </Pressable>
        ) : null}

        {showPasswordInput ? (
          <>
            <Text style={styles.label}>Enter Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Password"
              placeholderTextColor="#94a3b8"
            />
            <Pressable style={[styles.primaryBtn, busy && styles.disabled]} onPress={unlockByPassword} disabled={busy}>
              <Text style={styles.primaryBtnText}>{busy ? "Please wait..." : "Unlock with Password"}</Text>
            </Pressable>
          </>
        ) : null}

        <Pressable
          style={[styles.passwordBtn, busy && styles.disabled]}
          onPress={() => setShowPasswordInput((v) => !v)}
          disabled={busy}
        >
          <Text style={styles.passwordBtnText}>Forgot PIN? Login with Password</Text>
        </Pressable>

        {busy ? <ActivityIndicator size="small" color="#2563eb" style={{ marginTop: 8 }} /> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#0b1220",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  card: {
    width: "100%",
    borderRadius: 18,
    backgroundColor: "#111a2e",
    borderWidth: 1,
    borderColor: "#1f2a44",
    padding: 16,
    gap: 10,
  },
  title: { color: "#f8fafc", fontSize: 20, fontWeight: "800" },
  subTitle: { color: "#93c5fd", fontSize: 12, marginBottom: 6 },
  label: { color: "#94a3b8", fontSize: 12, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0f172a",
    borderRadius: 10,
    color: "#f8fafc",
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  primaryBtn: {
    borderRadius: 10,
    backgroundColor: "#2563eb",
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "800" },
  secondaryBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#1e293b",
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryBtnText: { color: "#e2e8f0", fontWeight: "700" },
  passwordBtn: {
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#475569",
    paddingVertical: 11,
    alignItems: "center",
    backgroundColor: "#0f172a",
  },
  passwordBtnText: { color: "#cbd5e1", fontWeight: "700", fontSize: 12 },
  disabled: { opacity: 0.7 },
});
