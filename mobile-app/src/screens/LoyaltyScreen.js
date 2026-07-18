import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import api from "../api/client";
import { useTheme } from "../context/ThemeContext";


export default function LoyaltyScreen() {
  const { theme } = useTheme();
  const [mobile, setMobile] = useState("");
  const [account, setAccount] = useState(null);
  const [txns, setTxns] = useState([]);
  const [loading, setLoading] = useState(false);

  const [adjustPoints, setAdjustPoints] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [redeemPoints, setRedeemPoints] = useState("");
  const [redeemNote, setRedeemNote] = useState("");
  const [savingAdjust, setSavingAdjust] = useState(false);
  const [savingRedeem, setSavingRedeem] = useState(false);

  const lookupAccount = async () => {
    const mm = mobile.replace(/\D/g, "");
    if (mm.length !== 10) return Alert.alert("Validation", "Enter 10-digit mobile number");
    setLoading(true);
    setAccount(null);
    setTxns([]);
    try {
      const res = await api.get(`/loyalty/account/by-mobile/${mm}`);
      setAccount(res?.data || null);
      if (res?.data?.customer_id) {
        try {
          const t = await api.get(`/loyalty/transactions/${res.data.customer_id}`);
          setTxns(t?.data || []);
        } catch { setTxns([]); }
      }
    } catch (err) {
      Alert.alert("Not Found", err?.response?.data?.detail || "Customer not found");
    } finally {
      setLoading(false);
    }
  };

  const doAdjust = async () => {
    const pts = Number(adjustPoints || 0);
    if (!Number.isFinite(pts) || pts === 0) return Alert.alert("Validation", "Enter points to add/remove");
    setSavingAdjust(true);
    try {
      await api.post("/loyalty/adjust", {
        mobile: account.mobile || mobile,
        points: Math.trunc(pts),
        notes: adjustNote || undefined,
      });
      setAdjustPoints("");
      setAdjustNote("");
      await lookupAccount();
      Alert.alert("Done", `${pts > 0 ? "Added" : "Removed"} ${Math.abs(pts)} points.`);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Adjustment failed");
    } finally {
      setSavingAdjust(false);
    }
  };

  const doRedeem = async () => {
    const pts = Number(redeemPoints || 0);
    if (!pts || pts <= 0) return Alert.alert("Validation", "Enter points to redeem");
    if (pts > Number(account?.points_balance || 0)) {
      return Alert.alert("Insufficient", "Not enough points to redeem");
    }
    setSavingRedeem(true);
    try {
      await api.post("/loyalty/redeem", {
        mobile: account.mobile || mobile,
        points: Math.trunc(pts),
        notes: redeemNote || undefined,
      });
      setRedeemPoints("");
      setRedeemNote("");
      await lookupAccount();
      Alert.alert("Done", `Redeemed ${pts} points.`);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Redemption failed");
    } finally {
      setSavingRedeem(false);
    }
  };

  const fmtDate = (v) => {
    if (!v) return "-";
    try {
      return new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    } catch { return "-"; }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>

        {/* Lookup */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customer Lookup</Text>
          <View style={styles.lookupRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="10-digit mobile"
              placeholderTextColor="#94a3b8"
              keyboardType="phone-pad"
              value={mobile}
              onChangeText={(v) => setMobile(v.replace(/\D/g, "").slice(0, 10))}
            />
            <Pressable
              style={[styles.lookupBtn, loading && styles.btnDisabled]}
              disabled={loading}
              onPress={lookupAccount}
            >
              {loading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.lookupBtnText}>Lookup</Text>}
            </Pressable>
          </View>
        </View>

        {/* Account Card */}
        {account && (
          <>
            <View style={[styles.section, styles.accountCard]}>
              <Text style={styles.accountName}>{account.customer_name || "Customer"}</Text>
              <Text style={styles.accountMobile}>📞 {account.mobile || mobile}</Text>
              <View style={styles.balanceRow}>
                <View style={styles.balanceItem}>
                  <Text style={styles.balanceLabel}>Points Balance</Text>
                  <Text style={styles.balanceValue}>{account.points_balance ?? account.points ?? 0}</Text>
                </View>
                {account.tier && (
                  <View style={styles.tierBadge}>
                    <Text style={styles.tierText}>{account.tier}</Text>
                  </View>
                )}
              </View>
              {account.points_value != null && (
                <Text style={styles.valueLine}>
                  Worth: ₹{Number(account.points_value || 0).toFixed(2)}
                </Text>
              )}
            </View>

            {/* Adjust Points */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Adjust Points</Text>
              <Text style={styles.hint}>Use negative numbers to deduct points</Text>
              <TextInput
                style={styles.input}
                keyboardType="numbers-and-punctuation"
                placeholder="e.g. 50 or -20"
                placeholderTextColor="#94a3b8"
                value={adjustPoints}
                onChangeText={setAdjustPoints}
              />
              <TextInput
                style={styles.input}
                placeholder="Note (optional)"
                placeholderTextColor="#94a3b8"
                value={adjustNote}
                onChangeText={setAdjustNote}
              />
              <Pressable
                style={[styles.adjustBtn, savingAdjust && styles.btnDisabled]}
                disabled={savingAdjust}
                onPress={doAdjust}
              >
                <Text style={styles.adjustBtnText}>{savingAdjust ? "Saving…" : "Apply Adjustment"}</Text>
              </Pressable>
            </View>

            {/* Redeem Points */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Redeem Points</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                placeholder="Points to redeem"
                placeholderTextColor="#94a3b8"
                value={redeemPoints}
                onChangeText={(v) => setRedeemPoints(v.replace(/\D/g, ""))}
              />
              <TextInput
                style={styles.input}
                placeholder="Note (optional)"
                placeholderTextColor="#94a3b8"
                value={redeemNote}
                onChangeText={setRedeemNote}
              />
              <Pressable
                style={[styles.redeemBtn, savingRedeem && styles.btnDisabled]}
                disabled={savingRedeem}
                onPress={doRedeem}
              >
                <Text style={styles.redeemBtnText}>{savingRedeem ? "Processing…" : "Redeem Points"}</Text>
              </Pressable>
            </View>

            {/* Transactions */}
            {txns.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Recent Transactions</Text>
                {txns.slice(0, 20).map((t, i) => (
                  <View key={String(t.txn_id || t.id || i)} style={styles.txnRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.txnDesc}>{t.txn_type || "Transaction"}</Text>
                      <Text style={styles.txnDate}>{fmtDate(t.created_at || t.date)}</Text>
                      {!!t.invoice_id && <Text style={styles.txnDate}>Invoice: {t.invoice_id}</Text>}
                      {!!t.notes && <Text style={styles.txnDate}>{t.notes}</Text>}
                    </View>
                    <Text style={[styles.txnPoints, Number(t.points) < 0 ? styles.txnNeg : styles.txnPos]}>
                      {Number(t.points) > 0 ? "+" : ""}{t.points}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f6fb" },
  container: { padding: 14, gap: 12, paddingBottom: 36 },
  section: {
    backgroundColor: "#ffffff", borderRadius: 18, borderWidth: 1.5,
    borderColor: "#e4e9f2", padding: 14, gap: 10,
    shadowColor: "#0a0f1e", shadowOpacity: 0.07, shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  sectionTitle: { fontSize: 12, fontWeight: "800", color: "#4b5563", textTransform: "uppercase", letterSpacing: 0.5 },
  hint: { color: "#9ca3af", fontSize: 12 },
  lookupRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  input: {
    borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12, backgroundColor: "#f8f9fd",
    paddingHorizontal: 13, paddingVertical: 12, color: "#0a0f1e", fontSize: 14,
  },
  lookupBtn: {
    backgroundColor: "#6366f1", borderRadius: 12, paddingHorizontal: 18,
    paddingVertical: 12, alignItems: "center", justifyContent: "center",
    shadowColor: "#6366f1", shadowOpacity: 0.35, shadowRadius: 10, elevation: 5,
  },
  lookupBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  accountCard: { backgroundColor: "#0a0f1e", borderColor: "#0a0f1e" },
  accountName: { color: "#fff", fontSize: 18, fontWeight: "900", letterSpacing: -0.3 },
  accountMobile: { color: "#4b5563", fontSize: 13, fontWeight: "600", marginTop: 2 },
  balanceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  balanceItem: {},
  balanceLabel: { color: "#4b5563", fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  balanceValue: { color: "#4a8ef5", fontSize: 32, fontWeight: "900", letterSpacing: -1 },
  tierBadge: {
    backgroundColor: "#f0a820", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  tierText: { color: "#78350f", fontWeight: "800", fontSize: 12 },
  valueLine: { color: "#4b5563", fontSize: 12, fontWeight: "600" },
  adjustBtn: {
    backgroundColor: "#0891b2", borderRadius: 14, paddingVertical: 13, alignItems: "center",
    shadowColor: "#0891b2", shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  adjustBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  redeemBtn: {
    backgroundColor: "#7c3aed", borderRadius: 14, paddingVertical: 13, alignItems: "center",
    shadowColor: "#7c3aed", shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  redeemBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  btnDisabled: { opacity: 0.5 },
  txnRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: "#f4f6fb",
  },
  txnDesc: { fontWeight: "700", color: "#0a0f1e", fontSize: 13 },
  txnDate: { color: "#9ca3af", fontSize: 11, marginTop: 2 },
  txnPoints: { fontSize: 15, fontWeight: "900" },
  txnPos: { color: "#10b981" },
  txnNeg: { color: "#ef4444" },
});
