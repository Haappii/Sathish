import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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

const fmt = (n) => Number(n || 0).toFixed(2);

export default function InventoryScreen() {
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

  const renderItem = ({ item }) => {
    const stock = getStock(item.item_id);
    const isBusy = saving === item.item_id;
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.itemName}>{item.item_name}</Text>
            <Text style={styles.itemMeta}>
              {item.category_name || ""}{item.unit ? ` · ${item.unit}` : ""}
            </Text>
          </View>
          <View style={styles.stockBadge}>
            <Text style={[styles.stockText, stock <= 0 && styles.stockTextZero]}>
              {fmt(stock)}{item.unit ? ` ${item.unit}` : ""}
            </Text>
            <Text style={styles.stockLabel}>in stock</Text>
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
          <ActivityIndicator size="large" color="#0b57d0" />
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
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={["#0b57d0"]} />
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>📦</Text>
            <Text style={styles.emptyTitle}>No items found</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f3f6ff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  searchBar: { padding: 12, paddingBottom: 0 },
  searchInput: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#0b1220",
  },
  catBar: { paddingHorizontal: 12, paddingVertical: 8, flexGrow: 0 },
  chip: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
    backgroundColor: "#fff",
  },
  chipActive: { backgroundColor: "#0b57d0", borderColor: "#0b57d0" },
  chipText: { color: "#334155", fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  warningBanner: { backgroundColor: "#fef3c7", padding: 10, marginHorizontal: 12, borderRadius: 8, marginBottom: 4 },
  warningText: { color: "#92400e", fontSize: 12, fontWeight: "600" },
  list: { padding: 12, gap: 8, paddingBottom: 24 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d9e3ff",
    padding: 12,
    gap: 8,
  },
  cardTop: { flexDirection: "row", alignItems: "flex-start" },
  itemName: { fontWeight: "700", color: "#0b1220", fontSize: 14 },
  itemMeta: { color: "#64748b", fontSize: 12, marginTop: 2 },
  stockBadge: { alignItems: "flex-end" },
  stockText: { fontSize: 20, fontWeight: "800", color: "#059669" },
  stockTextZero: { color: "#dc2626" },
  stockLabel: { fontSize: 10, color: "#64748b", fontWeight: "600" },
  stockRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  qtyInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: "#0b1220",
    backgroundColor: "#ffffff",
  },
  addBtn: {
    backgroundColor: "#059669",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  subBtn: {
    backgroundColor: "#dc2626",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  subBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  btnDisabled: { opacity: 0.5 },
  emptyWrap: { alignItems: "center", paddingTop: 60, gap: 8 },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { color: "#64748b", fontSize: 16, fontWeight: "700" },
});
