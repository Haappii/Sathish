import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import api from "../api/client";
import { useAuth } from "../context/AuthContext";

const BLANK = {
  shop_name: "", owner_name: "", mobile: "", mailid: "",
  address_line1: "", city: "", state: "", pincode: "",
  gst_number: "", gst_enabled: false, gst_percent: "", upi_id: "", fssai_number: "",
  inventory_enabled: false,
};

export default function ShopSettingsScreen() {
  const { session } = useAuth();
  const userRole = session?.role || session?.role_name || "User";

  const [form, setForm] = useState(BLANK);
  const [billingType, setBillingType] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/shop/details");
      const sd = res.data || {};
      setBillingType(sd.billing_type || "");
      setForm({
        shop_name: sd.shop_name || "", owner_name: sd.owner_name || "", mobile: sd.mobile || "", mailid: sd.mailid || "",
        address_line1: sd.address_line1 || "", city: sd.city || "", state: sd.state || "", pincode: sd.pincode || "",
        gst_number: sd.gst_number || "", gst_enabled: !!sd.gst_enabled, gst_percent: String(sd.gst_percent ?? ""),
        upi_id: sd.upi_id || "", fssai_number: sd.fssai_number || "", inventory_enabled: !!sd.inventory_enabled,
      });
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load shop details");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.shop_name.trim()) return Alert.alert("Validation", "Shop name is required");
    setSaving(true);
    try {
      const payload = { ...form, gst_percent: form.gst_percent ? Number(form.gst_percent) : 0 };
      await api.post("/shop/", payload, { headers: { "x-user-role": userRole } });
      Alert.alert("Saved", "Shop settings updated");
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <SafeAreaView style={st.safe}><View style={st.center}><ActivityIndicator size="large" color="#6366f1" /></View></SafeAreaView>;
  }

  const field = (key, label, opts = {}) => (
    <View key={key}>
      <Text style={st.label}>{label}</Text>
      <TextInput
        style={st.input}
        placeholderTextColor="#94a3b8"
        value={form[key]}
        onChangeText={(v) => setForm((p) => ({ ...p, [key]: v }))}
        {...opts}
      />
    </View>
  );

  return (
    <SafeAreaView style={st.safe}>
      <FlatList
        data={[1]}
        keyExtractor={() => "form"}
        contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 100 }}
        renderItem={() => (
          <View style={{ gap: 12 }}>
            {billingType ? <Text style={st.badgeType}>Billing Type: {billingType.toUpperCase()} (fixed at signup)</Text> : null}
            {field("shop_name", "Shop Name")}
            {field("owner_name", "Owner Name")}
            {field("mobile", "Mobile", { keyboardType: "phone-pad" })}
            {field("mailid", "Email", { keyboardType: "email-address" })}
            {field("address_line1", "Address")}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>{field("city", "City")}</View>
              <View style={{ flex: 1 }}>{field("state", "State")}</View>
              <View style={{ width: 100 }}>{field("pincode", "Pincode", { keyboardType: "numeric" })}</View>
            </View>
            <View style={st.toggleRow}>
              <Text style={st.toggleLabel}>GST Enabled</Text>
              <Switch value={form.gst_enabled} onValueChange={(v) => setForm((p) => ({ ...p, gst_enabled: v }))} trackColor={{ true: "#6366f1" }} />
            </View>
            {form.gst_enabled && (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>{field("gst_number", "GSTIN")}</View>
                <View style={{ width: 90 }}>{field("gst_percent", "GST %", { keyboardType: "numeric" })}</View>
              </View>
            )}
            {field("upi_id", "UPI ID")}
            {field("fssai_number", "FSSAI Number")}
            <View style={st.toggleRow}>
              <Text style={st.toggleLabel}>Inventory Tracking</Text>
              <Switch value={form.inventory_enabled} onValueChange={(v) => setForm((p) => ({ ...p, inventory_enabled: v }))} trackColor={{ true: "#6366f1" }} />
            </View>
          </View>
        )}
      />
      <View style={st.footer}>
        <Pressable style={st.saveBtn} disabled={saving} onPress={save}>
          {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.saveBtnText}>Save Changes</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f6fb" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  badgeType: { fontSize: 11, color: "#6366f1", fontWeight: "700", backgroundColor: "#eef2ff", padding: 8, borderRadius: 10 },
  label: { fontSize: 11, fontWeight: "700", color: "#9ca3af", marginBottom: 4, textTransform: "uppercase" },
  input: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12, backgroundColor: "#fff", paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: "#0a0f1e" },
  toggleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, borderWidth: 1.5, borderColor: "#e4e9f2", paddingHorizontal: 12, paddingVertical: 12 },
  toggleLabel: { fontSize: 13, fontWeight: "700", color: "#374151" },
  footer: { padding: 14, borderTopWidth: 1, borderTopColor: "#e4e9f2" },
  saveBtn: { paddingVertical: 14, borderRadius: 12, backgroundColor: "#6366f1", alignItems: "center" },
  saveBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
