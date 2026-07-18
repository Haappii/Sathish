/**
 * RecipesScreen — Hotel only. Recipe & food cost management.
 * Mirrors frontend/src/pages/RecipeManagement.jsx field-for-field.
 */
import { useCallback, useEffect, useState } from "react";
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

const UNITS = ["g", "kg", "ml", "L", "pcs", "tbsp", "tsp", "cup"];
const BLANK_INGREDIENT = { ingredient_item_id: "", quantity: "1", unit: "g", cost_per_unit: "0" };
const fmt = (n) => `₹${Number(n || 0).toFixed(2)}`;

const marginColor = (pct) => {
  if (pct >= 60) return "#059669";
  if (pct >= 40) return "#d97706";
  return "#dc2626";
};

export default function RecipesScreen({ navigation }) {
  const [billingType, setBillingType] = useState(null); // null = loading
  const [recipes, setRecipes] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [ingredientItems, setIngredientItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [search, setSearch] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState(null); // recipe being edited, or null = new
  const [itemPickerOpen, setItemPickerOpen] = useState(false);
  const [itemId, setItemId] = useState("");
  const [servingSize, setServingSize] = useState("1");
  const [notes, setNotes] = useState("");
  const [ingredients, setIngredients] = useState([{ ...BLANK_INGREDIENT }]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (isRefresh) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const shopRes = await api.get("/shop/details");
      const bt = String(shopRes?.data?.billing_type || "").toLowerCase();
      setBillingType(bt);
      if (bt !== "hotel") return;

      const [recRes, menuRes, ingRes] = await Promise.all([
        api.get("/recipes/").catch(() => ({ data: [] })),
        api.get("/items/", { params: { is_raw_material: false } }),
        api.get("/items/", { params: { is_raw_material: true } }),
      ]);
      setRecipes(Array.isArray(recRes.data) ? recRes.data : []);
      setMenuItems(Array.isArray(menuRes.data) ? menuRes.data : (menuRes.data?.items || []));
      setIngredientItems(Array.isArray(ingRes.data) ? ingRes.data : (ingRes.data?.items || []));
    } catch (err) {
      setBillingType((prev) => prev || "store");
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load recipes");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = recipes.filter((r) => (r.item_name || "").toLowerCase().includes(search.toLowerCase()));
  const menuItemsWithoutRecipe = menuItems.filter((it) => !recipes.some((r) => r.item_id === it.item_id));

  const openNew = () => {
    setSelected(null);
    setItemId("");
    setServingSize("1");
    setNotes("");
    setIngredients([{ ...BLANK_INGREDIENT }]);
    setModalOpen(true);
  };

  const openEdit = (r) => {
    setSelected(r);
    setItemId(String(r.item_id || ""));
    setServingSize(String(r.serving_size || "1"));
    setNotes(r.notes || "");
    setIngredients(
      (r.ingredients || []).map((i) => ({
        ingredient_item_id: String(i.ingredient_item_id ?? ""),
        quantity: String(i.quantity ?? ""),
        unit: i.unit || "g",
        cost_per_unit: String(i.cost_per_unit ?? "0"),
      }))
    );
    setModalOpen(true);
  };

  const addIngredient = () => setIngredients((p) => [...p, { ...BLANK_INGREDIENT }]);
  const removeIngredient = (i) => setIngredients((p) => p.filter((_, idx) => idx !== i));
  const updateIngredient = (i, field, val) => setIngredients((p) => p.map((r, idx) => (idx === i ? { ...r, [field]: val } : r)));

  const save = async () => {
    if (!itemId) return Alert.alert("Validation", "Select a menu item");
    const validIngredients = ingredients.filter((i) => i.ingredient_item_id && i.quantity);
    if (!validIngredients.length) return Alert.alert("Validation", "Add at least one ingredient");
    setSaving(true);
    try {
      const payload = {
        item_id: Number(itemId),
        serving_size: servingSize ? Number(servingSize) : 1,
        notes: notes.trim() || null,
        ingredients: validIngredients.map((i) => ({
          ingredient_item_id: Number(i.ingredient_item_id),
          quantity: Number(i.quantity),
          unit: i.unit.trim() || "g",
          cost_per_unit: Number(i.cost_per_unit || 0),
        })),
      };
      if (selected) await api.put(`/recipes/${selected.recipe_id}`, payload);
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

  const selectedItemName = () => {
    const m = menuItems.find((it) => String(it.item_id) === String(itemId));
    return m?.item_name || "";
  };
  const ingredientName = (id) => ingredientItems.find((it) => String(it.item_id) === String(id))?.item_name || "";

  const renderItem = ({ item }) => {
    const expanded = expandedId === item.recipe_id;
    return (
      <View style={st.card}>
        <Pressable onPress={() => setExpandedId(expanded ? null : item.recipe_id)}>
          <View style={st.cardTop}>
            <Text style={st.dishName}>{item.item_name}</Text>
            <Text style={[st.margin, { color: marginColor(item.margin_pct) }]}>
              {item.margin_pct != null ? `${Number(item.margin_pct).toFixed(1)}%` : ""}
            </Text>
          </View>
          <Text style={st.meta}>Serving: {item.serving_size} · {(item.ingredients || []).length} ingredient{(item.ingredients || []).length !== 1 ? "s" : ""}</Text>
          <View style={st.costRow}>
            <View style={st.costCell}>
              <Text style={st.costValue}>{fmt(item.selling_price)}</Text>
              <Text style={st.costLabel}>Selling</Text>
            </View>
            <View style={st.costCell}>
              <Text style={[st.costValue, { color: "#ea580c" }]}>{fmt(item.food_cost)}</Text>
              <Text style={st.costLabel}>Food Cost</Text>
            </View>
            <View style={st.costCell}>
              <Text style={[st.costValue, { color: item.gross_margin >= 0 ? "#059669" : "#dc2626" }]}>{fmt(item.gross_margin)}</Text>
              <Text style={st.costLabel}>Margin</Text>
            </View>
          </View>
          <Text style={st.expandHint}>{expanded ? "Hide" : "Show"} ingredients</Text>
        </Pressable>
        {expanded && (
          <View style={st.ingredientBox}>
            {(item.ingredients || []).map((ing, i) => (
              <View key={i} style={st.ingredientLineRow}>
                <Text style={st.ingredientName}>{ing.ingredient_name}</Text>
                <Text style={st.ingredientDetail}>{ing.quantity} {ing.unit} · {fmt(ing.line_cost)}</Text>
              </View>
            ))}
          </View>
        )}
        <View style={st.actionsRow}>
          <Pressable style={st.editBtn} onPress={() => openEdit(item)}><Text style={st.editBtnText}>Edit</Text></Pressable>
          <Pressable style={st.deleteBtn} onPress={() => remove(item)}><Text style={st.deleteBtnText}>Delete</Text></Pressable>
        </View>
      </View>
    );
  };

  if (billingType === null) {
    return (
      <SafeAreaView style={st.safe}>
        <View style={st.center}><ActivityIndicator size="large" color="#6366f1" /></View>
      </SafeAreaView>
    );
  }

  if (billingType !== "hotel") {
    return (
      <SafeAreaView style={st.safe}>
        <View style={st.center}>
          <Text style={{ fontSize: 40, marginBottom: 10 }}>🍽️</Text>
          <Text style={st.guardTitle}>Hotel / Restaurant Only</Text>
          <Text style={st.guardSub}>Recipe & food cost management is only available for Hotel businesses.</Text>
          <Pressable style={st.guardBackBtn} onPress={() => navigation?.goBack?.()}>
            <Text style={st.guardBackBtnText}>Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

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
            <Text style={st.detailTitle}>{selected ? "Edit Recipe" : "New Recipe"}</Text>
          </View>
          <FlatList
            data={ingredients}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={{ padding: 14, gap: 10 }}
            ListHeaderComponent={
              <View style={{ gap: 10, marginBottom: 6 }}>
                <Text style={st.sectionLabel}>Menu Item (Dish) *</Text>
                <Pressable
                  style={[st.input, selected && st.inputDisabled]}
                  disabled={Boolean(selected)}
                  onPress={() => setItemPickerOpen(true)}
                >
                  <Text style={itemId ? st.inputText : st.inputPlaceholder}>
                    {itemId ? selectedItemName() : "Select dish…"}
                  </Text>
                </Pressable>

                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.sectionLabel}>Serving Size</Text>
                    <TextInput style={st.input} placeholder="1" placeholderTextColor="#94a3b8" keyboardType="numeric" value={servingSize} onChangeText={setServingSize} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.sectionLabel}>Notes</Text>
                    <TextInput style={st.input} placeholder="Optional" placeholderTextColor="#94a3b8" value={notes} onChangeText={setNotes} />
                  </View>
                </View>
                <Text style={st.sectionLabel}>Ingredients</Text>
              </View>
            }
            renderItem={({ item: row, index }) => (
              <View style={st.ingredientRowCard}>
                <View style={st.ingredientRowTop}>
                  <Text style={st.ingredientRowLabel}>Ingredient {index + 1}</Text>
                  <Pressable onPress={() => removeIngredient(index)}><Text style={st.removeText}>✕</Text></Pressable>
                </View>
                <RawMaterialPicker
                  value={row.ingredient_item_id}
                  options={ingredientItems}
                  onSelect={(id) => updateIngredient(index, "ingredient_item_id", id)}
                />
                <View style={{ flexDirection: "row", gap: 6 }}>
                  <TextInput style={[st.input, { flex: 1 }]} placeholder="Qty" placeholderTextColor="#94a3b8" keyboardType="numeric" value={row.quantity} onChangeText={(v) => updateIngredient(index, "quantity", v)} />
                  <View style={{ flex: 1 }}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {UNITS.map((u) => (
                        <Pressable key={u} style={[st.unitChip, row.unit === u && st.unitChipActive]} onPress={() => updateIngredient(index, "unit", u)}>
                          <Text style={[st.unitChipText, row.unit === u && st.unitChipTextActive]}>{u}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                </View>
                <TextInput style={st.input} placeholder="Cost per unit (₹)" placeholderTextColor="#94a3b8" keyboardType="numeric" value={row.cost_per_unit} onChangeText={(v) => updateIngredient(index, "cost_per_unit", v)} />
              </View>
            )}
            ListFooterComponent={
              <Pressable style={st.addRowBtn} onPress={addIngredient}><Text style={st.addRowBtnText}>+ Add Ingredient</Text></Pressable>
            }
          />
          <View style={st.detailActions}>
            <Pressable style={st.completeBtn} disabled={saving} onPress={save}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.completeBtnText}>{selected ? "Update Recipe" : "Create Recipe"}</Text>}
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Menu item picker */}
      <Modal visible={itemPickerOpen} animationType="slide" transparent onRequestClose={() => setItemPickerOpen(false)}>
        <Pressable style={st.modalBackdrop} onPress={() => setItemPickerOpen(false)}>
          <Pressable style={st.pickerSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={st.modalTitle}>Select Dish</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {(selected ? menuItems : menuItemsWithoutRecipe).map((it) => (
                <Pressable
                  key={it.item_id}
                  style={st.pickerRow}
                  onPress={() => { setItemId(String(it.item_id)); setItemPickerOpen(false); }}
                >
                  <Text style={st.pickerRowText}>{it.item_name}</Text>
                </Pressable>
              ))}
              {(selected ? menuItems : menuItemsWithoutRecipe).length === 0 && (
                <Text style={st.emptyTitle}>No dishes available.</Text>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function RawMaterialPicker({ value, options, onSelect }) {
  const [open, setOpen] = useState(false);
  const label = options.find((o) => String(o.item_id) === String(value))?.item_name || "";
  return (
    <>
      <Pressable style={st.input} onPress={() => setOpen(true)}>
        <Text style={value ? st.inputText : st.inputPlaceholder}>{value ? label : "Select raw material…"}</Text>
      </Pressable>
      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={st.modalBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={st.pickerSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={st.modalTitle}>Select Raw Material</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {options.map((it) => (
                <Pressable key={it.item_id} style={st.pickerRow} onPress={() => { onSelect(String(it.item_id)); setOpen(false); }}>
                  <Text style={st.pickerRowText}>{it.item_name}</Text>
                </Pressable>
              ))}
              {options.length === 0 && <Text style={st.emptyTitle}>No raw materials available.</Text>}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f6fb" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  guardTitle: { fontSize: 15, fontWeight: "800", color: "#0a0f1e" },
  guardSub: { fontSize: 12, color: "#9ca3af", textAlign: "center", marginTop: 6, lineHeight: 18 },
  guardBackBtn: { marginTop: 16, backgroundColor: "#eef2ff", borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 },
  guardBackBtnText: { color: "#4338ca", fontWeight: "700", fontSize: 12 },
  searchWrap: { padding: 14, paddingBottom: 6 },
  searchInput: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12, backgroundColor: "#fff", paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: "#0a0f1e" },
  list: { padding: 14, paddingTop: 6, paddingBottom: 90, gap: 10 },
  card: { backgroundColor: "#fff", borderRadius: 16, borderWidth: 1.5, borderColor: "#e4e9f2", padding: 12, gap: 6 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dishName: { fontSize: 14, fontWeight: "800", color: "#0a0f1e", flex: 1 },
  margin: { fontSize: 12, fontWeight: "800" },
  meta: { fontSize: 11, color: "#9ca3af" },
  costRow: { flexDirection: "row", backgroundColor: "#f8f9fd", borderRadius: 10, borderWidth: 1, borderColor: "#e4e9f2", marginTop: 4 },
  costCell: { flex: 1, alignItems: "center", paddingVertical: 8 },
  costValue: { fontSize: 13, fontWeight: "800", color: "#0a0f1e" },
  costLabel: { fontSize: 9, color: "#9ca3af", marginTop: 2 },
  expandHint: { fontSize: 11, color: "#6366f1", fontWeight: "700", marginTop: 4 },
  ingredientBox: { gap: 6, marginTop: 4, backgroundColor: "#f8f9fd", borderRadius: 10, borderWidth: 1, borderColor: "#e4e9f2", padding: 10 },
  ingredientLineRow: { flexDirection: "row", justifyContent: "space-between" },
  ingredientName: { fontSize: 12, color: "#0a0f1e", fontWeight: "600", flex: 1 },
  ingredientDetail: { fontSize: 11, color: "#6b7280" },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  editBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: "#eef2ff" },
  editBtnText: { color: "#6366f1", fontSize: 11, fontWeight: "800" },
  deleteBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: "#fef2f2" },
  deleteBtnText: { color: "#dc2626", fontSize: 11, fontWeight: "800" },
  emptyWrap: { alignItems: "center", paddingTop: 50, gap: 10 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { color: "#9ca3af", fontSize: 15, fontWeight: "700", textAlign: "center" },
  fab: { position: "absolute", right: 16, bottom: 20, backgroundColor: "#6366f1", borderRadius: 999, paddingHorizontal: 20, paddingVertical: 14, elevation: 4 },
  fabText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  detailHeader: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14 },
  backLink: { color: "#6366f1", fontWeight: "700", fontSize: 13 },
  detailTitle: { fontSize: 16, fontWeight: "800", color: "#0a0f1e" },
  sectionLabel: { fontSize: 11, fontWeight: "800", color: "#9ca3af", textTransform: "uppercase" },
  input: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12, backgroundColor: "#f8f9fd", paddingHorizontal: 12, paddingVertical: 11, fontSize: 13, color: "#0a0f1e", justifyContent: "center" },
  inputDisabled: { backgroundColor: "#eef0f5", opacity: 0.7 },
  inputText: { color: "#0a0f1e", fontSize: 13, fontWeight: "600" },
  inputPlaceholder: { color: "#94a3b8", fontSize: 13 },
  ingredientRowCard: { backgroundColor: "#f8f9fd", borderRadius: 12, borderWidth: 1, borderColor: "#e4e9f2", padding: 10, gap: 8 },
  ingredientRowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  ingredientRowLabel: { fontSize: 10, fontWeight: "800", color: "#9ca3af", textTransform: "uppercase" },
  removeText: { color: "#dc2626", fontSize: 16, fontWeight: "800", paddingHorizontal: 4 },
  unitChip: { borderWidth: 1, borderColor: "#e4e9f2", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginRight: 6, backgroundColor: "#fff" },
  unitChipActive: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  unitChipText: { fontSize: 11, fontWeight: "700", color: "#4b5563" },
  unitChipTextActive: { color: "#fff" },
  addRowBtn: { paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: "#e4e9f2", borderStyle: "dashed", alignItems: "center" },
  addRowBtnText: { color: "#6366f1", fontWeight: "700", fontSize: 12 },
  detailActions: { padding: 14, borderTopWidth: 1, borderTopColor: "#e4e9f2" },
  completeBtn: { paddingVertical: 13, borderRadius: 12, backgroundColor: "#6366f1", alignItems: "center" },
  completeBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(10,15,30,0.45)", justifyContent: "flex-end" },
  pickerSheet: { backgroundColor: "#fff", borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, gap: 6, maxHeight: "70%" },
  modalTitle: { fontSize: 16, fontWeight: "800", color: "#0a0f1e", marginBottom: 6 },
  pickerRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f1f3f9" },
  pickerRowText: { fontSize: 13, color: "#0a0f1e", fontWeight: "600" },
});
