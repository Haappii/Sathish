import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
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
import { API_BASE } from "../config/api";
import { useAuth } from "../context/AuthContext";

const fmtDate = (v) => (v ? String(v).split("T")[0] : "");
const fmt = (n) => `₹${Number(n || 0).toFixed(2)}`;
const API_ORIGIN = String(API_BASE || "").replace(/\/api\/?$/, "");
const UNITS = ["g", "kg", "ml", "L", "pcs", "tbsp", "tsp", "cup"];
const STATUS_COLOR = { DRAFT: "#9ca3af", ORDERED: "#2563eb", RECEIVED: "#059669", PARTIAL: "#f59e0b", CLOSED: "#9ca3af" };
const PAYMENT_COLOR = { UNPAID: "#dc2626", PARTIAL: "#f59e0b", PAID: "#059669" };

const parseSerialNumbers = (text) => {
  const raw = String(text || "");
  if (!raw.trim()) return [];
  return raw.split(/[\n,]+/g).map((s) => s.trim()).filter(Boolean);
};

export default function PurchaseOrdersScreen() {
  const { session } = useAuth();
  const isAdmin = String(session?.role_name || session?.role || "").toLowerCase() === "admin";

  const [rows, setRows] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [items, setItems] = useState([]);
  const [isHotel, setIsHotel] = useState(false);
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(session?.branch_id ? String(session.branch_id) : "");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState([{ item_id: "", qty: "1", unit: "", unit_cost: "" }]);
  const [creating, setCreating] = useState(false);
  const [unitPickerIndex, setUnitPickerIndex] = useState(null);

  const [receiveTarget, setReceiveTarget] = useState(null);
  const [receiveRows, setReceiveRows] = useState([]);
  const [receiving, setReceiving] = useState(false);

  const [paymentTarget, setPaymentTarget] = useState(null);
  const [paymentStatus, setPaymentStatus] = useState("UNPAID");
  const [paidAmount, setPaidAmount] = useState("");
  const [payingBusy, setPayingBusy] = useState(false);

  const [attachTarget, setAttachTarget] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [attachLoading, setAttachLoading] = useState(false);

  const load = useCallback(async (isRefresh) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params = {};
      if (branchId) params.branch_id = branchId;
      const res = await api.get("/purchase-orders/", { params });
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load purchase orders");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [branchId]);

  useEffect(() => {
    if (isAdmin) api.get("/branch/active").then((r) => setBranches(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    api.get("/suppliers/").then((r) => setSuppliers(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    api.get("/shop/details").then((r) => {
      const shopData = r?.data || {};
      const hotel = String(shopData?.billing_type || shopData?.shop_type || "").toLowerCase() === "hotel";
      setIsHotel(hotel);
      api.get("/items/", { params: hotel ? { is_raw_material: true } : {} }).then((ir) => {
        const allItems = Array.isArray(ir.data) ? ir.data : [];
        setItems(hotel ? allItems.filter((it) => !!it?.is_raw_material) : allItems);
      }).catch(() => {});
    }).catch(() => {
      api.get("/items/").then((r) => setItems(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    });
  }, [isAdmin]);

  useEffect(() => { load(); }, [branchId]); // eslint-disable-line react-hooks/exhaustive-deps

  const addLine = () => setLines((p) => [...p, { item_id: "", qty: "1", unit: "", unit_cost: "" }]);
  const removeLine = (i) => setLines((p) => p.filter((_, idx) => idx !== i));
  const updateLine = (i, field, val) => setLines((p) => p.map((l, idx) => {
    if (idx !== i) return l;
    const updated = { ...l, [field]: val };
    if (field === "item_id" && val) {
      const found = items.find((it) => String(it.item_id) === String(val));
      if (found?.unit) updated.unit = found.unit;
    }
    return updated;
  }));

  const totalAmount = lines.reduce((sum, l) => sum + Number(l.qty || 0) * Number(l.unit_cost || 0), 0);

  const createPO = async () => {
    if (!supplierId) return Alert.alert("Validation", "Select a supplier");
    const validLines = lines.filter((l) => l.item_id && Number(l.qty) > 0);
    if (!validLines.length) return Alert.alert("Validation", "Add at least one item");
    setCreating(true);
    try {
      const payload = {
        supplier_id: Number(supplierId),
        expected_date: expectedDate || undefined,
        notes: notes.trim() || undefined,
        status: "DRAFT",
        payment_status: "UNPAID",
        items: validLines.map((l) => ({
          item_id: Number(l.item_id),
          qty: Number(l.qty),
          unit: l.unit || undefined,
          unit_cost: Number(l.unit_cost) || undefined,
        })),
      };
      if (isAdmin && branchId) payload.branch_id = Number(branchId);
      await api.post("/purchase-orders/", payload);
      setCreateOpen(false);
      setSupplierId(""); setExpectedDate(""); setNotes(""); setLines([{ item_id: "", qty: "1", unit: "", unit_cost: "" }]);
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to create PO");
    } finally {
      setCreating(false);
    }
  };

  const openReceive = (po) => {
    setReceiveTarget(po);
    setReceiveRows((po.items || []).map((l) => ({
      item_id: l.item_id,
      item_name: l.item_name || `Item #${l.item_id}`,
      unit: l.unit || "",
      remaining: Number(l.quantity ?? l.qty_ordered ?? 0) - Number(l.quantity_received ?? l.qty_received ?? 0),
      qty_received: "",
      batch_no: "",
      expiry_date: "",
      serial_numbers_text: "",
    })));
  };

  const updateReceiveRow = (idx, patch) => setReceiveRows((p) => p.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const submitReceive = async () => {
    for (const r of receiveRows) {
      const qty = Number(r.qty_received || 0);
      if (qty <= 0) continue;
      const serials = parseSerialNumbers(r.serial_numbers_text);
      if (serials.length > 0 && serials.length !== qty) {
        return Alert.alert("Validation", `Serial count (${serials.length}) must match qty (${qty}) for ${r.item_name}`);
      }
    }
    const itemsPayload = receiveRows
      .filter((r) => Number(r.qty_received) > 0)
      .map((r) => {
        const serials = parseSerialNumbers(r.serial_numbers_text);
        return {
          item_id: r.item_id,
          qty_received: Number(r.qty_received),
          batch_no: r.batch_no?.trim() || undefined,
          expiry_date: r.expiry_date || undefined,
          serial_numbers: serials.length ? serials : undefined,
        };
      });
    if (!itemsPayload.length) return Alert.alert("Validation", "Enter received quantities");
    setReceiving(true);
    try {
      await api.post(`/purchase-orders/${receiveTarget.po_id}/receive`, { items: itemsPayload });
      setReceiveTarget(null);
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to receive PO");
    } finally {
      setReceiving(false);
    }
  };

  const openPayment = (po) => {
    setPaymentTarget(po);
    setPaymentStatus(po.payment_status || "UNPAID");
    setPaidAmount(String(po.paid_amount || ""));
  };
  const submitPayment = async () => {
    setPayingBusy(true);
    try {
      await api.post(`/purchase-orders/${paymentTarget.po_id}/payment`, {
        payment_status: paymentStatus,
        paid_amount: Number(paidAmount || 0),
      });
      setPaymentTarget(null);
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to update payment");
    } finally {
      setPayingBusy(false);
    }
  };

  const openAttachments = async (po) => {
    setAttachTarget(po);
    setAttachments([]);
    setAttachLoading(true);
    try {
      const res = await api.get(`/purchase-orders/${po.po_id}/attachments`);
      setAttachments(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      // deferred: mobile has no upload path yet; listing best-effort
      setAttachments([]);
    } finally {
      setAttachLoading(false);
    }
  };

  const openAttachmentUrl = (a) => {
    if (!a?.url) return;
    Linking.openURL(`${API_ORIGIN}${a.url}`).catch(() => Alert.alert("Error", "Could not open attachment"));
  };

  const renderItem = ({ item }) => {
    const statusText = String(item.status || "DRAFT").trim().toUpperCase();
    const payStatus = String(item.payment_status || "UNPAID").trim().toUpperCase();
    const isClosed = statusText === "CLOSED";
    const due = Math.max(0, Number(item.total_amount || 0) - Number(item.paid_amount || 0));
    return (
      <View style={st.card}>
        <View style={st.cardTop}>
          <Text style={st.poNo}>{item.po_number}</Text>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <View style={[st.badge, { backgroundColor: `${STATUS_COLOR[statusText] || "#9ca3af"}22` }]}>
              <Text style={[st.badgeText, { color: STATUS_COLOR[statusText] || "#9ca3af" }]}>{statusText}</Text>
            </View>
            <View style={[st.badge, { backgroundColor: `${PAYMENT_COLOR[payStatus] || "#9ca3af"}22` }]}>
              <Text style={[st.badgeText, { color: PAYMENT_COLOR[payStatus] || "#9ca3af" }]}>{payStatus}</Text>
            </View>
          </View>
        </View>
        <Text style={st.meta}>{item.supplier_name || `Supplier #${item.supplier_id}`} · {fmtDate(item.created_at)}</Text>
        <View style={st.chipsRow}>
          <View style={st.amountChip}><Text style={st.amountLabel}>Total</Text><Text style={st.amountValue}>{fmt(item.total_amount)}</Text></View>
          <View style={[st.amountChip, { backgroundColor: "#ecfdf5" }]}><Text style={[st.amountLabel, { color: "#059669" }]}>Paid</Text><Text style={[st.amountValue, { color: "#059669" }]}>{fmt(item.paid_amount)}</Text></View>
          <View style={[st.amountChip, due > 0 && { backgroundColor: "#fef2f2" }]}><Text style={[st.amountLabel, due > 0 && { color: "#dc2626" }]}>Due</Text><Text style={[st.amountValue, due > 0 && { color: "#dc2626" }]}>{fmt(due)}</Text></View>
        </View>
        <View style={st.actionsRow}>
          {!isClosed && (
            <Pressable style={[st.actionBtn, { backgroundColor: "#eff6ff" }]} onPress={() => openReceive(item)}>
              <Text style={[st.actionBtnText, { color: "#2563eb" }]}>Receive</Text>
            </Pressable>
          )}
          {payStatus !== "PAID" && (
            <Pressable style={[st.actionBtn, { backgroundColor: "#ecfdf5" }]} onPress={() => openPayment(item)}>
              <Text style={[st.actionBtnText, { color: "#059669" }]}>Payment</Text>
            </Pressable>
          )}
          <Pressable style={[st.actionBtn, { backgroundColor: "#f1f3f9" }]} onPress={() => openAttachments(item)}>
            <Text style={[st.actionBtnText, { color: "#4b5563" }]}>Attachments</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={st.safe}>
      {isAdmin && branches.length > 0 && (
        <View style={st.chipRow}>
          {branches.map((b) => (
            <Pressable key={b.branch_id} style={[st.chip, String(branchId) === String(b.branch_id) && st.chipActive]} onPress={() => setBranchId(String(b.branch_id))}>
              <Text style={[st.chipText, String(branchId) === String(b.branch_id) && st.chipTextActive]}>{b.branch_name}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {loading ? (
        <View style={st.center}><ActivityIndicator size="large" color="#6366f1" /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r, i) => String(r.po_id || i)}
          renderItem={renderItem}
          contentContainerStyle={st.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          ListEmptyComponent={<View style={st.emptyWrap}><Text style={st.emptyIcon}>📑</Text><Text style={st.emptyTitle}>No purchase orders</Text></View>}
        />
      )}
      <Pressable style={st.fab} onPress={() => setCreateOpen(true)}><Text style={st.fabText}>+ New PO</Text></Pressable>

      {/* Create PO */}
      <Modal visible={createOpen} animationType="slide" onRequestClose={() => setCreateOpen(false)}>
        <SafeAreaView style={st.safe}>
          <View style={st.detailHeader}>
            <Pressable onPress={() => setCreateOpen(false)}><Text style={st.backLink}>‹ Cancel</Text></Pressable>
            <Text style={st.detailTitle}>New Purchase Order</Text>
          </View>
          <FlatList
            data={lines}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={{ padding: 14, gap: 10 }}
            ListHeaderComponent={
              <View style={{ gap: 10, marginBottom: 6 }}>
                <Text style={st.sectionLabel}>Supplier</Text>
                <View style={st.chipRow}>
                  {suppliers.map((s) => (
                    <Pressable key={s.supplier_id} style={[st.chip, String(supplierId) === String(s.supplier_id) && st.chipActive]} onPress={() => setSupplierId(String(s.supplier_id))}>
                      <Text style={[st.chipText, String(supplierId) === String(s.supplier_id) && st.chipTextActive]}>{s.supplier_name}</Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput style={st.input} placeholder="Expected date (YYYY-MM-DD)" placeholderTextColor="#94a3b8" value={expectedDate} onChangeText={setExpectedDate} />
                <TextInput style={st.input} placeholder="Notes (optional)" placeholderTextColor="#94a3b8" value={notes} onChangeText={setNotes} />
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={st.sectionLabel}>Items</Text>
                  <Text style={st.totalText}>Total: {fmt(totalAmount)}</Text>
                </View>
              </View>
            }
            renderItem={({ item: line, index }) => (
              <View style={st.itemRow}>
                <TextInput
                  style={[st.input, { flex: 1.3 }]}
                  placeholder="Item name"
                  placeholderTextColor="#94a3b8"
                  value={line.item_id ? String(items.find((it) => String(it.item_id) === String(line.item_id))?.item_name || line.item_id) : ""}
                  onChangeText={(v) => {
                    const match = items.find((it) => it.item_name.toLowerCase() === v.toLowerCase());
                    updateLine(index, "item_id", match ? String(match.item_id) : v);
                  }}
                />
                <TextInput style={[st.input, { width: 46 }]} placeholder="Qty" placeholderTextColor="#94a3b8" keyboardType="numeric" value={line.qty} onChangeText={(v) => updateLine(index, "qty", v)} />
                <Pressable style={[st.input, st.unitBox]} onPress={() => setUnitPickerIndex(index)}>
                  <Text style={st.unitBoxText}>{line.unit || "Unit"}</Text>
                </Pressable>
                <TextInput style={[st.input, { width: 60 }]} placeholder="Cost" placeholderTextColor="#94a3b8" keyboardType="numeric" value={line.unit_cost} onChangeText={(v) => updateLine(index, "unit_cost", v)} />
                <Pressable onPress={() => removeLine(index)}><Text style={st.removeText}>✕</Text></Pressable>
              </View>
            )}
            ListFooterComponent={<Pressable style={st.addRowBtn} onPress={addLine}><Text style={st.addRowBtnText}>+ Add Item</Text></Pressable>}
          />
          <View style={st.detailActions}>
            <Pressable style={st.completeBtn} disabled={creating} onPress={createPO}>
              {creating ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.completeBtnText}>Create PO</Text>}
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Unit picker */}
      <Modal visible={unitPickerIndex !== null} animationType="fade" transparent onRequestClose={() => setUnitPickerIndex(null)}>
        <Pressable style={st.modalBackdrop} onPress={() => setUnitPickerIndex(null)}>
          <Pressable style={st.unitSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={st.modalTitle}>Select Unit</Text>
            <View style={st.chipRow}>
              {UNITS.map((u) => (
                <Pressable key={u} style={st.chip} onPress={() => { updateLine(unitPickerIndex, "unit", u); setUnitPickerIndex(null); }}>
                  <Text style={st.chipText}>{u}</Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Receive Modal */}
      <Modal visible={!!receiveTarget} animationType="slide" onRequestClose={() => setReceiveTarget(null)}>
        <SafeAreaView style={st.safe}>
          <View style={st.detailHeader}>
            <Pressable onPress={() => setReceiveTarget(null)}><Text style={st.backLink}>‹ Cancel</Text></Pressable>
            <Text style={st.detailTitle}>Receive {receiveTarget?.po_number}</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }}>
            {receiveRows.map((r, idx) => (
              <View key={r.item_id} style={st.receiveCard}>
                <View style={st.receiveHead}>
                  <Text style={st.receiveItemName} numberOfLines={1}>{r.item_name}{r.unit ? ` (${r.unit})` : ""}</Text>
                  <Text style={st.receiveBalance}>Balance: {r.remaining}{r.unit ? ` ${r.unit}` : ""}</Text>
                </View>
                <Text style={st.fieldLabel}>Qty to Receive</Text>
                <TextInput
                  style={st.input}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor="#94a3b8"
                  value={r.qty_received}
                  onChangeText={(v) => updateReceiveRow(idx, { qty_received: v })}
                />
                {Number(r.qty_received || 0) > 0 && (
                  <>
                    <Text style={st.fieldLabel}>Batch No (optional)</Text>
                    <TextInput style={st.input} placeholder="Batch no" placeholderTextColor="#94a3b8" value={r.batch_no} onChangeText={(v) => updateReceiveRow(idx, { batch_no: v })} />
                    <Text style={st.fieldLabel}>Expiry Date (optional)</Text>
                    <TextInput style={st.input} placeholder="YYYY-MM-DD" placeholderTextColor="#94a3b8" value={r.expiry_date} onChangeText={(v) => updateReceiveRow(idx, { expiry_date: v })} />
                    <Text style={st.fieldLabel}>Serial Numbers (optional — one per line or comma)</Text>
                    <TextInput
                      style={[st.input, { height: 64 }]}
                      placeholder={"SN001\nSN002"}
                      placeholderTextColor="#94a3b8"
                      multiline
                      value={r.serial_numbers_text}
                      onChangeText={(v) => updateReceiveRow(idx, { serial_numbers_text: v })}
                    />
                    {!!r.serial_numbers_text?.trim() && (
                      <Text style={st.serialHint}>
                        {parseSerialNumbers(r.serial_numbers_text).length} entered / {Number(r.qty_received || 0)} required
                      </Text>
                    )}
                  </>
                )}
              </View>
            ))}
          </ScrollView>
          <View style={st.detailActions}>
            <Pressable style={st.completeBtn} disabled={receiving} onPress={submitReceive}>
              {receiving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.completeBtnText}>Receive Stock</Text>}
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Payment Modal */}
      <Modal visible={!!paymentTarget} animationType="slide" transparent onRequestClose={() => setPaymentTarget(null)}>
        <Pressable style={st.modalBackdrop} onPress={() => setPaymentTarget(null)}>
          <Pressable style={st.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={st.modalTitle}>Payment — {paymentTarget?.po_number}</Text>
            <Text style={st.meta}>Total: {fmt(paymentTarget?.total_amount)}</Text>
            <Text style={st.fieldLabel}>Payment Status</Text>
            <View style={st.chipRow}>
              {["UNPAID", "PARTIAL", "PAID"].map((s) => (
                <Pressable key={s} style={[st.chip, paymentStatus === s && st.chipActive]} onPress={() => setPaymentStatus(s)}>
                  <Text style={[st.chipText, paymentStatus === s && st.chipTextActive]}>{s}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={st.fieldLabel}>Paid Amount</Text>
            <TextInput style={st.input} placeholder="Paid amount" placeholderTextColor="#94a3b8" keyboardType="numeric" value={paidAmount} onChangeText={setPaidAmount} />
            <View style={st.modalActions}>
              <Pressable style={st.cancelBtn} onPress={() => setPaymentTarget(null)}><Text style={st.cancelBtnText}>Cancel</Text></Pressable>
              <Pressable style={st.saveBtn} disabled={payingBusy} onPress={submitPayment}>
                {payingBusy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.saveBtnText}>Save</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Attachments Modal (list/view only — no upload on mobile) */}
      <Modal visible={!!attachTarget} animationType="slide" transparent onRequestClose={() => setAttachTarget(null)}>
        <Pressable style={st.modalBackdrop} onPress={() => setAttachTarget(null)}>
          <Pressable style={st.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={st.modalTitle}>Attachments — {attachTarget?.po_number}</Text>
            {attachLoading ? (
              <ActivityIndicator color="#6366f1" style={{ marginVertical: 20 }} />
            ) : attachments.length === 0 ? (
              <Text style={st.empty}>No attachments yet</Text>
            ) : (
              <ScrollView style={{ maxHeight: 320 }}>
                {attachments.map((a) => (
                  <View key={a.attachment_id} style={st.attachRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={st.attachName} numberOfLines={1}>{a.original_filename}</Text>
                      {a.size_bytes ? <Text style={st.meta}>{(a.size_bytes / 1024).toFixed(1)} KB</Text> : null}
                    </View>
                    {a.url ? (
                      <Pressable style={st.openBtn} onPress={() => openAttachmentUrl(a)}>
                        <Text style={st.openBtnText}>Open</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))}
              </ScrollView>
            )}
            <Pressable style={[st.cancelBtn, { marginTop: 10 }]} onPress={() => setAttachTarget(null)}>
              <Text style={st.cancelBtnText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f6fb" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, padding: 14, paddingBottom: 4 },
  chip: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#fff" },
  chipActive: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  chipText: { fontSize: 11, fontWeight: "700", color: "#4b5563" },
  chipTextActive: { color: "#fff" },
  list: { padding: 14, paddingBottom: 90, gap: 10 },
  card: { backgroundColor: "#fff", borderRadius: 16, borderWidth: 1.5, borderColor: "#e4e9f2", padding: 12, gap: 4 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  poNo: { fontSize: 14, fontWeight: "800", color: "#0a0f1e" },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 10, fontWeight: "800" },
  meta: { fontSize: 11, color: "#6b7280" },
  chipsRow: { flexDirection: "row", gap: 6, marginTop: 6 },
  amountChip: { flex: 1, backgroundColor: "#f8f9fd", borderRadius: 10, paddingVertical: 6, paddingHorizontal: 8 },
  amountLabel: { fontSize: 9, fontWeight: "700", color: "#6b7280", textTransform: "uppercase" },
  amountValue: { fontSize: 12, fontWeight: "800", color: "#0a0f1e", marginTop: 1 },
  actionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  actionBtnText: { fontSize: 11, fontWeight: "800" },
  emptyWrap: { alignItems: "center", paddingTop: 50, gap: 10 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { color: "#9ca3af", fontSize: 15, fontWeight: "700" },
  fab: { position: "absolute", right: 16, bottom: 20, backgroundColor: "#6366f1", borderRadius: 999, paddingHorizontal: 20, paddingVertical: 14, elevation: 4 },
  fabText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  detailHeader: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14 },
  backLink: { color: "#6366f1", fontWeight: "700", fontSize: 13 },
  detailTitle: { fontSize: 16, fontWeight: "800", color: "#0a0f1e" },
  sectionLabel: { fontSize: 11, fontWeight: "800", color: "#9ca3af", textTransform: "uppercase" },
  totalText: { fontSize: 12, fontWeight: "800", color: "#0a0f1e" },
  input: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12, backgroundColor: "#f8f9fd", paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, color: "#0a0f1e" },
  itemRow: { flexDirection: "row", gap: 6, alignItems: "center", marginBottom: 6 },
  unitBox: { width: 56, alignItems: "center", justifyContent: "center", paddingVertical: 9 },
  unitBoxText: { fontSize: 11, fontWeight: "700", color: "#4b5563" },
  removeText: { color: "#dc2626", fontSize: 16, fontWeight: "800", paddingHorizontal: 4 },
  addRowBtn: { paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: "#e4e9f2", borderStyle: "dashed", alignItems: "center" },
  addRowBtnText: { color: "#6366f1", fontWeight: "700", fontSize: 12 },
  detailActions: { padding: 14, borderTopWidth: 1, borderTopColor: "#e4e9f2" },
  completeBtn: { paddingVertical: 13, borderRadius: 12, backgroundColor: "#6366f1", alignItems: "center" },
  completeBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(10,15,30,0.45)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#fff", borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, gap: 10, maxHeight: "85%" },
  unitSheet: { backgroundColor: "#fff", borderRadius: 18, padding: 18, gap: 10, marginHorizontal: 24, marginBottom: "40%" },
  modalTitle: { fontSize: 16, fontWeight: "800", color: "#0a0f1e" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 6 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: "#f1f3f9", alignItems: "center" },
  cancelBtnText: { color: "#4b5563", fontWeight: "700", fontSize: 13 },
  saveBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: "#6366f1", alignItems: "center" },
  saveBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  fieldLabel: { fontSize: 11, fontWeight: "800", color: "#9ca3af", textTransform: "uppercase", marginTop: 4 },
  receiveCard: { backgroundColor: "#fff", borderRadius: 16, borderWidth: 1.5, borderColor: "#e4e9f2", padding: 12, gap: 6 },
  receiveHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  receiveItemName: { flex: 1, fontSize: 13, fontWeight: "800", color: "#0a0f1e" },
  receiveBalance: { fontSize: 10, fontWeight: "700", color: "#6b7280" },
  serialHint: { fontSize: 10, color: "#6b7280" },
  empty: { color: "#9ca3af", fontSize: 12, textAlign: "center", paddingVertical: 20 },
  attachRow: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: "#f1f3f9", paddingVertical: 10 },
  attachName: { fontSize: 13, fontWeight: "700", color: "#0a0f1e" },
  openBtn: { backgroundColor: "#eff6ff", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  openBtnText: { color: "#2563eb", fontSize: 11, fontWeight: "800" },
});
