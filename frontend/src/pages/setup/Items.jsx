// src/pages/setup/Items.jsx
import { useEffect, useMemo, useState } from "react";
import authAxios from "../../api/authAxios";
import { useToast } from "../../components/Toast";
import { API_BASE } from "../../config/api";
import BackButton from "../../components/BackButton";

export default function Items() {
  const { showToast } = useToast();

  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);

  const [activeCategoryId, setActiveCategoryId] = useState("all");
  const [categorySearch, setCategorySearch] = useState("");
  const [search, setSearch] = useState("");

  const [form, setForm] = useState({
    item_name: "",
    category_id: "",
    price: "",
    buy_price: "",
    mrp_price: "",
    min_stock: "",
    item_status: true
  });

  const [editingId, setEditingId] = useState(null);
  const [editingItem, setEditingItem] = useState(null);

  const [imageFile, setImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");

  const loadData = async () => {
    try {
      const [i, c] = await Promise.all([
        authAxios.get("/items/"),
        authAxios.get("/category/")
      ]);
      setItems(i.data || []);
      setCategories(c.data || []);
    } catch {
      showToast("Failed to load data", "error");
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl("");
      return;
    }

    const url = URL.createObjectURL(imageFile);
    setImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const filteredCategories = useMemo(() => {
    const q = categorySearch.trim().toLowerCase();
    if (!q) return categories || [];
    return (categories || []).filter(c =>
      (c.category_name || "").toLowerCase().includes(q)
    );
  }, [categories, categorySearch]);

  const itemCountByCategory = useMemo(() => {
    return (items || []).reduce((acc, it) => {
      const k = String(it?.category_id ?? "");
      if (!k) return acc;
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
  }, [items]);

  const activeCategory = useMemo(() => {
    if (activeCategoryId === "all") return null;
    return (
      categories.find(c => String(c.category_id) === String(activeCategoryId)) || null
    );
  }, [activeCategoryId, categories]);

  const resetForm = ({ keepCategory = true } = {}) => {
    const nextCategoryId =
      keepCategory && activeCategoryId !== "all" ? String(activeCategoryId) : "";

    setForm({
      item_name: "",
      category_id: nextCategoryId,
      price: "",
      buy_price: "",
      mrp_price: "",
      min_stock: "",
      item_status: true
    });
    setEditingId(null);
    setEditingItem(null);
    setImageFile(null);
  };

  const selectCategory = catId => {
    setActiveCategoryId(catId);
    if (catId !== "all") {
      setForm(prev => ({ ...prev, category_id: String(catId) }));
    }
  };

  const saveItem = async () => {
    if (!form.item_name || !form.category_id) {
      return showToast("Enter item name and select a category", "error");
    }

    const payload = {
      item_name: form.item_name.toUpperCase(),
      category_id: Number(form.category_id),
      price: Number(form.price) || 0,
      buy_price: Number(form.buy_price) || 0,
      mrp_price: Number(form.mrp_price) || 0,
      min_stock: Number(form.min_stock) || 0,
      item_status: !!form.item_status
    };

    const uploadImage = async itemId => {
      if (!imageFile) return { ok: true };
      if (!itemId) return { ok: false, msg: "Item id missing for image upload" };

      const fd = new FormData();
      fd.append("file", imageFile);

      try {
        await authAxios.post(`/items/${itemId}/image`, fd);
        return { ok: true };
      } catch (err) {
        const msg =
          err?.response?.data?.detail ||
          err?.response?.data?.message ||
          "Image upload failed";
        return { ok: false, msg };
      }
    };

    try {
      if (editingId) {
        await authAxios.put(`/items/${editingId}`, payload);

        const imageRes = await uploadImage(editingId);
        if (!imageRes.ok) {
          showToast(`Item updated, but image upload failed: ${imageRes.msg}`, "warning");
        } else {
          showToast("Item updated", "success");
        }
      } else {
        const res = await authAxios.post("/items/", payload);
        const newId = res?.data?.item_id;

        const imageRes = await uploadImage(newId);
        if (!imageRes.ok) {
          showToast(`Item added, but image upload failed: ${imageRes.msg}`, "warning");
        } else {
          showToast("Item added", "success");
        }
      }

      resetForm({ keepCategory: true });
      loadData();
    } catch (err) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Save failed";
      showToast(msg, "error");
    }
  };

  const editItem = item => {
    const catId = String(item?.category_id ?? "");
    if (catId) setActiveCategoryId(catId);

    setEditingId(item.item_id);
    setEditingItem(item);
    setForm({
      item_name: item.item_name || "",
      category_id: catId,
      price: item.price ?? 0,
      buy_price: item.buy_price ?? 0,
      mrp_price: item.mrp_price ?? 0,
      min_stock: item.min_stock ?? 0,
      item_status: !!item.item_status
    });
    setImageFile(null);
  };

  const toggleStatus = async item => {
    try {
      await authAxios.put(`/items/${item.item_id}`, {
        item_status: !item.item_status
      });
      loadData();
    } catch {
      showToast("Status update failed", "error");
    }
  };

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (items || []).filter(i => {
      const catOk =
        activeCategoryId === "all" ||
        String(i.category_id) === String(activeCategoryId);
      const searchOk = (i.item_name || "").toLowerCase().includes(q);
      return catOk && searchOk;
    });
  }, [items, activeCategoryId, search]);

  const formCategoryName =
    categories.find(c => String(c.category_id) === String(form.category_id))
      ?.category_name || "";

  return (
    <>
      <style jsx global>{`
        html, body, #root {
          height: 100%;
          margin: 0;
          padding: 0;
          overflow: hidden;
        }
        /* Hide scrollbar but keep scroll functionality */
        .no-scroll::-webkit-scrollbar {
          display: none;
        }
        .no-scroll {
          -ms-overflow-style: none;  /* IE and Edge */
          scrollbar-width: none;     /* Firefox */
        }
      `}</style>

      {/* Back + Add Item (same pattern as billing page) */}
      <div className="px-4 pt-2 pb-1 flex items-center justify-between">
        <BackButton />

        <button
          type="button"
          onClick={() => resetForm({ keepCategory: true })}
          className="px-3 py-1.5 rounded-lg bg-blue-600 text-white shadow-sm text-[12px]"
        >
          Add Item
        </button>
      </div>

      {/* Main content */}
      <div
        className="grid grid-cols-[200px_3fr_2fr] gap-6 px-4 pb-4 no-scroll"
        style={{ height: "calc(100vh - 110px)" }}
      >
        {/* CATEGORIES */}
        <aside className="rounded-2xl border shadow-xl p-3 bg-white text-[11px] flex flex-col overflow-hidden">
          <h2 className="text-sm font-bold text-center mb-2">CATEGORIES</h2>

          <input
            className="border rounded-lg px-2 py-1 mb-2 text-[11px] w-full"
            placeholder="Search category..."
            value={categorySearch}
            onChange={e => setCategorySearch(e.target.value)}
          />

          <div className="flex-1 overflow-y-auto no-scroll">
            <button
              type="button"
              onClick={() => selectCategory("all")}
              className={`w-full text-left px-3 py-2 rounded mb-1 ${
                activeCategoryId === "all" ? "bg-blue-600 text-white" : "hover:bg-gray-100"
              }`}
            >
              <div className="flex justify-between items-center">
                <span className="font-medium">All</span>
                <span className={`text-[11px] ${activeCategoryId === "all" ? "text-white/80" : "text-gray-500"}`}>
                  {items.length}
                </span>
              </div>
            </button>

            {filteredCategories.map(c => {
              const id = String(c.category_id);
              const isActive = String(activeCategoryId) === id;
              const count = itemCountByCategory[id] || 0;

              return (
                <button
                  key={c.category_id}
                  type="button"
                  onClick={() => selectCategory(id)}
                  className={`w-full text-left px-3 py-2 rounded mb-1 ${
                    isActive ? "bg-blue-600 text-white" : "hover:bg-gray-100"
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{c.category_name}</span>
                    <span className={`text-[11px] ${isActive ? "text-white/80" : "text-gray-500"}`}>
                      {count}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ITEM LIST */}
        <div className="rounded-2xl border shadow-xl p-3 bg-white flex flex-col overflow-hidden text-[11px]">
          <h2 className="text-sm font-bold text-center mb-2">ITEM LIST</h2>

          <div className="flex gap-2 mb-2">
            <input
              className="flex-1 border rounded-lg px-2 py-1 shadow-sm text-[11px]"
              placeholder="Search item..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="flex-1 overflow-y-auto no-scroll pr-1">
            <div className="grid grid-cols-[repeat(auto-fill,_minmax(260px,_1fr))] gap-3">
              {filteredItems.map(item => {
                const imgUrl = item.image_filename
                  ? `${API_BASE}/item-images/${item.image_filename}`
                  : "";
                const isSelected = editingId === item.item_id;
                const catName =
                  categories.find(c => c.category_id === item.category_id)?.category_name || "";

                return (
                  <div
                    key={item.item_id}
                    className={`
                      text-left rounded-lg border shadow-sm bg-white
                      px-2 py-2 text-[12px] leading-tight
                      hover:bg-blue-50 cursor-pointer
                      ${isSelected ? "border-blue-400 bg-blue-50" : ""}
                    `}
                    onClick={() => editItem(item)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => {
                      if (e.key === "Enter" || e.key === " ") editItem(item);
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <div className="w-10 h-10 rounded-md border bg-gray-50 overflow-hidden flex-shrink-0">
                        {imgUrl ? (
                          <img
                            src={imgUrl}
                            alt={item.item_name}
                            className="w-full h-full object-cover"
                            onError={e => { e.currentTarget.style.display = "none"; }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[9px] text-gray-400">
                            IMG
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-[13px] whitespace-normal break-words leading-snug">
                          {item.item_name}
                        </div>
                        <div className="text-[12px] mt-1 font-medium">
                          RS.{Number(item.price || 0).toFixed(0)}
                        </div>
                        <div className="text-[11px] text-gray-500 mt-1 whitespace-normal break-words">
                          {activeCategoryId === "all" && catName ? `${catName} | ` : ""}
                          Buy RS.{Number(item.buy_price || 0).toFixed(0)} | MRP RS.{Number(item.mrp_price || 0).toFixed(0)} | Min {Number(item.min_stock || 0)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 flex items-center justify-between">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full border ${
                          item.item_status
                            ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                            : "text-red-700 bg-red-50 border-red-200"
                        }`}
                      >
                        {item.item_status ? "Active" : "Disabled"}
                      </span>

                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          toggleStatus(item);
                        }}
                        className={`text-[11px] px-2 py-1 rounded-lg border ${
                          item.item_status
                            ? "text-red-600 hover:bg-red-50"
                            : "text-emerald-700 hover:bg-emerald-50"
                        }`}
                      >
                        {item.item_status ? "Disable" : "Enable"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredItems.length === 0 && (
              <div className="text-[12px] text-gray-500 text-center py-8">
                No items found
              </div>
            )}
          </div>
        </div>

        {/* ADD / EDIT */}
        <div className="rounded-2xl border shadow-xl p-3 bg-white flex flex-col overflow-hidden text-[11px]">
          <h2 className="text-sm font-bold text-center mb-2">
            {editingId ? "EDIT ITEM" : "ADD ITEM"}
          </h2>

          <div className="flex-1 overflow-y-auto no-scroll pr-1">
            <div className="mb-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[9px] text-gray-600">Category</div>
                {form.category_id ? (
                  <span className="text-[11px] px-2 py-0.5 rounded-full border bg-gray-50 text-gray-700">
                    {formCategoryName}
                  </span>
                ) : (
                  <span className="text-[11px] text-gray-500">Select from left</span>
                )}
              </div>
            </div>

            <div className="mb-2">
              <label className="text-[9px] text-gray-600">Item Name *</label>
              <input
                className="border rounded-lg px-2 py-1 w-full text-[11px]"
                value={form.item_name}
                onChange={e => setForm({ ...form, item_name: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="text-[9px] text-gray-600">Selling Price</label>
                <input
                  type="number"
                  className="border rounded-lg px-2 py-1 w-full text-[11px]"
                  value={form.price}
                  onChange={e => setForm({ ...form, price: e.target.value })}
                />
              </div>

              <div>
                <label className="text-[9px] text-gray-600">Buy Price</label>
                <input
                  type="number"
                  className="border rounded-lg px-2 py-1 w-full text-[11px]"
                  value={form.buy_price}
                  onChange={e => setForm({ ...form, buy_price: e.target.value })}
                />
              </div>

              <div>
                <label className="text-[9px] text-gray-600">MRP Price</label>
                <input
                  type="number"
                  className="border rounded-lg px-2 py-1 w-full text-[11px]"
                  value={form.mrp_price}
                  onChange={e => setForm({ ...form, mrp_price: e.target.value })}
                />
              </div>

              <div>
                <label className="text-[9px] text-gray-600">Min Stock</label>
                <input
                  type="number"
                  className="border rounded-lg px-2 py-1 w-full text-[11px]"
                  value={form.min_stock}
                  onChange={e => setForm({ ...form, min_stock: e.target.value })}
                />
              </div>
            </div>

            <div className="mb-2">
              <div className="text-[9px] text-gray-600">Item Image</div>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="border rounded-lg px-2 py-1 text-[11px] w-full"
                onChange={e => setImageFile(e.target.files?.[0] || null)}
              />

              <div className="mt-2 flex items-center gap-2">
                <div className="w-16 h-16 rounded-lg border bg-gray-50 overflow-hidden flex items-center justify-center">
                  {imagePreviewUrl ? (
                    <img src={imagePreviewUrl} alt="Preview" className="w-full h-full object-cover" />
                  ) : editingItem?.image_filename ? (
                    <img
                      src={`${API_BASE}/item-images/${editingItem.image_filename}`}
                      alt={editingItem.item_name}
                      className="w-full h-full object-cover"
                      onError={e => { e.currentTarget.style.display = "none"; }}
                    />
                  ) : (
                    <span className="text-[10px] text-gray-400">No Image</span>
                  )}
                </div>

                <div className="text-[10px] text-gray-500 leading-tight">
                  {imageFile
                    ? imageFile.name
                    : editingItem?.image_filename
                      ? "Current image"
                      : "Choose an image"}
                </div>
              </div>
            </div>

            <label className="flex items-center gap-2 text-[11px] mb-2">
              <input
                type="checkbox"
                checked={form.item_status}
                onChange={e => setForm({ ...form, item_status: e.target.checked })}
              />
              Active
            </label>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            {editingId && (
              <button
                type="button"
                onClick={() => resetForm({ keepCategory: true })}
                className="px-3 py-1 border rounded-lg text-[12px]"
              >
                Cancel
              </button>
            )}

            <button
              type="button"
              onClick={saveItem}
              className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-[12px]"
            >
              {editingId ? "Update" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
