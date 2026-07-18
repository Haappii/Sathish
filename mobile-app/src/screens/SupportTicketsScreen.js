import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";

import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { API_BASE } from "../config/api";
import { getStoredSession } from "../storage/session";

const STATUSES = ["OPEN", "IN_PROGRESS", "CLOSED"];
const fmtDate = (v) => {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

export default function SupportTicketsScreen() {
  const { session } = useAuth();
  const roleLower = String(session?.role_name || session?.role || "").toLowerCase();
  const isAdmin = roleLower === "admin";
  const isManager = roleLower === "manager";
  const isStaff = isAdmin || isManager;

  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [limit, setLimit] = useState("200");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async (isRefresh) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params = { limit: Number(limit || 200) };
      if (isManager) params.ticket_type = "SUPPORT";
      else if (typeFilter) params.ticket_type = typeFilter;
      if (statusFilter) params.status = statusFilter;
      const res = await api.get("/support/tickets", { params });
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load tickets");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [typeFilter, statusFilter, limit, isManager]);

  useEffect(() => { if (isStaff) load(); }, [typeFilter, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const changeStatus = async (ticket, newStatus) => {
    setUpdating(true);
    try {
      await api.post(`/support/tickets/${ticket.ticket_id}/status`, null, { params: { new_status: newStatus } });
      setSelected((p) => (p ? { ...p, status: newStatus } : p));
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to update status");
    } finally {
      setUpdating(false);
    }
  };

  const downloadAttachment = async (ticket) => {
    if (!ticket?.ticket_id) return;
    setDownloading(true);
    try {
      const stored = await getStoredSession();
      const token = stored?.access_token || stored?.token || null;
      const headers = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      if (stored?.branch_id) headers["x-branch-id"] = String(stored.branch_id);

      const filename = ticket.attachment_filename || `ticket_${ticket.ticket_id}_attachment`;
      const dest = `${FileSystem.cacheDirectory}${filename}`;
      const result = await FileSystem.downloadAsync(
        `${API_BASE}/support/tickets/${ticket.ticket_id}/attachment`,
        dest,
        { headers }
      );
      if (result.status !== 200) throw new Error("Download failed");
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, { dialogTitle: filename });
      } else {
        Alert.alert("Saved", `File saved to:\n${result.uri}`);
      }
    } catch (err) {
      Alert.alert("Error", err?.message || "Failed to download attachment");
    } finally {
      setDownloading(false);
    }
  };

  const counts = useMemo(() => ({
    total: rows.length,
    open: rows.filter((r) => r.status === "OPEN").length,
    in_progress: rows.filter((r) => r.status === "IN_PROGRESS").length,
    closed: rows.filter((r) => r.status === "CLOSED").length,
  }), [rows]);

  const statusColor = (s) => (s === "OPEN" ? "#dc2626" : s === "IN_PROGRESS" ? "#f59e0b" : "#059669");

  const renderItem = ({ item }) => (
    <Pressable style={st.card} onPress={() => setSelected(item)}>
      <View style={st.cardTop}>
        <Text style={st.subject} numberOfLines={1}>#{item.ticket_id} · {item.shop_name || "—"}</Text>
        <View style={[st.badge, { backgroundColor: `${statusColor(item.status)}22` }]}>
          <Text style={[st.badgeText, { color: statusColor(item.status) }]}>{item.status}</Text>
        </View>
      </View>
      <Text style={st.message} numberOfLines={2}>{item.message}</Text>
      <Text style={st.meta}>{item.ticket_type} · {item.user_name || "—"}{item.branch_name ? ` · ${item.branch_name}` : ""}</Text>
      {item.attachment_filename ? <Text style={st.attachTag}>📎 {item.attachment_filename}</Text> : null}
    </Pressable>
  );

  if (!isStaff) {
    return (
      <SafeAreaView style={st.safe}>
        <View style={st.center}>
          <Text style={st.lockIcon}>🔒</Text>
          <Text style={st.lockText}>You are not authorized to access this page.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.safe}>
      <View style={st.statsRow}>
        <StatCard label="Total" value={counts.total} color="#374151" />
        <StatCard label="Open" value={counts.open} color="#dc2626" />
        <StatCard label="In Progress" value={counts.in_progress} color="#f59e0b" />
        <StatCard label="Closed" value={counts.closed} color="#059669" />
      </View>

      <View style={st.filterCard}>
        {!isManager && (
          <View style={st.chipRow}>
            {["", "SUPPORT", "DEMO"].map((t) => (
              <Pressable key={t || "all"} style={[st.chip, typeFilter === t && st.chipActive]} onPress={() => setTypeFilter(t)}>
                <Text style={[st.chipText, typeFilter === t && st.chipTextActive]}>{t || "All Types"}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <View style={st.chipRow}>
          {["", ...STATUSES].map((s) => (
            <Pressable key={s || "all"} style={[st.chip, statusFilter === s && st.chipActive]} onPress={() => setStatusFilter(s)}>
              <Text style={[st.chipText, statusFilter === s && st.chipTextActive]}>{s || "All Status"}</Text>
            </Pressable>
          ))}
        </View>
        <View style={st.limitRow}>
          <Text style={st.limitLabel}>Limit</Text>
          <TextInput
            style={st.limitInput}
            value={String(limit)}
            onChangeText={setLimit}
            keyboardType="number-pad"
            placeholder="200"
            placeholderTextColor="#94a3b8"
          />
          <Pressable style={st.applyBtn} onPress={() => load()}>
            <Text style={st.applyBtnText}>Apply</Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={st.center}><ActivityIndicator size="large" color="#6366f1" /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r, i) => String(r.ticket_id || i)}
          renderItem={renderItem}
          contentContainerStyle={st.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          ListEmptyComponent={<View style={st.emptyWrap}><Text style={st.emptyIcon}>🎫</Text><Text style={st.emptyTitle}>No tickets</Text></View>}
        />
      )}

      <Modal visible={!!selected} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
        <Pressable style={st.modalBackdrop} onPress={() => setSelected(null)}>
          <Pressable style={st.modalSheet} onPress={(e) => e.stopPropagation()}>
            {selected && (
              <>
                <Text style={st.modalTitle}>Ticket #{selected.ticket_id}</Text>
                <Text style={st.detailMeta}>User: {selected.user_name || "—"}</Text>
                <Text style={st.detailMeta}>Contact: {selected.branch_contact || selected.phone || selected.email || "—"}</Text>
                <Text style={st.detailMeta}>Shop/Branch: {selected.shop_name || "—"}{selected.branch_name ? ` · ${selected.branch_name}` : ""}</Text>
                <Text style={st.detailMeta}>{fmtDate(selected.created_at)}</Text>
                <Text style={st.sectionLabel}>Message</Text>
                <Text style={st.detailMessage}>{selected.message || "No message"}</Text>

                {selected.attachment_filename ? (
                  <Pressable style={st.attachBtn} onPress={() => downloadAttachment(selected)} disabled={downloading}>
                    <Text style={st.attachBtnText}>{downloading ? "Downloading…" : `📎 Download ${selected.attachment_filename}`}</Text>
                  </Pressable>
                ) : null}

                <Text style={st.sectionLabel}>Status</Text>
                <View style={st.chipRow}>
                  {STATUSES.map((s) => (
                    <Pressable
                      key={s}
                      disabled={updating}
                      style={[st.chip, selected.status === s && st.chipActive]}
                      onPress={() => changeStatus(selected, s)}
                    >
                      <Text style={[st.chipText, selected.status === s && st.chipTextActive]}>{s}</Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable style={st.closeBtn} onPress={() => setSelected(null)}>
                  <Text style={st.closeBtnText}>Close</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function StatCard({ label, value, color }) {
  return (
    <View style={st.statCard}>
      <Text style={st.statLabel}>{label}</Text>
      <Text style={[st.statValue, { color }]}>{value}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f6fb" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  lockIcon: { fontSize: 44 },
  lockText: { color: "#6b7280", fontSize: 14, fontWeight: "700", textAlign: "center", paddingHorizontal: 30 },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 14, paddingBottom: 0 },
  statCard: {
    flexGrow: 1, minWidth: "22%", backgroundColor: "#fff", borderRadius: 14, borderWidth: 1.5,
    borderColor: "#e4e9f2", padding: 10, alignItems: "center",
  },
  statLabel: { fontSize: 9, fontWeight: "800", color: "#9ca3af", textTransform: "uppercase" },
  statValue: { fontSize: 18, fontWeight: "900", marginTop: 2 },
  filterCard: { backgroundColor: "#fff", margin: 14, marginBottom: 8, borderRadius: 16, borderWidth: 1.5, borderColor: "#e4e9f2", padding: 12, gap: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#f8f9fd" },
  chipActive: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  chipText: { fontSize: 11, fontWeight: "700", color: "#4b5563" },
  chipTextActive: { color: "#fff" },
  limitRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  limitLabel: { fontSize: 11, fontWeight: "700", color: "#6b7280" },
  limitInput: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, fontSize: 12, color: "#0a0f1e", width: 70 },
  applyBtn: { backgroundColor: "#6366f1", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  applyBtnText: { color: "#fff", fontWeight: "800", fontSize: 11 },
  list: { padding: 14, paddingTop: 6, paddingBottom: 24, gap: 10 },
  card: { backgroundColor: "#fff", borderRadius: 16, borderWidth: 1.5, borderColor: "#e4e9f2", padding: 12, gap: 4 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  subject: { fontSize: 13, fontWeight: "700", color: "#0a0f1e", flex: 1, marginRight: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 10, fontWeight: "800" },
  message: { fontSize: 12, color: "#374151" },
  meta: { fontSize: 11, color: "#9ca3af" },
  attachTag: { fontSize: 11, color: "#6366f1", fontWeight: "600" },
  emptyWrap: { alignItems: "center", paddingTop: 50, gap: 10 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { color: "#9ca3af", fontSize: 15, fontWeight: "700" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(10,15,30,0.45)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#fff", borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, gap: 8, maxHeight: "85%" },
  modalTitle: { fontSize: 16, fontWeight: "800", color: "#0a0f1e" },
  detailMeta: { fontSize: 12, color: "#6b7280" },
  detailMessage: { fontSize: 13, color: "#374151", lineHeight: 19, marginVertical: 4 },
  sectionLabel: { fontSize: 11, fontWeight: "800", color: "#9ca3af", textTransform: "uppercase", marginTop: 6 },
  attachBtn: { marginTop: 8, paddingVertical: 11, borderRadius: 12, backgroundColor: "#eef2ff", alignItems: "center" },
  attachBtnText: { color: "#4338ca", fontWeight: "700", fontSize: 12 },
  closeBtn: { marginTop: 12, paddingVertical: 12, borderRadius: 12, backgroundColor: "#f1f3f9", alignItems: "center" },
  closeBtnText: { color: "#4b5563", fontWeight: "700", fontSize: 13 },
});
