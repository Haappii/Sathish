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

import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { WEB_APP_BASE } from "../config/api";
import { printAdvanceOrderReceipt } from "../utils/printInvoice";

const fmt = (v) => `₹${Number(v || 0).toFixed(2)}`;

const STATUS_COLORS = {
  PENDING: "#d97706",
  CONFIRMED: "#0b57d0",
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
        <View style={styles.center}><ActivityIndicator size="large" color="#0b57d0" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={["#0b57d0"]} />}
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
  safe: { flex: 1, backgroundColor: "#f3f6ff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  filterBar: { backgroundColor: "#fff", padding: 12, borderBottomWidth: 1, borderBottomColor: "#e2e8f0", gap: 8 },
  filterGroup: { gap: 4 },
  filterLabel: { fontSize: 9, fontWeight: "700", color: "#94a3b8", letterSpacing: 0.5 },
  filterInput: {
    borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 6, fontSize: 13, color: "#0b1220",
    backgroundColor: "#f8fafc",
  },
  statusRow: { flexDirection: "row", gap: 6 },
  statusChip: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999, borderWidth: 1, borderColor: "#cbd5e1",
    backgroundColor: "#fff",
  },
  statusChipActive: { backgroundColor: "#0b57d0", borderColor: "#0b57d0" },
  statusChipText: { fontSize: 11, fontWeight: "700", color: "#334155" },
  statusChipTextActive: { color: "#fff" },
  actionBar: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  newBtn: { backgroundColor: "#0b57d0", borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  newBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  list: { padding: 12, gap: 10, paddingBottom: 32 },
  empty: { textAlign: "center", color: "#94a3b8", marginTop: 40, fontSize: 13 },
  card: { backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#d9e3ff", padding: 12, gap: 8 },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  cardName: { fontWeight: "800", fontSize: 14, color: "#0b1220" },
  cardPhone: { fontSize: 12, color: "#64748b" },
  cardDate: { fontSize: 12, color: "#94a3b8" },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 10, fontWeight: "800" },
  cardAmounts: { flexDirection: "row", gap: 16 },
  amtBlock: { gap: 1 },
  amtLabel: { fontSize: 9, fontWeight: "700", color: "#94a3b8", letterSpacing: 0.5 },
  amtValue: { fontSize: 14, fontWeight: "800", color: "#0b1220" },
  cardNotes: { fontSize: 12, color: "#64748b", fontStyle: "italic" },
  paymentStatus: { fontSize: 11, color: "#475569", fontWeight: "700" },
  cardActions: { flexDirection: "row", gap: 8 },
  actionBtn: { flex: 1, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, paddingVertical: 7, alignItems: "center" },
  actionBtnPrimary: { backgroundColor: "#0b57d0", borderColor: "#0b57d0" },
  actionBtnText: { fontSize: 12, fontWeight: "700", color: "#334155" },
  printBtn: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#93c5fd",
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
    backgroundColor: "#eff6ff",
  },
  printBtnText: { fontSize: 12, fontWeight: "700", color: "#1d4ed8" },
  statusPickerBar: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingTop: 4 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "90%", paddingBottom: 32 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  modalTitle: { fontSize: 15, fontWeight: "800", color: "#0b1220" },
  modalClose: { fontSize: 18, color: "#94a3b8" },
  modalBody: { padding: 16, gap: 4, paddingBottom: 16 },
  fieldLabel: { fontSize: 11, fontWeight: "700", color: "#64748b", marginBottom: 4, marginTop: 8 },
  fieldInput: {
    borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: "#0b1220",
    backgroundColor: "#f8fafc",
  },
  row2: { flexDirection: "row", alignItems: "flex-start" },
  pmRow: { flexDirection: "row", gap: 8, marginVertical: 4 },
  pmChip: { flex: 1, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, paddingVertical: 8, alignItems: "center", backgroundColor: "#fff" },
  pmChipActive: { backgroundColor: "#0b57d0", borderColor: "#0b57d0" },
  pmChipText: { fontSize: 12, fontWeight: "700", color: "#334155" },
  pmChipTextActive: { color: "#fff" },
  itemsPicker: {
    maxHeight: 140,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    backgroundColor: "#fff",
    marginTop: 2,
  },
  itemPickRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  itemPickThumb: {
    width: 32,
    height: 32,
    borderRadius: 6,
    marginRight: 8,
    backgroundColor: "#f1f5f9",
  },
  itemPickThumbFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  itemPickThumbFallbackText: {
    fontSize: 8,
    fontWeight: "700",
    color: "#94a3b8",
  },
  itemPickName: { fontSize: 12, color: "#1e293b", fontWeight: "600", flex: 1, paddingRight: 8 },
  itemPickRate: { fontSize: 12, color: "#1d4ed8", fontWeight: "800" },
  selectedItemsWrap: { marginTop: 8, gap: 8 },
  selectedItemCard: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    backgroundColor: "#fff",
    padding: 10,
  },
  selectedItemHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
  selectedItemName: { fontSize: 12, color: "#0f172a", fontWeight: "700", flex: 1, paddingRight: 8 },
  removeItemText: { fontSize: 11, color: "#dc2626", fontWeight: "700" },
  smallInput: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: 12,
    color: "#0b1220",
    backgroundColor: "#f8fafc",
  },
  amountPill: {
    borderWidth: 1,
    borderColor: "#bbf7d0",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 9,
    backgroundColor: "#ecfdf5",
    alignItems: "center",
  },
  amountPillText: { fontSize: 11, color: "#047857", fontWeight: "800" },
  readOnlyText: { fontSize: 13, color: "#0b1220", fontWeight: "700", marginBottom: 2 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  checkBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#94a3b8",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  checkBoxActive: { backgroundColor: "#0b57d0", borderColor: "#0b57d0" },
  checkMark: { color: "#fff", fontSize: 11, fontWeight: "900" },
  checkLabel: { fontSize: 12, color: "#334155", fontWeight: "600" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  cancelBtnText: { fontSize: 13, fontWeight: "700", color: "#334155" },
  saveBtn: { flex: 1, backgroundColor: "#0b57d0", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  saveBtnText: { fontSize: 13, fontWeight: "800", color: "#fff" },
});
