import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";

import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { WEB_APP_BASE } from "../config/api";

const emptyForm = {
  branch_name: "",
  address_line1: "",
  address_line2: "",
  city: "",
  state: "",
  country: "",
  pincode: "",
  type: "Branch",
  discount_enabled: false,
  discount_type: "flat",
  discount_value: "0",
  loyalty_points_percentage: "0",
  kot_required: true,
  receipt_required: true,
  feedback_qr_enabled: true,
  print_logo_enabled: true,
  order_live_tracking_enabled: true,
  invoice_whatsapp_enabled: false,
  invoice_whatsapp_country_code: "91",
  public_menu_enabled: false,
  public_menu_token: null,
  public_menu_slug: "",
  paper_size: "58mm",
  fssai_number: "",
  service_charge_required: false,
  service_charge_amount: "0",
  swiggy_enabled: false,
  zomato_enabled: false,
  swiggy_partner_id: "",
  zomato_partner_id: "",
  online_orders_auto_accept: false,
  online_orders_webhook_token: "",
  online_orders_signature_required: false,
  swiggy_webhook_secret: "",
  zomato_webhook_secret: "",
  online_orders_status_sync_enabled: true,
  online_orders_status_sync_strict: false,
  online_orders_status_sync_timeout_sec: "8",
  swiggy_status_sync_url: "",
  zomato_status_sync_url: "",
  swiggy_status_sync_token: "",
  zomato_status_sync_token: "",
  swiggy_status_sync_secret: "",
  zomato_status_sync_secret: "",
  upi_id: "",
  upi_id_2: "",
  upi_id_3: "",
  upi_id_4: "",
};

