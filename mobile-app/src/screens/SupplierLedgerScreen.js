import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

const money = (n) => `₹${Number(n || 0).toFixed(2)}`;
const MODES = ["cash", "upi", "card", "bank"];

export default function SupplierLedgerScreen() {
  const { session } = useAuth();
  const roleLower = String(session?.role_name || session?.role || "").toLowerCase();
  const isAdmin = roleLower === "admin";

  const [allowed, setAllowed] = useState(null);
  const [canWrite, setCanWrite] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(session?.branch_id || "");

  const [suppliers, setSuppliers] = useState([]);
  const [aging, setAging] = useState([]);

  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [openPos, setOpenPos] = useState([]);
  const [statement, setStatement] = useState([]);

  const [payment, setPayment] = useState({
    amount: "",
    payment_mode: "cash",
    reference_no: "",
    notes: "",
    po_id: "",
  });

  const loadPermissions = useCallback(async () => {
    try {
      const res = await api.get("/permissions/my");
      const modules = Array.isArray(res?.data?.modules) ? res.data.modules : [];
      const map = {};
      for (const m of modules) map[String(m?.key || "")] = m;
      const row = map.supplier_ledger;
      setAllowed(Boolean(row?.can_read));
      setCanWrite(Boolean(row?.can_write));
    } catch {
      setAllowed(false);
      setCanWrite(false);
    }
  }, []);

  const loadBranches = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await api.get("/branch/active");
      setBranches(res?.data || []);
    } catch {
      setBranches([]);
    }
  }, [isAdmin]);

  const loadSuppliers = useCallback(async () => {
    try {
      const res = await api.get("/suppliers/", {
        params: { branch_id: isAdmin ? branchId || undefined : undefined },
      });
      setSuppliers(res?.data || []);
    } catch {
      setSuppliers([]);
      Alert.alert("Error", "Failed to load suppliers");
    }
  }, [isAdmin, branchId]);

  const loadAging = useCallback(async () => {
    try {
      const res = await api.get("/supplier-ledger/aging", {
        params: { branch_id: isAdmin ? branchId || undefined : undefined },
      });
      setAging(res?.data || []);
    } catch {
      setAging([]);
      Alert.alert("Error", "Failed to load aging details");
    }
  }, [isAdmin, branchId]);

  const loadSupplierDetails = useCallback(async (supplierId) => {
    if (!supplierId) {
      setOpenPos([]);
      setStatement([]);
      return;
    }
    try {
      const [poRes, stRes] = await Promise.all([
        api.get(`/supplier-ledger/supplier/${supplierId}/open-pos`, {
          params: { branch_id: isAdmin ? branchId || undefined : undefined },
        }),
        api.get(`/supplier-ledger/supplier/${supplierId}/statement`, {
          params: { branch_id: isAdmin ? branchId || undefined : undefined },
        }),
      ]);
      setOpenPos(poRes?.data || []);
      setStatement(stRes?.data || []);
    } catch (err) {
      setOpenPos([]);
      setStatement([]);
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load supplier ledger");
    }
  }, [isAdmin, branchId]);

  const loadAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      await loadPermissions();
      await loadBranches();
      await loadSuppliers();
      await loadAging();
      await loadSupplierDetails(selectedSupplierId);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadPermissions, loadBranches, loadSuppliers, loadAging, loadSupplierDetails, selectedSupplierId]);

  useEffect(() => {
    loadAll(false);
  }, [loadAll]);

  useEffect(() => {
    if (allowed) {
      loadSuppliers();
      loadAging();
      loadSupplierDetails(selectedSupplierId);
    }
  }, [branchId]);

  const totalDue = useMemo(
    () => aging.reduce((sum, row) => sum + Number(row?.total_due || 0), 0),
    [aging]
  );

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => Number(s.supplier_id) === Number(selectedSupplierId)) || null,
    [suppliers, selectedSupplierId]
  );

  const recordPayment = async () => {
    if (!canWrite) {
      Alert.alert("Not Allowed", "You are not allowed to record payments.");
      return;
    }
    if (!selectedSupplierId) {
      Alert.alert("Select Supplier", "Please select a supplier first.");
      return;
    }
    const amount = Number(payment.amount || 0);
    if (!amount || amount <= 0) {
      Alert.alert("Invalid Amount", "Enter a valid payment amount.");
      return;
    }

    try {
      await api.post("/supplier-ledger/payment", {
        supplier_id: Number(selectedSupplierId),
        branch_id: isAdmin ? Number(branchId) : undefined,
        po_id: payment.po_id ? Number(payment.po_id) : undefined,
        amount,
        payment_mode: payment.payment_mode || "cash",
        reference_no: payment.reference_no || undefined,
        notes: payment.notes || undefined,
      });
      setPayment({ amount: "", payment_mode: "cash", reference_no: "", notes: "", po_id: "" });
      Alert.alert("Success", "Payment recorded.");
      await loadAging();
      await loadSupplierDetails(selectedSupplierId);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Payment failed");
    }
  };

  if (loading || allowed === null) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator size="large" color="#0b57d0" /></View>
      </SafeAreaView>
    );
  }

  if (!allowed) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Not Authorized</Text>
          <Text style={styles.errorSub}>You do not have access to Supplier Ledger.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadAll(true)} colors={["#0b57d0"]} />}
      >
        <View style={styles.card}>
          <View style={styles.headRow}>
            <Text style={styles.title}>Supplier Ledger</Text>
            <Pressable style={styles.refreshBtn} onPress={() => loadAll(true)}>
              <Text style={styles.refreshTxt}>Refresh</Text>
            </Pressable>
          </View>
          <Text style={styles.totalDue}>Total Due: {money(totalDue)}</Text>

          {isAdmin && branches.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {branches.map((b) => {
                const active = Number(branchId) === Number(b.branch_id);
                return (
                  <Pressable
                    key={String(b.branch_id)}
                    style={[styles.chip, active && styles.chipOn]}
                    onPress={() => setBranchId(b.branch_id)}
                  >
                    <Text style={[styles.chipTxt, active && styles.chipTxtOn]}>{b.branch_name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>Aging Outstanding</Text>
          {aging.length === 0 ? (
            <Text style={styles.empty}>No outstanding dues</Text>
          ) : (
            aging.map((a) => {
              const active = Number(selectedSupplierId) === Number(a.supplier_id);
              return (
                <Pressable
                  key={String(a.supplier_id)}
                  style={[styles.row, active && styles.rowActive]}
                  onPress={() => setSelectedSupplierId(String(a.supplier_id))}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName}>{a.supplier_name}</Text>
                    <Text style={styles.rowMeta}>
                      0-30: {money(a.due_0_30)}  31-60: {money(a.due_31_60)}  90+: {money(a.due_90_plus)}
                    </Text>
                  </View>
                  <Text style={styles.rowDue}>{money(a.total_due)}</Text>
                </Pressable>
              );
            })
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>Supplier</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {suppliers.map((s) => {
              const active = Number(selectedSupplierId) === Number(s.supplier_id);
              return (
                <Pressable
                  key={String(s.supplier_id)}
                  style={[styles.chip, active && styles.chipOn]}
                  onPress={() => setSelectedSupplierId(String(s.supplier_id))}
                >
                  <Text style={[styles.chipTxt, active && styles.chipTxtOn]}>{s.supplier_name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {selectedSupplier ? (
            <Text style={styles.supplierNote}>
              Credit Terms: {Number(selectedSupplier.credit_terms_days || 0)} days
            </Text>
          ) : (
            <Text style={styles.empty}>Select a supplier</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>Record Payment</Text>
          <TextInput
            style={styles.input}
            value={payment.amount}
            onChangeText={(v) => setPayment((p) => ({ ...p, amount: v }))}
            placeholder="Amount"
            keyboardType="numeric"
          />

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {MODES.map((m) => {
              const active = payment.payment_mode === m;
              return (
                <Pressable
                  key={m}
                  style={[styles.chip, active && styles.chipOn]}
                  onPress={() => setPayment((p) => ({ ...p, payment_mode: m }))}
                >
                  <Text style={[styles.chipTxt, active && styles.chipTxtOn]}>{m.toUpperCase()}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={styles.subSection}>Apply to PO (optional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Pressable
              style={[styles.chip, payment.po_id === "" && styles.chipOn]}
              onPress={() => setPayment((p) => ({ ...p, po_id: "" }))}
            >
              <Text style={[styles.chipTxt, payment.po_id === "" && styles.chipTxtOn]}>Any PO</Text>
            </Pressable>
            {openPos.map((p) => {
              const id = String(p.po_id);
              const active = payment.po_id === id;
              return (
                <Pressable
                  key={id}
                  style={[styles.chip, active && styles.chipOn]}
                  onPress={() => setPayment((prev) => ({ ...prev, po_id: id }))}
                >
                  <Text style={[styles.chipTxt, active && styles.chipTxtOn]}>
                    {p.po_number} ({money(p.due_amount)})
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <TextInput
            style={styles.input}
            value={payment.reference_no}
            onChangeText={(v) => setPayment((p) => ({ ...p, reference_no: v }))}
            placeholder="Reference No (optional)"
          />
          <TextInput
            style={[styles.input, { height: 72 }]}
            value={payment.notes}
            onChangeText={(v) => setPayment((p) => ({ ...p, notes: v }))}
            placeholder="Notes (optional)"
            multiline
          />

          <Pressable style={[styles.saveBtn, !canWrite && styles.saveBtnOff]} onPress={recordPayment} disabled={!canWrite}>
            <Text style={styles.saveTxt}>Save Payment</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>Open Purchase Orders</Text>
          {openPos.length === 0 ? (
            <Text style={styles.empty}>{selectedSupplierId ? "No open POs" : "Select a supplier"}</Text>
          ) : (
            openPos.map((p) => (
              <View key={String(p.po_id)} style={styles.poRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{p.po_number}</Text>
                  <Text style={styles.rowMeta}>{p.order_date || "-"}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.rowMeta}>Total {money(p.total_amount)}</Text>
                  <Text style={styles.rowDue}>{money(p.due_amount)}</Text>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>Ledger Statement</Text>
          {statement.length === 0 ? (
            <Text style={styles.empty}>{selectedSupplierId ? "No entries" : "Select a supplier"}</Text>
          ) : (
            statement.map((e) => (
              <View key={String(e.entry_id)} style={styles.stRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{e.entry_type || "ENTRY"}</Text>
                  <Text style={styles.rowMeta}>
                    {e.entry_time ? new Date(e.entry_time).toLocaleString() : "-"}
                  </Text>
                  {!!e.notes && <Text style={styles.rowMeta}>{e.notes}</Text>}
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.debit}>{Number(e.debit || 0) > 0 ? money(e.debit) : "-"}</Text>
                  <Text style={styles.credit}>{Number(e.credit || 0) > 0 ? money(e.credit) : "-"}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f3f6ff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 12, gap: 10, paddingBottom: 26 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#d9e3ff",
    padding: 12,
    gap: 8,
  },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 16, fontWeight: "800", color: "#0b1220" },
  totalDue: { color: "#dc2626", fontWeight: "700", fontSize: 13 },
  refreshBtn: {
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#e8f0ff",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  refreshTxt: { color: "#0b57d0", fontWeight: "700", fontSize: 12 },
  section: { fontSize: 13, fontWeight: "800", color: "#1e293b" },
  subSection: { fontSize: 11, fontWeight: "700", color: "#475569", marginTop: 4 },
  empty: { color: "#94a3b8", fontSize: 12, paddingVertical: 8 },
  chips: { flexDirection: "row", gap: 8, paddingVertical: 4 },
  chip: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipOn: { backgroundColor: "#0b57d0", borderColor: "#0b57d0" },
  chipTxt: { color: "#334155", fontWeight: "700", fontSize: 11 },
  chipTxtOn: { color: "#fff" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#f3f6ff",
    borderRadius: 10,
    padding: 8,
  },
  rowActive: { borderColor: "#93c5fd", backgroundColor: "#e8f0ff" },
  rowName: { color: "#0b1220", fontWeight: "700", fontSize: 12 },
  rowMeta: { color: "#64748b", fontSize: 11 },
  rowDue: { color: "#dc2626", fontWeight: "800", fontSize: 12 },
  supplierNote: { color: "#475569", fontSize: 12, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    backgroundColor: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 13,
    color: "#0b1220",
  },
  saveBtn: {
    backgroundColor: "#059669",
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
  },
  saveBtnOff: { opacity: 0.6 },
  saveTxt: { color: "#fff", fontWeight: "800" },
  poRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f6ff",
    paddingVertical: 8,
  },
  stRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f6ff",
    paddingVertical: 8,
  },
  debit: { color: "#dc2626", fontSize: 11, fontWeight: "700" },
  credit: { color: "#059669", fontSize: 11, fontWeight: "700" },
  errorTitle: { fontSize: 16, fontWeight: "800", color: "#b91c1c" },
  errorSub: { marginTop: 6, color: "#64748b" },
});
