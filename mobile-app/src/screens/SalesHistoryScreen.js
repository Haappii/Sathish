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
  safe: { flex: 1, backgroundColor: "#f0f4ff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 14, gap: 12, paddingBottom: 24 },
  section: {
    borderRadius: 18,
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#dde6f7",
    padding: 14,
    gap: 10,
    shadowColor: "#1a2463",
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: "#0c1228", letterSpacing: 0.6, textTransform: "uppercase" },
  businessDate: { color: "#2563eb", fontWeight: "800", fontSize: 12 },
  input: {
    borderWidth: 1.5,
    borderColor: "#d0dcf0",
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 12,
    backgroundColor: "#f6f8fe",
    color: "#0c1228",
    fontSize: 14,
  },
  rangeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  rangeBtn: {
    borderWidth: 1.5,
    borderColor: "#d0dcf0",
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 9,
    backgroundColor: "#f6f8fe",
  },
  rangeBtnActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  rangeTxt: { fontSize: 12, fontWeight: "700", color: "#4a5a78" },
  rangeTxtActive: { color: "#fff" },
  refreshBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#eef2ff",
    borderWidth: 1.5,
    borderColor: "#dde6f7",
  },
  refreshTxt: { fontWeight: "700", color: "#2563eb", fontSize: 13 },
  empty: { color: "#8896ae", fontSize: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#dde6f7",
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#fff",
    shadowColor: "#1a2463",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  invNo: { fontWeight: "800", color: "#0c1228", fontSize: 14 },
  sub: { marginTop: 3, color: "#4a5a78", fontSize: 12 },
  amount: { marginLeft: 8, fontWeight: "800", color: "#059669", fontSize: 15 },
  modalSafe: { flex: 1, backgroundColor: "#f0f4ff" },
  modalHead: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: "#dde6f7",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    shadowColor: "#1a2463",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  modalTitle: { fontSize: 17, fontWeight: "900", color: "#0c1228" },
  modalHeadActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  printBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    shadowColor: "#2563eb",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  printBtnDisabled: { opacity: 0.65 },
  printBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  close: { color: "#2563eb", fontWeight: "800", fontSize: 14 },
  modalBody: { padding: 16, gap: 10 },
  detailLine: { color: "#4a5a78", fontSize: 14 },
  itemsBox: {
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: "#dde6f7",
    borderRadius: 14,
    padding: 12,
    gap: 8,
    backgroundColor: "#fff",
  },
  itemsTitle: { fontWeight: "800", color: "#0c1228", fontSize: 14 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  itemEditRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  qtyEditInput: {
    width: 48,
    borderWidth: 1.5,
    borderColor: "#d0dcf0",
    borderRadius: 9,
    paddingVertical: 5,
    paddingHorizontal: 6,
    textAlign: "center",
    color: "#0c1228",
    backgroundColor: "#f6f8fe",
    fontSize: 14,
  },
  qtyLabel: { fontSize: 11, color: "#8896ae", fontWeight: "600" },
  qtyStatic: { fontSize: 13, color: "#4a5a78", fontWeight: "700" },
  totalLine: { marginTop: 3, color: "#4a5a78", fontSize: 14 },
  totalBig: { marginTop: 10, fontSize: 20, fontWeight: "900", color: "#059669", letterSpacing: -0.3 },
  editSection: {
    marginTop: 14,
    borderWidth: 1.5,
    borderColor: "#dde6f7",
    borderRadius: 14,
    padding: 14,
    backgroundColor: "#fff",
    gap: 10,
  },
  modeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  modeBtn: {
    borderWidth: 1.5,
    borderColor: "#d0dcf0",
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 8,
    backgroundColor: "#f6f8fe",
  },
  modeBtnActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  modeText: { color: "#4a5a78", fontWeight: "700", fontSize: 11 },
  modeTextActive: { color: "#fff" },
  editActions: { flexDirection: "row", gap: 8 },
  updateBtn: {
    flex: 1,
    backgroundColor: "#059669",
    borderRadius: 11,
    paddingVertical: 12,
    alignItems: "center",
    shadowColor: "#059669",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  updateBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  deleteBtn: {
    flex: 1,
    backgroundColor: "#dc2626",
    borderRadius: 11,
    paddingVertical: 12,
    alignItems: "center",
    shadowColor: "#dc2626",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  deleteBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  removeScBtn: {
    flex: 1,
    backgroundColor: "#fffbeb",
    borderColor: "#f59e0b",
    borderWidth: 1.5,
    borderRadius: 11,
    paddingVertical: 12,
    alignItems: "center",
  },
  removeScBtnText: { color: "#92400e", fontWeight: "700", fontSize: 12, textAlign: "center" },
});