export default function BranchesScreen() {
  const { session } = useAuth();
  const roleLower = String(session?.role || session?.role_name || "").toLowerCase();
  const isAdmin = roleLower === "admin";

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [hotelShop, setHotelShop] = useState(false);
  const [showSecrets, setShowSecrets] = useState({});

  const setField = (key, value) => setForm((p) => ({ ...p, [key]: value }));
  const toggleSecret = (key) => setShowSecrets((p) => ({ ...p, [key]: !p[key] }));

  const load = useCallback(async (isRefresh) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await api.get("/branch/scoped");
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load branches");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    api.get("/shop/details")
      .then((res) => {
        const data = res.data || {};
        const type = String(data?.shop_type || data?.billing_type || "").trim().toLowerCase();
        setHotelShop(type === "hotel");
      })
      .catch(() => {});
  }, [load]);

  const openNew = () => {
    if (!isAdmin) return Alert.alert("Error", "Only Admin can create branches");
    setEditingId(null);
    setForm(emptyForm);
    setShowSecrets({});
    setModalOpen(true);
  };

  const openEdit = (b) => {
    const rawServiceChargeRequired = b?.service_charge_required;
    const rawServiceChargeAmount = Number(b?.service_charge_amount || 0);
    const normalizedServiceChargeRequired =
      typeof rawServiceChargeRequired === "boolean"
        ? rawServiceChargeRequired
        : rawServiceChargeAmount > 0;

    setEditingId(b.branch_id);
    setForm({
      ...emptyForm,
      ...b,
      branch_name: b?.branch_name || "",
      address_line1: b?.address_line1 || "",
      address_line2: b?.address_line2 || "",
      city: b?.city || "",
      state: b?.state || "",
      country: b?.country || "",
      pincode: b?.pincode || "",
      type: b?.type || "Branch",
      discount_enabled: Boolean(b?.discount_enabled),
      discount_type: (b?.discount_type || "flat").toLowerCase(),
      discount_value: String(b?.discount_value ?? 0),
      loyalty_points_percentage: String(b?.loyalty_points_percentage ?? 0),
      kot_required: b?.kot_required !== false,
      receipt_required: b?.receipt_required !== false,
      feedback_qr_enabled: b?.feedback_qr_enabled !== false,
      print_logo_enabled: b?.print_logo_enabled !== false,
      order_live_tracking_enabled: b?.order_live_tracking_enabled !== false,
      invoice_whatsapp_enabled: Boolean(b?.invoice_whatsapp_enabled),
      invoice_whatsapp_country_code: String(b?.invoice_whatsapp_country_code || "91"),
      public_menu_enabled: Boolean(b?.public_menu_enabled),
      public_menu_token: b?.public_menu_token || null,
      public_menu_slug: b?.public_menu_slug || "",
      paper_size: b?.paper_size || "58mm",
      fssai_number: b?.fssai_number || "",
      service_charge_required: normalizedServiceChargeRequired,
      service_charge_amount: String(rawServiceChargeAmount),
      upi_id: b?.upi_id || "",
      upi_id_2: b?.upi_id_2 || "",
      upi_id_3: b?.upi_id_3 || "",
      upi_id_4: b?.upi_id_4 || "",
      swiggy_enabled: Boolean(b?.swiggy_enabled),
      zomato_enabled: Boolean(b?.zomato_enabled),
      swiggy_partner_id: b?.swiggy_partner_id || "",
      zomato_partner_id: b?.zomato_partner_id || "",
      swiggy_webhook_secret: b?.swiggy_webhook_secret || "",
      zomato_webhook_secret: b?.zomato_webhook_secret || "",
      swiggy_status_sync_url: b?.swiggy_status_sync_url || "",
      zomato_status_sync_url: b?.zomato_status_sync_url || "",
      swiggy_status_sync_token: b?.swiggy_status_sync_token || "",
      zomato_status_sync_token: b?.zomato_status_sync_token || "",
      swiggy_status_sync_secret: b?.swiggy_status_sync_secret || "",
      zomato_status_sync_secret: b?.zomato_status_sync_secret || "",
      online_orders_auto_accept: Boolean(b?.online_orders_auto_accept),
      online_orders_webhook_token: b?.online_orders_webhook_token || "",
      online_orders_signature_required: Boolean(b?.online_orders_signature_required),
      online_orders_status_sync_enabled: b?.online_orders_status_sync_enabled !== false,
      online_orders_status_sync_strict: Boolean(b?.online_orders_status_sync_strict),
      online_orders_status_sync_timeout_sec: String(Number(b?.online_orders_status_sync_timeout_sec) || 8),
    });
    setShowSecrets({});
    setModalOpen(true);
  };

  const save = async () => {
    if (!isAdmin && !editingId) return Alert.alert("Error", "Only Admin can create branches");
    if (!form.branch_name.trim() || !form.city.trim() || !form.country.trim()) {
      return Alert.alert("Validation", "Branch Name, City & Country are required");
    }

    if (form.discount_enabled) {
      const discountType = String(form.discount_type || "flat").toLowerCase();
      const discountValue = Number(form.discount_value || 0);
      if (!discountValue || discountValue < 0) return Alert.alert("Validation", "Enter valid discount value");
      if (discountType === "percent" && discountValue > 100) {
        return Alert.alert("Validation", "Percent discount cannot exceed 100");
      }
    }

    if (hotelShop && form.service_charge_required) {
      const amount = Number(form.service_charge_amount || 0);
      if (!amount || amount < 0) return Alert.alert("Validation", "Enter a valid service charge amount");
    }

    if (form.invoice_whatsapp_enabled) {
      const countryCode = String(form.invoice_whatsapp_country_code || "").replace(/\D/g, "");
      if (!countryCode) return Alert.alert("Validation", "Enter a valid WhatsApp country code");
    }

    const loyaltyPointsPercentage = Number(form.loyalty_points_percentage || 0);
    if (Number.isNaN(loyaltyPointsPercentage) || loyaltyPointsPercentage < 0 || loyaltyPointsPercentage > 100) {
      return Alert.alert("Validation", "Enter loyalty points percentage between 0 and 100");
    }

    const timeout = Number(form.online_orders_status_sync_timeout_sec || 8);
    if (Number.isNaN(timeout) || timeout < 3 || timeout > 30) {
      return Alert.alert("Validation", "Status sync timeout must be between 3 and 30 seconds");
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        discount_value: Number(form.discount_value || 0),
        loyalty_points_percentage: Number(form.loyalty_points_percentage || 0),
        invoice_whatsapp_country_code: String(form.invoice_whatsapp_country_code || "91").replace(/\D/g, "") || "91",
        online_orders_status_sync_timeout_sec: timeout,
      };

      if (editingId) {
        await api.put(`/branch/${editingId}`, payload);
        Alert.alert("Saved", "Branch updated");
        load();
      } else {
        await api.post("/branch/create", payload);
        Alert.alert("Saved", "Branch created");
        setForm(emptyForm);
        setEditingId(null);
        setModalOpen(false);
        load();
      }
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (b) => {
    if (!isAdmin) return Alert.alert("Error", "Only Admin can change branch status");
    const next = String(b.status).toUpperCase() === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    try {
      await api.post(`/branch/${b.branch_id}/status?status=${next}`);
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to update status");
    }
  };

  const togglePublicMenu = async (checked) => {
    if (!editingId) {
      Alert.alert("Error", "Save the branch first, then enable public menu.");
      return;
    }
    try {
      const res = await api.post(`/branch/${editingId}/public-menu`, { enabled: checked });
      setForm((p) => ({
        ...p,
        public_menu_enabled: res.data?.enabled ?? checked,
        public_menu_token: res.data?.token || null,
        public_menu_slug: res.data?.slug || "",
      }));
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to toggle public menu");
    }
  };

  const shareLink = async (url) => {
    try { await Share.share({ message: url }); } catch { /* noop */ }
  };

  const renderItem = ({ item }) => {
    const active = String(item.status).toUpperCase() === "ACTIVE";
    return (
      <View style={st.card}>
        <Pressable onPress={() => openEdit(item)}>
          <View style={st.cardTop}>
            <Text style={st.name}>{item.branch_name}</Text>
            <View style={[st.badge, active ? st.badgeOn : st.badgeOff]}>
              <Text style={st.badgeText}>{active ? "Active" : "Inactive"}</Text>
            </View>
          </View>
          <Text style={st.meta}>{[item.address_line1, item.city, item.state].filter(Boolean).join(", ") || "No address set"}</Text>
          {(item.swiggy_enabled || item.zomato_enabled) && (
            <View style={st.integrationRow}>
              {item.swiggy_enabled && (
                <View style={[st.integrationBadge, st.swiggyBadge]}><Text style={st.integrationBadgeText}>Swiggy</Text></View>
              )}
              {item.zomato_enabled && (
                <View style={[st.integrationBadge, st.zomatoBadge]}><Text style={st.integrationBadgeText}>Zomato</Text></View>
              )}
            </View>
          )}
        </Pressable>
        <View style={st.cardActions}>
          <Pressable style={st.editBtn} onPress={() => openEdit(item)}><Text style={st.editBtnText}>Edit</Text></Pressable>
          {isAdmin && (
            <Pressable style={[st.statusBtn, active ? st.statusBtnOff : st.statusBtnOn]} onPress={() => toggleStatus(item)}>
              <Text style={[st.statusBtnText, active ? st.statusBtnTextOff : st.statusBtnTextOn]}>{active ? "Disable" : "Enable"}</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  const menuUrl = form.public_menu_token
    ? (form.public_menu_slug
        ? `${WEB_APP_BASE}/menu/${form.public_menu_slug}/${form.public_menu_token}`
        : `${WEB_APP_BASE}/menu/${form.public_menu_token}`)
    : "";

  return (
    <SafeAreaView style={st.safe}>
      {loading ? (
        <View style={st.center}><ActivityIndicator size="large" color="#6366f1" /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r, i) => String(r.branch_id || i)}
          renderItem={renderItem}
          contentContainerStyle={st.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          ListEmptyComponent={<View style={st.emptyWrap}><Text style={st.emptyIcon}>🏬</Text><Text style={st.emptyTitle}>No branches yet</Text></View>}
        />
      )}
      {isAdmin && (
        <Pressable style={st.fab} onPress={openNew}><Text style={st.fabText}>+ New Branch</Text></Pressable>
      )}

      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
        <View style={st.modalBackdrop}>
          <SafeAreaView style={st.modalSheet}>
            <View style={st.detailHeader}>
              <Pressable onPress={() => setModalOpen(false)}><Text style={st.backLink}>‹ Cancel</Text></Pressable>
              <Text style={st.detailTitle}>{editingId ? "Edit Branch" : "New Branch"}</Text>
            </View>

            <ScrollView contentContainerStyle={{ padding: 14, gap: 14 }}>
              {/* 1. Branch Details */}
              <Section title="Branch Details" subtitle="Basic information about this location">
                <FieldInput label="Branch Name" required value={form.branch_name} onChangeText={(v) => setField("branch_name", v)} placeholder="e.g. Main Store" />
                <View style={st.rowGap}>
                  <Text style={st.label}>Branch Type</Text>
                  <View style={st.lockedField}><Text style={st.lockedFieldText}>{form.type}</Text></View>
                </View>
                <FieldInput label="Address Line 1" value={form.address_line1} onChangeText={(v) => setField("address_line1", v)} placeholder="Street address" />
                <FieldInput label="Address Line 2" value={form.address_line2} onChangeText={(v) => setField("address_line2", v)} placeholder="Apt, suite, landmark" />
                <FieldInput label="City" required value={form.city} onChangeText={(v) => setField("city", v)} placeholder="City" />
                <FieldInput label="State" value={form.state} onChangeText={(v) => setField("state", v)} placeholder="State" />
                <FieldInput label="Country" required value={form.country} onChangeText={(v) => setField("country", v)} placeholder="Country" />
                <FieldInput label="Pincode" value={form.pincode} onChangeText={(v) => setField("pincode", v)} placeholder="Pincode / ZIP" keyboardType="numeric" />
              </Section>

              {/* 2. Default Discount */}
              <Section title="Default Discount" subtitle="Auto-apply a discount for this branch">
                <ToggleRow label="Enable default discount" hint="Applied automatically for this branch when supported." value={form.discount_enabled}
                  onValueChange={(v) => setForm((p) => ({ ...p, discount_enabled: v, discount_type: p.discount_type || "flat", discount_value: p.discount_value ?? "0" }))} />
                {form.discount_enabled && (
                  <>
                    <View style={st.chipRow}>
                      {["flat", "percent"].map((t) => (
                        <Pressable key={t} style={[st.chip, form.discount_type === t && st.chipActive]} onPress={() => setField("discount_type", t)}>
                          <Text style={[st.chipText, form.discount_type === t && st.chipTextActive]}>{t === "flat" ? "Flat (₹)" : "Percent (%)"}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <FieldInput label="Discount Value" value={String(form.discount_value)} onChangeText={(v) => setField("discount_value", v)} keyboardType="numeric" placeholder="0" />
                  </>
                )}
              </Section>

              {/* 3. Loyalty Points */}
              <Section title="Loyalty Points" subtitle="Award customer points as a percent of invoice total (0-100)">
                <FieldInput label="Points percentage" value={String(form.loyalty_points_percentage)} onChangeText={(v) => setField("loyalty_points_percentage", v)} keyboardType="numeric" placeholder="0" />
              </Section>

              {/* 4. Order Live Tracking (hotel only) */}
              {hotelShop && (
                <Section title="Order Live Tracking" subtitle="Control live tracking screens for this branch">
                  <ToggleRow label="Enable order live tracking" hint="Shows Order Live and KOT status management menus." value={form.order_live_tracking_enabled} onValueChange={(v) => setField("order_live_tracking_enabled", v)} />
                </Section>
              )}

              {/* 5. Printing */}
              <Section title="Printing" subtitle="Configure print behavior for this branch">
                <ToggleRow label="KOT required" hint="Print kitchen tickets for this branch." value={form.kot_required} onValueChange={(v) => setField("kot_required", v)} />
                <ToggleRow label="Receipt required" hint="Print customer receipts by default." value={form.receipt_required} onValueChange={(v) => setField("receipt_required", v)} />
                <ToggleRow label="Feedback QR on receipt" hint="Print feedback QR code at the bottom of receipts." value={form.feedback_qr_enabled} onValueChange={(v) => setField("feedback_qr_enabled", v)} />
                <ToggleRow label="Logo on receipt" hint="Print shop logo at the top of receipts." value={form.print_logo_enabled} onValueChange={(v) => setField("print_logo_enabled", v)} />
                <View style={st.rowGap}>
                  <Text style={st.label}>Paper Size</Text>
                  <View style={st.chipRow}>
                    {["58mm", "80mm"].map((size) => (
                      <Pressable key={size} style={[st.chip, form.paper_size === size && st.chipActive]} onPress={() => setField("paper_size", size)}>
                        <Text style={[st.chipText, form.paper_size === size && st.chipTextActive]}>{size}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <FieldInput label="FSSAI Number" value={form.fssai_number} onChangeText={(v) => setField("fssai_number", v)} placeholder="e.g. 11223344556677" />
              </Section>

              {/* 6. Invoice WhatsApp */}
              <Section title="Invoice WhatsApp" subtitle="Send the public invoice link to customers after successful billing">
                <ToggleRow label="Send invoice link on WhatsApp" hint="If customer mobile is valid, send the invoice link automatically after checkout." value={form.invoice_whatsapp_enabled} onValueChange={(v) => setField("invoice_whatsapp_enabled", v)} />
                <FieldInput label="Default Country Code" value={form.invoice_whatsapp_country_code} onChangeText={(v) => setField("invoice_whatsapp_country_code", v.replace(/\D/g, ""))} keyboardType="numeric" placeholder="91" />
              </Section>

              {/* 7. Public Menu */}
              <Section title="Public Menu" subtitle="Share a read-only menu link for this branch">
                <ToggleRow label="Enable public menu URL" hint="Generate a shareable link that shows your menu without login." value={form.public_menu_enabled} onValueChange={togglePublicMenu} />
                {form.public_menu_enabled && form.public_menu_token && (
                  <View style={st.menuBox}>
                    <Text style={st.menuBoxLabel}>Public Menu URL</Text>
                    <Text style={st.menuBoxUrl} selectable>{menuUrl}</Text>
                    <View style={st.menuQrWrap}>
                      <QRCode value={menuUrl} size={140} backgroundColor="#ffffff" color="#0B3C8C" />
                    </View>
                    <Pressable style={st.shareBtn} onPress={() => shareLink(menuUrl)}>
                      <Text style={st.shareBtnText}>Share Link</Text>
                    </Pressable>
                  </View>
                )}
              </Section>

              {/* 8. Service Charge (hotel only) */}
              {hotelShop && (
                <Section title="Service Charge" subtitle="Apply a fixed service charge for this branch">
                  <ToggleRow label="Service charge required" hint="Adds the configured amount to every table bill." value={form.service_charge_required}
                    onValueChange={(v) => setForm((p) => ({ ...p, service_charge_required: v, service_charge_amount: v ? (p.service_charge_amount || "0") : "0" }))} />
                  {form.service_charge_required && (
                    <FieldInput label="Service Charge Amount" value={String(form.service_charge_amount)} onChangeText={(v) => setField("service_charge_amount", v)} keyboardType="numeric" placeholder="0" />
                  )}
                </Section>
              )}

              {/* 9. UPI Payment */}
              <Section title="UPI Payment" subtitle="Add up to 4 UPI IDs — a separate QR code is generated for each at billing time">
                <FieldInput label="Primary UPI ID" value={form.upi_id} onChangeText={(v) => setField("upi_id", v.trim())} placeholder="e.g. shopname@upi" />
                <FieldInput label="UPI ID 2" value={form.upi_id_2} onChangeText={(v) => setField("upi_id_2", v.trim())} placeholder="e.g. owner@okaxis" />
                <FieldInput label="UPI ID 3" value={form.upi_id_3} onChangeText={(v) => setField("upi_id_3", v.trim())} placeholder="e.g. store@ybl" />
                <FieldInput label="UPI ID 4" value={form.upi_id_4} onChangeText={(v) => setField("upi_id_4", v.trim())} placeholder="e.g. billing@paytm" />
              </Section>

              {/* 10. Online Orders */}
              <Section title="Online Orders" subtitle="Delivery platform integrations and webhook settings">
                <ToggleRow label="Auto accept orders" hint="Accept new online orders automatically." value={form.online_orders_auto_accept} onValueChange={(v) => setField("online_orders_auto_accept", v)} />
                <ToggleRow label="Require webhook signature" hint="Reject unsigned webhooks." value={form.online_orders_signature_required} onValueChange={(v) => setField("online_orders_signature_required", v)} />
                <ToggleRow label="Enable status sync" hint="Send order status updates back to the provider." value={form.online_orders_status_sync_enabled} onValueChange={(v) => setField("online_orders_status_sync_enabled", v)} />
                <ToggleRow label="Strict sync mode" hint="Fail the action if provider sync call fails." value={form.online_orders_status_sync_strict} onValueChange={(v) => setField("online_orders_status_sync_strict", v)} />
                <FieldInput label="Fallback Webhook Token" value={form.online_orders_webhook_token} onChangeText={(v) => setField("online_orders_webhook_token", v)} placeholder="" />
                <FieldInput label="Status Sync Timeout (sec)" value={String(form.online_orders_status_sync_timeout_sec)} onChangeText={(v) => setField("online_orders_status_sync_timeout_sec", v)} keyboardType="numeric" placeholder="8" />

                <ProviderCard title="Swiggy" enabled={form.swiggy_enabled} onToggle={(v) => setField("swiggy_enabled", v)}>
                  <FieldInput label="Partner ID" value={form.swiggy_partner_id} onChangeText={(v) => setField("swiggy_partner_id", v)} />
                  <SecretInput label="Webhook Secret" value={form.swiggy_webhook_secret} onChangeText={(v) => setField("swiggy_webhook_secret", v)} show={!!showSecrets.swiggy_webhook_secret} onToggleShow={() => toggleSecret("swiggy_webhook_secret")} />
                  <FieldInput label="Status Sync URL" value={form.swiggy_status_sync_url} onChangeText={(v) => setField("swiggy_status_sync_url", v)} />
                  <SecretInput label="Status Sync Token" value={form.swiggy_status_sync_token} onChangeText={(v) => setField("swiggy_status_sync_token", v)} show={!!showSecrets.swiggy_status_sync_token} onToggleShow={() => toggleSecret("swiggy_status_sync_token")} />
                  <SecretInput label="Status Sync Secret" value={form.swiggy_status_sync_secret} onChangeText={(v) => setField("swiggy_status_sync_secret", v)} show={!!showSecrets.swiggy_status_sync_secret} onToggleShow={() => toggleSecret("swiggy_status_sync_secret")} />
                </ProviderCard>

                <ProviderCard title="Zomato" enabled={form.zomato_enabled} onToggle={(v) => setField("zomato_enabled", v)}>
                  <FieldInput label="Partner ID" value={form.zomato_partner_id} onChangeText={(v) => setField("zomato_partner_id", v)} />
                  <SecretInput label="Webhook Secret" value={form.zomato_webhook_secret} onChangeText={(v) => setField("zomato_webhook_secret", v)} show={!!showSecrets.zomato_webhook_secret} onToggleShow={() => toggleSecret("zomato_webhook_secret")} />
                  <FieldInput label="Status Sync URL" value={form.zomato_status_sync_url} onChangeText={(v) => setField("zomato_status_sync_url", v)} />
                  <SecretInput label="Status Sync Token" value={form.zomato_status_sync_token} onChangeText={(v) => setField("zomato_status_sync_token", v)} show={!!showSecrets.zomato_status_sync_token} onToggleShow={() => toggleSecret("zomato_status_sync_token")} />
                  <SecretInput label="Status Sync Secret" value={form.zomato_status_sync_secret} onChangeText={(v) => setField("zomato_status_sync_secret", v)} show={!!showSecrets.zomato_status_sync_secret} onToggleShow={() => toggleSecret("zomato_status_sync_secret")} />
                </ProviderCard>
              </Section>
            </ScrollView>

            <View style={st.detailActions}>
              <Pressable style={st.completeBtn} disabled={saving} onPress={save}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.completeBtnText}>{editingId ? "Save Changes" : "Create Branch"}</Text>}
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <View style={st.section}>
      <Text style={st.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={st.sectionSubtitle}>{subtitle}</Text> : null}
      <View style={{ gap: 10, marginTop: 8 }}>{children}</View>
    </View>
  );
}

function FieldInput({ label, required, value, onChangeText, placeholder, keyboardType }) {
  return (
    <View style={st.rowGap}>
      <Text style={st.label}>{label}{required ? <Text style={st.required}> *</Text> : null}</Text>
      <TextInput
        style={st.input}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
      />
    </View>
  );
}

function ToggleRow({ label, hint, value, onValueChange }) {
  return (
    <View style={st.toggleRow}>
      <View style={{ flex: 1, paddingRight: 10 }}>
        <Text style={st.toggleLabel}>{label}</Text>
        {hint ? <Text style={st.toggleHint}>{hint}</Text> : null}
      </View>
      <Switch value={!!value} onValueChange={onValueChange} trackColor={{ true: "#6366f1" }} />
    </View>
  );
}

function SecretInput({ label, value, onChangeText, show, onToggleShow }) {
  return (
    <View style={st.rowGap}>
      <Text style={st.label}>{label}</Text>
      <View style={st.secretRow}>
        <TextInput
          style={[st.input, { flex: 1 }]}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!show}
          placeholderTextColor="#94a3b8"
        />
        <Pressable style={st.secretToggle} onPress={onToggleShow}>
          <Text style={st.secretToggleText}>{show ? "Hide" : "Show"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ProviderCard({ title, enabled, onToggle, children }) {
  return (
    <View style={[st.providerCard, enabled && st.providerCardActive]}>
      <View style={st.providerHeader}>
        <Text style={st.providerTitle}>{title}</Text>
        <Switch value={!!enabled} onValueChange={onToggle} trackColor={{ true: "#6366f1" }} />
      </View>
      {enabled && <View style={{ gap: 10, marginTop: 10 }}>{children}</View>}
    </View>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f6fb" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 14, paddingBottom: 90, gap: 10 },
  card: { backgroundColor: "#fff", borderRadius: 16, borderWidth: 1.5, borderColor: "#e4e9f2", padding: 12, gap: 6 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontSize: 14, fontWeight: "800", color: "#0a0f1e", flex: 1 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeOn: { backgroundColor: "#ecfdf5" }, badgeOff: { backgroundColor: "#fef2f2" },
  badgeText: { fontSize: 10, fontWeight: "800", color: "#374151" },
  meta: { fontSize: 11, color: "#6b7280" },
  integrationRow: { flexDirection: "row", gap: 6, marginTop: 4 },
  integrationBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  swiggyBadge: { backgroundColor: "#fff7ed" },
  zomatoBadge: { backgroundColor: "#fef2f2" },
  integrationBadgeText: { fontSize: 9, fontWeight: "800", color: "#374151" },
  cardActions: { flexDirection: "row", gap: 8, marginTop: 6 },
  editBtn: { alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: "#eef2ff" },
  editBtnText: { color: "#6366f1", fontSize: 11, fontWeight: "800" },
  statusBtn: { alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  statusBtnOn: { backgroundColor: "#ecfdf5" },
  statusBtnOff: { backgroundColor: "#fef2f2" },
  statusBtnText: { fontSize: 11, fontWeight: "800" },
  statusBtnTextOn: { color: "#059669" },
  statusBtnTextOff: { color: "#dc2626" },
  emptyWrap: { alignItems: "center", paddingTop: 50, gap: 10 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { color: "#9ca3af", fontSize: 15, fontWeight: "700" },
  fab: { position: "absolute", right: 16, bottom: 20, backgroundColor: "#6366f1", borderRadius: 999, paddingHorizontal: 20, paddingVertical: 14, elevation: 4 },
  fabText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(10,15,30,0.4)", justifyContent: "flex-end" },
  modalSheet: { height: "94%", backgroundColor: "#f4f6fb", borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: "hidden" },
  detailHeader: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, backgroundColor: "#f4f6fb", borderBottomWidth: 1, borderBottomColor: "#e4e9f2" },
  backLink: { color: "#6366f1", fontWeight: "700", fontSize: 13 },
  detailTitle: { fontSize: 16, fontWeight: "800", color: "#0a0f1e" },
  section: { backgroundColor: "#fff", borderRadius: 16, borderWidth: 1.5, borderColor: "#e4e9f2", padding: 14 },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: "#0a0f1e" },
  sectionSubtitle: { fontSize: 11, color: "#6b7280", marginTop: 2 },
  rowGap: { gap: 6 },
  label: { fontSize: 12, fontWeight: "700", color: "#4b5563" },
  required: { color: "#ef4444" },
  input: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12, backgroundColor: "#f8f9fd", paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: "#0a0f1e" },
  lockedField: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12, backgroundColor: "#eef1f6", paddingHorizontal: 12, paddingVertical: 10 },
  lockedFieldText: { fontSize: 13, color: "#6b7280", fontWeight: "600" },
  chipRow: { flexDirection: "row", gap: 6 },
  chip: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9, justifyContent: "center", backgroundColor: "#f8f9fd" },
  chipActive: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  chipText: { fontSize: 12, fontWeight: "700", color: "#4b5563" },
  chipTextActive: { color: "#fff" },
  toggleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#f8f9fd", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  toggleLabel: { fontSize: 13, fontWeight: "700", color: "#374151" },
  toggleHint: { fontSize: 10, color: "#9ca3af", marginTop: 2 },
  secretRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  secretToggle: { paddingHorizontal: 10, paddingVertical: 10, borderRadius: 10, backgroundColor: "#eef2ff" },
  secretToggleText: { fontSize: 11, fontWeight: "800", color: "#6366f1" },
  menuBox: { backgroundColor: "#eef2ff", borderRadius: 14, borderWidth: 1, borderColor: "#c7d2fe", padding: 14, gap: 10, alignItems: "flex-start" },
  menuBoxLabel: { fontSize: 10, fontWeight: "800", color: "#4338ca", textTransform: "uppercase", letterSpacing: 0.5 },
  menuBoxUrl: { fontSize: 12, color: "#312e81", fontWeight: "600" },
  menuQrWrap: { alignSelf: "center", backgroundColor: "#fff", padding: 10, borderRadius: 12 },
  shareBtn: { backgroundColor: "#6366f1", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, alignSelf: "flex-start" },
  shareBtnText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  providerCard: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 14, padding: 12, backgroundColor: "#f8f9fd" },
  providerCardActive: { borderColor: "#6366f1", backgroundColor: "#eef2ff" },
  providerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  providerTitle: { fontSize: 13, fontWeight: "800", color: "#0a0f1e" },
  detailActions: { padding: 14, borderTopWidth: 1, borderTopColor: "#e4e9f2", backgroundColor: "#f4f6fb" },
  completeBtn: { paddingVertical: 13, borderRadius: 12, backgroundColor: "#6366f1", alignItems: "center" },
  completeBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
});
