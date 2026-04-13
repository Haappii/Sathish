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

export default function LoyaltyScreen() {
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
        customer_id: account.customer_id,
        points: pts,
        notes: adjustNote || "Manual adjustment",
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
        customer_id: account.customer_id,
        points: pts,
        notes: redeemNote || "Manual redemption",
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
                  <View key={String(t.id || i)} style={styles.txnRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.txnDesc}>{t.description || t.notes || t.txn_type || "Transaction"}</Text>
                      <Text style={styles.txnDate}>{fmtDate(t.created_at || t.date)}</Text>
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
  safe: { flex: 1, backgroundColor: "#f3f6ff" },
  container: { padding: 12, gap: 10, paddingBottom: 32 },
  section: {
    backgroundColor: "#fff", borderRadius: 14, borderWidth: 1,
    borderColor: "#d9e3ff", padding: 12, gap: 8,
  },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: "#0b1220" },
  hint: { color: "#94a3b8", fontSize: 12 },
  lookupRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  input: {
    borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10, backgroundColor: "#ffffff",
    paddingHorizontal: 12, paddingVertical: 10, color: "#0b1220",
  },
  lookupBtn: {
    backgroundColor: "#0b57d0", borderRadius: 10, paddingHorizontal: 16,
    paddingVertical: 10, alignItems: "center", justifyContent: "center",
  },
  lookupBtnText: { color: "#fff", fontWeight: "700" },
  accountCard: { backgroundColor: "#0b57d0", borderColor: "#0b57d0" },
  accountName: { color: "#fff", fontSize: 18, fontWeight: "800" },
  accountMobile: { color: "#bfdbfe", fontSize: 13 },
  balanceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  balanceItem: {},
  balanceLabel: { color: "#bfdbfe", fontSize: 12, fontWeight: "600" },
  balanceValue: { color: "#fff", fontSize: 28, fontWeight: "800" },
  tierBadge: {
    backgroundColor: "#fbbf24", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 4,
  },
  tierText: { color: "#78350f", fontWeight: "700", fontSize: 12 },
  valueLine: { color: "#bfdbfe", fontSize: 12 },
  adjustBtn: {
    backgroundColor: "#0891b2", borderRadius: 10, paddingVertical: 12, alignItems: "center",
  },
  adjustBtnText: { color: "#fff", fontWeight: "800" },
  redeemBtn: {
    backgroundColor: "#7c3aed", borderRadius: 10, paddingVertical: 12, alignItems: "center",
  },
  redeemBtnText: { color: "#fff", fontWeight: "800" },
  btnDisabled: { opacity: 0.5 },
  txnRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: "#f3f6ff",
  },
  txnDesc: { fontWeight: "600", color: "#334155", fontSize: 13 },
  txnDate: { color: "#94a3b8", fontSize: 11, marginTop: 1 },
  txnPoints: { fontSize: 15, fontWeight: "800" },
  txnPos: { color: "#059669" },
  txnNeg: { color: "#dc2626" },
});
