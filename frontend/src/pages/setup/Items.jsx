/* eslint-disable react-hooks/set-state-in-effect */
// src/pages/setup/Items.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import authAxios from "../../api/authAxios";
import { useToast } from "../../components/Toast";
import { API_BASE } from "../../config/api";
import BackButton from "../../components/BackButton";
import { isHotelShop } from "../../utils/shopType";
import { getSession } from "../../utils/auth";

export default function Items() {
  const { showToast } = useToast();

  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [hotelShop, setHotelShop] = useState(false);
  const [branchWise, setBranchWise] = useState(false);
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const session = getSession();
  const isAdmin = String(session?.role || "").toLowerCase() === "admin";

  const [activeCategoryId, setActiveCategoryId] = useState("all");
  const [activeSupplierId, setActiveSupplierId] = useState(null);
  const [categorySearch, setCategorySearch] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const UNITS = ["g", "kg", "ml", "L", "pcs", "tbsp", "tsp", "cup"];

  const [form, setForm] = useState({
    item_name: "",
    category_id: "",
    supplier_id: "",
    price: "",
    buy_price: "",
    mrp_price: "",
    min_stock: "",
    unit: "",
    item_status: true,
    is_raw_material: false,
    sold_by_weight: false,
  });

  const [editingId, setEditingId] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [importing, setImporting] = useState(false);
  const xlsxRef = useRef(null);

  const branchHeaders = (branchWise && selectedBranchId)
    ? { "x-branch-id": selectedBranchId }
    : {};

  const handleExcelImport = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { defval: "" });
      const rows = raw.map(r => ({
        item_name: String(r["item_name"] || r["Item Name"] || r["name"] || "").trim(),
        category_name: String(r["category_name"] || r["Category"] || r["category"] || "").trim().toUpperCase(),
        price: parseFloat(r["price"] || r["Price"] || r["selling_price"] || 0) || 0,
        buy_price: parseFloat(r["buy_price"] || r["Buy Price"] || r["cost"] || 0) || 0,
        mrp_price: parseFloat(r["mrp_price"] || r["MRP"] || r["mrp"] || 0) || 0,
        min_stock: parseInt(r["min_stock"] || r["Min Stock"] || 0) || 0,
      })).filter(r => r.item_name && r.category_name);
      if (!rows.length) return showToast("No valid rows found in file", "error");
      const res = await authAxios.post("/items/bulk-import", { filename: file.name, rows }, { headers: branchHeaders });
      const errs = res.data.errors || [];
      showToast(`Done — ${res.data.inserted} inserted, ${res.data.updated} updated${errs.length ? `, ${errs.length} errors` : ""}`, "success");
      if (errs.length) console.warn("Import errors:", errs);
      loadData();
    } catch (err) {
      showToast(err?.response?.data?.detail || "Import failed", "error");
    } finally {
      setImporting(false);
    }
  };

  const [imageFile, setImageFile] = useState(null);

  const loadData = useCallback(async (branchIdOverride) => {
    try {
      const [shopRes, branchRes, c, suppRes] = await Promise.all([
        authAxios.get("/shop/details"),
        authAxios.get("/branch/active"),
        authAxios.get("/category/"),
        authAxios.get("/suppliers/"),
      ]);
      const shopData = shopRes?.data || {};
      setHotelShop(isHotelShop(shopData));
      const isBW = !!shopData.items_branch_wise;
      setBranchWise(isBW);
      const branchList = branchRes?.data || [];
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

      const headers = (isBW && bid) ? { "x-branch-id": bid } : {};
      const i = await authAxios.get("/items/", { headers });
      setItems(i.data || []);
      setCategories(c.data || []);
      setSuppliers(suppRes.data || []);
    } catch {
      showToast("Failed to load data", "error");
    }
  }, [showToast, isAdmin, session?.branch_id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const imagePreviewUrl = useMemo(() => {
    if (!imageFile) return "";
    return URL.createObjectURL(imageFile);
  }, [imageFile]);

  useEffect(() => {
    if (!imagePreviewUrl) return;
    return () => URL.revokeObjectURL(imagePreviewUrl);
  }, [imagePreviewUrl]);

  const filteredCategories = useMemo(() => {
    const q = categorySearch.trim().toLowerCase();
    if (!q) return categories || [];
    return (categories || []).filter(c =>
      (c.category_name || "").toLowerCase().includes(q)
    );
  }, [categories, categorySearch]);

  const itemCountByCategory = useMemo(() => {
    return (items || []).reduce((acc, it) => {
      if (it.is_raw_material) return acc;
      const k = it?.category_id != null ? String(it.category_id) : "__uncategorised__";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
  }, [items]);

  const resetForm = ({ keepCategory = true } = {}) => {
    const nextCategoryId =
      keepCategory && activeCategoryId !== "all" && activeCategoryId !== "__uncategorised__"
        ? String(activeCategoryId) : "";

    setForm({
      item_name: "",
      category_id: nextCategoryId,
      supplier_id: activeSupplierId ? String(activeSupplierId) : "",
      price: "",
      buy_price: "",
      mrp_price: "",
      min_stock: "",
      unit: "",
      item_status: true,
      is_raw_material: !!activeSupplierId,
      sold_by_weight: false,
    });
    setEditingId(null);
    setEditingItem(null);
    setImageFile(null);
  };

  const selectCategory = catId => {
    setActiveCategoryId(catId);
    setActiveSupplierId(null);
    if (catId !== "all") {
      setForm(prev => ({ ...prev, category_id: String(catId) }));
    }
  };

  const selectSupplier = suppId => {
    setActiveSupplierId(suppId);
    setActiveCategoryId("all");
    setForm(prev => ({ ...prev, supplier_id: String(suppId), is_raw_material: true, category_id: "" }));
  };

  const saveItem = async () => {
    if (!form.item_name.trim()) {
      return showToast("Enter item name", "error");
    }
    if (form.is_raw_material) {
      if (!form.supplier_id) return showToast("Select a supplier for raw material", "error");
    } else {
      if (!hotelShop) {
        if (!Number(form.buy_price)) return showToast("Buy price is required", "error");
        if (!Number(form.mrp_price)) return showToast("MRP is required", "error");
      }
      if (!Number(form.price)) return showToast("Selling price is required", "error");
    }

    const payload = form.is_raw_material
      ? {
          item_name: form.item_name.toUpperCase(),
          is_raw_material: true,
          supplier_id: Number(form.supplier_id),
          category_id: null,
          price: 0,
          buy_price: 0,
          mrp_price: 0,
          min_stock: Number(form.min_stock) || 0,
          unit: form.unit || null,
          item_status: !!form.item_status,
          sold_by_weight: false,
        }
      : {
          item_name: form.item_name.toUpperCase(),
          category_id: form.category_id ? Number(form.category_id) : null,
          is_raw_material: false,
          supplier_id: null,
          price: Number(form.price) || 0,
          buy_price: hotelShop ? 0 : (Number(form.buy_price) || 0),
          mrp_price: hotelShop ? 0 : (Number(form.mrp_price) || 0),
          min_stock: Number(form.min_stock) || 0,
          item_status: !!form.item_status,
          sold_by_weight: !!form.sold_by_weight,
          soldByWeight: !!form.sold_by_weight,
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
        await authAxios.put(`/items/${editingId}`, payload, { headers: branchHeaders });

        const imageRes = await uploadImage(editingId);
        if (!imageRes.ok) {
          showToast(`Item updated, but image upload failed: ${imageRes.msg}`, "warning");
        } else {
          showToast("Item updated", "success");
        }
      } else {
        const res = await authAxios.post("/items/", payload, { headers: branchHeaders });
        const newId = res?.data?.item_id;

        const imageRes = await uploadImage(newId);
        if (!imageRes.ok) {
          showToast(`Item added, but image upload failed: ${imageRes.msg}`, "warning");
        } else {
          showToast("Item added", "success");
        }
      }

      resetForm({ keepCategory: true });
      loadData(selectedBranchId);
    } catch (err) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Save failed";
      showToast(msg, "error");
    }
  };

  const editItem = item => {
    const isRaw = !!item.is_raw_material;
    const catId = isRaw ? "" : String(item?.category_id ?? "");
    if (!isRaw && catId) setActiveCategoryId(catId);

    setEditingId(item.item_id);
    setEditingItem(item);
    setForm({
      item_name: item.item_name || "",
      category_id: catId,
      supplier_id: isRaw ? String(item.supplier_id ?? "") : "",
      price: item.price ?? 0,
      buy_price: item.buy_price ?? 0,
      mrp_price: item.mrp_price ?? 0,
      min_stock: item.min_stock ?? 0,
      unit: item.unit || "",
      item_status: !!item.item_status,
      is_raw_material: isRaw,
      sold_by_weight: !isRaw && !!item.sold_by_weight,
    });
    setImageFile(null);
  };

  const toggleStatus = async item => {
    try {
      await authAxios.put(`/items/${item.item_id}`, { item_status: !item.item_status }, { headers: branchHeaders });
      loadData(selectedBranchId);
    } catch {
      showToast("Status update failed", "error");
    }
  };

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (items || []).filter(i => {
      const searchOk = (i.item_name || "").toLowerCase().includes(q);
      const statusOk =
        statusFilter === "all" ||
        (statusFilter === "on" ? !!i.item_status : !i.item_status);
      if (!statusOk) return false;
      if (activeSupplierId) {
        return i.is_raw_material && String(i.supplier_id) === String(activeSupplierId) && searchOk;
      }
      const catOk =
        activeCategoryId === "all" ||
        (activeCategoryId === "__uncategorised__"
          ? i.category_id == null
          : String(i.category_id) === String(activeCategoryId));
      return catOk && searchOk;
    });
  }, [items, activeCategoryId, activeSupplierId, search, statusFilter]);

  const statusCounts = useMemo(() => {
    return (items || []).reduce((acc, item) => {
      if (item.item_status) acc.on += 1;
      else acc.off += 1;
      return acc;
    }, { on: 0, off: 0 });
  }, [items]);

  const formCategoryName =
    categories.find(c => String(c.category_id) === String(form.category_id))
      ?.category_name || "";

  return (
    <>
      <style>{`
        html, body, #root { height: 100%; margin: 0; padding: 0; overflow: hidden; }
        .ns::-webkit-scrollbar { display: none; }
        .ns { -ms-overflow-style: none; scrollbar-width: none; }
        .tsw { position: relative; display: inline-block; width: 38px; height: 22px; }
        .tsw input { opacity: 0; width: 0; height: 0; }
        .tsl {
          position: absolute; cursor: pointer; inset: 0;
          background: #d1d5db; border-radius: 22px; transition: .2s;
        }
        .tsl:before {
          position: absolute; content: ""; height: 16px; width: 16px; left: 3px; bottom: 3px;
          background: white; border-radius: 50%; transition: .2s; box-shadow: 0 1px 2px rgba(0,0,0,.15);
        }
        .tsw input:checked + .tsl { background: #10b981; }
        .tsw input:checked + .tsl:before { transform: translateX(16px); }
        .tsw-amber input:checked + .tsl { background: #f59e0b; }
      `}</style>

      {/* ── TOP BAR ── */}
      <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2 flex-wrap">
        <div className="flex items-center gap-2.5">
          <BackButton />
          <div>
            <h1 className="text-[15px] font-bold text-gray-800 leading-tight">Item Management</h1>
            <p className="text-[11px] text-gray-400 leading-none">
              {items.filter(i => !i.is_raw_material).length} items · {categories.length} categories
            </p>
          </div>
          {branchWise && (
            <div className="flex items-center gap-1.5 ml-2">
              <span className="text-[11px] text-gray-400">Branch:</span>
              {isAdmin ? (
                <select
                  value={selectedBranchId}
                  onChange={e => { const bid = e.target.value; setSelectedBranchId(bid); loadData(bid); }}
                  className="border rounded-lg px-2 py-1 text-[11px] bg-white focus:outline-none focus:border-blue-400"
                >
                  {branches.map(b => (
                    <option key={b.branch_id} value={String(b.branch_id)}>{b.branch_name}</option>
                  ))}
                </select>
              ) : (
                <span className="px-2 py-0.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-[11px] font-semibold">
                  {branches.find(b => String(b.branch_id) === String(session?.branch_id))?.branch_name || "My Branch"}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Status filter */}
          <div className="flex rounded-xl border bg-white shadow-sm overflow-hidden text-[11px] font-semibold">
            {[
              { key: "all",  label: `All (${items.filter(i=>!i.is_raw_material).length})`, active: "bg-gray-800 text-white", idle: "text-gray-500 hover:bg-gray-50" },
              { key: "on",   label: `On (${statusCounts.on})`,  active: "bg-emerald-500 text-white", idle: "text-emerald-600 hover:bg-emerald-50" },
              { key: "off",  label: `Off (${statusCounts.off})`, active: "bg-rose-500 text-white",   idle: "text-rose-500 hover:bg-rose-50"   },
            ].map(({ key, label, active, idle }) => (
              <button key={key} type="button" onClick={() => setStatusFilter(key)}
                className={`px-3 py-1.5 transition-colors ${statusFilter === key ? active : idle}`}>
                {label}
              </button>
            ))}
          </div>

          <input ref={xlsxRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleExcelImport} />
          <button type="button" onClick={() => xlsxRef.current?.click()} disabled={importing}
            className="px-3 py-1.5 rounded-xl border bg-white shadow-sm text-[11px] font-medium text-gray-600 hover:bg-gray-50 flex items-center gap-1.5 disabled:opacity-60">
            📥 {importing ? "Importing…" : "Import Excel"}
          </button>

          <button type="button" onClick={() => resetForm({ keepCategory: true })}
            className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-semibold shadow-sm transition-colors">
            + Add Item
          </button>
        </div>
      </div>

      {/* ── MAIN 3-COLUMN LAYOUT ── */}
      <div className="grid grid-cols-[200px_1fr_260px] gap-3 px-4 pb-4 ns"
        style={{ height: "calc(100vh - 108px)" }}>

        {/* ── LEFT: CATEGORIES ── */}
        <aside className="flex flex-col bg-white rounded-2xl border shadow-sm overflow-hidden">
          <div className="px-3 pt-3 pb-2 border-b bg-gray-50">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Categories</p>
            <input
              className="w-full border rounded-lg px-2.5 py-1.5 text-[11px] bg-white focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
              placeholder="Search…"
              value={categorySearch}
              onChange={e => setCategorySearch(e.target.value)}
            />
          </div>

          <div className="flex-1 overflow-y-auto ns px-2 py-2 space-y-0.5">
            {/* All Items */}
            <button type="button" onClick={() => selectCategory("all")}
              className={`w-full text-left px-2.5 py-2 rounded-xl transition-colors flex items-center justify-between gap-1 ${
                activeCategoryId === "all" && !activeSupplierId
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-gray-700 hover:bg-blue-50"
              }`}>
              <span className="font-semibold text-[12px]">All Items</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                activeCategoryId === "all" && !activeSupplierId ? "bg-white/25 text-white" : "bg-gray-100 text-gray-500"
              }`}>{items.filter(i => !i.is_raw_material).length}</span>
            </button>

            {/* Category list */}
            {filteredCategories.map(c => {
              const id = String(c.category_id);
              const isActive = !activeSupplierId && String(activeCategoryId) === id;
              const count = itemCountByCategory[id] || 0;
              return (
                <button key={c.category_id} type="button" onClick={() => selectCategory(id)}
                  className={`w-full text-left px-2.5 py-2 rounded-xl transition-colors flex items-center justify-between gap-1 ${
                    isActive ? "bg-blue-600 text-white shadow-sm" : "text-gray-700 hover:bg-blue-50"
                  }`}>
                  <span className="font-medium text-[11px] truncate pr-1">{c.category_name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium ${
                    isActive ? "bg-white/25 text-white" : "bg-gray-100 text-gray-500"
                  }`}>{count}</span>
                </button>
              );
            })}

            {/* Uncategorised virtual filter */}
            {(itemCountByCategory["__uncategorised__"] || 0) > 0 && (
              <button type="button" onClick={() => { setActiveCategoryId("__uncategorised__"); setActiveSupplierId(null); }}
                className={`w-full text-left px-2.5 py-2 rounded-xl transition-colors flex items-center justify-between gap-1 ${
                  !activeSupplierId && activeCategoryId === "__uncategorised__"
                    ? "bg-slate-500 text-white shadow-sm"
                    : "text-gray-400 hover:bg-gray-50"
                }`}>
                <span className="font-medium text-[11px] truncate pr-1 italic">Uncategorised</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium ${
                  !activeSupplierId && activeCategoryId === "__uncategorised__"
                    ? "bg-white/25 text-white" : "bg-gray-100 text-gray-500"
                }`}>{itemCountByCategory["__uncategorised__"]}</span>
              </button>
            )}

            {/* Raw Materials */}
            {suppliers.length > 0 && (
              <>
                <div className="pt-3 pb-1 px-1">
                  <p className="text-[9px] font-bold text-amber-500 uppercase tracking-widest border-t border-gray-100 pt-2">Raw Materials</p>
                </div>
                {suppliers.map(s => {
                  const sid = String(s.supplier_id);
                  const isActive = String(activeSupplierId) === sid;
                  const count = items.filter(i => i.is_raw_material && String(i.supplier_id) === sid).length;
                  return (
                    <button key={s.supplier_id} type="button" onClick={() => selectSupplier(sid)}
                      className={`w-full text-left px-2.5 py-2 rounded-xl transition-colors flex items-center justify-between gap-1 ${
                        isActive ? "bg-amber-500 text-white shadow-sm" : "text-gray-700 hover:bg-amber-50"
                      }`}>
                      <span className="font-medium text-[11px] truncate pr-1">{s.supplier_name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium ${
                        isActive ? "bg-white/25 text-white" : "bg-amber-100 text-amber-600"
                      }`}>{count}</span>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </aside>

        {/* ── CENTRE: ITEM LIST ── */}
        <div className="flex flex-col bg-white rounded-2xl border shadow-sm overflow-hidden">
          <div className="px-4 pt-3 pb-2.5 border-b flex items-center gap-3 bg-gray-50">
            <div className="flex-1 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[13px]">🔍</span>
              <input
                className="w-full border rounded-xl pl-8 pr-3 py-2 text-[12px] bg-white focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                placeholder="Search items…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <span className="text-[11px] text-gray-400 font-medium flex-shrink-0">
              {filteredItems.length} {filteredItems.length === 1 ? "item" : "items"}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto ns p-3">
            {filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 py-16">
                <span className="text-4xl mb-3">📦</span>
                <p className="text-[13px] font-medium">No items found</p>
                <p className="text-[11px] mt-1">Try a different search or category</p>
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,_minmax(220px,_1fr))] gap-2.5">
                {filteredItems.map(item => {
                  const imgUrl = item.image_filename ? `${API_BASE}/item-images/${item.image_filename}` : "";
                  const isSelected = editingId === item.item_id;
                  const catName =
                    categories.find(c => c.category_id === item.category_id)?.category_name
                    || (item.category_id == null && !item.is_raw_material ? "Uncategorised" : "");
                  const supplierName = item.is_raw_material
                    ? (suppliers.find(s => String(s.supplier_id) === String(item.supplier_id))?.supplier_name || "")
                    : "";
                  const branchName = branchWise
                    ? (branches.find(b => String(b.branch_id) === String(item.branch_id))?.branch_name || null)
                    : null;

                  return (
                    <div key={item.item_id} role="button" tabIndex={0}
                      onClick={() => editItem(item)}
                      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") editItem(item); }}
                      className={`rounded-2xl border cursor-pointer transition-all select-none ${
                        isSelected
                          ? "border-blue-400 ring-2 ring-blue-100 bg-blue-50 shadow-md"
                          : "border-gray-200 bg-white hover:border-blue-300 hover:shadow-md"
                      }`}>
                      <div className="flex items-center gap-3 p-3">
                        {/* Image */}
                        <div className="w-12 h-12 rounded-xl border bg-gray-50 overflow-hidden flex-shrink-0">
                          {imgUrl ? (
                            <img src={imgUrl} alt={item.item_name} className="w-full h-full object-cover"
                              onError={e => { e.currentTarget.style.display = "none"; }} />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-lg text-gray-200">📦</div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-1 justify-between mb-0.5">
                            <p className="font-semibold text-[12px] text-gray-800 leading-snug break-words min-w-0">{item.item_name}</p>
                            <div className="flex gap-1 flex-shrink-0">
                              {item.is_raw_material && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">RAW</span>
                              )}
                              {!item.is_raw_material && item.sold_by_weight && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold">KG</span>
                              )}
                            </div>
                          </div>

                          {item.is_raw_material ? (
                            <div className="flex items-center gap-1.5">
                              <p className="text-[11px] text-amber-600 font-medium">{supplierName || "Raw Material"}</p>
                              {item.unit && (
                                <span className="text-[9px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-bold">{item.unit}</span>
                              )}
                            </div>
                          ) : (
                            <p className="text-[14px] font-bold text-emerald-600">₹{Number(item.price || 0).toFixed(0)}</p>
                          )}

                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            {!item.is_raw_material && catName && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full">{catName}</span>
                            )}
                            {!hotelShop && !item.is_raw_material && (
                              <span className="text-[9px] text-gray-400">
                                Buy ₹{Number(item.buy_price||0).toFixed(0)} · MRP ₹{Number(item.mrp_price||0).toFixed(0)}
                              </span>
                            )}
                            {branchName && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-full border border-blue-100">{branchName}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Footer */}
                      <div className="flex items-center justify-between px-3 pb-2.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                          item.item_status
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-red-50 text-red-600 border border-red-200"
                        }`}>
                          {item.item_status ? "● Active" : "○ Disabled"}
                        </span>
                        <button type="button"
                          onClick={e => { e.stopPropagation(); toggleStatus(item); }}
                          className={`text-[10px] px-2.5 py-0.5 rounded-lg border font-medium transition-colors ${
                            item.item_status
                              ? "text-red-500 border-red-200 hover:bg-red-50"
                              : "text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                          }`}>
                          {item.item_status ? "Disable" : "Enable"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: ADD / EDIT PANEL ── */}
        <div className="flex flex-col bg-white rounded-2xl border shadow-sm overflow-hidden">
          {/* Panel header */}
          <div className={`px-4 py-3 flex items-center gap-2 ${editingId ? "bg-blue-600" : "bg-emerald-600"}`}>
            <span className="text-white text-[15px]">{editingId ? "✏️" : "＋"}</span>
            <div>
              <p className="text-[12px] font-bold text-white leading-tight">{editingId ? "Edit Item" : "Add New Item"}</p>
              {editingId && <p className="text-[10px] text-white/70 leading-tight truncate">{editingItem?.item_name}</p>}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto ns px-3 py-3 space-y-2.5">

            {/* Raw Material toggle */}
            <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl border ${
              form.is_raw_material ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-200"
            }`}>
              <div>
                <p className={`text-[11px] font-semibold ${form.is_raw_material ? "text-amber-800" : "text-gray-600"}`}>Raw Material</p>
                <p className={`text-[10px] ${form.is_raw_material ? "text-amber-600" : "text-gray-400"}`}>No price, linked to supplier</p>
              </div>
              <label className="tsw tsw-amber">
                <input type="checkbox" checked={form.is_raw_material}
                  onChange={e => {
                    const raw = e.target.checked;
                    setForm({ ...form, is_raw_material: raw, sold_by_weight: raw ? false : form.sold_by_weight,
                      price: "", buy_price: "", mrp_price: "",
                      category_id: raw ? "" : form.category_id, supplier_id: raw ? form.supplier_id : "" });
                    if (!raw) setActiveSupplierId(null);
                  }} />
                <span className="tsl"></span>
              </label>
            </div>

            {/* Category / Supplier */}
            {form.is_raw_material ? (
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">Supplier *</label>
                <select className="border rounded-xl px-3 py-2 w-full text-[12px] focus:outline-none focus:border-amber-400 bg-white"
                  value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })}>
                  <option value="">— Select supplier —</option>
                  {suppliers.map(s => <option key={s.supplier_id} value={String(s.supplier_id)}>{s.supplier_name}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">
                  Category <span className="normal-case font-normal text-gray-300">(optional)</span>
                </label>
                {form.category_id ? (
                  <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl">
                    <span className="text-[11px] text-blue-700 font-semibold truncate flex-1">{formCategoryName}</span>
                    <button type="button" onClick={() => setForm(prev => ({ ...prev, category_id: "" }))}
                      className="text-blue-300 hover:text-red-400 transition-colors text-[13px] flex-shrink-0">✕</button>
                  </div>
                ) : (
                  <div className="px-3 py-2 bg-gray-50 border border-dashed border-gray-300 rounded-xl text-[11px] text-gray-400 italic">
                    ← Pick from left or leave blank (Uncategorised)
                  </div>
                )}
              </div>
            )}

            {/* Item Name */}
            <div>
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">Item Name *</label>
              <input
                className="border rounded-xl px-3 py-2 w-full text-[12px] focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                placeholder="Enter item name…"
                value={form.item_name}
                onChange={e => setForm({ ...form, item_name: e.target.value })}
              />
            </div>

            {/* Pricing */}
            {!form.is_raw_material && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2.5">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Pricing</p>

                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block">Selling Price *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 font-medium">₹</span>
                    <input type="number" placeholder="0"
                      className="border rounded-xl pl-7 pr-3 py-2 w-full text-[12px] focus:outline-none focus:border-blue-400 bg-white"
                      value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} />
                  </div>
                </div>

                {!hotelShop && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-500 mb-1 block">Buy Price *</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">₹</span>
                        <input type="number" placeholder="0"
                          className="border rounded-xl pl-7 pr-2 py-2 w-full text-[12px] focus:outline-none focus:border-blue-400 bg-white"
                          value={form.buy_price} onChange={e => setForm({ ...form, buy_price: e.target.value })} />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 mb-1 block">MRP *</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">₹</span>
                        <input type="number" placeholder="0"
                          className="border rounded-xl pl-7 pr-2 py-2 w-full text-[12px] focus:outline-none focus:border-blue-400 bg-white"
                          value={form.mrp_price} onChange={e => setForm({ ...form, mrp_price: e.target.value })} />
                      </div>
                    </div>
                  </div>
                )}

                {/* Sell by weight */}
                <div className="flex items-center justify-between bg-white border border-blue-100 rounded-xl px-3 py-2">
                  <div>
                    <p className="text-[10px] font-semibold text-blue-700">Sell by Weight (KG)</p>
                    <p className="text-[9px] text-blue-400">Auto-rounds grams in billing</p>
                  </div>
                  <label className="tsw">
                    <input type="checkbox" checked={!!form.sold_by_weight}
                      onChange={e => setForm({ ...form, sold_by_weight: e.target.checked })} />
                    <span className="tsl"></span>
                  </label>
                </div>
              </div>
            )}

            {/* Unit — raw materials only */}
            {form.is_raw_material && (
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">Stock Unit</label>
                <select
                  className="border rounded-xl px-3 py-2 w-full text-[12px] focus:outline-none focus:border-amber-400 bg-white"
                  value={form.unit}
                  onChange={e => setForm({ ...form, unit: e.target.value })}
                >
                  <option value="">— Select unit —</option>
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                <p className="text-[10px] text-gray-400 mt-0.5 pl-1">Unit used for inventory & purchase orders</p>
              </div>
            )}

            {/* Min Stock */}
            <div>
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">Min Stock</label>
              <input type="number" placeholder="0"
                className="border rounded-xl px-3 py-2 w-full text-[12px] focus:outline-none focus:border-blue-400"
                value={form.min_stock} onChange={e => setForm({ ...form, min_stock: e.target.value })} />
              <p className="text-[10px] text-gray-400 mt-0.5 pl-1">
                Low-stock alert threshold{form.is_raw_material && form.unit ? ` (${form.unit})` : ""}
              </p>
            </div>

            {/* Image upload */}
            {!form.is_raw_material && (
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">Item Image</label>
                <div className="flex items-center gap-2.5">
                  <div className="w-14 h-14 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center flex-shrink-0">
                    {imagePreviewUrl ? (
                      <img src={imagePreviewUrl} alt="Preview" className="w-full h-full object-cover" />
                    ) : editingItem?.image_filename ? (
                      <img src={`${API_BASE}/item-images/${editingItem.image_filename}`} alt={editingItem.item_name}
                        className="w-full h-full object-cover" onError={e => { e.currentTarget.style.display = "none"; }} />
                    ) : (
                      <span className="text-xl text-gray-200">📷</span>
                    )}
                  </div>
                  <label className="flex-1 cursor-pointer">
                    <div className="border border-dashed border-gray-300 rounded-xl px-2 py-2.5 text-center text-[10px] text-gray-500 hover:border-blue-400 hover:bg-blue-50 transition-colors">
                      {imageFile ? imageFile.name : "Choose image"}
                    </div>
                    <p className="text-[9px] text-gray-400 mt-0.5 pl-1">JPG · PNG · WEBP</p>
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                      onChange={e => setImageFile(e.target.files?.[0] || null)} />
                  </label>
                </div>
              </div>
            )}

            {/* Active toggle */}
            <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
              <div>
                <p className="text-[11px] font-semibold text-gray-700">Active</p>
                <p className="text-[10px] text-gray-400">Visible in billing</p>
              </div>
              <label className="tsw">
                <input type="checkbox" checked={form.item_status}
                  onChange={e => setForm({ ...form, item_status: e.target.checked })} />
                <span className="tsl"></span>
              </label>
            </div>

          </div>

          {/* Action buttons */}
          <div className="px-3 py-3 border-t bg-gray-50 flex gap-2">
            {editingId && (
              <button type="button" onClick={() => resetForm({ keepCategory: true })}
                className="flex-1 py-2 border border-gray-300 rounded-xl text-[12px] text-gray-600 hover:bg-gray-100 transition-colors font-medium">
                Cancel
              </button>
            )}
            <button type="button" onClick={saveItem}
              className={`flex-1 py-2 rounded-xl text-[12px] text-white font-bold transition-colors shadow-sm ${
                editingId ? "bg-blue-600 hover:bg-blue-700" : "bg-emerald-600 hover:bg-emerald-700"
              }`}>
              {editingId ? "Update Item" : "Save Item"}
            </button>
          </div>
        </div>

      </div>
    </>
  );
}
