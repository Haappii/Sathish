import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import api from "../api/client";
import { buildMobileMenu, modulesToPermMap } from "../auth/rbac";
import PrinterSettingsModal from "../components/PrinterSettingsModal";
import { useAuth } from "../context/AuthContext";
import useOnlineStatus from "../hooks/useOnlineStatus";
import { getPendingCount } from "../offline/queue";
import { syncOfflineQueue } from "../offline/sync";

export default function HomeScreen({ navigation }) {
  const { session, logout } = useAuth();
  const { isOnline } = useOnlineStatus();

  const [shopName, setShopName]     = useState("Haappii Billing");
  const [isHotel, setIsHotel]       = useState(false);
  const [permsEnabled, setPermsEnabled] = useState(false);
  const [permMap, setPermMap]       = useState(null);
  const [loading, setLoading]       = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing]       = useState(false);
  const [holdBills, setHoldBills]   = useState([]);
  const [holdBusyId, setHoldBusyId] = useState(null);
  const [showPrinterSettings, setShowPrinterSettings] = useState(false);

  const roleLower = String(session?.role_name || session?.role || "").toLowerCase();
  const branchName = String(session?.branch_name || "").trim();
  const shopBranchLabel = branchName ? `${shopName} - ${branchName}` : shopName;

  useEffect(() => {
    let mounted = true;
    const loadHoldBills = async () => {
      if (!isHotel) {
        setHoldBills([]);
        return;
      }
      try {
        const res = await api.get("/table-billing/takeaway/orders");
        setHoldBills(Array.isArray(res?.data) ? res.data : []);
      } catch {
        setHoldBills([]);
      }
    };

    (async () => {
      setLoading(true);
      try {
        const [shopRes, permRes] = await Promise.all([
          api.get("/shop/details"),
          api.get("/permissions/my"),
        ]);

        if (!mounted) return;

        const shopData = shopRes?.data || {};
        setShopName(shopData.shop_name || "Haappii Billing");
        const billingType = String(shopData.billing_type || shopData.shop_type || "").toLowerCase();
        setIsHotel(billingType === "hotel");

        setPermsEnabled(Boolean(permRes?.data?.enabled));
        setPermMap(modulesToPermMap(permRes?.data?.modules));

        // Refresh offline pending count
        const count = await getPendingCount();
        setPendingCount(count);
        if (billingType === "hotel") {
          const holdRes = await api.get("/table-billing/takeaway/orders");
          setHoldBills(Array.isArray(holdRes?.data) ? holdRes.data : []);
        }
      } catch (err) {
        if (!mounted) return;
        const msg = err?.response?.data?.detail || "Failed to load home";
        Alert.alert("Error", String(msg));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const refreshHoldBills = async () => {
    if (!isHotel) return;
    try {
      const res = await api.get("/table-billing/takeaway/orders");
      setHoldBills(Array.isArray(res?.data) ? res.data : []);
    } catch {
      setHoldBills([]);
    }
  };

  const getHoldOrderId = (row) => {
    const raw = row?.order_id ?? row?.source_order_id ?? row?.id ?? null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const completeHoldBill = (row, paymentMode = "cash") => {
    const holdOrderId = getHoldOrderId(row);
    if (!holdOrderId) {
      Alert.alert("Error", "Unable to identify this hold bill. Please refresh and try again.");
      return;
    }

    Alert.alert(
      "Complete Hold Bill",
      `Complete token ${row?.token_number || `#${holdOrderId}`} with ${String(paymentMode).toUpperCase()} payment?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Complete",
          onPress: async () => {
            try {
              setHoldBusyId(holdOrderId);
              const payload = {
                customer_name: row?.customer_name || "Walk-in",
                mobile: row?.mobile || null,
                payment_mode: paymentMode,
                payment_split: null,
                service_charge: 0,
              };
              const res = await api.post(`/table-billing/order/checkout/${holdOrderId}`, payload);
              const invoiceNo = String(res?.data?.invoice_number || "").trim();
              Alert.alert("Completed", invoiceNo ? `Invoice: ${invoiceNo}` : "Hold bill completed.");
              await refreshHoldBills();
            } catch (err) {
              Alert.alert("Error", err?.response?.data?.detail || "Failed to complete hold bill");
            } finally {
              setHoldBusyId(null);
            }
          },
        },
      ]
    );
  };

  const openCompleteOptions = (row) => {
    Alert.alert(
      "Select Payment",
      "Choose payment mode to complete this hold bill.",
      [
        { text: "Cash", onPress: () => completeHoldBill(row, "cash") },
        { text: "Card", onPress: () => completeHoldBill(row, "card") },
        { text: "UPI", onPress: () => completeHoldBill(row, "upi") },
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  const clearTakeawayOrder = async (holdOrderId) => {
    const candidates = [
      () => api.post(`/table-billing/order/cancel/${holdOrderId}`),
      () => api.post(`/table-billing/order/cancel/${holdOrderId}/`),
      () => api.post(`/table-billing/orders/${holdOrderId}/cancel`),
      () => api.put(`/table-billing/orders/${holdOrderId}/cancel`),
      () => api.delete(`/table-billing/orders/${holdOrderId}`),
      () => api.post("/table-billing/order/cancel", { order_id: holdOrderId }),
    ];

    let lastErr = null;
    for (const fn of candidates) {
      try {
        await fn();
        return true;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error("Order clear failed");
  };

  const cancelHoldBill = async (row) => {
    const holdOrderId = getHoldOrderId(row);
    if (!holdOrderId) {
      Alert.alert("Error", "Unable to identify this hold bill. Please refresh and try again.");
      return;
    }

    Alert.alert(
      "Cancel Hold Bill",
      `Cancel token ${row?.token_number || `#${holdOrderId}`}?`,
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, Cancel",
          style: "destructive",
          onPress: async () => {
            try {
              setHoldBusyId(holdOrderId);
              await clearTakeawayOrder(holdOrderId);
              Alert.alert("Cancelled", "Hold bill cancelled.");
              await refreshHoldBills();
            } catch (err) {
              const status = Number(err?.response?.status || 0);
              const detail = err?.response?.data?.detail || err?.message || "Failed to cancel hold bill";
              Alert.alert("Error", status ? `${detail} (HTTP ${status})` : String(detail));
            } finally {
              setHoldBusyId(null);
            }
          },
        },
      ]
    );
  };

  const markPickedUp = async (row) => {
    const holdOrderId = getHoldOrderId(row);
    if (!holdOrderId) {
      Alert.alert("Error", "Unable to identify this hold bill. Please refresh and try again.");
      return;
    }

    Alert.alert(
      "Picked Up",
      `Mark token ${row?.token_number || `#${holdOrderId}`} as picked up and clear it?`,
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, Clear",
          onPress: async () => {
            try {
              setHoldBusyId(holdOrderId);
              await clearTakeawayOrder(holdOrderId);
              Alert.alert("Picked Up", "Takeaway order cleared.");
              await refreshHoldBills();
            } catch (err) {
              const status = Number(err?.response?.status || 0);
              const detail = err?.response?.data?.detail || err?.message || "Failed to clear takeaway order";
              Alert.alert("Error", status ? `${detail} (HTTP ${status})` : String(detail));
            } finally {
              setHoldBusyId(null);
            }
          },
        },
      ]
    );
  };

  const menus = useMemo(
    () => buildMobileMenu({ roleLower, permsEnabled, permMap, isHotel }),
    [roleLower, permsEnabled, permMap, isHotel]
  );

  const handleSync = async () => {
    if (syncing || !isOnline) return;
    setSyncing(true);
    try {
      const result = await syncOfflineQueue();
      const remaining = await getPendingCount();
      setPendingCount(remaining);
      if (result.synced > 0)
        Alert.alert("Synced", `${result.synced} offline bill(s) uploaded.`);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator size="large" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Offline Banner */}
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>⚡ Offline — bills will sync when reconnected</Text>
        </View>
      )}
      {isOnline && pendingCount > 0 && (
        <Pressable style={styles.syncBanner} onPress={handleSync} disabled={syncing}>
          <Text style={styles.syncBannerText}>
            {syncing ? "Syncing…" : `📤 ${pendingCount} bill(s) pending upload — tap to sync`}
          </Text>
        </Pressable>
      )}

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.head}>
          <View style={styles.headTopRow}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.shop}>{shopBranchLabel}</Text>
              <Text style={styles.meta}>
                {session?.user_name || "User"} · {session?.role_name || session?.role || "role"}
              </Text>
            </View>
            <Pressable style={styles.logoutTopBtn} onPress={logout}>
              <Text style={styles.logoutTopBtnText}>Logout</Text>
            </Pressable>
          </View>
          {isHotel && (
            <View style={styles.hotelBadge}>
              <Text style={styles.hotelBadgeText}>Hotel Mode</Text>
            </View>
          )}
        </View>

        {/* Menu Grid */}
        <View style={styles.grid}>
          {menus.length === 0 ? (
            <Text style={styles.empty}>No menus available for your role.</Text>
          ) : (
            menus.map((m) => (
              <Pressable
                key={m.key}
                style={styles.tile}
                onPress={() => navigation.navigate(m.route, m.params || undefined)}
              >
                <Text style={styles.tileIcon}>{m.icon || "☰"}</Text>
                <Text style={styles.tileLabel}>{m.title}</Text>
              </Pressable>
            ))
          )}
        </View>

        <Pressable style={styles.printerBtn} onPress={() => setShowPrinterSettings(true)}>
          <Text style={styles.printerBtnText}>Printer Settings</Text>
        </Pressable>

        {isHotel && (
          <View style={styles.holdWrap}>
            <View style={styles.holdHeadRow}>
              <Text style={styles.holdTitle}>Hold Bills ({holdBills.length})</Text>
              <Pressable onPress={refreshHoldBills}>
                <Text style={styles.refreshText}>Refresh</Text>
              </Pressable>
            </View>

            {holdBills.length === 0 ? (
              <Text style={styles.holdEmpty}>No hold bills.</Text>
            ) : (
              holdBills.map((row, idx) => {
                const holdOrderId = getHoldOrderId(row);
                const busy = holdBusyId === holdOrderId;
                return (
                  <View key={String(holdOrderId || row?.token_number || row?.invoice_number || `hold-${idx}`)} style={styles.holdCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.holdToken}>Token: {row?.token_number || row?.invoice_number || (holdOrderId ? `#${holdOrderId}` : "-")}</Text>
                      <Text style={styles.holdMeta}>{row?.customer_name || "Walk-in"} · {row?.mobile || "-"}</Text>
                      <Text style={styles.holdMeta}>Items: {Array.isArray(row?.items) ? row.items.length : 0} · Total: ₹{Number(row?.running_total || 0).toFixed(2)}</Text>
                    </View>
                    <View style={styles.holdActions}>
                      <Pressable style={[styles.completeBtn, busy && styles.btnDisabled]} disabled={busy} onPress={() => openCompleteOptions(row)}>
                        <Text style={styles.completeBtnText}>{busy ? "..." : "Complete"}</Text>
                      </Pressable>
                      <Pressable style={[styles.pickupBtn, busy && styles.btnDisabled]} disabled={busy} onPress={() => markPickedUp(row)}>
                        <Text style={styles.pickupBtnText}>Picked Up</Text>
                      </Pressable>
                      <Pressable style={[styles.cancelBtn, busy && styles.btnDisabled]} disabled={busy} onPress={() => cancelHoldBill(row)}>
                        <Text style={styles.cancelBtnText}>Cancel</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

      </ScrollView>

      <PrinterSettingsModal
        visible={showPrinterSettings}
        onClose={() => setShowPrinterSettings(false)}
        onSaved={() => {
          Alert.alert("Saved", "Printer settings updated.");
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: "#f1f5f9" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 14, gap: 14 },

  head: {
    borderRadius: 16,
    backgroundColor: "#1d4ed8",
    padding: 16,
    gap: 8,
  },
  headTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  shop:  { color: "#fff", fontSize: 20, fontWeight: "800" },
  meta:  { color: "#bfdbfe" },
  logoutTopBtn: {
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  logoutTopBtnText: { color: "#1d4ed8", fontWeight: "800" },
  hotelBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#fbbf24",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 6,
  },
  hotelBadgeText: { color: "#78350f", fontWeight: "700", fontSize: 12 },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  tile: {
    width: "47%",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  tileIcon:  { fontSize: 32 },
  tileLabel: { fontWeight: "700", color: "#1e293b", textAlign: "center", fontSize: 13 },

  printerBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    paddingVertical: 12,
    alignItems: "center",
  },
  printerBtnText: { color: "#1d4ed8", fontWeight: "800" },

  empty: { color: "#94a3b8", textAlign: "center", padding: 20 },
  offlineBanner: { backgroundColor: "#92400e", padding: 10, alignItems: "center" },
  offlineBannerText: { color: "#fef3c7", fontWeight: "700", fontSize: 13 },
  syncBanner: { backgroundColor: "#1d4ed8", padding: 10, alignItems: "center" },
  syncBannerText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  holdWrap: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 12,
    gap: 8,
  },
  holdHeadRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  holdTitle: { fontWeight: "800", color: "#0f172a", fontSize: 15 },
  refreshText: { color: "#2563eb", fontWeight: "700" },
  holdEmpty: { color: "#64748b", fontSize: 13 },
  holdCard: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#f8fafc",
    flexDirection: "row",
    gap: 10,
  },
  holdToken: { fontWeight: "800", color: "#0f172a" },
  holdMeta: { color: "#475569", fontSize: 12, marginTop: 2 },
  holdActions: { justifyContent: "center", gap: 6 },
  completeBtn: {
    backgroundColor: "#059669",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  completeBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  pickupBtn: {
    backgroundColor: "#d97706",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pickupBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  cancelBtn: {
    backgroundColor: "#dc2626",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  cancelBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  btnDisabled: { opacity: 0.6 },
});
