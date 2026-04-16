import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import api from "../api/client";
import { WEB_APP_BASE } from "../config/api";
import { useAuth } from "../context/AuthContext";
import { printInvoiceByData } from "../utils/printInvoice";

const pad = (n) => String(n).padStart(2, "0");
const toYmd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtMoney = (v) => `Rs. ${Number(v || 0).toFixed(2)}`;

const dateRanges = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 Days" },
  { key: "30d", label: "Last 30 Days" },
];

function parseBusinessDate(appDate) {
  if (!appDate || typeof appDate !== "string") return new Date();
  const [y, m, d] = appDate.slice(0, 10).split("-").map((v) => Number(v));
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
}

function getRange(mode, appDate) {
  const to = parseBusinessDate(appDate);
  const from = new Date(to);
  if (mode === "7d") from.setDate(from.getDate() - 6);
  if (mode === "30d") from.setDate(from.getDate() - 29);
  return { from_date: toYmd(from), to_date: toYmd(to) };
}

function displayDate(v) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function getServiceChargeValue(inv = {}) {
  const split = (inv?.payment_split && typeof inv.payment_split === "object") ? inv.payment_split : {};
  const candidates = [
    inv?.service_charge,
    inv?.service_charge_amt,
    inv?.service_charge_amount,
    split?.service_charge,
    split?.service_charge_amt,
    split?.service_charge_amount,
  ];
  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

export default function SalesHistoryScreen() {
  const { session } = useAuth();
  const [range, setRange] = useState("today");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [businessDate, setBusinessDate] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [shopDetails, setShopDetails] = useState({});
  const [branchDetails, setBranchDetails] = useState({});

  const [rows, setRows] = useState([]);
  const [activeInvoice, setActiveInvoice] = useState(null);
  const [items, setItems] = useState([]);    // editable items when editing
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editCustomerName, setEditCustomerName] = useState("");
  const [editCustomerMobile, setEditCustomerMobile] = useState("");
  const [editDiscount, setEditDiscount] = useState("0");
  const [editPaymentMode, setEditPaymentMode] = useState("cash");

  const loadRows = async (withLoader = true) => {
    if (withLoader) setLoading(true);
    else setRefreshing(true);

    try {
      let activeBusinessDate = businessDate;
      if (!activeBusinessDate) {
        const branchPromise = session?.branch_id
          ? api.get(`/branch/${session.branch_id}`).catch(() => null)
          : Promise.resolve(null);
        const [shopRes, branchRes] = await Promise.all([
          api.get("/shop/details"),
          branchPromise,
        ]);
        activeBusinessDate = shopRes?.data?.app_date || null;
        setBusinessDate(activeBusinessDate);
        setShopDetails(shopRes?.data || {});
        setBranchDetails(branchRes?.data || {});
      }
      const params = getRange(range, activeBusinessDate);
      const res = await api.get("/invoice/list", { params });
      setRows(res?.data || []);
    } catch (err) {
      const msg = err?.response?.data?.detail || "Failed to load invoices";
      Alert.alert("Error", String(msg));
    } finally {
      if (withLoader) setLoading(false);
      else setRefreshing(false);
    }
  };

  useEffect(() => {
    loadRows(true);
  }, [range, businessDate]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return (rows || []).filter((r) =>
      `${r.invoice_number || ""} ${r.customer_name || ""} ${r.mobile || ""}`
        .toLowerCase()
        .includes(q)
    );
  }, [rows, search]);

  const openInvoice = async (invoiceNo) => {
    try {
      const res = await api.get(`/invoice/by-number/${invoiceNo}`);
      const inv = res?.data || null;
      setActiveInvoice(inv);
        setItems(inv?.items || []);      // initialize editable items
      setEditCustomerName(String(inv?.customer_name || "Walk-in"));
      setEditCustomerMobile(String(inv?.mobile || ""));
      setEditDiscount(String(Number(inv?.discounted_amt || 0)));
      setEditPaymentMode(String(inv?.payment_mode || "cash"));
    } catch (err) {
      const msg = err?.response?.data?.detail || "Failed to load invoice details";
      Alert.alert("Error", String(msg));
    }
  };

  const isBusinessDateInvoice =
    !!activeInvoice &&
    !!businessDate &&
    String(activeInvoice?.created_time || "").slice(0, 10) === String(businessDate).slice(0, 10);

  const saveInvoiceChanges = async () => {
    if (!activeInvoice?.invoice_id) return;
    const payloadItems = (items || []).map((it) => ({
      item_id: Number(it.item_id),
      quantity: Number(it.quantity || 0),
      amount: Number((Number(it.price || 0) * Number(it.quantity || 0)) || it.amount || 0),
    })).filter((it) => it.item_id > 0 && it.quantity > 0);

    if (!payloadItems.length) {
      Alert.alert("Error", "Invoice items missing");
      return;
    }

    setEditing(true);
    try {
      await api.put(`/invoice/${activeInvoice.invoice_id}`, {
        customer_name: editCustomerName.trim() || "Walk-in",
        mobile: editCustomerMobile.trim() || null,
        discounted_amt: Number(editDiscount || 0),
        payment_mode: editPaymentMode,
        items: payloadItems,
      });
      Alert.alert("Updated", "Invoice updated successfully.");
      await loadRows(false);
      await openInvoice(activeInvoice.invoice_number);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to update invoice");
    } finally {
      setEditing(false);
    }
  };

  const removeServiceCharge = async () => {
    if (!activeInvoice?.invoice_id) return;
    try {
      const res = await api.patch(`/invoice/${activeInvoice.invoice_id}/remove-service-charge`);
      Alert.alert("Updated", "Service charge removed successfully.");
      setActiveInvoice((prev) => {
        if (!prev) return prev;
        const split = { ...(prev.payment_split || {}) };
        delete split.service_charge;
        delete split.service_charge_gst;
        delete split.serviceCharge;
        delete split.serviceChargeGst;
        return {
          ...prev,
          payment_split: Object.keys(split).length ? split : null,
          total_amount: Number(res?.data?.new_total ?? prev.total_amount ?? 0),
        };
      });
      await loadRows(false);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Could not remove service charge");
    }
  };

  const deleteInvoice = async () => {
    if (!activeInvoice?.invoice_id) return;
    Alert.alert("Delete Invoice", `Delete ${activeInvoice.invoice_number}?`, [
      { text: "No", style: "cancel" },
      {
        text: "Yes, Delete",
        style: "destructive",
        onPress: async () => {
          setDeleting(true);
          try {
            await api.delete(`/invoice/${activeInvoice.invoice_id}`);
            Alert.alert("Deleted", "Invoice deleted successfully.");
            setActiveInvoice(null);
            await loadRows(false);
          } catch (err) {
            Alert.alert("Error", err?.response?.data?.detail || "Failed to delete invoice");
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  const handlePrintInvoice = async () => {
    if (!activeInvoice) return;
    if (branchDetails?.receipt_required === false) {
      Alert.alert("Print Disabled", "Receipt printing is disabled for this branch.");
      return;
    }

    setPrinting(true);
    try {
      await printInvoiceByData(activeInvoice, {
        shop: shopDetails,
        branch: branchDetails,
        shopName: shopDetails?.shop_name || "Haappii Billing",
        webBase: WEB_APP_BASE,
        disableNative: true,
      });
      Alert.alert("Print", "Invoice sent to printer.");
    } catch (err) {
      Alert.alert("Print Error", err?.message || "Failed to print invoice.");
    } finally {
      setPrinting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Filters</Text>
          {businessDate ? (
            <Text style={styles.businessDate}>Business Date: {String(businessDate).slice(0, 10)}</Text>
          ) : null}
          <View style={styles.rangeRow}>
            {dateRanges.map((r) => (
              <Pressable
                key={r.key}
                style={[styles.rangeBtn, range === r.key && styles.rangeBtnActive]}
                onPress={() => setRange(r.key)}
              >
                <Text style={[styles.rangeTxt, range === r.key && styles.rangeTxtActive]}>
                  {r.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            style={styles.input}
            value={search}
            onChangeText={setSearch}
            placeholder="Search invoice / customer / mobile"
          />

          <Pressable style={styles.refreshBtn} onPress={() => loadRows(false)}>
            <Text style={styles.refreshTxt}>{refreshing ? "Refreshing..." : "Refresh"}</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Invoices ({filtered.length})</Text>
          {filtered.length === 0 ? <Text style={styles.empty}>No invoices found.</Text> : null}
          {filtered.map((r) => (
            <Pressable
              key={String(r.invoice_id)}
              style={styles.row}
              onPress={() => openInvoice(r.invoice_number)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.invNo}>{r.invoice_number}</Text>
                <Text style={styles.sub}>{displayDate(r.created_time)}</Text>
                <Text style={styles.sub}>
                  {r.customer_name || "Walk-in"} | {r.mobile || "-"}
                </Text>
              </View>
              <Text style={styles.amount}>{fmtMoney(Number(r.total_amount || 0) - Number(r.discounted_amt || 0))}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <Modal
        visible={Boolean(activeInvoice)}
        animationType="slide"
        onRequestClose={() => setActiveInvoice(null)}
      >
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>Invoice Details</Text>
            <View style={styles.modalHeadActions}>
              <Pressable
                style={[styles.printBtn, printing && styles.printBtnDisabled]}
                disabled={printing}
                onPress={handlePrintInvoice}
              >
                <Text style={styles.printBtnText}>{printing ? "Printing..." : "Print"}</Text>
              </Pressable>
              <Pressable onPress={() => setActiveInvoice(null)}>
                <Text style={styles.close}>Close</Text>
              </Pressable>
            </View>
          </View>

          {activeInvoice ? (
            <ScrollView contentContainerStyle={styles.modalBody}>
              <Text style={styles.detailLine}>Invoice: {activeInvoice.invoice_number}</Text>
              <Text style={styles.detailLine}>
                Date: {displayDate(activeInvoice.created_time)}
              </Text>
              <Text style={styles.detailLine}>
                Customer: {activeInvoice.customer_name || "Walk-in"}
              </Text>
              <Text style={styles.detailLine}>Mobile: {activeInvoice.mobile || "-"}</Text>
              <Text style={styles.detailLine}>
                Payment: {String(activeInvoice.payment_mode || "cash").toUpperCase()}
              </Text>

              <View style={styles.itemsBox}>
                <Text style={styles.itemsTitle}>Items</Text>
                {(activeInvoice.items || []).map((it, idx) => (
                  <View key={`${it.item_id}-${idx}`} style={styles.itemRow}>
                    <Text style={{ flex: 1 }}>{it.item_name}</Text>
                    {isBusinessDateInvoice ? (
                      <View style={styles.itemEditRow}>
                        <TextInput
                          style={styles.qtyEditInput}
                          keyboardType="numeric"
                          value={String(items[idx]?.quantity ?? it.quantity ?? 1)}
                          onChangeText={(v) => {
                            const nextQty = Math.max(1, Number(v.replace(/[^\d]/g, "") || 1));
                            setItems((prev) => {
                              const clone = [...prev];
                              const price = Number(clone[idx]?.price || 0);
                              clone[idx] = {
                                ...clone[idx],
                                quantity: nextQty,
                                amount: price * nextQty,
                              };
                              return clone;
                            });
                          }}
                        />
                        <Text style={styles.qtyLabel}>qty</Text>
                      </View>
                    ) : (
                      <Text style={styles.qtyStatic}>x {it.quantity}</Text>
                    )}
                    <Text>{fmtMoney(items[idx]?.amount ?? it.amount)}</Text>
                  </View>
                ))}
              </View>

              <Text style={styles.totalLine}>Tax: {fmtMoney(activeInvoice.tax_amt)}</Text>
              <Text style={styles.totalLine}>Service Charge: {fmtMoney(getServiceChargeValue(activeInvoice))}</Text>
              <Text style={styles.totalLine}>Discount: {fmtMoney(activeInvoice.discounted_amt)}</Text>
              <Text style={styles.totalBig}>Total: {fmtMoney(Number(activeInvoice.total_amount || 0) - Number(activeInvoice.discounted_amt || 0))}</Text>

              {isBusinessDateInvoice ? (
                <View style={styles.editSection}>
                  <Text style={styles.itemsTitle}>Edit (Business Date)</Text>
                  <TextInput
                    style={styles.input}
                    value={editCustomerName}
                    onChangeText={setEditCustomerName}
                    placeholder="Customer name"
                    placeholderTextColor="#94a3b8"
                  />
                  <TextInput
                    style={styles.input}
                    value={editCustomerMobile}
                    onChangeText={setEditCustomerMobile}
                    placeholder="Mobile"
                    placeholderTextColor="#94a3b8"
                    keyboardType="phone-pad"
                  />
                  <TextInput
                    style={styles.input}
                    value={editDiscount}
                    onChangeText={setEditDiscount}
                    placeholder="Discount"
                    placeholderTextColor="#94a3b8"
                    keyboardType="decimal-pad"
                  />
                  <View style={styles.modeRow}>
                    {["cash", "card", "upi", "credit"].map((m) => (
                      <Pressable
                        key={m}
                        style={[styles.modeBtn, editPaymentMode === m && styles.modeBtnActive]}
                        onPress={() => setEditPaymentMode(m)}
                      >
                        <Text style={[styles.modeText, editPaymentMode === m && styles.modeTextActive]}>
                          {m.toUpperCase()}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={styles.editActions}>
                    <Pressable
                      style={[styles.updateBtn, editing && styles.printBtnDisabled]}
                      onPress={saveInvoiceChanges}
                      disabled={editing}
                    >
                      <Text style={styles.updateBtnText}>{editing ? "Updating..." : "Update"}</Text>
                    </Pressable>
                    <Pressable
                      style={styles.removeScBtn}
                      onPress={removeServiceCharge}
                    >
                      <Text style={styles.removeScBtnText}>Remove Service Charge</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.deleteBtn, deleting && styles.printBtnDisabled]}
                      onPress={deleteInvoice}
                      disabled={deleting}
                    >
                      <Text style={styles.deleteBtnText}>{deleting ? "Deleting..." : "Delete"}</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f3f6ff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 12, gap: 10, paddingBottom: 20 },
  section: {
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d9e3ff",
    padding: 12,
    gap: 8,
  },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: "#0b1220" },
  businessDate: { color: "#0b57d0", fontWeight: "700", fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  rangeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  rangeBtn: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  rangeBtnActive: { backgroundColor: "#0b57d0", borderColor: "#0b57d0" },
  rangeTxt: { fontSize: 12, fontWeight: "700", color: "#334155" },
  rangeTxtActive: { color: "#fff" },
  refreshBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#d9e3ff",
  },
  refreshTxt: { fontWeight: "700", color: "#334155" },
  empty: { color: "#64748b" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#d9e3ff",
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#fff",
  },
  invNo: { fontWeight: "800", color: "#0b1220" },
  sub: { marginTop: 2, color: "#475569", fontSize: 12 },
  amount: { marginLeft: 8, fontWeight: "800", color: "#047857" },
  modalSafe: { flex: 1, backgroundColor: "#ffffff" },
  modalHead: {
    padding: 14,
    borderBottomWidth: 1,
    borderColor: "#d9e3ff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
  },
  modalTitle: { fontSize: 16, fontWeight: "800", color: "#0b1220" },
  modalHeadActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  printBtn: {
    backgroundColor: "#0b57d0",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  printBtnDisabled: { opacity: 0.7 },
  printBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  close: { color: "#0b57d0", fontWeight: "700" },
  modalBody: { padding: 14, gap: 8 },
  detailLine: { color: "#334155" },
  itemsBox: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#d9e3ff",
    borderRadius: 10,
    padding: 10,
    gap: 8,
    backgroundColor: "#fff",
  },
  itemsTitle: { fontWeight: "800", color: "#0b1220" },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  itemEditRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  qtyEditInput: {
    width: 46,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 6,
    textAlign: "center",
    color: "#0b1220",
    backgroundColor: "#fff",
  },
  qtyLabel: { fontSize: 11, color: "#64748b" },
  qtyStatic: { fontSize: 13, color: "#334155", fontWeight: "600" },
  totalLine: { marginTop: 3, color: "#334155" },
  totalBig: { marginTop: 8, fontSize: 18, fontWeight: "800", color: "#047857" },
  editSection: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#d9e3ff",
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#fff",
    gap: 8,
  },
  modeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  modeBtn: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "#fff",
  },
  modeBtnActive: { backgroundColor: "#0b57d0", borderColor: "#0b57d0" },
  modeText: { color: "#334155", fontWeight: "700", fontSize: 11 },
  modeTextActive: { color: "#fff" },
  editActions: { flexDirection: "row", gap: 8 },
  updateBtn: {
    flex: 1,
    backgroundColor: "#059669",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  updateBtnText: { color: "#fff", fontWeight: "700" },
  deleteBtn: {
    flex: 1,
    backgroundColor: "#dc2626",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  deleteBtnText: { color: "#fff", fontWeight: "700" },
  removeScBtn: {
    flex: 1,
    backgroundColor: "#fef3c7",
    borderColor: "#f59e0b",
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  removeScBtnText: { color: "#92400e", fontWeight: "700", fontSize: 12, textAlign: "center" },
});
