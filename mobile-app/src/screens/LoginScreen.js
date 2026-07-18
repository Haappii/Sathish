import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
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

function Field({ label, icon, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={fi.wrap}>
      <Text style={fi.label}>{label}</Text>
      <View style={[fi.row, focused && fi.rowFocused]}>
        {icon && <Text style={fi.icon}>{icon}</Text>}
        <TextInput
          style={fi.input}
          placeholderTextColor="rgba(255,255,255,0.25)"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...props}
        />
      </View>
    </View>
  );
}
const fi = StyleSheet.create({
  wrap: { marginBottom: 20 },
  label: { color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 8, textTransform: "uppercase" },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 16, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.08)", paddingHorizontal: 16 },
  rowFocused: { borderColor: "#818cf8", backgroundColor: "rgba(129,140,248,0.08)" },
  icon: { fontSize: 18, marginRight: 12, opacity: 0.5 },
  input: { flex: 1, color: "#fff", fontSize: 16, fontWeight: "500", paddingVertical: 15 },
});

export default function LoginScreen() {
  const { login } = useAuth();
  const [form, setForm] = useState({ shop_id: "", username: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerStep, setRegisterStep] = useState(0);
  const [registering, setRegistering] = useState(false);
  const [regForm, setRegForm] = useState({
    shop_name: "", billing_type: "store", city: "", state: "",
    name: "", email: "", phone: "", message: "",
  });
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }).start();
  }, []);

  const setReg = (k, v) => setRegForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.shop_id.trim()) { Alert.alert("Validation", "Enter Shop ID"); return; }
    if (!form.username.trim() || !form.password) { Alert.alert("Validation", "Enter username and password"); return; }
    setLoading(true);
    try { await login(form); }
    catch (err) { Alert.alert("Login Failed", String(err?.response?.data?.detail || err?.message || "Login failed")); }
    finally { setLoading(false); }
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
        shop_name: regForm.shop_name, billing_type: regForm.billing_type,
        city: regForm.city, state: regForm.state,
        branch_name: regForm.shop_name, branch_city: regForm.city, branch_state: regForm.state,
        owner_name: regForm.name, mailid: regForm.email, mobile: regForm.phone,
        requester_name: regForm.name, requester_email: regForm.email, requester_phone: regForm.phone,
        business: regForm.billing_type === "store" ? "Store / Retail" : "Hotel / Restaurant",
        message: regForm.message,
      });
      Alert.alert("Request Received", `Your request has been saved (ID: ${res?.data?.request_id || "-"}).\n\nWe'll send login credentials to ${regForm.email} shortly.`);
      setRegisterOpen(false); setRegisterStep(0);
      setRegForm({ shop_name: "", billing_type: "store", city: "", state: "", name: "", email: "", phone: "", message: "" });
    } catch (err2) {
      const detail = err2?.response?.data?.detail;
      Alert.alert("Failed", Array.isArray(detail) ? detail.map((r) => String(r?.msg || "Invalid")).join("\n") : String(detail || err2?.message || "Request failed"));
    } finally { setRegistering(false); }
  };

  return (
    <SafeAreaView style={s.safe}>
      {/* Gradient-like layered background */}
      <View style={s.bgLayer1} />
      <View style={s.bgLayer2} />
      <View style={s.bgLayer3} />
      <View style={s.bgLayer4} />
      <View style={s.bgMesh1} />
      <View style={s.bgMesh2} />

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Brand */}
          <Animated.View style={[s.brand, { opacity: fadeAnim }]}>
            <View style={s.logoContainer}>
              <View style={s.logoGlow} />
              <View style={s.logoBox}>
                <Image source={require("../../assets/app_logo.png")} style={s.logo} resizeMode="contain" />
              </View>
            </View>
            <Text style={s.brandName}>Haappii Billing</Text>
            <Text style={s.brandTag}>POS & Shop Management</Text>
          </Animated.View>

          {/* Glass Card */}
          <View style={s.card}>
            <View style={s.cardShine} />
            <Text style={s.cardTitle}>Sign in</Text>
            <Text style={s.cardSub}>Enter your credentials to continue</Text>

            <Field icon="🏪" label="Shop ID" placeholder="Your shop ID" value={form.shop_id}
              onChangeText={(v) => setForm((p) => ({ ...p, shop_id: v }))} autoCapitalize="none" />
            <Field icon="👤" label="Username" placeholder="Your username" value={form.username}
              onChangeText={(v) => setForm((p) => ({ ...p, username: v }))} autoCapitalize="none" />
            <Field icon="🔒" label="Password" placeholder="Your password" value={form.password}
              onChangeText={(v) => setForm((p) => ({ ...p, password: v }))} secureTextEntry />

            <Pressable style={({ pressed }) => [s.btn, pressed && s.btnPressed, loading && { opacity: 0.6 }]} disabled={loading} onPress={submit}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Sign In</Text>}
            </Pressable>

            <View style={s.orRow}>
              <View style={s.orLine} />
              <Text style={s.orText}>or</Text>
              <View style={s.orLine} />
            </View>

            <Pressable style={({ pressed }) => [s.regBtn, pressed && { opacity: 0.7 }]}
              onPress={() => { setRegisterStep(0); setRegisterOpen(true); }}>
              <Text style={s.regBtnText}>Register New Business</Text>
              <Text style={s.regArrow}>→</Text>
            </Pressable>
          </View>

          <Text style={s.ver}>v2.3.0</Text>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Register Modal */}
      <Modal visible={registerOpen} animationType="slide" transparent onRequestClose={() => setRegisterOpen(false)}>
        <View style={s.mOverlay}>
          <View style={s.mCard}>
            <View style={s.mHead}>
              <View>
                <Text style={s.mTitle}>Register Business</Text>
                <Text style={s.mSub}>Step {registerStep + 1} of 2</Text>
              </View>
              <Pressable onPress={() => setRegisterOpen(false)} style={s.mClose}>
                <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 18, fontWeight: "700" }}>✕</Text>
              </Pressable>
            </View>

            <View style={s.mProgress}>
              <View style={[s.mProgressBar, { width: registerStep === 0 ? "50%" : "100%" }]} />
            </View>

            <ScrollView contentContainerStyle={s.mBody} keyboardShouldPersistTaps="handled">
              {registerStep === 0 ? (
                <>
                  <Field label="Shop Name" placeholder="Enter shop name" value={regForm.shop_name} onChangeText={(v) => setReg("shop_name", v)} />
                  <Text style={fi.label}>Business Type</Text>
                  <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
                    {[{ k: "store", l: "Store / Retail", i: "🏪" }, { k: "hotel", l: "Hotel / Restaurant", i: "🍽️" }].map((t) => (
                      <Pressable key={t.k} style={[s.typeBtn, regForm.billing_type === t.k && s.typeBtnOn]} onPress={() => setReg("billing_type", t.k)}>
                        <Text style={{ fontSize: 24 }}>{t.i}</Text>
                        <Text style={[s.typeTxt, regForm.billing_type === t.k && s.typeTxtOn]}>{t.l}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Field label="City" placeholder="City" value={regForm.city} onChangeText={(v) => setReg("city", v)} />
                  <Field label="State" placeholder="State" value={regForm.state} onChangeText={(v) => setReg("state", v)} />
                  <Pressable style={s.btn} onPress={nextRegisterStep}><Text style={s.btnText}>Continue</Text></Pressable>
                </>
              ) : (
                <>
                  <Field label="Your Name" placeholder="Full name" value={regForm.name} onChangeText={(v) => setReg("name", v)} />
                  <Field label="Email" placeholder="Email address" value={regForm.email} onChangeText={(v) => setReg("email", v)} autoCapitalize="none" keyboardType="email-address" />
                  <Field label="Phone" placeholder="Phone number" value={regForm.phone} onChangeText={(v) => setReg("phone", v)} keyboardType="phone-pad" />
                  <View style={fi.wrap}>
                    <Text style={fi.label}>Message (optional)</Text>
                    <View style={fi.row}><TextInput style={[fi.input, { minHeight: 80 }]} placeholderTextColor="rgba(255,255,255,0.25)" value={regForm.message} onChangeText={(v) => setReg("message", v)} multiline textAlignVertical="top" placeholder="Setup requirements" /></View>
                  </View>
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    <Pressable style={[s.regBtn, { flex: 1 }]} onPress={() => setRegisterStep(0)}><Text style={s.regBtnText}>Back</Text></Pressable>
                    <Pressable style={[s.btn, { flex: 1 }, registering && { opacity: 0.6 }]} onPress={submitRegistration} disabled={registering}>
                      {registering ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Submit</Text>}
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

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#030712" },

  // Layered gradient background
  bgLayer1: { ...StyleSheet.absoluteFillObject, backgroundColor: "#030712" },
  bgLayer2: { position: "absolute", top: -100, right: -80, width: 400, height: 400, borderRadius: 200, backgroundColor: "#4f46e5", opacity: 0.12 },
  bgLayer3: { position: "absolute", bottom: -150, left: -120, width: 450, height: 450, borderRadius: 225, backgroundColor: "#7c3aed", opacity: 0.08 },
  bgLayer4: { position: "absolute", top: "35%", left: "20%", width: 300, height: 300, borderRadius: 150, backgroundColor: "#06b6d4", opacity: 0.05 },
  bgMesh1: { position: "absolute", top: 60, right: 40, width: 2, height: 120, backgroundColor: "rgba(255,255,255,0.03)", transform: [{ rotate: "25deg" }] },
  bgMesh2: { position: "absolute", bottom: 100, left: 30, width: 2, height: 160, backgroundColor: "rgba(255,255,255,0.02)", transform: [{ rotate: "-15deg" }] },

  scroll: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 28, paddingVertical: 50 },

  // Brand
  brand: { alignItems: "center", marginBottom: 44 },
  logoContainer: { marginBottom: 24, alignItems: "center", justifyContent: "center" },
  logoGlow: { position: "absolute", width: 120, height: 120, borderRadius: 60, backgroundColor: "#6366f1", opacity: 0.2 },
  logoBox: {
    width: 88, height: 88, borderRadius: 28, backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#6366f1", shadowOpacity: 0.4, shadowRadius: 30, shadowOffset: { width: 0, height: 10 }, elevation: 20,
  },
  logo: { width: 56, height: 56 },
  brandName: { color: "#fff", fontSize: 28, fontWeight: "900", letterSpacing: -0.5 },
  brandTag: { color: "rgba(255,255,255,0.35)", fontSize: 14, fontWeight: "500", marginTop: 6, letterSpacing: 0.5 },

  // Glass card
  card: {
    backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 32, padding: 28,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  cardShine: {
    position: "absolute", top: -80, right: -40, width: 200, height: 200, borderRadius: 100,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  cardTitle: { color: "#fff", fontSize: 28, fontWeight: "900", letterSpacing: -0.5 },
  cardSub: { color: "rgba(255,255,255,0.4)", fontSize: 14, marginTop: 6, marginBottom: 28 },

  // Primary button
  btn: {
    backgroundColor: "#6366f1", borderRadius: 16, paddingVertical: 17, alignItems: "center",
    shadowColor: "#6366f1", shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 10,
  },
  btnPressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 16, letterSpacing: 0.3 },

  // OR divider
  orRow: { flexDirection: "row", alignItems: "center", marginVertical: 20, gap: 14 },
  orLine: { flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.08)" },
  orText: { color: "rgba(255,255,255,0.3)", fontSize: 12, fontWeight: "600" },

  // Register button
  regBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
    paddingVertical: 15, backgroundColor: "rgba(255,255,255,0.04)", gap: 8,
  },
  regBtnText: { color: "#a5b4fc", fontWeight: "700", fontSize: 14 },
  regArrow: { color: "#a5b4fc", fontSize: 16, fontWeight: "700" },

  ver: { textAlign: "center", color: "rgba(255,255,255,0.12)", fontWeight: "700", marginTop: 36, fontSize: 12 },

  // Modal
  mOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  mCard: { backgroundColor: "#0f1729", borderTopLeftRadius: 32, borderTopRightRadius: 32, maxHeight: "92%", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderBottomWidth: 0 },
  mHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, paddingTop: 24, paddingBottom: 12 },
  mTitle: { color: "#fff", fontWeight: "900", fontSize: 20 },
  mSub: { color: "rgba(255,255,255,0.4)", fontSize: 12, fontWeight: "600", marginTop: 2 },
  mClose: { width: 40, height: 40, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  mProgress: { height: 3, backgroundColor: "rgba(255,255,255,0.06)", marginHorizontal: 24, borderRadius: 2, marginBottom: 8 },
  mProgressBar: { height: 3, backgroundColor: "#6366f1", borderRadius: 2 },
  mBody: { padding: 24, paddingBottom: 40 },

  typeBtn: {
    flex: 1, alignItems: "center", gap: 8, paddingVertical: 16,
    borderRadius: 16, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  typeBtnOn: { borderColor: "#6366f1", backgroundColor: "rgba(99,102,241,0.12)" },
  typeTxt: { color: "rgba(255,255,255,0.4)", fontSize: 12, fontWeight: "700" },
  typeTxtOn: { color: "#c7d2fe" },
});
