import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import QRCode from "react-native-qrcode-svg";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { WEB_APP_BASE } from "../config/api";
import { printAdvanceOrderReceipt } from "../utils/printInvoice";

const fmt = (v) => `₹${Number(v || 0).toFixed(2)}`;

const STATUS_COLORS = {
  PENDING: "#d97706",
  CONFIRMED: "#2563eb",
  READY: "#7c3aed",
  COMPLETED: "#059669",
  CANCELLED: "#dc2626",
};
const STATUS_LIST = ["PENDING", "CONFIRMED", "READY", "COMPLETED", "CANCELLED"];
const PAYMENT_MODES = ["CASH", "UPI", "CARD"];

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const isAbsoluteUrl = (v) => /^https?:\/\//i.test(String(v || ""));

const resolveItemImageUrl = (item) => {
  const raw = String(
    item?.image_url || item?.image || item?.item_image || item?.image_path || item?.photo || item?.thumbnail || ""
  ).trim();
  if (!raw) return "";
  if (raw.startsWith("data:") || isAbsoluteUrl(raw)) return raw;
  if (raw.startsWith("/")) return `${WEB_APP_BASE}${raw}`;
  return `${WEB_APP_BASE}/${raw}`;
};

const normalizeOrderItems = (items) => {
  const rows = Array.isArray(items) ? items : [];
  return rows.map((it) => {
    const qty = Math.max(1, toNum(it?.qty || 1));
    const rate = Math.max(0, toNum(it?.rate ?? it?.price ?? 0));
    return {
      item_id: it?.item_id || null,
      item_name: String(it?.item_name || "Item"),
      qty,
      rate,
      amount: Number((qty * rate).toFixed(2)),
    };
  });
};

const sumOrderItems = (items) => normalizeOrderItems(items).reduce((acc, it) => acc + toNum(it.amount), 0);

const toPaid = (order) => Number(order?.amount_paid ?? order?.advance_amount ?? 0);
const toDue = (order) => Number(order?.due_amount ?? Math.max(0, Number(order?.total_amount || 0) - toPaid(order)));
const paymentStatusFor = (order) => {
  if (order?.payment_status) return String(order.payment_status);
  const paid = toPaid(order);
  const due = toDue(order);
  if (due <= 0) return "PAID";
  if (paid > 0) return "PARTIAL";
  return "UNPAID";
};

function StatusBadge({ status }) {
  return (
    <View style={[styles.badge, { backgroundColor: (STATUS_COLORS[status] || "#64748b") + "20" }]}>
      <Text style={[styles.badgeText, { color: STATUS_COLORS[status] || "#64748b" }]}>{status}</Text>
    </View>
  );
}

const EMPTY_FORM = {
  customer_name: "",
  customer_phone: "",
  expected_date: "",
  expected_time: "",
  total_amount: "",
  advance_amount: "",
  advance_payment_mode: "CASH",
  notes: "",
  order_items: [],
};

