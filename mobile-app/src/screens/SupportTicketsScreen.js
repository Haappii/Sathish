import { useCallback, useEffect, useState } from "react";
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
  View,
} from "react-native";

import api from "../api/client";
import { useAuth } from "../context/AuthContext";

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
  const isManager = roleLower === "manager";

  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState(null);
  const [updating, setUpdating] = useState(false);

  const load = useCallback(async (isRefresh) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params = { limit: 200 };
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
  }, [typeFilter, statusFilter, isManager]);

  useEffect(() => { load(); }, [typeFilter, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

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
    </Pressable>
  );

  return (
    <SafeAreaView style={st.safe}>
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
                <Text style={st.detailMeta}>{selected.shop_name}{selected.branch_name ? ` · ${selected.branch_name}` : ""}</Text>
                <Text style={st.detailMeta}>{selected.user_name || "—"} · {fmtDate(selected.created_at)}</Text>
                <Text style={st.detailMessage}>{selected.message}</Text>
                {selected.branch_contact ? <Text style={st.detailMeta}>Contact: {selected.branch_contact}</Text> : null}
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

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f6fb" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  filterCard: { backgroundColor: "#fff", margin: 14, marginBottom: 8, borderRadius: 16, borderWidth: 1.5, borderColor: "#e4e9f2", padding: 12, gap: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#f8f9fd" },
  chipActive: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  chipText: { fontSize: 11, fontWeight: "700", color: "#4b5563" },
  chipTextActive: { color: "#fff" },
  list: { padding: 14, paddingTop: 6, paddingBottom: 24, gap: 10 },
  card: { backgroundColor: "#fff", borderRadius: 16, borderWidth: 1.5, borderColor: "#e4e9f2", padding: 12, gap: 4 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  subject: { fontSize: 13, fontWeight: "700", color: "#0a0f1e", flex: 1, marginRight: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 10, fontWeight: "800" },
  message: { fontSize: 12, color: "#374151" },
  meta: { fontSize: 11, color: "#9ca3af" },
  emptyWrap: { alignItems: "center", paddingTop: 50, gap: 10 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { color: "#9ca3af", fontSize: 15, fontWeight: "700" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(10,15,30,0.45)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#fff", borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, gap: 8, maxHeight: "80%" },
  modalTitle: { fontSize: 16, fontWeight: "800", color: "#0a0f1e" },
  detailMeta: { fontSize: 12, color: "#6b7280" },
  detailMessage: { fontSize: 13, color: "#374151", lineHeight: 19, marginVertical: 8 },
  sectionLabel: { fontSize: 11, fontWeight: "800", color: "#9ca3af", textTransform: "uppercase", marginTop: 6 },
  closeBtn: { marginTop: 12, paddingVertical: 12, borderRadius: 12, backgroundColor: "#f1f3f9", alignItems: "center" },
  closeBtnText: { color: "#4b5563", fontWeight: "700", fontSize: 13 },
});
