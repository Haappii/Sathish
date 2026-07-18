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
  TextInput,
  View,
} from "react-native";

import api from "../api/client";

const BLANK_INGREDIENT = { ingredient_name: "", quantity: "", unit: "", cost_per_unit: "" };
const fmt = (n) => `₹${Number(n || 0).toFixed(2)}`;

export default function RecipesScreen() {
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [search, setSearch] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [itemName, setItemName] = useState("");
  const [servingSize, setServingSize] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [ingredients, setIngredients] = useState([{ ...BLANK_INGREDIENT }]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (isRefresh) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await api.get("/recipes/");
      setRecipes(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load recipes");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = recipes.filter((r) => r.item_name?.toLowerCase().includes(search.toLowerCase()));

  const openNew = () => {
    setEditingId(null); setItemName(""); setServingSize(""); setSellingPrice("");
    setIngredients([{ ...BLANK_INGREDIENT }]);
    setModalOpen(true);
  };

  const openEdit = (r) => {
    setEditingId(r.recipe_id);
    setItemName(r.item_name || ""); setServingSize(String(r.serving_size || "")); setSellingPrice(String(r.selling_price || ""));
    setIngredients((r.ingredients || []).map((i) => ({
      ingredient_name: i.ingredient_name || "", quantity: String(i.quantity ?? ""), unit: i.unit || "", cost_per_unit: String(i.cost_per_unit ?? ""),
    })));
    setModalOpen(true);
  };

  const addIngredient = () => setIngredients((p) => [...p, { ...BLANK_INGREDIENT }]);
  const removeIngredient = (i) => setIngredients((p) => p.filter((_, idx) => idx !== i));
  const updateIngredient = (i, field, val) => setIngredients((p) => p.map((r, idx) => (idx === i ? { ...r, [field]: val } : r)));

  const save = async () => {
    if (!itemName.trim()) return Alert.alert("Validation", "Dish name is required");
    const validIngredients = ingredients.filter((i) => i.ingredient_name.trim() && i.quantity);
    setSaving(true);
    try {
      const payload = {
        item_name: itemName.trim(),
        serving_size: servingSize ? Number(servingSize) : 1,
        selling_price: sellingPrice ? Number(sellingPrice) : 0,
        ingredients: validIngredients.map((i) => ({
          ingredient_name: i.ingredient_name.trim(), quantity: Number(i.quantity), unit: i.unit.trim(), cost_per_unit: Number(i.cost_per_unit || 0),
        })),
      };
      if (editingId) await api.put(`/recipes/${editingId}`, payload);
      else await api.post("/recipes/", payload);
      setModalOpen(false);
      load();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to save recipe");
    } finally {
      setSaving(false);
    }
  };

  const remove = (r) => {
    Alert.alert("Delete Recipe", `Delete recipe for "${r.item_name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await api.delete(`/recipes/${r.recipe_id}`); load(); }
        catch (err) { Alert.alert("Error", err?.response?.data?.detail || "Failed to delete"); }
      }},
    ]);
  };

  const renderItem = ({ item }) => {
    const expanded = expandedId === item.recipe_id;
    return (
      <View style={st.card}>
        <Pressable onPress={() => setExpandedId(expanded ? null : item.recipe_id)}>
          <View style={st.cardTop}>
            <Text style={st.dishName}>{item.item_name}</Text>
            <Text style={st.margin}>{item.margin_pct != null ? `${Number(item.margin_pct).toFixed(0)}% margin` : ""}</Text>
          </View>
          <Text style={st.meta}>Food cost {fmt(item.food_cost)} · Sells {fmt(item.selling_price)}</Text>
        </Pressable>
        {expanded && (item.ingredients || []).map((ing, i) => (
          <Text key={i} style={st.ingredientLine}>• {ing.ingredient_name} — {ing.quantity} {ing.unit} @ {fmt(ing.cost_per_unit)}</Text>
        ))}
        <View style={st.actionsRow}>
          <Pressable style={st.editBtn} onPress={() => openEdit(item)}><Text style={st.editBtnText}>Edit</Text></Pressable>
          <Pressable style={st.deleteBtn} onPress={() => remove(item)}><Text style={st.deleteBtnText}>Delete</Text></Pressable>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={st.safe}>
      <View style={st.searchWrap}>
        <TextInput style={st.searchInput} placeholder="Search dish..." placeholderTextColor="#94a3b8" value={search} onChangeText={setSearch} />
      </View>

      {loading ? (
        <View style={st.center}><ActivityIndicator size="large" color="#6366f1" /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(r, i) => String(r.recipe_id || i)}
          renderItem={renderItem}
          contentContainerStyle={st.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          ListEmptyComponent={<View style={st.emptyWrap}><Text style={st.emptyIcon}>🍳</Text><Text style={st.emptyTitle}>No recipes yet</Text></View>}
        />
      )}

      <Pressable style={st.fab} onPress={openNew}>
        <Text style={st.fabText}>+ New Recipe</Text>
      </Pressable>

      <Modal visible={modalOpen} animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <SafeAreaView style={st.safe}>
          <View style={st.detailHeader}>
            <Pressable onPress={() => setModalOpen(false)}><Text style={st.backLink}>‹ Cancel</Text></Pressable>
            <Text style={st.detailTitle}>{editingId ? "Edit Recipe" : "New Recipe"}</Text>
          </View>
          <FlatList
            data={ingredients}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={{ padding: 14, gap: 10 }}
            ListHeaderComponent={
              <View style={{ gap: 10, marginBottom: 6 }}>
                <TextInput style={st.input} placeholder="Dish name" placeholderTextColor="#94a3b8" value={itemName} onChangeText={setItemName} />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TextInput style={[st.input, { flex: 1 }]} placeholder="Serving size" placeholderTextColor="#94a3b8" keyboardType="numeric" value={servingSize} onChangeText={setServingSize} />
                  <TextInput style={[st.input, { flex: 1 }]} placeholder="Selling price" placeholderTextColor="#94a3b8" keyboardType="numeric" value={sellingPrice} onChangeText={setSellingPrice} />
                </View>
                <Text style={st.sectionLabel}>Ingredients</Text>
              </View>
            }
            renderItem={({ item: row, index }) => (
              <View style={st.ingredientRow}>
                <TextInput style={[st.input, { flex: 1.5 }]} placeholder="Ingredient" placeholderTextColor="#94a3b8" value={row.ingredient_name} onChangeText={(v) => updateIngredient(index, "ingredient_name", v)} />
                <TextInput style={[st.input, { width: 55 }]} placeholder="Qty" placeholderTextColor="#94a3b8" keyboardType="numeric" value={row.quantity} onChangeText={(v) => updateIngredient(index, "quantity", v)} />
                <TextInput style={[st.input, { width: 55 }]} placeholder="Unit" placeholderTextColor="#94a3b8" value={row.unit} onChangeText={(v) => updateIngredient(index, "unit", v)} />
                <TextInput style={[st.input, { width: 60 }]} placeholder="₹/unit" placeholderTextColor="#94a3b8" keyboardType="numeric" value={row.cost_per_unit} onChangeText={(v) => updateIngredient(index, "cost_per_unit", v)} />
                <Pressable onPress={() => removeIngredient(index)}><Text style={st.removeText}>✕</Text></Pressable>
              </View>
            )}
            ListFooterComponent={
              <Pressable style={st.addRowBtn} onPress={addIngredient}><Text style={st.addRowBtnText}>+ Add Ingredient</Text></Pressable>
            }
          />
          <View style={st.detailActions}>
            <Pressable style={st.completeBtn} disabled={saving} onPress={save}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.completeBtnText}>{editingId ? "Save Changes" : "Create Recipe"}</Text>}
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
  list: { padding: 14, paddingTop: 6, paddingBottom: 90, gap: 10 },
  card: { backgroundColor: "#fff", borderRadius: 16, borderWidth: 1.5, borderColor: "#e4e9f2", padding: 12, gap: 6 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dishName: { fontSize: 14, fontWeight: "800", color: "#0a0f1e", flex: 1 },
  margin: { fontSize: 12, color: "#059669", fontWeight: "700" },
  meta: { fontSize: 11, color: "#9ca3af" },
  ingredientLine: { fontSize: 12, color: "#374151", marginTop: 4 },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  editBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: "#eef2ff" },
  editBtnText: { color: "#6366f1", fontSize: 11, fontWeight: "800" },
  deleteBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: "#fef2f2" },
  deleteBtnText: { color: "#dc2626", fontSize: 11, fontWeight: "800" },
  emptyWrap: { alignItems: "center", paddingTop: 50, gap: 10 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { color: "#9ca3af", fontSize: 15, fontWeight: "700" },
  fab: { position: "absolute", right: 16, bottom: 20, backgroundColor: "#6366f1", borderRadius: 999, paddingHorizontal: 20, paddingVertical: 14, elevation: 4 },
  fabText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  detailHeader: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14 },
  backLink: { color: "#6366f1", fontWeight: "700", fontSize: 13 },
  detailTitle: { fontSize: 16, fontWeight: "800", color: "#0a0f1e" },
  sectionLabel: { fontSize: 11, fontWeight: "800", color: "#9ca3af", textTransform: "uppercase" },
  input: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12, backgroundColor: "#f8f9fd", paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, color: "#0a0f1e" },
  ingredientRow: { flexDirection: "row", gap: 6, alignItems: "center" },
  removeText: { color: "#dc2626", fontSize: 16, fontWeight: "800", paddingHorizontal: 4 },
  addRowBtn: { paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: "#e4e9f2", borderStyle: "dashed", alignItems: "center" },
  addRowBtnText: { color: "#6366f1", fontWeight: "700", fontSize: 12 },
  detailActions: { padding: 14, borderTopWidth: 1, borderTopColor: "#e4e9f2" },
  completeBtn: { paddingVertical: 13, borderRadius: 12, backgroundColor: "#6366f1", alignItems: "center" },
  completeBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
});
