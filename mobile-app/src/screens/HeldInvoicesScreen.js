import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { WEB_APP_BASE } from "../config/api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { printInvoiceByNumber } from "../utils/printInvoice";

const fmt = (n) => `₹${Number(n || 0).toFixed(2)}`;

const PAYMENT_MODES = ["cash", "card", "upi", "credit", "gift_card", "coupon", "split", "wallet"];

const toAmount = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const normalizeHeldInvoices = (data) => {
  const list = Array.isArray(data) ? data : [];
  const filtered = list.filter((row) => {
    const orderId = Number(row?.draft_id || 0);
    const itemCount = Array.isArray(row?.items) ? row.items.length : 0;
    return Number.isFinite(orderId) && orderId > 0 && itemCount > 0;
  });

  const seen = new Set();
  return filtered.filter((row) => {
    const key = String(row?.draft_id || row?.source_draft_id || row?.draft_number || "");
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const getOrderId = (row) => {
  const raw = row?.draft_id ?? row?.source_draft_id ?? row?.id ?? null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export default function HeldInvoicesScreen() {
  const { session } = useAuth();
  const { theme } = useTheme();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);

  // Shop / branch data for printing
  const [shopDetails, setShopDetails] = useState({});
  const [branchDetails, setBranchDetails] = useState({});
  const [shopName, setShopName] = useState("Haappii Billing");

  // Process modal state
  const [processModalOpen, setProcessModalOpen] = useState(false);
  const [processRow, setProcessRow] = useState(null);
  const [processCustomer, setProcessCustomer] = useState({ mobile: "", name: "", gst_number: "" });
  const [processPaymentMode, setProcessPaymentMode] = useState("cash");
  const [splitCash, setSplitCash] = useState("");
  const [splitCard, setSplitCard] = useState("");
  const [splitUpi, setSplitUpi] = useState("");
  const [splitGift, setSplitGift] = useState("");
  const [giftCardCode, setGiftCardCode] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [walletMobile, setWalletMobile] = useState("");
  const [walletAmount, setWalletAmount] = useState("");
  const [processDiscountAmt, setProcessDiscountAmt] = useState("0");
  const [processSaving, setProcessSaving] = useState(false);

  // UPI QR modal state
  const [upiModalOpen, setUpiModalOpen] = useState(false);
  const [upiUtr, setUpiUtr] = useState("");
  const [upiQrIdx, setUpiQrIdx] = useState(0);
  const [upiPendingAction, setUpiPendingAction] = useState(null);

  const toxDate = session?.app_date || new Date().toISOString().split("T")[0];
  const todayLabel = (() => {
    const [y, m, d] = toxDate.split("-");
    const mNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${d} ${mNames[Number(m) - 1]} ${y}`;
  })();

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const branchPromise = session?.branch_id
        ? api.get(`/branch/${session.branch_id}`).catch(() => null)
        : Promise.resolve(null);

      const [draftsRes, shopRes, branchRes] = await Promise.all([
        api.get("/invoice/draft/list").catch(() => ({ data: [] })),
        api.get("/shop/details").catch(() => ({ data: {} })),
        branchPromise,
      ]);

      setInvoices(normalizeHeldInvoices(draftsRes?.data));
      const nextShop = shopRes?.data || {};
      setShopDetails(nextShop);
      setShopName(nextShop?.shop_name || "Haappii Billing");
      setBranchDetails(branchRes?.data || {});
    } catch (err) {
      if (!silent) {
        Alert.alert("Error", err?.response?.data?.detail || "Failed to load held invoices");
      }
      setInvoices([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session?.branch_id]);

  useEffect(() => { load(); }, [load]);

  // ── Open process modal, pre-fill from draft ────────────────────────────────
  const openProcessModal = (row) => {
    setProcessRow(row);
    setProcessCustomer({
      mobile: String(row?.mobile || ""),
      name: String(row?.customer_name || ""),
      gst_number: String(row?.gst_number || ""),
    });
    const savedMode = String(row?.payment_mode || "cash").toLowerCase();
    setProcessPaymentMode(PAYMENT_MODES.includes(savedMode) ? savedMode : "cash");
    setProcessDiscountAmt(String(Math.round(Number(row?.discounted_amt || 0))));
    // Pre-fill split fields from saved payment_split if any
    const sp = row?.payment_split || {};
    setSplitCash(sp.cash ? String(sp.cash) : "");
    setSplitCard(sp.card ? String(sp.card) : "");
    setSplitUpi(sp.upi ? String(sp.upi) : "");
    setSplitGift(sp.gift_card_amount ? String(sp.gift_card_amount) : "");
    setGiftCardCode(sp.gift_card_code ? String(sp.gift_card_code) : "");
    setCouponCode(sp.coupon_code ? String(sp.coupon_code) : "");
    setWalletMobile(sp.wallet_mobile ? String(sp.wallet_mobile) : "");
    setWalletAmount(sp.wallet_amount ? String(sp.wallet_amount) : "");
    setUpiUtr("");
    setUpiQrIdx(0);
    setProcessModalOpen(true);
  };

  const closeProcessModal = () => {
    setProcessModalOpen(false);
    setProcessRow(null);
    setUpiModalOpen(false);
  };

  // ── Compute totals for the process modal (mirrors CreateBillScreen logic) ──
  const processSubtotal = useMemo(
    () => (processRow?.items || []).reduce((t, it) => t + Number(it.amount || 0), 0),
    [processRow]
  );
  const gstEnabled  = Boolean(shopDetails?.gst_enabled);
  const gstPercent  = Number(shopDetails?.gst_percent || 0);
  const gstMode     = String(shopDetails?.gst_mode || "inclusive").toLowerCase();
  const processGst  = useMemo(() => {
    if (!gstEnabled || gstPercent <= 0) return 0;
    if (gstMode === "exclusive") return (processSubtotal * gstPercent) / 100;
    return processSubtotal - processSubtotal / (1 + gstPercent / 100);
  }, [gstEnabled, gstPercent, gstMode, processSubtotal]);
  const processGross = useMemo(
    () => (gstEnabled && gstMode === "exclusive" ? processSubtotal + processGst : processSubtotal),
    [gstEnabled, gstMode, processSubtotal, processGst]
  );
  const processDiscountValue = useMemo(
    () => Math.min(processGross, Math.max(0, toAmount(processDiscountAmt))),
    [processGross, processDiscountAmt]
  );
  const processPayable = useMemo(
    () => Math.round(Math.max(0, processGross - processDiscountValue)),
    [processGross, processDiscountValue]
  );

  // ── Submit: create invoice + delete draft ──────────────────────────────────
  const submitProcess = async (printAction = "save_only", utrCode = null) => {
    if (!processRow) return;
    const orderId = getOrderId(processRow);
    if (!orderId) return Alert.alert("Error", "Unable to identify this held bill.");

    const mobile = String(processCustomer.mobile || "").replace(/\D/g, "");
    if (mobile.length !== 10) return Alert.alert("Validation", "Enter a valid 10-digit mobile");
    if (!String(processCustomer.name || "").trim()) return Alert.alert("Validation", "Customer name is required");

    if (processPaymentMode === "split") {
      const splitTotal =
        toAmount(splitCash) + toAmount(splitCard) + toAmount(splitUpi) +
        toAmount(splitGift) + toAmount(walletAmount);
      if (Math.abs(splitTotal - processPayable) > 0.01) {
        return Alert.alert("Validation", "Split total must match payable amount");
      }
    }
    if (processPaymentMode === "gift_card") {
      if (!giftCardCode.trim()) return Alert.alert("Validation", "Gift card code is required");
      if (toAmount(splitGift) <= 0) return Alert.alert("Validation", "Gift card amount is required");
      if (Math.abs(toAmount(splitGift) - processPayable) > 0.01) {
        return Alert.alert("Validation", "Gift card amount must match payable amount");
      }
    }

    const splitPayload = {
      gift_card_code: giftCardCode.trim() || undefined,
      gift_card_amount: Number(splitGift || 0) || undefined,
      coupon_code: couponCode.trim() || undefined,
      cash: Number(splitCash || 0) || undefined,
      card: Number(splitCard || 0) || undefined,
      upi: Number(splitUpi || 0) || undefined,
      wallet_mobile: walletMobile.trim() || undefined,
      wallet_amount: Number(walletAmount || 0) || undefined,
      upi_utr: (processPaymentMode === "upi" && utrCode) ? utrCode : undefined,
    };
    const paymentSplit = Object.fromEntries(Object.entries(splitPayload).filter(([, v]) => v !== undefined));

    const payload = {
      customer_name: String(processCustomer.name || "").trim(),
      mobile,
      customer_gst: String(processCustomer.gst_number || "").trim() || null,
      discounted_amt: processDiscountValue,
      payment_mode: processPaymentMode,
      payment_split: Object.keys(paymentSplit).length ? paymentSplit : null,
      items: (Array.isArray(processRow?.items) ? processRow.items : []).map((it) => ({
        item_id: it.item_id,
        quantity: it.quantity,
        amount: Number(it.amount || 0),
      })),
    };

    setBusyId(orderId);
    setProcessSaving(true);
    try {
      // Create invoice with updated customer + payment details
      const res = await api.post("/invoice/", payload);
      const invoiceNo = String(res?.data?.invoice_number || "").trim();

      // Remove the draft
      await api.delete(`/invoice/draft/${orderId}`).catch(() => null);

      // Print if requested
      if (printAction === "print_both" && invoiceNo) {
        try {
          await printInvoiceByNumber(api, invoiceNo, {
            shop: shopDetails,
            branch: branchDetails,
            shopName,
            webBase: WEB_APP_BASE,
          });
          Alert.alert("Processed", `Invoice: ${invoiceNo}\nPrinted successfully.`);
        } catch {
          Alert.alert("Processed", `Invoice: ${invoiceNo}\nUnable to send print command.`);
        }
      } else {
        Alert.alert("Processed", invoiceNo ? `Invoice: ${invoiceNo}\nSaved without printing.` : "Invoice processed.");
      }

      closeProcessModal();
      await load(true);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to process invoice");
    } finally {
      setBusyId(null);
      setProcessSaving(false);
    }
  };

  // ── UPI confirmation ───────────────────────────────────────────────────────
  const handleUpiConfirm = (printAction) => {
    setUpiPendingAction(printAction);
    setUpiUtr("");
    setUpiQrIdx(0);
    setUpiModalOpen(true);
  };

  // ── Delete draft ───────────────────────────────────────────────────────────
  const handleCancel = (row) => {
    const orderId = getOrderId(row);
    if (!orderId) return Alert.alert("Error", "Unable to identify this held invoice.");

    Alert.alert(
      "Delete Held Bill",
      `Delete ${row?.draft_number || `#${orderId}`} for ${row?.customer_name || "Walk-in"}?`,
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, Delete",
          style: "destructive",
          onPress: async () => {
            setBusyId(orderId);
            try {
              await api.delete(`/invoice/draft/${orderId}`);
              Alert.alert("Deleted", "Held bill deleted.");
              await load(true);
            } catch (err) {
              const status = Number(err?.response?.status || 0);
              const detail = err?.response?.data?.detail || err?.message || "Failed to cancel";
              Alert.alert("Error", status ? `${detail} (HTTP ${status})` : String(detail));
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item: row, index }) => {
    const orderId = getOrderId(row);
    const busy = busyId === orderId;
    const itemsList = Array.isArray(row?.items) ? row.items : [];
    const total = Number(row?.discounted_amt || row?.total_amount || 0);

    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <View style={styles.tokenRow}>
              <View style={styles.tokenBadge}>
                <Text style={styles.tokenText}>
                  {row?.draft_number ? row.draft_number : `#${orderId || index + 1}`}
                </Text>
              </View>
            </View>
            <Text style={styles.customerText}>
              {row?.customer_name || "Walk-in"}
              {row?.mobile ? ` · ${row.mobile}` : ""}
            </Text>
            {itemsList.length > 0 && (
              <Text style={styles.itemsText}>
                {itemsList.map((it) => `${it?.item_name || `Item #${it?.item_id || "-"}`} ×${it?.quantity || 1}`).join(", ")}
              </Text>
            )}
          </View>
        </View>
        <View style={styles.actionsRow}>
          <Pressable
            style={[styles.processBtn, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={() => openProcessModal(row)}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.processBtnText}>Process</Text>
            )}
          </Pressable>
          <Pressable
            style={[styles.cancelBtn, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={() => handleCancel(row)}
          >
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  // ── UPI IDs from branch config ─────────────────────────────────────────────
  const upiIds = [
    branchDetails?.upi_id,
    branchDetails?.upi_id_2,
    branchDetails?.upi_id_3,
    branchDetails?.upi_id_4,
  ]
    .map((id) => String(id || "").trim())
    .filter(Boolean);
  if (upiIds.length === 0 && shopDetails?.upi_id) upiIds.push(String(shopDetails.upi_id).trim());

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.accent }]}>
        <Text style={styles.headerTitle}>Held Invoices</Text>
        <Text style={[styles.headerDate, { color: theme.textSub }]}>{todayLabel}</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0b57d0" />
          <Text style={styles.loadingText}>Loading held invoices…</Text>
        </View>
      ) : (
        <FlatList
          data={invoices}
          keyExtractor={(row, idx) => String(getOrderId(row) || row?.token_number || `held-${idx}`)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={["#0b57d0"]} />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyTitle}>No held invoices</Text>
              <Text style={styles.emptyMsg}>
                There are no invoices currently on hold for today's business date.
              </Text>
            </View>
          }
          ListHeaderComponent={
            invoices.length > 0 ? (
              <Text style={[styles.countLabel, { color: theme.textSub }]}>
                {invoices.length} held bill{invoices.length !== 1 ? "s" : ""} · Pull down to refresh
              </Text>
            ) : null
          }
        />
      )}

      {/* ── Process Modal ─────────────────────────────────────────────────── */}
      <Modal
        transparent
        visible={processModalOpen}
        animationType="slide"
        onRequestClose={closeProcessModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Process Held Bill</Text>
              {processRow?.draft_number ? (
                <Text style={styles.modalSubtitle}>{processRow.draft_number}</Text>
              ) : null}
              <Pressable onPress={closeProcessModal} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseTxt}>✕</Text>
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.modalBody}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Items summary */}
              {processRow && Array.isArray(processRow.items) && processRow.items.length > 0 && (
                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>Items</Text>
                  {processRow.items.map((it, idx) => (
                    <View key={String(it?.item_id || idx)} style={styles.itemSummaryRow}>
                      <Text style={styles.itemSummaryName} numberOfLines={1}>
                        {it?.item_name || `Item #${it?.item_id}`}
                      </Text>
                      <Text style={styles.itemSummaryQty}>×{it?.quantity || 1}</Text>
                      <Text style={styles.itemSummaryAmt}>{fmt(it?.amount || 0)}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Customer */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Customer</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Mobile number"
                  keyboardType="phone-pad"
                  value={processCustomer.mobile}
                  placeholderTextColor="#94a3b8"
                  onChangeText={(v) =>
                    setProcessCustomer((p) => ({ ...p, mobile: v.replace(/\D/g, "").slice(0, 10) }))
                  }
                />
                <TextInput
                  style={styles.input}
                  placeholder="Customer name"
                  value={processCustomer.name}
                  placeholderTextColor="#94a3b8"
                  onChangeText={(v) => setProcessCustomer((p) => ({ ...p, name: v }))}
                />
                <TextInput
                  style={styles.input}
                  placeholder="GST number (optional)"
                  value={processCustomer.gst_number}
                  placeholderTextColor="#94a3b8"
                  onChangeText={(v) => setProcessCustomer((p) => ({ ...p, gst_number: v }))}
                  autoCapitalize="characters"
                />
              </View>

              {/* Payment mode */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Payment Mode</Text>
                <View style={styles.modeRow}>
                  {PAYMENT_MODES.map((m) => (
                    <Pressable
                      key={m}
                      style={[styles.modeBtn, processPaymentMode === m && styles.modeBtnActive]}
                      onPress={() => { setProcessPaymentMode(m); setUpiUtr(""); }}
                    >
                      <Text style={[styles.modeTxt, processPaymentMode === m && styles.modeTxtActive]}>
                        {m.toUpperCase()}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {/* Discount */}
                <Text style={styles.fieldLabel}>Discount</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  keyboardType="numeric"
                  value={processDiscountAmt}
                  placeholderTextColor="#94a3b8"
                  onChangeText={(v) => setProcessDiscountAmt(v.replace(/[^\d.]/g, ""))}
                />

                {/* Gift card fields */}
                {(processPaymentMode === "gift_card" || processPaymentMode === "split") && (
                  <>
                    <Text style={styles.fieldLabel}>Gift Card</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Gift card code"
                      value={giftCardCode}
                      placeholderTextColor="#94a3b8"
                      onChangeText={setGiftCardCode}
                      autoCapitalize="characters"
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Gift card amount"
                      keyboardType="numeric"
                      value={splitGift}
                      placeholderTextColor="#94a3b8"
                      onChangeText={(v) => setSplitGift(v.replace(/[^\d.]/g, ""))}
                    />
                  </>
                )}

                {/* Coupon */}
                {(processPaymentMode === "coupon" || processPaymentMode === "split") && (
                  <>
                    <Text style={styles.fieldLabel}>Coupon</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Coupon code"
                      value={couponCode}
                      placeholderTextColor="#94a3b8"
                      onChangeText={setCouponCode}
                      autoCapitalize="characters"
                    />
                  </>
                )}

                {/* Split amounts */}
                {processPaymentMode === "split" && (
                  <>
                    <Text style={styles.fieldLabel}>Split Payments</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Cash amount"
                      keyboardType="numeric"
                      value={splitCash}
                      placeholderTextColor="#94a3b8"
                      onChangeText={(v) => setSplitCash(v.replace(/[^\d.]/g, ""))}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Card amount"
                      keyboardType="numeric"
                      value={splitCard}
                      placeholderTextColor="#94a3b8"
                      onChangeText={(v) => setSplitCard(v.replace(/[^\d.]/g, ""))}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="UPI amount"
                      keyboardType="numeric"
                      value={splitUpi}
                      placeholderTextColor="#94a3b8"
                      onChangeText={(v) => setSplitUpi(v.replace(/[^\d.]/g, ""))}
                    />
                  </>
                )}

                {/* Wallet */}
                {(processPaymentMode === "wallet" || processPaymentMode === "split") && (
                  <>
                    <Text style={styles.fieldLabel}>Wallet</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Wallet mobile"
                      keyboardType="phone-pad"
                      value={walletMobile}
                      placeholderTextColor="#94a3b8"
                      onChangeText={(v) => setWalletMobile(v.replace(/\D/g, "").slice(0, 10))}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Wallet amount"
                      keyboardType="numeric"
                      value={walletAmount}
                      placeholderTextColor="#94a3b8"
                      onChangeText={(v) => setWalletAmount(v.replace(/[^\d.]/g, ""))}
                    />
                  </>
                )}

                <View style={styles.payableSummary}>
                  {gstEnabled && gstPercent > 0 && (
                    <Text style={styles.payableLine}>GST ({gstPercent}%): {fmt(processGst)}</Text>
                  )}
                  {processDiscountValue > 0 && (
                    <Text style={[styles.payableLine, { color: "#dc2626" }]}>Discount: − {fmt(processDiscountValue)}</Text>
                  )}
                  <Text style={styles.payableRow}>
                    Payable: <Text style={styles.payableAmt}>{fmt(processPayable)}</Text>
                  </Text>
                </View>
              </View>

              {/* Action buttons */}
              <Pressable
                style={[styles.printBtn, processSaving && styles.btnDisabled]}
                disabled={processSaving}
                onPress={() => {
                  if (processPaymentMode === "upi") {
                    handleUpiConfirm("print_both");
                  } else {
                    submitProcess("print_both");
                  }
                }}
              >
                <Text style={styles.printBtnTxt}>
                  {processSaving ? "Processing…" : "Save & Print"}
                </Text>
              </Pressable>

              <Pressable
                style={[styles.saveOnlyBtn, processSaving && styles.btnDisabled]}
                disabled={processSaving}
                onPress={() => {
                  if (processPaymentMode === "upi") {
                    handleUpiConfirm("save_only");
                  } else {
                    submitProcess("save_only");
                  }
                }}
              >
                <Text style={styles.saveOnlyBtnTxt}>
                  {processSaving ? "Processing…" : "Save Without Printing"}
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── UPI QR Confirmation Modal ──────────────────────────────────────── */}
      <Modal
        transparent
        visible={upiModalOpen}
        animationType="slide"
        onRequestClose={() => setUpiModalOpen(false)}
      >
        <View style={[styles.modalBackdrop, { justifyContent: "flex-start", paddingTop: 40 }]}>
          <ScrollView
            style={{ width: "100%" }}
            contentContainerStyle={{ padding: 16 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.upiModal}>
              <Text style={styles.upiModalTitle}>UPI Payment</Text>

              {upiIds.length === 0 ? (
                <View style={styles.upiNoId}>
                  <Text style={styles.upiNoIdText}>No UPI ID configured for this branch.</Text>
                </View>
              ) : (
                <View>
                  {upiIds.length > 1 && (
                    <View style={styles.upiTabRow}>
                      {upiIds.map((_, i) => (
                        <Pressable
                          key={i}
                          style={[styles.upiTab, upiQrIdx === i && styles.upiTabActive]}
                          onPress={() => setUpiQrIdx(i)}
                        >
                          <Text style={[styles.upiTabText, upiQrIdx === i && styles.upiTabTextActive]}>
                            QR {i + 1}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                  <View style={styles.upiQrWrap}>
                    <QRCode
                      value={`upi://pay?pa=${encodeURIComponent(upiIds[Math.min(upiQrIdx, upiIds.length - 1)])}&pn=${encodeURIComponent(shopName)}&am=${processPayable.toFixed(2)}&cu=INR`}
                      size={180}
                      backgroundColor="#ffffff"
                      color="#0b1220"
                    />
                    <Text style={styles.upiIdLabel}>{upiIds[Math.min(upiQrIdx, upiIds.length - 1)]}</Text>
                    <Text style={styles.upiAmtLabel}>Amount: {fmt(processPayable)}</Text>
                  </View>
                </View>
              )}

              <Text style={styles.upiFieldLabel}>Customer Name</Text>
              <TextInput
                style={styles.input}
                value={processCustomer.name}
                onChangeText={(v) => setProcessCustomer((p) => ({ ...p, name: v }))}
                placeholder="Customer name"
                placeholderTextColor="#94a3b8"
              />

              <Text style={styles.upiFieldLabel}>Mobile Number</Text>
              <TextInput
                style={styles.input}
                value={processCustomer.mobile}
                onChangeText={(v) =>
                  setProcessCustomer((p) => ({ ...p, mobile: v.replace(/\D/g, "").slice(0, 10) }))
                }
                placeholder="10-digit mobile"
                keyboardType="phone-pad"
                placeholderTextColor="#94a3b8"
              />

              <Text style={styles.upiFieldLabel}>UTR Last 5 Digits</Text>
              <TextInput
                style={styles.input}
                value={upiUtr}
                onChangeText={(v) => setUpiUtr(v.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 5))}
                placeholder="e.g. AB123"
                placeholderTextColor="#94a3b8"
                autoCapitalize="characters"
                maxLength={5}
              />

              <View style={styles.upiModalBtns}>
                <Pressable
                  style={styles.upiCancelBtn}
                  onPress={() => setUpiModalOpen(false)}
                >
                  <Text style={styles.upiCancelTxt}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.upiDoneBtn, processSaving && { opacity: 0.6 }]}
                  disabled={processSaving}
                  onPress={() => {
                    const name = String(processCustomer.name || "").trim();
                    const mobile = String(processCustomer.mobile || "").replace(/\D/g, "");
                    const utr = upiUtr.trim();
                    if (!name) return Alert.alert("Validation", "Customer name is required");
                    if (mobile.length !== 10) return Alert.alert("Validation", "Enter a valid 10-digit mobile");
                    if (utr.length !== 5) return Alert.alert("Validation", "Enter UTR last 5 digits");
                    setUpiModalOpen(false);
                    submitProcess(upiPendingAction, utr);
                  }}
                >
                  <Text style={styles.upiDoneTxt}>{processSaving ? "Processing…" : "Payment Done"}</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f3f6ff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: "#64748b", fontSize: 14 },

  header: {
    backgroundColor: "#0b57d0",
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },
  headerDate: { color: "#bfdbfe", fontSize: 13, fontWeight: "600" },

  countLabel: {
    color: "#64748b",
    fontSize: 12,
    paddingHorizontal: 4,
    paddingBottom: 4,
  },

  list: { padding: 14, gap: 10, paddingBottom: 24 },

  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#d9e3ff",
    padding: 12,
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTop: { gap: 6 },
  tokenRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  tokenBadge: {
    backgroundColor: "#fef3c7",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#fbbf24",
  },
  tokenText: { color: "#92400e", fontWeight: "800", fontSize: 13 },
  totalText: { fontSize: 16, fontWeight: "800", color: "#059669" },
  customerText: { color: "#1e293b", fontWeight: "700", fontSize: 14 },
  itemsText: { color: "#64748b", fontSize: 12, marginTop: 2 },

  actionsRow: { flexDirection: "row", gap: 10 },
  processBtn: {
    flex: 1,
    backgroundColor: "#059669",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  processBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  cancelBtn: {
    flex: 1,
    backgroundColor: "#fee2e2",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#fca5a5",
  },
  cancelBtnText: { color: "#b91c1c", fontWeight: "800", fontSize: 14 },
  btnDisabled: { opacity: 0.5 },

  emptyWrap: {
    alignItems: "center",
    paddingTop: 60,
    gap: 10,
    paddingHorizontal: 30,
  },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: "#0b1220" },
  emptyMsg: { color: "#64748b", textAlign: "center", fontSize: 14, lineHeight: 20 },

  // ── Modal ──────────────────────────────────────────────────────────────────
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  modalCard: {
    width: "100%",
    maxHeight: "92%",
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  modalHeader: {
    backgroundColor: "#0b57d0",
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  modalTitle: { color: "#fff", fontSize: 17, fontWeight: "800", flex: 1 },
  modalSubtitle: { color: "#bfdbfe", fontSize: 13, fontWeight: "600" },
  modalCloseBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  modalCloseTxt: { color: "#fff", fontWeight: "800", fontSize: 14 },
  modalBody: { padding: 16, gap: 12, paddingBottom: 32 },
  modalSection: {
    backgroundColor: "#f8faff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d9e3ff",
    padding: 12,
    gap: 8,
  },
  modalSectionTitle: { fontSize: 13, fontWeight: "800", color: "#0b1220", marginBottom: 2 },

  // Items summary
  itemSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 3,
  },
  itemSummaryName: { flex: 1, fontSize: 13, color: "#334155", fontWeight: "600" },
  itemSummaryQty: { fontSize: 12, color: "#64748b", marginHorizontal: 8 },
  itemSummaryAmt: { fontSize: 13, fontWeight: "700", color: "#0b1220" },
  summaryDivider: {
    height: 1,
    backgroundColor: "#e2e8f0",
    marginVertical: 4,
  },
  itemSummaryTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 6,
    marginTop: 4,
  },
  itemSummaryTotalLabel: { fontSize: 13, fontWeight: "800", color: "#0b1220" },
  itemSummaryTotalAmt: { fontSize: 15, fontWeight: "800", color: "#059669" },

  // Payment mode
  modeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  modeBtn: {
    borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "#fff",
  },
  modeBtnActive: { backgroundColor: "#0b57d0", borderColor: "#0b57d0" },
  modeTxt: { fontSize: 11, fontWeight: "700", color: "#334155" },
  modeTxtActive: { color: "#fff" },

  fieldLabel: { fontSize: 12, fontWeight: "700", color: "#475569", marginTop: 4 },

  input: {
    borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10,
    backgroundColor: "#fff", paddingHorizontal: 12, paddingVertical: 10,
    color: "#0b1220", fontSize: 14,
  },

  payableSummary: { gap: 3, marginTop: 4 },
  payableLine: { fontSize: 13, color: "#64748b", fontWeight: "600" },
  payableRow: { fontSize: 14, fontWeight: "700", color: "#334155", marginTop: 2 },
  payableAmt: { fontSize: 16, fontWeight: "800", color: "#059669" },

  printBtn: {
    backgroundColor: "#0b57d0", borderRadius: 12,
    paddingVertical: 14, alignItems: "center",
  },
  printBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 15 },

  saveOnlyBtn: {
    borderWidth: 1, borderColor: "#0b57d0", borderRadius: 12,
    paddingVertical: 12, alignItems: "center", backgroundColor: "#eff6ff",
  },
  saveOnlyBtnTxt: { color: "#0b57d0", fontWeight: "800", fontSize: 14 },

  // ── UPI Modal ──────────────────────────────────────────────────────────────
  upiModal: {
    backgroundColor: "#fff", borderRadius: 16, padding: 16,
    shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 12,
    elevation: 8, gap: 10,
  },
  upiModalTitle: { fontSize: 17, fontWeight: "800", color: "#0b1220", textAlign: "center" },
  upiNoId: { alignItems: "center", padding: 16 },
  upiNoIdText: { color: "#64748b", fontSize: 14 },
  upiTabRow: { flexDirection: "row", gap: 8, marginBottom: 8, justifyContent: "center" },
  upiTab: {
    borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 6, backgroundColor: "#fff",
  },
  upiTabActive: { backgroundColor: "#7c3aed", borderColor: "#7c3aed" },
  upiTabText: { fontSize: 12, fontWeight: "700", color: "#334155" },
  upiTabTextActive: { color: "#fff" },
  upiQrWrap: { alignItems: "center", padding: 12, gap: 6 },
  upiIdLabel: { fontSize: 13, fontWeight: "700", color: "#334155" },
  upiAmtLabel: { fontSize: 14, fontWeight: "800", color: "#059669" },
  upiFieldLabel: { fontSize: 12, fontWeight: "700", color: "#475569" },
  upiModalBtns: { flexDirection: "row", gap: 10, marginTop: 4 },
  upiCancelBtn: {
    flex: 1, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10,
    paddingVertical: 12, alignItems: "center",
  },
  upiCancelTxt: { color: "#334155", fontWeight: "700" },
  upiDoneBtn: {
    flex: 2, backgroundColor: "#7c3aed", borderRadius: 10,
    paddingVertical: 12, alignItems: "center",
  },
  upiDoneTxt: { color: "#fff", fontWeight: "800" },
});