export default function AdvanceOrdersScreen() {
  const { session } = useAuth();
  const { theme } = useTheme();
  const today = session?.app_date || new Date().toISOString().split("T")[0];

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterDate, setFilterDate] = useState(today);
  const [filterStatus, setFilterStatus] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pmPicker, setPmPicker] = useState(false);
  const [statusPicker, setStatusPicker] = useState(null); // order_id
  const [collectDue, setCollectDue] = useState(null); // { order, amount, payment_mode, mark_completed }
  const [collectUpiIdx, setCollectUpiIdx] = useState(0);
  const [collecting, setCollecting] = useState(false);
  const [printingId, setPrintingId] = useState(null);
  const [shopDetails, setShopDetails] = useState({});
  const [branchDetails, setBranchDetails] = useState({});
  const [itemCatalog, setItemCatalog] = useState([]);
  const [itemSearchText, setItemSearchText] = useState("");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const params = {};
      if (filterDate) params.expected_date = filterDate;
      if (filterStatus) params.status = filterStatus;
      const res = await api.get("/advance-orders/", { params });
      setOrders(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      if (!silent) Alert.alert("Error", err?.response?.data?.detail || "Failed to load advance orders");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filterDate, filterStatus]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const branchPromise = session?.branch_id ? api.get(`/branch/${session.branch_id}`).catch(() => null) : Promise.resolve(null);
        const [shopRes, branchRes] = await Promise.all([
          api.get("/shop/details").catch(() => null),
          branchPromise,
        ]);
        if (!mounted) return;
        setShopDetails(shopRes?.data || {});
        setBranchDetails(branchRes?.data || {});
      } catch {
        if (!mounted) return;
        setShopDetails({});
        setBranchDetails({});
      }
    })();
    return () => { mounted = false; };
  }, [session?.branch_id]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await api.get("/items/");
        if (!mounted) return;
        setItemCatalog(Array.isArray(res?.data) ? res.data : []);
      } catch {
        if (!mounted) return;
        setItemCatalog([]);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const openCreate = () => {
    setEditId(null);
    setForm({ ...EMPTY_FORM, expected_date: filterDate || today });
    setItemSearchText("");
    setShowForm(true);
  };

  const openEdit = (order) => {
    setEditId(order.order_id);
    setForm({
      customer_name: order.customer_name || "",
      customer_phone: order.customer_phone || "",
      expected_date: order.expected_date || "",
      expected_time: order.expected_time || "",
      total_amount: String(order.total_amount || ""),
      advance_amount: String(order.advance_amount || ""),
      advance_payment_mode: order.advance_payment_mode || "CASH",
      notes: order.notes || "",
      order_items: normalizeOrderItems(order.order_items || []),
    });
    setItemSearchText("");
    setShowForm(true);
  };

  const addItemToForm = (item) => {
    const itemId = item?.item_id;
    const itemName = String(item?.item_name || "Item");
    const itemRate = Math.max(0, toNum(item?.selling_price ?? item?.price ?? item?.mrp_price ?? 0));
    const rows = normalizeOrderItems(form.order_items || []);
    const idx = rows.findIndex((x) => String(x.item_id) === String(itemId));
    let next;
    if (idx >= 0) {
      next = rows.map((x, i) => {
        if (i !== idx) return x;
        const qty = Math.max(1, toNum(x.qty) + 1);
        return { ...x, qty, amount: Number((qty * toNum(x.rate)).toFixed(2)) };
      });
    } else {
      next = [...rows, { item_id: itemId, item_name: itemName, qty: 1, rate: itemRate, amount: Number(itemRate.toFixed(2)) }];
    }
    setForm({ ...form, order_items: next, total_amount: String(sumOrderItems(next).toFixed(2)) });
  };

  const updateFormItem = (index, patch) => {
    const rows = normalizeOrderItems(form.order_items || []);
    const next = rows.map((row, i) => {
      if (i !== index) return row;
      const qty = Math.max(1, toNum(patch.qty ?? row.qty));
      const rate = Math.max(0, toNum(patch.rate ?? row.rate));
      return { ...row, qty, rate, amount: Number((qty * rate).toFixed(2)) };
    });
    setForm({ ...form, order_items: next, total_amount: String(sumOrderItems(next).toFixed(2)) });
  };

  const removeFormItem = (index) => {
    const rows = normalizeOrderItems(form.order_items || []);
    const next = rows.filter((_, i) => i !== index);
    setForm({ ...form, order_items: next, total_amount: String(sumOrderItems(next).toFixed(2)) });
  };

  const handleSave = async () => {
    if (!form.customer_name.trim()) return Alert.alert("Validation", "Customer name is required");
    if (!form.expected_date) return Alert.alert("Validation", "Expected date is required");
    setSaving(true);
    try {
      const payload = {
        ...form,
        order_items: normalizeOrderItems(form.order_items || []),
        total_amount: parseFloat((sumOrderItems(form.order_items || []) || form.total_amount || 0).toFixed(2)),
        advance_amount: parseFloat(form.advance_amount || 0),
      };
      if (editId) {
        await api.put(`/advance-orders/${editId}`, payload);
      } else {
        await api.post("/advance-orders/", payload);
      }
      setShowForm(false);
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      await api.put(`/advance-orders/${orderId}`, { status: newStatus });
      setStatusPicker(null);
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to update");
    }
  };

  const openCollectDue = (order) => {
    const due = toDue(order);
    setCollectDue({
      order,
      amount: String(due > 0 ? due : ""),
      payment_mode: order?.advance_payment_mode || "CASH",
      mark_completed: due <= 0,
    });
  };

  const submitCollectDue = async () => {
    if (!collectDue?.order?.order_id) return;
    const amount = Number(collectDue.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert("Validation", "Enter valid amount to collect");
      return;
    }

    setCollecting(true);
    try {
      await api.post(`/advance-orders/${collectDue.order.order_id}/collect-due`, {
        amount,
        payment_mode: collectDue.payment_mode,
        mark_completed: Boolean(collectDue.mark_completed),
      });
      setCollectDue(null);
      await load(true);
      Alert.alert("Success", "Due amount collected.");
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to collect due");
    } finally {
      setCollecting(false);
    }
  };

  const handlePrintAdvance = async (order) => {
    setPrintingId(order?.order_id || null);
    try {
      await printAdvanceOrderReceipt(order, {
        shop: shopDetails,
        branch: branchDetails,
        shopName: shopDetails?.shop_name || "Haappii Billing",
      });
      Alert.alert("Printed", "Advance invoice sent to printer.");
    } catch {
      Alert.alert("Print Error", "Unable to print advance invoice.");
    } finally {
      setPrintingId(null);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      {/* Filters */}
      <View style={styles.filterBar}>
        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>DATE</Text>
          <TextInput
            style={[styles.filterInput, { borderColor: theme.inputBorder, backgroundColor: theme.inputBg, color: theme.text }]}
            value={filterDate}
            onChangeText={setFilterDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.textMuted}
          />
        </View>
        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>STATUS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.statusRow}>
              {["", ...STATUS_LIST].map((s) => (
                <Pressable
                  key={s || "all"}
                  style={[styles.statusChip, filterStatus === s && styles.statusChipActive]}
                  onPress={() => setFilterStatus(s)}
                >
                  <Text style={[styles.statusChipText, filterStatus === s && styles.statusChipTextActive]}>
                    {s || "All"}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
      </View>

      {/* New Order Button */}
      <View style={styles.actionBar}>
        <Pressable style={styles.newBtn} onPress={openCreate}>
          <Text style={styles.newBtnText}>+ New Advance Order</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={["#2563eb"]} />}
        >
          {orders.length === 0 ? (
            <Text style={styles.empty}>No advance orders for this date/filter</Text>
          ) : orders.map((o) => (
            <View key={o.order_id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardName}>{o.customer_name}</Text>
                  {o.customer_phone ? <Text style={styles.cardPhone}>{o.customer_phone}</Text> : null}
                  <Text style={styles.cardDate}>
                    {o.expected_date}{o.expected_time ? ` at ${o.expected_time}` : ""}
                  </Text>
                </View>
                <StatusBadge status={o.status} />
              </View>

              <View style={styles.cardAmounts}>
                <View style={styles.amtBlock}>
                  <Text style={styles.amtLabel}>TOTAL</Text>
                  <Text style={styles.amtValue}>{fmt(o.total_amount)}</Text>
                </View>
                <View style={styles.amtBlock}>
                  <Text style={styles.amtLabel}>ADVANCE</Text>
                  <Text style={[styles.amtValue, { color: "#059669" }]}>{fmt(o.advance_amount)}</Text>
                </View>
                <View style={styles.amtBlock}>
                  <Text style={styles.amtLabel}>DUE</Text>
                  <Text style={[styles.amtValue, { color: "#dc2626" }]}>{fmt(toDue(o))}</Text>
                </View>
                {o.advance_payment_mode ? (
                  <View style={styles.amtBlock}>
                    <Text style={styles.amtLabel}>MODE</Text>
                    <Text style={styles.amtValue}>{o.advance_payment_mode}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.paymentStatus}>Payment: {paymentStatusFor(o)}</Text>

              {o.notes ? <Text style={styles.cardNotes}>{o.notes}</Text> : null}

              {o.status !== "COMPLETED" && o.status !== "CANCELLED" && (
                <View style={styles.cardActions}>
                  <Pressable style={styles.actionBtn} onPress={() => openEdit(o)}>
                    <Text style={styles.actionBtnText}>Edit</Text>
                  </Pressable>
                  {toDue(o) > 0 ? (
                    <Pressable style={styles.actionBtn} onPress={() => openCollectDue(o)}>
                      <Text style={styles.actionBtnText}>Collect Due</Text>
                    </Pressable>
                  ) : null}
                  <Pressable style={[styles.actionBtn, styles.actionBtnPrimary]} onPress={() => setStatusPicker(o.order_id)}>
                    <Text style={[styles.actionBtnText, { color: "#fff" }]}>Update Status</Text>
                  </Pressable>
                </View>
              )}

              <Pressable
                style={[styles.printBtn, printingId === o.order_id && styles.btnDisabled]}
                onPress={() => handlePrintAdvance(o)}
                disabled={printingId === o.order_id}
              >
                <Text style={styles.printBtnText}>{printingId === o.order_id ? "Printing..." : "Print Advance Invoice"}</Text>
              </Pressable>

              {/* Status picker */}
              {statusPicker === o.order_id && (
                <View style={styles.statusPickerBar}>
                  {STATUS_LIST.map((s) => (
                    <Pressable
                      key={s}
                      style={[styles.statusChip, { marginBottom: 4 }]}
                      onPress={() => handleStatusChange(o.order_id, s)}
                    >
                      <Text style={[styles.statusChipText, { color: STATUS_COLORS[s] || "#64748b" }]}>{s}</Text>
                    </Pressable>
                  ))}
                  <Pressable onPress={() => setStatusPicker(null)}>
                    <Text style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Cancel</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Create / Edit Modal */}
      <Modal visible={showForm} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editId ? "Edit Advance Order" : "New Advance Order"}</Text>
              <Pressable onPress={() => setShowForm(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody}>
              <Text style={styles.fieldLabel}>Customer Name *</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="Customer name"
                placeholderTextColor="#94a3b8"
                value={form.customer_name}
                onChangeText={(v) => setForm({ ...form, customer_name: v })}
              />
              <Text style={styles.fieldLabel}>Phone</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="Phone number"
                placeholderTextColor="#94a3b8"
                keyboardType="phone-pad"
                value={form.customer_phone}
                onChangeText={(v) => setForm({ ...form, customer_phone: v })}
              />
              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Expected Date *</Text>
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#94a3b8"
                    value={form.expected_date}
                    onChangeText={(v) => setForm({ ...form, expected_date: v })}
                  />
                </View>
                <View style={{ width: 8 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Time (HH:MM)</Text>
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="e.g. 14:30"
                    placeholderTextColor="#94a3b8"
                    value={form.expected_time}
                    onChangeText={(v) => setForm({ ...form, expected_time: v })}
                  />
                </View>
              </View>
              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Total Amount (₹)</Text>
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="0.00"
                    placeholderTextColor="#94a3b8"
                    keyboardType="decimal-pad"
                    value={sumOrderItems(form.order_items || []).toFixed(2)}
                    editable={false}
                  />
                </View>
                <View style={{ width: 8 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Advance Paid (₹)</Text>
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="0.00"
                    placeholderTextColor="#94a3b8"
                    keyboardType="decimal-pad"
                    value={form.advance_amount}
                    onChangeText={(v) => setForm({ ...form, advance_amount: v })}
                  />
                </View>
              </View>

              <Text style={styles.fieldLabel}>Select Items</Text>
              <TextInput
                style={[styles.fieldInput, { borderColor: theme.inputBorder, backgroundColor: theme.inputBg, color: theme.text }]}
                placeholder="Search item to add"
                placeholderTextColor={theme.textMuted}
                value={itemSearchText}
                onChangeText={setItemSearchText}
              />
              <ScrollView style={styles.itemsPicker} nestedScrollEnabled>
                {itemCatalog
                  .filter((it) => String(it?.item_name || "").toLowerCase().includes(String(itemSearchText || "").toLowerCase()))
                  .slice(0, 10)
                  .map((it) => (
                    <Pressable key={String(it.item_id)} style={styles.itemPickRow} onPress={() => addItemToForm(it)}>
                      {resolveItemImageUrl(it) ? (
                        <Image source={{ uri: resolveItemImageUrl(it) }} style={styles.itemPickThumb} resizeMode="cover" />
                      ) : (
                        <View style={[styles.itemPickThumb, styles.itemPickThumbFallback]}>
                          <Text style={styles.itemPickThumbFallbackText}>IMG</Text>
                        </View>
                      )}
                      <Text style={styles.itemPickName}>{it.item_name}</Text>
                      <Text style={styles.itemPickRate}>{fmt(it?.selling_price ?? it?.price ?? 0)}</Text>
                    </Pressable>
                  ))}
              </ScrollView>

              {(form.order_items || []).length > 0 ? (
                <View style={styles.selectedItemsWrap}>
                  {(form.order_items || []).map((it, idx) => (
                    <View key={`${it.item_id || it.item_name}-${idx}`} style={styles.selectedItemCard}>
                      <View style={styles.selectedItemHead}>
                        <Text style={styles.selectedItemName} numberOfLines={1}>{it.item_name || "Item"}</Text>
                        <Pressable onPress={() => removeFormItem(idx)}>
                          <Text style={styles.removeItemText}>Remove</Text>
                        </Pressable>
                      </View>
                      <View style={styles.row2}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.fieldLabel}>Qty</Text>
                          <TextInput
                            style={styles.smallInput}
                            keyboardType="numeric"
                            value={String(it.qty || 1)}
                            onChangeText={(v) => updateFormItem(idx, { qty: v })}
                          />
                        </View>
                        <View style={{ width: 8 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.fieldLabel}>Rate</Text>
                          <TextInput
                            style={styles.smallInput}
                            keyboardType="decimal-pad"
                            value={String(it.rate ?? 0)}
                            onChangeText={(v) => updateFormItem(idx, { rate: v })}
                          />
                        </View>
                        <View style={{ width: 8 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.fieldLabel}>Amount</Text>
                          <View style={styles.amountPill}><Text style={styles.amountPillText}>{fmt(it.amount || 0)}</Text></View>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}

              <Text style={styles.fieldLabel}>Payment Mode</Text>
              <View style={styles.pmRow}>
                {PAYMENT_MODES.map((m) => (
                  <Pressable
                    key={m}
                    style={[styles.pmChip, form.advance_payment_mode === m && styles.pmChipActive]}
                    onPress={() => setForm({ ...form, advance_payment_mode: m })}
                  >
                    <Text style={[styles.pmChipText, form.advance_payment_mode === m && styles.pmChipTextActive]}>{m}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.fieldLabel}>Notes</Text>
              <TextInput
                style={[styles.fieldInput, { height: 64, textAlignVertical: "top" }]}
                placeholder="Special instructions…"
                placeholderTextColor="#94a3b8"
                multiline
                value={form.notes}
                onChangeText={(v) => setForm({ ...form, notes: v })}
              />
              <View style={styles.modalActions}>
                <Pressable style={styles.cancelBtn} onPress={() => setShowForm(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
                  <Text style={styles.saveBtnText}>{saving ? "Saving…" : editId ? "Update" : "Create"}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(collectDue)} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Collect Due Amount</Text>
              <Pressable onPress={() => setCollectDue(null)}>
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>
            <View style={styles.modalBody}>
              <Text style={styles.fieldLabel}>Order</Text>
              <Text style={styles.readOnlyText}>#{collectDue?.order?.order_id} · {collectDue?.order?.customer_name}</Text>
              <Text style={styles.fieldLabel}>Current Due</Text>
              <Text style={styles.readOnlyText}>{fmt(toDue(collectDue?.order || {}))}</Text>

              <Text style={styles.fieldLabel}>Amount To Collect (₹)</Text>
              <TextInput
                style={styles.fieldInput}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor="#94a3b8"
                value={collectDue?.amount || ""}
                onChangeText={(v) => setCollectDue((prev) => ({ ...prev, amount: v }))}
              />

              <Text style={styles.fieldLabel}>Payment Mode</Text>
              <View style={styles.pmRow}>
                {PAYMENT_MODES.map((m) => (
                  <Pressable
                    key={m}
                    style={[styles.pmChip, collectDue?.payment_mode === m && styles.pmChipActive]}
                    onPress={() => setCollectDue((prev) => ({ ...prev, payment_mode: m }))}
                  >
                    <Text style={[styles.pmChipText, collectDue?.payment_mode === m && styles.pmChipTextActive]}>{m}</Text>
                  </Pressable>
                ))}
              </View>

              {/* UPI QR */}
              {collectDue?.payment_mode === "UPI" && (() => {
                const upiIds = [
                  branchDetails?.upi_id,
                  branchDetails?.upi_id_2,
                  branchDetails?.upi_id_3,
                  branchDetails?.upi_id_4,
                ].filter(Boolean);
                if (upiIds.length === 0 && shopDetails?.upi_id) upiIds.push(shopDetails.upi_id);
                const shopName = shopDetails?.shop_name || "Shop";
                const amount = Number(collectDue?.amount || 0);
                const safeIdx = Math.min(collectUpiIdx, Math.max(0, upiIds.length - 1));
                if (upiIds.length === 0) {
                  return (
                    <View style={styles.upiWarning}>
                      <Text style={styles.upiWarningText}>No UPI ID configured for this branch.</Text>
                    </View>
                  );
                }
                return (
                  <View style={styles.upiQrBox}>
                    {upiIds.length > 1 && (
                      <View style={styles.upiQrTabs}>
                        {upiIds.map((id, i) => (
                          <Pressable
                            key={id}
                            style={[styles.upiQrTab, safeIdx === i && styles.upiQrTabActive]}
                            onPress={() => setCollectUpiIdx(i)}
                          >
                            <Text style={[styles.upiQrTabText, safeIdx === i && styles.upiQrTabTextActive]}>
                              QR {i + 1}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                    <View style={styles.upiQrCenter}>
                      <QRCode
                        value={`upi://pay?pa=${upiIds[safeIdx]}&pn=${encodeURIComponent(shopName)}&am=${amount > 0 ? amount.toFixed(2) : "0.00"}&cu=INR`}
                        size={160}
                      />
                      <Text style={styles.upiQrId}>{upiIds[safeIdx]}</Text>
                    </View>
                  </View>
                );
              })()}

              <Pressable
                style={styles.checkRow}
                onPress={() => setCollectDue((prev) => ({ ...prev, mark_completed: !prev?.mark_completed }))}
              >
                <View style={[styles.checkBox, collectDue?.mark_completed && styles.checkBoxActive]}>
                  {collectDue?.mark_completed ? <Text style={styles.checkMark}>✓</Text> : null}
                </View>
                <Text style={styles.checkLabel}>Mark as completed if fully paid</Text>
              </Pressable>

              <View style={styles.modalActions}>
                <Pressable style={styles.cancelBtn} onPress={() => setCollectDue(null)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.saveBtn, collecting && styles.btnDisabled]} onPress={submitCollectDue} disabled={collecting}>
                  <Text style={styles.saveBtnText}>{collecting ? "Saving..." : "Collect"}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f0f4ff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  filterBar: { backgroundColor: "#fff", padding: 14, borderBottomWidth: 1.5, borderBottomColor: "#dde6f7", gap: 10 },
  filterGroup: { gap: 5 },
  filterLabel: { fontSize: 9, fontWeight: "800", color: "#8896ae", letterSpacing: 0.7, textTransform: "uppercase" },
  filterInput: {
    borderWidth: 1.5, borderColor: "#d0dcf0", borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, color: "#0c1228",
    backgroundColor: "#f6f8fe",
  },
  statusRow: { flexDirection: "row", gap: 8 },
  statusChip: {
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 999, borderWidth: 1.5, borderColor: "#d0dcf0",
    backgroundColor: "#f6f8fe",
  },
  statusChipActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  statusChipText: { fontSize: 11, fontWeight: "700", color: "#4a5a78" },
  statusChipTextActive: { color: "#fff" },
  actionBar: { paddingHorizontal: 14, paddingVertical: 10, backgroundColor: "#fff", borderBottomWidth: 1.5, borderBottomColor: "#dde6f7" },
  newBtn: {
    backgroundColor: "#2563eb", borderRadius: 14, paddingVertical: 12, alignItems: "center",
    shadowColor: "#2563eb", shadowOpacity: 0.35, shadowRadius: 10, elevation: 5,
  },
  newBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  list: { padding: 14, gap: 12, paddingBottom: 36 },
  empty: { textAlign: "center", color: "#8896ae", marginTop: 44, fontSize: 14, fontWeight: "600" },
  card: {
    backgroundColor: "#fff", borderRadius: 18, borderWidth: 1.5, borderColor: "#dde6f7", padding: 14, gap: 10,
    shadowColor: "#1a2463", shadowOpacity: 0.07, shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  cardName: { fontWeight: "900", fontSize: 15, color: "#0c1228" },
  cardPhone: { fontSize: 12, color: "#8896ae", marginTop: 2 },
  cardDate: { fontSize: 12, color: "#4a5a78", marginTop: 2 },
  badge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 10, fontWeight: "800" },
  cardAmounts: { flexDirection: "row", gap: 18 },
  amtBlock: { gap: 2 },
  amtLabel: { fontSize: 9, fontWeight: "800", color: "#8896ae", letterSpacing: 0.5, textTransform: "uppercase" },
  amtValue: { fontSize: 15, fontWeight: "900", color: "#0c1228" },
  cardNotes: { fontSize: 12, color: "#8896ae", fontStyle: "italic" },
  paymentStatus: { fontSize: 11, color: "#4a5a78", fontWeight: "700" },
  cardActions: { flexDirection: "row", gap: 8 },
  actionBtn: {
    flex: 1, borderWidth: 1.5, borderColor: "#d0dcf0", borderRadius: 12,
    paddingVertical: 8, alignItems: "center", backgroundColor: "#f6f8fe",
  },
  actionBtnPrimary: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  actionBtnText: { fontSize: 12, fontWeight: "700", color: "#4a5a78" },
  printBtn: {
    marginTop: 4, borderWidth: 1.5, borderColor: "#93c5fd", borderRadius: 12,
    paddingVertical: 9, alignItems: "center", backgroundColor: "#eff6ff",
  },
  printBtnText: { fontSize: 12, fontWeight: "700", color: "#1d4ed8" },
  statusPickerBar: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingTop: 6 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28,
    maxHeight: "92%", paddingBottom: 36,
    shadowColor: "#0c1228", shadowOpacity: 0.2, shadowRadius: 24, elevation: 16,
  },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1.5, borderBottomColor: "#dde6f7",
  },
  modalTitle: { fontSize: 17, fontWeight: "900", color: "#0c1228", letterSpacing: -0.3 },
  modalClose: { fontSize: 18, color: "#8896ae", fontWeight: "700" },
  modalBody: { padding: 18, gap: 4, paddingBottom: 18 },
  fieldLabel: { fontSize: 11, fontWeight: "700", color: "#4a5a78", marginBottom: 4, marginTop: 10, textTransform: "uppercase", letterSpacing: 0.4 },
  fieldInput: {
    borderWidth: 1.5, borderColor: "#d0dcf0", borderRadius: 12,
    paddingHorizontal: 13, paddingVertical: 11, fontSize: 14, color: "#0c1228",
    backgroundColor: "#f6f8fe",
  },
  row2: { flexDirection: "row", alignItems: "flex-start" },
  pmRow: { flexDirection: "row", gap: 8, marginVertical: 6 },
  pmChip: {
    flex: 1, borderWidth: 1.5, borderColor: "#d0dcf0", borderRadius: 12,
    paddingVertical: 9, alignItems: "center", backgroundColor: "#f6f8fe",
  },
  pmChipActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  pmChipText: { fontSize: 12, fontWeight: "700", color: "#4a5a78" },
  pmChipTextActive: { color: "#fff" },
  itemsPicker: {
    maxHeight: 140, borderWidth: 1.5, borderColor: "#d0dcf0",
    borderRadius: 12, backgroundColor: "#fff", marginTop: 4,
  },
  itemPickRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 12, paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: "#f0f4ff",
  },
  itemPickThumb: { width: 32, height: 32, borderRadius: 8, marginRight: 10, backgroundColor: "#f0f4ff" },
  itemPickThumbFallback: { alignItems: "center", justifyContent: "center" },
  itemPickThumbFallbackText: { fontSize: 8, fontWeight: "700", color: "#8896ae" },
  itemPickName: { fontSize: 12, color: "#0c1228", fontWeight: "700", flex: 1, paddingRight: 8 },
  itemPickRate: { fontSize: 12, color: "#2563eb", fontWeight: "800" },
  selectedItemsWrap: { marginTop: 10, gap: 10 },
  selectedItemCard: {
    borderWidth: 1.5, borderColor: "#dde6f7", borderRadius: 14, backgroundColor: "#f6f8fe", padding: 12,
  },
  selectedItemHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  selectedItemName: { fontSize: 12, color: "#0c1228", fontWeight: "800", flex: 1, paddingRight: 8 },
  removeItemText: { fontSize: 11, color: "#dc2626", fontWeight: "700" },
  smallInput: {
    borderWidth: 1.5, borderColor: "#d0dcf0", borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 9, fontSize: 12, color: "#0c1228", backgroundColor: "#fff",
  },
  amountPill: {
    borderWidth: 1.5, borderColor: "#6ee7b7", borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 9, backgroundColor: "#ecfdf5", alignItems: "center",
  },
  amountPillText: { fontSize: 11, color: "#059669", fontWeight: "900" },
  readOnlyText: { fontSize: 13, color: "#0c1228", fontWeight: "700", marginBottom: 4 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  checkBox: {
    width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: "#d0dcf0",
    alignItems: "center", justifyContent: "center", backgroundColor: "#f6f8fe",
  },
  checkBoxActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  checkMark: { color: "#fff", fontSize: 12, fontWeight: "900" },
  checkLabel: { fontSize: 12, color: "#4a5a78", fontWeight: "700" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 18 },
  cancelBtn: {
    flex: 1, borderWidth: 1.5, borderColor: "#d0dcf0", borderRadius: 14,
    paddingVertical: 13, alignItems: "center", backgroundColor: "#f6f8fe",
  },
  cancelBtnText: { fontSize: 13, fontWeight: "700", color: "#4a5a78" },
  saveBtn: {
    flex: 1, backgroundColor: "#2563eb", borderRadius: 14, paddingVertical: 13, alignItems: "center",
    shadowColor: "#2563eb", shadowOpacity: 0.35, shadowRadius: 10, elevation: 5,
  },
  saveBtnText: { fontSize: 13, fontWeight: "800", color: "#fff" },
  upiWarning: {
    backgroundColor: "#fffbeb", borderRadius: 12, padding: 12, marginTop: 10,
    borderWidth: 1.5, borderColor: "#fde68a",
  },
  upiWarningText: { fontSize: 12, color: "#92400e", fontWeight: "700" },
  upiQrBox: { marginTop: 10, gap: 10 },
  upiQrTabs: { flexDirection: "row", gap: 8 },
  upiQrTab: {
    borderWidth: 1.5, borderColor: "#d0dcf0", borderRadius: 10,
    paddingHorizontal: 13, paddingVertical: 6, backgroundColor: "#f6f8fe",
  },
  upiQrTabActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  upiQrTabText: { fontSize: 12, fontWeight: "700", color: "#4a5a78" },
  upiQrTabTextActive: { color: "#fff" },
  upiQrCenter: { alignItems: "center", gap: 8, paddingVertical: 8 },
  upiQrId: { fontSize: 12, color: "#8896ae", fontWeight: "600" },
  btnDisabled: { opacity: 0.5 },
});
