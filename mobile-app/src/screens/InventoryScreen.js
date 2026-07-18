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

import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";


const fmt = (n) => Number(n || 0).toFixed(2);

export default function InventoryScreen() {
  const { theme } = useTheme();
  const { session } = useAuth();
  const branchId = session?.branch_id ?? null;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [inventoryEnabled, setInventoryEnabled] = useState(false);
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [stockData, setStockData] = useState([]);
  const [filterCat, setFilterCat] = useState("all");
  const [search, setSearch] = useState("");
  const [qtyInput, setQtyInput] = useState({});
  const [saving, setSaving] = useState(null);
  const [historyItem, setHistoryItem] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRows, setHistoryRows] = useState([]);

  const getStock = (id) =>
    stockData.find((s) => Number(s.item_id) === Number(id))?.quantity ?? 0;

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [shopRes, itemsRes, catsRes, paramRes] = await Promise.all([
        api.get("/shop/details"),
        api.get("/items/"),
        api.get("/category/"),
        api.get("/parameters/inventory").catch(() => ({ data: {} })),
      ]);
      const shopData = shopRes?.data || {};
      const isHotel =
        String(shopData?.billing_type || shopData?.shop_type || "").toLowerCase() === "hotel";
      const allItems = itemsRes?.data || [];
      const invItems = isHotel
        ? allItems.filter((it) => !!it?.is_raw_material)
        : allItems.filter((it) => !it?.is_raw_material);
      const catIds = new Set(invItems.map((it) => String(it?.category_id ?? "")));
      setCategories((catsRes?.data || []).filter((c) => catIds.has(String(c?.category_id ?? ""))));
      setItems(invItems);
      const enabled = paramRes?.data?.value === "YES";
      setInventoryEnabled(enabled);
      if (enabled && branchId) {
        const stockRes = await api.get("/inventory/list", { params: { branch_id: branchId } });
        setStockData(stockRes?.data || []);
      }
    } catch (err) {
      if (!silent) Alert.alert("Error", err?.response?.data?.detail || "Failed to load inventory");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [branchId]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((it) => {
      const matchCat = filterCat === "all" || String(it.category_id) === filterCat;
      const matchSearch = !q || String(it.item_name || "").toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [items, filterCat, search]);

  const updateStock = async (itemId, mode) => {
    const qty = Number(qtyInput[itemId] || 0);
    if (!qty || qty <= 0) return Alert.alert("Validation", "Enter valid quantity");
    setSaving(itemId);
    try {
      await api.post(`/inventory/${mode}`, null, {
        params: { item_id: itemId, qty, branch_id: branchId },
      });
      setQtyInput((p) => ({ ...p, [itemId]: "" }));
      await load(true);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Stock update failed");
    } finally {
      setSaving(null);
    }
  };

  const openHistory = async (item) => {
    setHistoryItem(item);
    setHistoryLoading(true);
    setHistoryRows([]);
    try {
      const res = await api.get("/inventory/history", { params: { item_id: item.item_id, branch_id: branchId } });
      setHistoryRows(res?.data || []);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load history");
    } finally {
      setHistoryLoading(false);
    }
  };

  const renderItem = ({ item }) => {
    const stock = getStock(item.item_id);
    const isBusy = saving === item.item_id;
    const isLow = item.min_stock > 0 ? stock < item.min_stock : false;
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.itemName}>{item.item_name}</Text>
            <Text style={styles.itemMeta}>
              {item.category_name || ""}{item.unit ? ` · ${item.unit}` : ""}
            </Text>
          </View>
          <Pressable onPress={() => openHistory(item)} style={styles.historyBtn}>
            <Text style={styles.historyBtnText}>🕒</Text>
          </Pressable>
          <View style={styles.stockBadge}>
            <Text style={[styles.stockText, (stock <= 0 || isLow) && styles.stockTextZero]}>
              {fmt(stock)}{item.unit ? ` ${item.unit}` : ""}
            </Text>
            <Text style={styles.stockLabel}>in stock</Text>
            {isLow && (
              <View style={styles.lowBadge}>
                <Text style={styles.lowBadgeText}>LOW STOCK</Text>
              </View>
            )}
            {item.min_stock > 0 && (
              <Text style={styles.minStockText}>Min: {item.min_stock}{item.unit ? ` ${item.unit}` : ""}</Text>
            )}
          </View>
        </View>
        {inventoryEnabled && (
          <View style={styles.stockRow}>
            <TextInput
              style={styles.qtyInput}
              keyboardType="numeric"
              placeholder={item.unit ? `Qty (${item.unit})` : "Qty"}
              placeholderTextColor="#94a3b8"
              value={qtyInput[item.item_id] || ""}
              onChangeText={(v) => setQtyInput((p) => ({ ...p, [item.item_id]: v.replace(/[^\d.]/g, "") }))}
            />
            <Pressable
              style={[styles.addBtn, isBusy && styles.btnDisabled]}
              disabled={isBusy}
              onPress={() => updateStock(item.item_id, "add")}
            >
              <Text style={styles.addBtnText}>{isBusy ? "…" : "+ Add"}</Text>
            </Pressable>
            <Pressable
              style={[styles.subBtn, isBusy && styles.btnDisabled]}
              disabled={isBusy}
              onPress={() => updateStock(item.item_id, "remove")}
            >
              <Text style={styles.subBtnText}>{isBusy ? "…" : "− Sub"}</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search item…"
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catBar}>
        {[{ category_id: "all", category_name: "All" }, ...categories].map((c) => (
          <Pressable
            key={String(c.category_id)}
            style={[styles.chip, filterCat === String(c.category_id) && styles.chipActive]}
            onPress={() => setFilterCat(String(c.category_id))}
          >
            <Text style={[styles.chipText, filterCat === String(c.category_id) && styles.chipTextActive]}>
              {c.category_name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {!inventoryEnabled && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>
            Inventory tracking is disabled. Enable it in Setup → Parameters to manage stock levels.
          </Text>
        </View>
      )}

      <FlatList
        data={filtered}
        keyExtractor={(it) => String(it.item_id)}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={["#2563eb"]} />
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>📦</Text>
            <Text style={styles.emptyTitle}>No items found</Text>
          </View>
        }
      />

      <Modal
        visible={!!historyItem}
        animationType="slide"
        transparent
        onRequestClose={() => setHistoryItem(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalSubtitle}>Stock History</Text>
                <Text style={styles.modalTitle} numberOfLines={1}>{historyItem?.item_name}</Text>
              </View>
              <Pressable style={styles.modalCloseBtn} onPress={() => setHistoryItem(null)}>
                <Text style={styles.modalCloseBtnText}>✕</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.historyList}>
              {historyLoading && <Text style={styles.historyEmpty}>Loading…</Text>}
              {!historyLoading && !historyRows.length && (
                <Text style={styles.historyEmpty}>No history</Text>
              )}
              {!historyLoading && historyRows.map((h, i) => (
                <View key={i} style={styles.historyRow}>
                  <View style={styles.historyRowTop}>
                    <View style={[styles.historyModeBadge, h.mode === "ADD" ? styles.historyModeAdd : styles.historyModeRemove]}>
                      <Text style={[styles.historyModeText, h.mode === "ADD" ? styles.historyModeTextAdd : styles.historyModeTextRemove]}>
                        {h.mode}
                      </Text>
                    </View>
                    <Text style={styles.historyTime}>{h.created_time}</Text>
                  </View>
                  <Text style={styles.historyQty}>Qty: {h.qty}</Text>
                  {h.ref_no ? <Text style={styles.historyRef}>Ref: {h.ref_no}</Text> : null}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f6fb" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  searchBar: { padding: 14, paddingBottom: 4 },
  searchInput: {
    borderWidth: 1.5,
    borderColor: "#e4e9f2",
    borderRadius: 14,
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#0a0f1e",
    fontSize: 14,
    shadowColor: "#0a0f1e",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  catBar: { paddingHorizontal: 14, paddingVertical: 10, flexGrow: 0 },
  chip: {
    borderWidth: 1.5,
    borderColor: "#e4e9f2",
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 8,
    marginRight: 8,
    backgroundColor: "#f8f9fd",
  },
  chipActive: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  chipText: { color: "#4b5563", fontSize: 12, fontWeight: "700" },
  chipTextActive: { color: "#fff" },
  warningBanner: {
    backgroundColor: "#fffbeb",
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginHorizontal: 14,
    borderRadius: 12,
    marginBottom: 6,
    borderWidth: 1.5,
    borderColor: "#fcd34d",
  },
  warningText: { color: "#92400e", fontSize: 12, fontWeight: "700" },
  list: { padding: 14, gap: 10, paddingBottom: 28 },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "#e4e9f2",
    padding: 14,
    gap: 10,
    shadowColor: "#0a0f1e",
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  cardTop: { flexDirection: "row", alignItems: "flex-start" },
  itemName: { fontWeight: "800", color: "#0a0f1e", fontSize: 15 },
  itemMeta: { color: "#9ca3af", fontSize: 12, marginTop: 3, fontWeight: "600" },
  stockBadge: { alignItems: "flex-end" },
  stockText: { fontSize: 22, fontWeight: "900", color: "#10b981", letterSpacing: -0.5 },
  stockTextZero: { color: "#ef4444" },
  stockLabel: { fontSize: 10, color: "#9ca3af", fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  stockRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  qtyInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#e4e9f2",
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#0a0f1e",
    backgroundColor: "#f8f9fd",
    fontSize: 14,
  },
  addBtn: {
    backgroundColor: "#10b981",
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: "#10b981",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  addBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  subBtn: {
    backgroundColor: "#ef4444",
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: "#ef4444",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  subBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  btnDisabled: { opacity: 0.5 },
  emptyWrap: { alignItems: "center", paddingTop: 64, gap: 10 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { color: "#9ca3af", fontSize: 17, fontWeight: "700" },
  historyBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
    marginRight: 4,
  },
  historyBtnText: { fontSize: 14 },
  lowBadge: {
    backgroundColor: "#fee2e2",
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 3,
  },
  lowBadgeText: { color: "#dc2626", fontSize: 8, fontWeight: "800", letterSpacing: 0.3 },
  minStockText: { color: "#9ca3af", fontSize: 9, fontWeight: "600", marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(10,15,30,0.45)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: "75%",
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#eef1f7",
  },
  modalSubtitle: { color: "#9ca3af", fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  modalTitle: { color: "#0a0f1e", fontSize: 16, fontWeight: "800", marginTop: 2 },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCloseBtnText: { fontSize: 14, color: "#4b5563", fontWeight: "700" },
  historyList: { paddingHorizontal: 16, paddingTop: 12 },
  historyEmpty: { textAlign: "center", color: "#9ca3af", fontSize: 13, paddingVertical: 32 },
  historyRow: {
    backgroundColor: "#f8f9fd",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#eef1f7",
    padding: 12,
    marginBottom: 8,
    gap: 4,
  },
  historyRowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  historyModeBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  historyModeAdd: { backgroundColor: "#d1fae5" },
  historyModeRemove: { backgroundColor: "#fee2e2" },
  historyModeText: { fontSize: 10, fontWeight: "800" },
  historyModeTextAdd: { color: "#059669" },
  historyModeTextRemove: { color: "#dc2626" },
  historyTime: { color: "#9ca3af", fontSize: 11 },
  historyQty: { color: "#0a0f1e", fontSize: 14, fontWeight: "700" },
  historyRef: { color: "#6b7280", fontSize: 12 },
});
