import { useCallback, useEffect, useState } from "react";
import { useNavigation } from "@react-navigation/native";
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

const COST_METHODS = [
  { k: "LAST", label: "Last Cost" },
  { k: "WAVG", label: "Weighted Avg" },
  { k: "FIFO", label: "FIFO" },
];

const BLANK = {
  shop_name: "", owner_name: "", mobile: "", mailid: "",
  address_line1: "", address_line2: "", address_line3: "",
  city: "", state: "", pincode: "",
  gst_number: "", gst_enabled: false, gst_percent: "", gst_mode: "inclusive",
  upi_id: "", fssai_number: "", head_office_branch_id: null,
  inventory_enabled: false, inventory_cost_method: "LAST", items_branch_wise: false,
};

export default function ShopSettingsScreen() {
  const { session } = useAuth();
  const navigation = useNavigation();
  const userRole = session?.role || session?.role_name || "User";
  const normalizedRole = String(userRole || "").trim().toLowerCase();
  const isSuperAdmin = normalizedRole === "admin" || normalizedRole === "super admin";

  const [form, setForm] = useState(BLANK);
  const [billingType, setBillingType] = useState("");
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [shopRes, branchRes] = await Promise.all([
        api.get("/shop/details"),
        api.get("/branch/scoped").catch(() => ({ data: [] })),
      ]);
      const sd = shopRes.data || {};
      setBillingType(sd.billing_type || "");
      setForm({
        shop_name: sd.shop_name || "", owner_name: sd.owner_name || "", mobile: sd.mobile || "", mailid: sd.mailid || "",
        address_line1: sd.address_line1 || "", address_line2: sd.address_line2 || "", address_line3: sd.address_line3 || "",
        city: sd.city || "", state: sd.state || "", pincode: sd.pincode || "",
        gst_number: sd.gst_number || "", gst_enabled: !!sd.gst_enabled, gst_percent: String(sd.gst_percent ?? ""),
        gst_mode: sd.gst_mode || "inclusive",
        upi_id: sd.upi_id || "", fssai_number: sd.fssai_number || "",
        head_office_branch_id: sd.head_office_branch_id ?? null,
        inventory_enabled: !!sd.inventory_enabled,
        inventory_cost_method: String(sd.inventory_cost_method || "LAST").toUpperCase(),
        items_branch_wise: !!sd.items_branch_wise,
      });
      setBranches(Array.isArray(branchRes.data) ? branchRes.data : []);
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
      const payload = {
        ...form,
        gst_percent: form.gst_percent ? Number(form.gst_percent) : 0,
        head_office_branch_id: form.head_office_branch_id === "" || form.head_office_branch_id == null
          ? null
          : Number(form.head_office_branch_id),
      };
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

  const isHotel = String(billingType || "").toLowerCase() === "hotel";
  const activeBranches = branches
    .filter((b) => b?.branch_id)
    .slice()
    .sort((a, b) => String(a?.branch_name || "").localeCompare(String(b?.branch_name || "")));

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
            {field("upi_id", "UPI ID")}

            <Text style={st.sectionLabel}>Address</Text>
            {field("address_line1", "Address Line 1")}
            {field("address_line2", "Address Line 2")}
            {field("address_line3", "Address Line 3")}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>{field("city", "City")}</View>
              <View style={{ flex: 1 }}>{field("state", "State")}</View>
              <View style={{ width: 100 }}>{field("pincode", "Pincode", { keyboardType: "numeric" })}</View>
            </View>

            {isSuperAdmin && activeBranches.length > 0 && (
              <>
                <Text style={st.sectionLabel}>Preferred Head Office Branch</Text>
                <View style={st.chipRow}>
                  {activeBranches.map((b) => (
                    <Pressable
                      key={b.branch_id}
                      style={[st.chip, Number(form.head_office_branch_id) === Number(b.branch_id) && st.chipActive]}
                      onPress={() => setForm((p) => ({ ...p, head_office_branch_id: b.branch_id }))}
                    >
                      <Text style={[st.chipText, Number(form.head_office_branch_id) === Number(b.branch_id) && st.chipTextActive]}>{b.branch_name}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            <Text style={st.sectionLabel}>GST &amp; Taxes</Text>
            {isHotel && field("fssai_number", "FSSAI Number")}
            <View style={st.toggleRow}>
              <Text style={st.toggleLabel}>GST Enabled</Text>
              <Switch value={form.gst_enabled} onValueChange={(v) => setForm((p) => ({ ...p, gst_enabled: v }))} trackColor={{ true: "#6366f1" }} />
            </View>
            {form.gst_enabled && (
              <>
                {field("gst_number", "GSTIN")}
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ width: 90 }}>{field("gst_percent", "GST %", { keyboardType: "numeric" })}</View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.label}>GST Mode</Text>
                    <View style={st.chipRow}>
                      {["inclusive", "exclusive"].map((m) => (
                        <Pressable key={m} style={[st.chip, form.gst_mode === m && st.chipActive]} onPress={() => setForm((p) => ({ ...p, gst_mode: m }))}>
                          <Text style={[st.chipText, form.gst_mode === m && st.chipTextActive]}>{m === "inclusive" ? "Inclusive" : "Exclusive"}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                </View>
              </>
            )}

            <Text style={st.sectionLabel}>Inventory</Text>
            <View style={st.toggleRow}>
              <Text style={st.toggleLabel}>Inventory Tracking</Text>
              <Switch value={form.inventory_enabled} onValueChange={(v) => setForm((p) => ({ ...p, inventory_enabled: v }))} trackColor={{ true: "#6366f1" }} disabled={!isSuperAdmin} />
            </View>
            <View style={st.toggleRow}>
              <Text style={st.toggleLabel}>Branch-wise Items</Text>
              <Switch value={form.items_branch_wise} onValueChange={(v) => setForm((p) => ({ ...p, items_branch_wise: v }))} trackColor={{ true: "#6366f1" }} disabled={!isSuperAdmin} />
            </View>
            {form.inventory_enabled && (
              <>
                <Text style={st.label}>Cost Method</Text>
                <View style={st.chipRow}>
                  {COST_METHODS.map((c) => (
                    <Pressable
                      key={c.k}
                      style={[st.chip, form.inventory_cost_method === c.k && st.chipActive]}
                      onPress={() => isSuperAdmin && setForm((p) => ({ ...p, inventory_cost_method: c.k }))}
                    >
                      <Text style={[st.chipText, form.inventory_cost_method === c.k && st.chipTextActive]}>{c.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            <Pressable style={st.linkRow} onPress={() => navigation.navigate("CashDenominations")}>
              <Text style={st.linkRowText}>Cash Drawer Denominations</Text>
              <Text style={st.linkRowChevron}>›</Text>
            </Pressable>
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
  sectionLabel: { fontSize: 12, fontWeight: "800", color: "#4b5563", marginTop: 4, textTransform: "uppercase", letterSpacing: 0.4 },
  label: { fontSize: 11, fontWeight: "700", color: "#9ca3af", marginBottom: 4, textTransform: "uppercase" },
  input: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12, backgroundColor: "#fff", paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: "#0a0f1e" },
  toggleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, borderWidth: 1.5, borderColor: "#e4e9f2", paddingHorizontal: 12, paddingVertical: 12 },
  toggleLabel: { fontSize: 13, fontWeight: "700", color: "#374151" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: "#fff", borderWidth: 1.5, borderColor: "#e4e9f2" },
  chipActive: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  chipText: { fontSize: 12, fontWeight: "700", color: "#4b5563" },
  chipTextActive: { color: "#fff" },
  linkRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, borderWidth: 1.5, borderColor: "#e4e9f2", paddingHorizontal: 12, paddingVertical: 14, marginTop: 4 },
  linkRowText: { fontSize: 13, fontWeight: "700", color: "#374151" },
  linkRowChevron: { fontSize: 18, color: "#9ca3af", fontWeight: "700" },
  footer: { padding: 14, borderTopWidth: 1, borderTopColor: "#e4e9f2" },
  saveBtn: { paddingVertical: 14, borderRadius: 12, backgroundColor: "#6366f1", alignItems: "center" },
  saveBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
