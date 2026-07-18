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
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import api from "../api/client";
import { useAuth } from "../context/AuthContext";

const UNITS = ["kg", "g", "litre", "ml", "pcs", "box", "packet", "dozen"];
const BLANK = {
  item_name: "", category_id: "", supplier_id: "", price: "", buy_price: "", mrp_price: "",
  min_stock: "", unit: "pcs", is_raw_material: false, sold_by_weight: false, item_status: true,
};

export default function ItemsScreen() {
  const { session } = useAuth();
  const isAdmin = String(session?.role_name || session?.role || "").toLowerCase() === "admin";

  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);

  const [isHotel, setIsHotel] = useState(false);
  const [branchWise, setBranchWise] = useState(false);
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");

  const branchHeaders = (branchWise && selectedBranchId) ? { "x-branch-id": String(selectedBranchId) } : {};

  const load = useCallback(async (isRefresh, branchIdOverride) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [shopRes, branchRes, catRes, supRes] = await Promise.all([
        api.get("/shop/details").catch(() => ({ data: {} })),
        api.get("/branch/active").catch(() => ({ data: [] })),
        api.get("/category/").catch(() => ({ data: [] })),
        api.get("/suppliers/").catch(() => ({ data: [] })),
      ]);
      const shopData = shopRes?.data || {};
      setIsHotel(String(shopData?.billing_type || shopData?.shop_type || "").toLowerCase() === "hotel");
      const isBW = !!shopData.items_branch_wise;
      setBranchWise(isBW);
      const branchList = Array.isArray(branchRes?.data) ? branchRes.data : [];
      setBranches(branchList);

      let bid = branchIdOverride;
      if (bid === undefined) {
        if (isBW) {
          bid = isAdmin
            ? (branchList[0]?.branch_id ? String(branchList[0].branch_id) : "")
            : String(session?.branch_id || "");
          setSelectedBranchId(bid);
        } else {
          bid = "";
          setSelectedBranchId("");
        }
      }

      const headers = (isBW && bid) ? { "x-branch-id": String(bid) } : {};
      const itemsRes = await api.get("/items/", { headers });
      setRows(Array.isArray(itemsRes.data) ? itemsRes.data : []);
      setCategories(Array.isArray(catRes.data) ? catRes.data : []);
      setSuppliers(Array.isArray(supRes.data) ? supRes.data : []);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load items");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAdmin, session?.branch_id]);

  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter((it) => it.item_name?.toLowerCase().includes(search.toLowerCase()));

  const openNew = () => { setEditingId(null); setForm(BLANK); setModalOpen(true); };
  const openEdit = (it) => {
    setEditingId(it.item_id);
    setForm({
      item_name: it.item_name || "", category_id: String(it.category_id ?? ""), supplier_id: String(it.supplier_id ?? ""),
      price: String(it.price ?? ""), buy_price: String(it.buy_price ?? ""), mrp_price: String(it.mrp_price ?? ""),
      min_stock: String(it.min_stock ?? ""), unit: it.unit || "pcs",
      is_raw_material: !!it.is_raw_material, sold_by_weight: !!it.sold_by_weight, item_status: it.item_status !== false,
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.item_name.trim()) return Alert.alert("Validation", "Enter item name");
    if (form.is_raw_material) {
      if (!form.supplier_id) return Alert.alert("Validation", "Select a supplier for raw material");
    } else {
      if (!isHotel) {
        if (!Number(form.buy_price)) return Alert.alert("Validation", "Buy price is required");
        if (!Number(form.mrp_price)) return Alert.alert("Validation", "MRP is required");
      }
      if (!Number(form.price)) return Alert.alert("Validation", "Selling price is required");
    }
    setSaving(true);
    try {
      const payload = form.is_raw_material
        ? {
            item_name: form.item_name.trim(),
            is_raw_material: true,
            supplier_id: Number(form.supplier_id),
            category_id: null,
            price: 0,
            buy_price: 0,
            mrp_price: 0,
            min_stock: form.min_stock ? Number(form.min_stock) : 0,
            unit: form.unit || null,
            item_status: form.item_status,
            sold_by_weight: false,
          }
        : {
            item_name: form.item_name.trim(),
            category_id: form.category_id ? Number(form.category_id) : null,
            is_raw_material: false,
            supplier_id: null,
            price: Number(form.price) || 0,
            buy_price: isHotel ? 0 : (form.buy_price ? Number(form.buy_price) : 0),
            mrp_price: isHotel ? 0 : (form.mrp_price ? Number(form.mrp_price) : 0),
            min_stock: form.min_stock ? Number(form.min_stock) : 0,
            item_status: form.item_status,
            sold_by_weight: form.sold_by_weight,
          };
      if (editingId) await api.put(`/items/${editingId}`, payload, { headers: branchHeaders });
      else await api.post("/items/", payload, { headers: branchHeaders });
      setModalOpen(false);
      load(false, selectedBranchId);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to save item");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (it) => {
    try {
      await api.put(`/items/${it.item_id}`, { item_status: !it.item_status }, { headers: branchHeaders });
      load(false, selectedBranchId);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to update");
    }
  };

  const switchBranch = (bid) => {
    setSelectedBranchId(bid);
    load(false, bid);
  };

  const renderItem = ({ item }) => (
    <View style={st.row}>
      <Pressable style={{ flex: 1 }} onPress={() => openEdit(item)}>
        <Text style={st.name} numberOfLines={1}>{item.item_name}</Text>
        <Text style={st.meta}>₹{Number(item.price || 0).toFixed(2)}{item.is_raw_material ? ` · Raw material (${item.unit})` : ""}</Text>
      </Pressable>
      <Switch value={item.item_status !== false} onValueChange={() => toggleStatus(item)} trackColor={{ true: "#6366f1" }} />
    </View>
  );

  return (
    <SafeAreaView style={st.safe}>
      <View style={st.searchWrap}>
        <TextInput style={st.searchInput} placeholder="Search item..." placeholderTextColor="#94a3b8" value={search} onChangeText={setSearch} />
      </View>

      {branchWise && (
        isAdmin ? (
          branches.length > 0 && (
            <View style={st.chipRow}>
              {branches.map((b) => (
                <Pressable key={b.branch_id} style={[st.chip, String(selectedBranchId) === String(b.branch_id) && st.chipActive]} onPress={() => switchBranch(String(b.branch_id))}>
                  <Text style={[st.chipText, String(selectedBranchId) === String(b.branch_id) && st.chipTextActive]}>{b.branch_name}</Text>
                </Pressable>
              ))}
            </View>
          )
        ) : (
          <View style={st.chipRow}>
            <View style={[st.chip, st.chipActive]}>
              <Text style={[st.chipText, st.chipTextActive]}>
                {branches.find((b) => String(b.branch_id) === String(session?.branch_id))?.branch_name || "My Branch"}
              </Text>
            </View>
          </View>
        )
      )}

      {loading ? (
        <View style={st.center}><ActivityIndicator size="large" color="#6366f1" /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(r, i) => String(r.item_id || i)}
          renderItem={renderItem}
          contentContainerStyle={st.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true, selectedBranchId)} />}
          ListEmptyComponent={<View style={st.emptyWrap}><Text style={st.emptyIcon}>📦</Text><Text style={st.emptyTitle}>No items yet</Text></View>}
        />
      )}
      <Pressable style={st.fab} onPress={openNew}><Text style={st.fabText}>+ New Item</Text></Pressable>

      <Modal visible={modalOpen} animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <SafeAreaView style={st.safe}>
          <View style={st.detailHeader}>
            <Pressable onPress={() => setModalOpen(false)}><Text style={st.backLink}>‹ Cancel</Text></Pressable>
            <Text style={st.detailTitle}>{editingId ? "Edit Item" : "New Item"}</Text>
          </View>
          <FlatList
            data={[1]}
            keyExtractor={() => "form"}
            contentContainerStyle={{ padding: 14, gap: 10 }}
            renderItem={() => (
              <View style={{ gap: 10 }}>
                <TextInput style={st.input} placeholder="Item name" placeholderTextColor="#94a3b8" value={form.item_name} onChangeText={(v) => setForm((p) => ({ ...p, item_name: v }))} />
                {categories.length > 0 && (
                  <>
                    <Text style={st.sectionLabel}>Category</Text>
                    <View style={st.chipRow}>
                      {categories.map((c) => (
                        <Pressable key={c.category_id} style={[st.chip, String(form.category_id) === String(c.category_id) && st.chipActive]} onPress={() => setForm((p) => ({ ...p, category_id: String(c.category_id) }))}>
                          <Text style={[st.chipText, String(form.category_id) === String(c.category_id) && st.chipTextActive]}>{c.category_name}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                )}
                <View style={st.toggleRow}>
                  <Text style={st.toggleLabel}>Raw Material</Text>
                  <Switch
                    value={form.is_raw_material}
                    onValueChange={(v) => setForm((p) => ({
                      ...p,
                      is_raw_material: v,
                      sold_by_weight: v ? false : p.sold_by_weight,
                      price: "", buy_price: "", mrp_price: "",
                      category_id: v ? "" : p.category_id,
                      supplier_id: v ? p.supplier_id : "",
                    }))}
                    trackColor={{ true: "#6366f1" }}
                  />
                </View>
                {form.is_raw_material && suppliers.length > 0 && (
                  <>
                    <Text style={st.sectionLabel}>Supplier</Text>
                    <View style={st.chipRow}>
                      {suppliers.map((s) => (
                        <Pressable key={s.supplier_id} style={[st.chip, String(form.supplier_id) === String(s.supplier_id) && st.chipActive]} onPress={() => setForm((p) => ({ ...p, supplier_id: String(s.supplier_id) }))}>
                          <Text style={[st.chipText, String(form.supplier_id) === String(s.supplier_id) && st.chipTextActive]}>{s.supplier_name}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <Text style={st.sectionLabel}>Unit</Text>
                    <View style={st.chipRow}>
                      {UNITS.map((u) => (
                        <Pressable key={u} style={[st.chip, form.unit === u && st.chipActive]} onPress={() => setForm((p) => ({ ...p, unit: u }))}>
                          <Text style={[st.chipText, form.unit === u && st.chipTextActive]}>{u}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                )}
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TextInput style={[st.input, { flex: 1 }]} placeholder="Selling price" placeholderTextColor="#94a3b8" keyboardType="numeric" value={form.price} onChangeText={(v) => setForm((p) => ({ ...p, price: v }))} />
                  {!isHotel && (
                    <>
                      <TextInput style={[st.input, { flex: 1 }]} placeholder="Buy price" placeholderTextColor="#94a3b8" keyboardType="numeric" value={form.buy_price} onChangeText={(v) => setForm((p) => ({ ...p, buy_price: v }))} />
                      <TextInput style={[st.input, { flex: 1 }]} placeholder="MRP" placeholderTextColor="#94a3b8" keyboardType="numeric" value={form.mrp_price} onChangeText={(v) => setForm((p) => ({ ...p, mrp_price: v }))} />
                    </>
                  )}
                </View>
                <TextInput style={st.input} placeholder="Minimum stock" placeholderTextColor="#94a3b8" keyboardType="numeric" value={form.min_stock} onChangeText={(v) => setForm((p) => ({ ...p, min_stock: v }))} />
                <View style={st.toggleRow}>
                  <Text style={st.toggleLabel}>Sold By Weight</Text>
                  <Switch value={form.sold_by_weight} onValueChange={(v) => setForm((p) => ({ ...p, sold_by_weight: v }))} trackColor={{ true: "#6366f1" }} />
                </View>
              </View>
            )}
          />
          <View style={st.detailActions}>
            <Pressable style={st.completeBtn} disabled={saving} onPress={save}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.completeBtnText}>{editingId ? "Save Changes" : "Create Item"}</Text>}
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f6fb" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  searchWrap: { padding: 14, paddingBottom: 6 },
  searchInput: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12, backgroundColor: "#fff", paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: "#0a0f1e" },
  list: { padding: 14, paddingTop: 6, paddingBottom: 90, gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff", borderRadius: 14, borderWidth: 1.5, borderColor: "#e4e9f2", padding: 12 },
  name: { fontSize: 13, fontWeight: "700", color: "#0a0f1e" },
  meta: { fontSize: 11, color: "#6b7280", marginTop: 2 },
  emptyWrap: { alignItems: "center", paddingTop: 50, gap: 10 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { color: "#9ca3af", fontSize: 15, fontWeight: "700" },
  fab: { position: "absolute", right: 16, bottom: 20, backgroundColor: "#6366f1", borderRadius: 999, paddingHorizontal: 20, paddingVertical: 14, elevation: 4 },
  fabText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  detailHeader: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14 },
  backLink: { color: "#6366f1", fontWeight: "700", fontSize: 13 },
  detailTitle: { fontSize: 16, fontWeight: "800", color: "#0a0f1e" },
  sectionLabel: { fontSize: 11, fontWeight: "800", color: "#9ca3af", textTransform: "uppercase" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#f8f9fd" },
  chipActive: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  chipText: { fontSize: 11, fontWeight: "700", color: "#4b5563" },
  chipTextActive: { color: "#fff" },
  toggleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#f8f9fd", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  toggleLabel: { fontSize: 13, fontWeight: "700", color: "#374151" },
  input: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12, backgroundColor: "#f8f9fd", paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: "#0a0f1e" },
  detailActions: { padding: 14, borderTopWidth: 1, borderTopColor: "#e4e9f2" },
  completeBtn: { paddingVertical: 13, borderRadius: 12, backgroundColor: "#6366f1", alignItems: "center" },
  completeBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
});
