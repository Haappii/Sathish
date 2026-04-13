import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { authApi } from "../api/client";
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
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerStep, setRegisterStep] = useState(0);
  const [registering, setRegistering] = useState(false);
  const [regForm, setRegForm] = useState({
    shop_name: "",
    billing_type: "store",
    city: "",
    state: "",
    name: "",
    email: "",
    phone: "",
    message: "",
  });

  const setReg = (k, v) => setRegForm((p) => ({ ...p, [k]: v }));

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

  const validateRegisterStep = () => {
    if (registerStep === 0) {
      if (!regForm.shop_name.trim()) return "Shop name is required";
      if (!["store", "hotel"].includes(regForm.billing_type)) return "Business type is required";
      return null;
    }
    if (!regForm.name.trim()) return "Your name is required";
    if (!regForm.email.includes("@")) return "Valid email is required";
    return null;
  };

  const nextRegisterStep = () => {
    const err = validateRegisterStep();
    if (err) return Alert.alert("Validation", err);
    setRegisterStep(1);
  };

  const submitRegistration = async () => {
    const err = validateRegisterStep();
    if (err) return Alert.alert("Validation", err);

    setRegistering(true);
    try {
      const res = await authApi.post("/platform/onboard/requests", {
        shop_name: regForm.shop_name,
        billing_type: regForm.billing_type,
        city: regForm.city,
        state: regForm.state,
        branch_name: regForm.shop_name,
        branch_city: regForm.city,
        branch_state: regForm.state,
        owner_name: regForm.name,
        mailid: regForm.email,
        mobile: regForm.phone,
        requester_name: regForm.name,
        requester_email: regForm.email,
        requester_phone: regForm.phone,
        business: regForm.billing_type === "store" ? "Store / Retail" : "Hotel / Restaurant",
        message: regForm.message,
      });
      Alert.alert("Request Sent", `Registration request submitted. Request ID: ${res?.data?.request_id || "-"}`);
      setRegisterOpen(false);
      setRegisterStep(0);
      setRegForm({
        shop_name: "",
        billing_type: "store",
        city: "",
        state: "",
        name: "",
        email: "",
        phone: "",
        message: "",
      });
    } catch (err2) {
      const detail = err2?.response?.data?.detail;
      const message = Array.isArray(detail)
        ? detail.map((row) => String(row?.msg || "Invalid value")).join("\n")
        : String(detail || err2?.message || "Request failed");
      Alert.alert("Failed", message);
    } finally {
      setRegistering(false);
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
            <Text style={styles.buttonText}>{loading ? "Signing In..." : "Login"}</Text>
          </Pressable>

          <Pressable
            style={styles.registerBtn}
            onPress={() => {
              setRegisterStep(0);
              setRegisterOpen(true);
            }}
          >
            <Text style={styles.registerBtnText}>Register Business</Text>
          </Pressable>
        </View>

        <Text style={styles.version}>v2.0.0</Text>
      </KeyboardAvoidingView>

      <Modal
        visible={registerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setRegisterOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Business Registration</Text>
              <Pressable onPress={() => setRegisterOpen(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.stepWrap}>
              <View style={[styles.stepPill, registerStep === 0 && styles.stepPillActive]}>
                <Text style={[styles.stepPillText, registerStep === 0 && styles.stepPillTextActive]}>1. Business</Text>
              </View>
              <View style={[styles.stepPill, registerStep === 1 && styles.stepPillActive]}>
                <Text style={[styles.stepPillText, registerStep === 1 && styles.stepPillTextActive]}>2. Contact</Text>
              </View>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody}>
              {registerStep === 0 ? (
                <>
                  <Field
                    label="Shop Name"
                    placeholder="Enter shop name"
                    value={regForm.shop_name}
                    onChangeText={(v) => setReg("shop_name", v)}
                  />

                  <Text style={styles.choiceLabel}>Business Type</Text>
                  <View style={styles.choiceRow}>
                    <Pressable
                      style={[styles.choiceBtn, regForm.billing_type === "store" && styles.choiceBtnActive]}
                      onPress={() => setReg("billing_type", "store")}
                    >
                      <Text style={[styles.choiceBtnText, regForm.billing_type === "store" && styles.choiceBtnTextActive]}>Store / Retail</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.choiceBtn, regForm.billing_type === "hotel" && styles.choiceBtnActive]}
                      onPress={() => setReg("billing_type", "hotel")}
                    >
                      <Text style={[styles.choiceBtnText, regForm.billing_type === "hotel" && styles.choiceBtnTextActive]}>Hotel / Restaurant</Text>
                    </Pressable>
                  </View>

                  <Field
                    label="City"
                    placeholder="Enter city"
                    value={regForm.city}
                    onChangeText={(v) => setReg("city", v)}
                  />
                  <Field
                    label="State"
                    placeholder="Enter state"
                    value={regForm.state}
                    onChangeText={(v) => setReg("state", v)}
                  />

                  <Pressable style={styles.modalPrimaryBtn} onPress={nextRegisterStep}>
                    <Text style={styles.modalPrimaryBtnText}>Continue</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Field
                    label="Your Name"
                    placeholder="Enter your name"
                    value={regForm.name}
                    onChangeText={(v) => setReg("name", v)}
                  />
                  <Field
                    label="Email"
                    placeholder="Enter email"
                    value={regForm.email}
                    onChangeText={(v) => setReg("email", v)}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                  <Field
                    label="Phone"
                    placeholder="Enter phone"
                    value={regForm.phone}
                    onChangeText={(v) => setReg("phone", v)}
                    keyboardType="phone-pad"
                  />

                  <View style={fieldStyles.wrap}>
                    <Text style={fieldStyles.label}>Message (optional)</Text>
                    <TextInput
                      style={[fieldStyles.input, styles.messageInput]}
                      placeholderTextColor="#475569"
                      value={regForm.message}
                      onChangeText={(v) => setReg("message", v)}
                      multiline
                      textAlignVertical="top"
                      placeholder="Tell us your setup needs"
                    />
                  </View>

                  <View style={styles.modalActionRow}>
                    <Pressable style={styles.modalGhostBtn} onPress={() => setRegisterStep(0)}>
                      <Text style={styles.modalGhostBtnText}>Back</Text>
                    </Pressable>
                    <Pressable style={[styles.modalPrimaryBtn, registering && styles.buttonDisabled]} onPress={submitRegistration} disabled={registering}>
                      {registering ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.modalPrimaryBtnText}>Submit</Text>}
                    </Pressable>
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  registerBtn: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#111b2f",
  },
  registerBtnText: { color: "#bfdbfe", fontWeight: "700", fontSize: 14 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#0f172a",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: "92%",
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  modalHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  modalTitle: { color: "#f8fafc", fontWeight: "800", fontSize: 17 },
  modalClose: { color: "#94a3b8", fontSize: 18, fontWeight: "700" },
  stepWrap: { flexDirection: "row", gap: 8, paddingHorizontal: 18, paddingTop: 12 },
  stepPill: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#0b1220",
  },
  stepPillActive: { borderColor: "#2563eb", backgroundColor: "#1e3a8a" },
  stepPillText: { color: "#64748b", fontSize: 12, fontWeight: "700" },
  stepPillTextActive: { color: "#dbeafe" },
  modalBody: { padding: 18, paddingBottom: 28 },
  choiceLabel: { color: "#94a3b8", fontSize: 11, fontWeight: "700", letterSpacing: 0.8, marginBottom: 6, textTransform: "uppercase" },
  choiceRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  choiceBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#111b2f",
  },
  choiceBtnActive: { borderColor: "#2563eb", backgroundColor: "#1e3a8a" },
  choiceBtnText: { color: "#94a3b8", fontWeight: "700", fontSize: 12 },
  choiceBtnTextActive: { color: "#dbeafe" },
  messageInput: { minHeight: 80 },
  modalActionRow: { flexDirection: "row", gap: 10 },
  modalPrimaryBtn: {
    marginTop: 4,
    flex: 1,
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  modalPrimaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  modalGhostBtn: {
    marginTop: 4,
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    paddingVertical: 13,
    alignItems: "center",
    backgroundColor: "#111b2f",
  },
  modalGhostBtnText: { color: "#bfdbfe", fontWeight: "700", fontSize: 14 },

  version: { textAlign: "center", color: "#1e293b", fontWeight: "700", marginTop: 28 },
});

