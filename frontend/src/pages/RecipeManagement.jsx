import { useEffect, useState } from "react";
import api from "../utils/apiClient";
import BackButton from "../components/BackButton";

const UNITS = ["g", "kg", "ml", "L", "pcs", "tbsp", "tsp", "cup"];
const BLUE = "#0B3C8C";

const marginBadge = (pct) => {
  if (pct >= 60) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (pct >= 40) return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-red-50 text-red-600 border-red-200";
};

export default function RecipeManagement() {
  const [billingType, setBillingType] = useState(null);
  const [recipes, setRecipes]         = useState([]);
  const [menuItems, setMenuItems]     = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [search, setSearch]           = useState("");
  const [selected, setSelected]       = useState(null);
  const [showForm, setShowForm]       = useState(false);
  const [saving, setSaving]           = useState(false);
  const [expandedId, setExpandedId]   = useState(null);
  const [form, setForm]               = useState({ item_id: "", serving_size: 1, notes: "", ingredients: [] });

  const load = async () => {
    try {
      const [shopRes, recRes, menuRes, ingRes] = await Promise.all([
        api.get("/shop/details"),
        api.get("/recipes/").catch(() => ({ data: [] })),
        api.get("/items/", { params: { is_raw_material: false } }),
        api.get("/items/", { params: { is_raw_material: true } }),
      ]);
      const bt = String(shopRes.data?.billing_type || "").toLowerCase();
      setBillingType(bt);
      if (bt !== "hotel") return;
      setRecipes(recRes.data || []);
      setMenuItems(menuRes.data || []);
      setIngredients(ingRes.data || []);
    } catch {
      setBillingType("store");
    }
  };

  useEffect(() => { load(); }, []);

  /* ── guards ── */
  if (billingType === null) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-[3px] border-blue-100 border-t-blue-600 rounded-full animate-spin" />
          <span className="text-sm text-slate-400">Loading…</span>
        </div>
      </div>
    );
  }

  if (billingType !== "hotel") {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center">
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm px-12 py-10 text-center max-w-sm">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-4" style={{ background: `${BLUE}12` }}>🍽️</div>
          <h2 className="text-sm font-bold text-slate-800">Hotel / Restaurant Only</h2>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">Recipe & food cost management is only available for Hotel businesses.</p>
          <div className="mt-5"><BackButton /></div>
        </div>
      </div>
    );
  }

  /* ── derived ── */
  const filtered = recipes.filter(r => r.item_name?.toLowerCase().includes(search.toLowerCase()));
  const menuItemsWithoutRecipe = menuItems.filter(it => !recipes.some(r => r.item_id === it.item_id));
  const totalFoodCost = recipes.length ? recipes.reduce((s, r) => s + r.food_cost, 0) / recipes.length : 0;
  const totalMargin   = recipes.length ? recipes.reduce((s, r) => s + r.margin_pct, 0) / recipes.length : 0;

  /* ── actions ── */
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
      ingredients: recipe.ingredients.map(i => ({
        ingredient_item_id: i.ingredient_item_id,
        quantity: i.quantity,
        unit: i.unit || "g",
        cost_per_unit: i.cost_per_unit,
      })),
    });
    setSelected(recipe);
    setShowForm(true);
  };

  const addIngredient = () =>
    setForm(f => ({ ...f, ingredients: [...f.ingredients, { ingredient_item_id: "", quantity: 1, unit: "g", cost_per_unit: 0 }] }));

  const removeIngredient = idx =>
    setForm(f => ({ ...f, ingredients: f.ingredients.filter((_, i) => i !== idx) }));

  const updateIngredient = (idx, field, value) =>
    setForm(f => ({ ...f, ingredients: f.ingredients.map((ing, i) => i === idx ? { ...ing, [field]: value } : ing) }));

  const save = async () => {
    if (!form.item_id) return alert("Select a menu item");
    if (!form.ingredients.length) return alert("Add at least one ingredient");
    setSaving(true);
    try {
      selected
        ? await api.put(`/recipes/${selected.recipe_id}`, form)
        : await api.post("/recipes/", form);
      setShowForm(false);
      load();
    } catch (e) {
      alert(e?.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  };

  const deleteRecipe = async (id) => {
    if (!window.confirm("Delete this recipe?")) return;
    try { await api.delete(`/recipes/${id}`); load(); }
    catch { alert("Delete failed"); }
  };

  const inputCls = "w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition";

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-4 max-w-7xl mx-auto">
          <BackButton />
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ background: `${BLUE}15` }}>🍽️</div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">Recipe & Food Cost</h1>
              <p className="text-xs text-slate-400">{recipes.length} recipe{recipes.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search dish…"
                className="pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition w-44"
              />
            </div>
            <button
              onClick={openNew}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
              style={{ backgroundColor: BLUE }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12h14"/></svg>
              Add Recipe
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 py-5 max-w-7xl mx-auto space-y-5">

        {/* ── Summary strip ── */}
        {recipes.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Total Recipes",  value: recipes.length,                        sub: "dishes configured",          color: "text-blue-700",    bg: "bg-blue-50",    border: "border-blue-100" },
              { label: "Avg Food Cost",  value: `₹${totalFoodCost.toFixed(2)}`,        sub: "avg ingredient cost/serving", color: "text-orange-600",  bg: "bg-orange-50",  border: "border-orange-100" },
              { label: "Avg Margin",     value: `${totalMargin.toFixed(1)}%`,           sub: "gross profit margin",        color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-100" },
            ].map(c => (
              <div key={c.label} className={`${c.bg} border ${c.border} rounded-2xl px-5 py-4`}>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">{c.label}</p>
                <p className={`text-2xl font-bold mt-1 ${c.color}`}>{c.value}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{c.sub}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Recipe list ── */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="text-5xl mb-4">🍲</div>
            <p className="text-sm font-semibold text-slate-700">No recipes yet</p>
            <p className="text-xs text-slate-400 mt-1">Click "Add Recipe" to define your first dish and its raw material costs.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(r => {
              const isExpanded = expandedId === r.recipe_id;
              return (
                <div key={r.recipe_id} className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden flex flex-col">

                  {/* Card header */}
                  <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-slate-800 truncate">{r.item_name}</h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">Serving size: {r.serving_size} · {r.ingredients.length} ingredient{r.ingredients.length !== 1 ? "s" : ""}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${marginBadge(r.margin_pct)}`}>
                      {r.margin_pct?.toFixed(1)}%
                    </span>
                  </div>

                  {/* Cost row */}
                  <div className="mx-4 mb-3 grid grid-cols-3 divide-x divide-slate-100 bg-slate-50 rounded-xl overflow-hidden border border-slate-100">
                    {[
                      { label: "Selling",   value: `₹${r.selling_price?.toFixed(2) || "—"}`, cls: "text-slate-700" },
                      { label: "Food Cost", value: `₹${r.food_cost?.toFixed(2)}`,             cls: "text-orange-600" },
                      { label: "Margin",    value: `₹${r.gross_margin?.toFixed(2) || "0.00"}`, cls: r.gross_margin >= 0 ? "text-emerald-600" : "text-red-500" },
                    ].map(c => (
                      <div key={c.label} className="px-3 py-2 text-center">
                        <div className={`text-sm font-bold ${c.cls}`}>{c.value}</div>
                        <div className="text-[10px] text-slate-400">{c.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Expandable ingredients */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : r.recipe_id)}
                    className="mx-4 mb-3 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 hover:text-slate-700 transition"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                      className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                      <path d="M6 9l6 6 6-6"/>
                    </svg>
                    {isExpanded ? "Hide" : "Show"} ingredients
                  </button>

                  {isExpanded && (
                    <div className="mx-4 mb-3 border border-slate-100 rounded-xl overflow-hidden">
                      <div className="px-3 py-2 bg-slate-50 border-b border-slate-100">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Raw Materials</span>
                      </div>
                      {r.ingredients.map((ing, idx) => (
                        <div key={idx} className="flex items-center justify-between px-3 py-2 border-b border-slate-50 last:border-0">
                          <span className="text-xs font-medium text-slate-700">{ing.ingredient_name}</span>
                          <span className="text-[11px] text-slate-400">{ing.quantity} {ing.unit} · <span className="text-slate-600 font-semibold">₹{ing.line_cost?.toFixed(2)}</span></span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="mt-auto border-t border-slate-100 flex">
                    <button
                      onClick={() => openEdit(r)}
                      className="flex-1 py-2.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 transition flex items-center justify-center gap-1.5"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      Edit
                    </button>
                    <div className="w-px bg-slate-100" />
                    <button
                      onClick={() => deleteRecipe(r.recipe_id)}
                      className="flex-1 py-2.5 text-xs font-semibold text-red-500 hover:bg-red-50 transition flex items-center justify-center gap-1.5"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Add / Edit Drawer ── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="w-full max-w-lg bg-white h-full flex flex-col shadow-2xl overflow-hidden">

            {/* Drawer header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base" style={{ background: `${BLUE}15` }}>🍽️</div>
              <h2 className="text-sm font-bold text-slate-800 flex-1">{selected ? "Edit Recipe" : "New Recipe"}</h2>
              <button onClick={() => setShowForm(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 transition text-slate-400 hover:text-slate-600">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Drawer body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

              {/* Menu item */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">Menu Item (Dish) *</label>
                <select
                  value={form.item_id}
                  onChange={e => setForm({ ...form, item_id: e.target.value })}
                  disabled={!!selected}
                  className={`${inputCls} disabled:bg-slate-50 disabled:text-slate-400`}
                >
                  <option value="">Select dish…</option>
                  {(selected ? menuItems : menuItemsWithoutRecipe).map(it => (
                    <option key={it.item_id} value={it.item_id}>{it.item_name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600">Serving Size</label>
                  <input type="number" min={1} value={form.serving_size}
                    onChange={e => setForm({ ...form, serving_size: parseInt(e.target.value) })}
                    className={inputCls} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600">Notes</label>
                  <input value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })}
                    className={inputCls} placeholder="Optional" />
                </div>
              </div>

              {/* Ingredients section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-700">Ingredients</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-semibold">Raw Materials</span>
                  </div>
                  <button onClick={addIngredient}
                    className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-xl border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12h14"/></svg>
                    Add
                  </button>
                </div>

                {form.ingredients.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg>
                    <p className="text-xs">No ingredients added yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {form.ingredients.map((ing, idx) => (
                      <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Ingredient {idx + 1}</span>
                          <button onClick={() => removeIngredient(idx)}
                            className="w-5 h-5 flex items-center justify-center rounded-lg hover:bg-red-100 text-slate-400 hover:text-red-500 transition">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
                          </button>
                        </div>
                        <select value={ing.ingredient_item_id}
                          onChange={e => updateIngredient(idx, "ingredient_item_id", e.target.value)}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:border-blue-400 transition">
                          <option value="">Select raw material…</option>
                          {ingredients.map(it => (
                            <option key={it.item_id} value={it.item_id}>{it.item_name}</option>
                          ))}
                        </select>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-500 font-medium">Quantity</label>
                            <input type="number" min={0} step={0.001} value={ing.quantity}
                              onChange={e => updateIngredient(idx, "quantity", parseFloat(e.target.value))}
                              className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:border-blue-400 transition" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-500 font-medium">Unit</label>
                            <select value={ing.unit}
                              onChange={e => updateIngredient(idx, "unit", e.target.value)}
                              className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:border-blue-400 transition">
                              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-500 font-medium">Cost/Unit (₹)</label>
                            <input type="number" min={0} step={0.01} value={ing.cost_per_unit}
                              onChange={e => updateIngredient(idx, "cost_per_unit", parseFloat(e.target.value))}
                              className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:border-blue-400 transition" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Drawer footer */}
            <div className="px-5 py-4 border-t border-slate-100 flex gap-3">
              <button onClick={() => setShowForm(false)}
                className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
                Cancel
              </button>
              <button onClick={save} disabled={saving}
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 transition disabled:opacity-50"
                style={{ backgroundColor: BLUE }}>
                {saving ? "Saving…" : selected ? "Update Recipe" : "Create Recipe"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
