import { useEffect, useState } from "react";
import api from "../utils/apiClient";

const UNITS = ["g", "kg", "ml", "L", "pcs", "tbsp", "tsp", "cup"];

export default function RecipeManagement() {
  const [recipes, setRecipes]       = useState([]);
  const [items, setItems]           = useState([]);
  const [search, setSearch]         = useState("");
  const [selected, setSelected]     = useState(null);  // recipe being viewed/edited
  const [showForm, setShowForm]     = useState(false);
  const [saving, setSaving]         = useState(false);
  const [form, setForm]             = useState({ item_id: "", serving_size: 1, notes: "", ingredients: [] });

  const load = async () => {
    try {
      const [recRes, itemRes] = await Promise.all([
        api.get("/recipes/"),
        api.get("/items/"),
      ]);
      setRecipes(recRes.data || []);
      setItems(itemRes.data || []);
    } catch { /* silent */ }
  };

  useEffect(() => { load(); }, []);

  const filtered = recipes.filter((r) =>
    r.item_name?.toLowerCase().includes(search.toLowerCase())
  );

  const openNew = () => {
    setForm({ item_id: "", serving_size: 1, notes: "", ingredients: [] });
    setSelected(null);
    setShowForm(true);
  };

  const openEdit = (recipe) => {
    setForm({
      item_id: recipe.item_id,
      serving_size: recipe.serving_size,
      notes: recipe.notes || "",
      ingredients: recipe.ingredients.map((i) => ({
        ingredient_item_id: i.ingredient_item_id,
        quantity: i.quantity,
        unit: i.unit || "",
        cost_per_unit: i.cost_per_unit,
      })),
    });
    setSelected(recipe);
    setShowForm(true);
  };

  const addIngredient = () => {
    setForm((f) => ({
      ...f,
      ingredients: [...f.ingredients, { ingredient_item_id: "", quantity: 1, unit: "g", cost_per_unit: 0 }],
    }));
  };

  const removeIngredient = (idx) => {
    setForm((f) => ({ ...f, ingredients: f.ingredients.filter((_, i) => i !== idx) }));
  };

  const updateIngredient = (idx, field, value) => {
    setForm((f) => ({
      ...f,
      ingredients: f.ingredients.map((ing, i) => i === idx ? { ...ing, [field]: value } : ing),
    }));
  };

  const save = async () => {
    if (!form.item_id) return alert("Select a menu item");
    if (form.ingredients.length === 0) return alert("Add at least one ingredient");
    setSaving(true);
    try {
      if (selected) {
        await api.put(`/recipes/${selected.recipe_id}`, form);
      } else {
        await api.post("/recipes/", form);
      }
      setShowForm(false);
      load();
    } catch (e) {
      alert(e?.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const deleteRecipe = async (id) => {
    if (!window.confirm("Delete this recipe?")) return;
    try {
      await api.delete(`/recipes/${id}`);
      load();
    } catch { alert("Delete failed"); }
  };

  const itemsWithoutRecipe = items.filter(
    (it) => !recipes.some((r) => r.item_id === it.item_id)
  );

  const marginColor = (pct) => {
    if (pct >= 60) return "#15803d";
    if (pct >= 40) return "#ca8a04";
    return "#b91c1c";
  };

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Recipe & Food Cost</h1>
        <button onClick={openNew} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded text-sm">
          + Add Recipe
        </button>
      </div>

      {/* Search */}
      <input
        value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by dish name..."
        className="border rounded px-3 py-2 text-sm w-full max-w-sm mb-4"
      />

      {/* Summary bar */}
      {recipes.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-4">
          {[
            { label: "Total Recipes", value: recipes.length, color: "#3b82f6" },
            { label: "Avg Food Cost", value: `₹${(recipes.reduce((s, r) => s + r.food_cost, 0) / recipes.length).toFixed(2)}`, color: "#f97316" },
            { label: "Avg Margin %", value: `${(recipes.reduce((s, r) => s + r.margin_pct, 0) / recipes.length).toFixed(1)}%`, color: "#22c55e" },
          ].map((c) => (
            <div key={c.label} className="bg-white rounded-lg shadow p-4 text-center">
              <div className="text-2xl font-bold" style={{ color: c.color }}>{c.value}</div>
              <div className="text-xs text-gray-500 mt-1">{c.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Recipe cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.length === 0 ? (
          <div className="col-span-full text-center text-gray-400 py-16">
            No recipes yet. Click "+ Add Recipe" to start.
          </div>
        ) : filtered.map((r) => (
          <div key={r.recipe_id} className="bg-white rounded-lg shadow p-4">
            <div className="flex justify-between items-start mb-3">
              <div>
                <div className="font-bold text-base">{r.item_name}</div>
                <div className="text-xs text-gray-400">Serving size: {r.serving_size}</div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEdit(r)} className="text-xs text-blue-600 hover:underline">Edit</button>
                <span className="text-gray-300">|</span>
                <button onClick={() => deleteRecipe(r.recipe_id)} className="text-xs text-red-500 hover:underline">Del</button>
              </div>
            </div>

            {/* Cost breakdown */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[
                { label: "Selling Price", value: `₹${r.selling_price?.toFixed(2) || "—"}` },
                { label: "Food Cost", value: `₹${r.food_cost?.toFixed(2)}` },
                { label: "Margin", value: `${r.margin_pct?.toFixed(1)}%`, highlight: true, color: marginColor(r.margin_pct) },
              ].map((c) => (
                <div key={c.label} className="text-center rounded p-2 bg-gray-50">
                  <div className="font-bold text-sm" style={c.color ? { color: c.color } : {}}>{c.value}</div>
                  <div className="text-xs text-gray-400">{c.label}</div>
                </div>
              ))}
            </div>

            {/* Ingredients list */}
            <div className="border-t pt-2">
              <div className="text-xs font-semibold text-gray-500 mb-1">INGREDIENTS</div>
              {r.ingredients.map((ing, idx) => (
                <div key={idx} className="flex justify-between text-xs py-1 border-b border-gray-50">
                  <span className="text-gray-700">{ing.ingredient_name}</span>
                  <span className="text-gray-500">{ing.quantity} {ing.unit} · ₹{ing.line_cost?.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6 my-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">{selected ? "Edit Recipe" : "New Recipe"}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="col-span-2">
                <label className="text-sm font-semibold text-gray-600">Menu Item *</label>
                <select
                  value={form.item_id}
                  onChange={(e) => setForm({ ...form, item_id: e.target.value })}
                  disabled={!!selected}
                  className="w-full border rounded px-3 py-2 mt-1 text-sm disabled:bg-gray-100"
                >
                  <option value="">Select item...</option>
                  {(selected ? items : itemsWithoutRecipe).map((it) => (
                    <option key={it.item_id} value={it.item_id}>{it.item_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-600">Serving Size</label>
                <input type="number" min={1} value={form.serving_size}
                  onChange={(e) => setForm({ ...form, serving_size: parseInt(e.target.value) })}
                  className="w-full border rounded px-3 py-2 mt-1 text-sm" />
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-600">Notes</label>
                <input value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full border rounded px-3 py-2 mt-1 text-sm" placeholder="Optional" />
              </div>
            </div>

            {/* Ingredients */}
            <div className="border rounded-lg overflow-hidden mb-4">
              <div className="bg-gray-800 text-white px-3 py-2 flex justify-between items-center">
                <span className="font-semibold text-sm">Ingredients</span>
                <button onClick={addIngredient}
                  className="text-xs bg-green-600 hover:bg-green-700 px-2 py-1 rounded">
                  + Add
                </button>
              </div>
              {form.ingredients.length === 0 ? (
                <div className="text-center text-gray-400 py-6 text-sm">No ingredients added</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {["Ingredient", "Qty", "Unit", "Cost/Unit", ""].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {form.ingredients.map((ing, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        <td className="px-2 py-1">
                          <select value={ing.ingredient_item_id}
                            onChange={(e) => updateIngredient(idx, "ingredient_item_id", e.target.value)}
                            className="border rounded px-2 py-1 text-xs w-full">
                            <option value="">Select...</option>
                            {items.map((it) => (
                              <option key={it.item_id} value={it.item_id}>{it.item_name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1">
                          <input type="number" min={0} step={0.001} value={ing.quantity}
                            onChange={(e) => updateIngredient(idx, "quantity", parseFloat(e.target.value))}
                            className="border rounded px-2 py-1 text-xs w-20" />
                        </td>
                        <td className="px-2 py-1">
                          <select value={ing.unit}
                            onChange={(e) => updateIngredient(idx, "unit", e.target.value)}
                            className="border rounded px-2 py-1 text-xs">
                            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-1">
                          <input type="number" min={0} step={0.01} value={ing.cost_per_unit}
                            onChange={(e) => updateIngredient(idx, "cost_per_unit", parseFloat(e.target.value))}
                            className="border rounded px-2 py-1 text-xs w-20" />
                        </td>
                        <td className="px-2 py-1">
                          <button onClick={() => removeIngredient(idx)}
                            className="text-red-500 hover:text-red-700 text-lg leading-none">×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowForm(false)}
                className="flex-1 border rounded py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={save} disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded py-2 text-sm font-semibold disabled:opacity-50">
                {saving ? "Saving..." : "Save Recipe"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
