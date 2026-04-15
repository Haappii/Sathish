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

  const [form, setForm] = useState({
    item_name: "",
    category_id: "",
    supplier_id: "",
    price: "",
    buy_price: "",
    mrp_price: "",
    min_stock: "",
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
        .no-scroll::-webkit-scrollbar { display: none; }
        .no-scroll { -ms-overflow-style: none; scrollbar-width: none; }
        .toggle-switch { position: relative; display: inline-block; width: 36px; height: 20px; }
        .toggle-switch input { opacity: 0; width: 0; height: 0; }
        .toggle-slider {
          position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
          background-color: #d1d5db; border-radius: 20px; transition: .2s;
        }
        .toggle-slider:before {
          position: absolute; content: ""; height: 14px; width: 14px; left: 3px; bottom: 3px;
          background-color: white; border-radius: 50%; transition: .2s;
        }
        input:checked + .toggle-slider { background-color: #10b981; }
        input:checked + .toggle-slider:before { transform: translateX(16px); }
        .toggle-switch-blue input:checked + .toggle-slider { background-color: #f59e0b; }
      `}</style>

      {/* Top bar */}
      <div className="px-4 pt-2 pb-1 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <BackButton />
          {branchWise && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-gray-500 font-medium">Branch:</span>
              {isAdmin ? (
                <select
                  value={selectedBranchId}
                  onChange={e => {
                    const bid = e.target.value;
                    setSelectedBranchId(bid);
                    loadData(bid);
                  }}
                  className="border rounded-lg px-2 py-1 text-[12px] bg-white shadow-sm focus:outline-none focus:border-blue-400"
                >
                  {branches.map(b => (
                    <option key={b.branch_id} value={String(b.branch_id)}>
                      {b.branch_name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-[12px] font-semibold">
                  {branches.find(b => String(b.branch_id) === String(session?.branch_id))?.branch_name || "My Branch"}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-xl border bg-white shadow-sm">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                statusFilter === "all"
                  ? "bg-slate-800 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              All ({items.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("on")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                statusFilter === "on"
                  ? "bg-emerald-600 text-white"
                  : "text-emerald-700 hover:bg-emerald-50"
              }`}
            >
              On ({statusCounts.on})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("off")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                statusFilter === "off"
                  ? "bg-rose-600 text-white"
                  : "text-rose-700 hover:bg-rose-50"
              }`}
            >
              Off ({statusCounts.off})
            </button>
          </div>
          <input ref={xlsxRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleExcelImport} />
          <button
            type="button"
            onClick={() => xlsxRef.current?.click()}
            disabled={importing}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white shadow-sm text-[12px] flex items-center gap-1.5 disabled:opacity-60"
          >
            📥 {importing ? "Importing…" : "Import Excel"}
          </button>
          <button
            type="button"
            onClick={() => resetForm({ keepCategory: true })}
            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white shadow-sm text-[12px]"
          >
            + Add Item
          </button>
        </div>
      </div>

      {/* Main 3-column layout */}
      <div
        className="grid grid-cols-[190px_3fr_230px] gap-3 px-4 pb-4 no-scroll"
        style={{ height: "calc(100vh - 110px)" }}
      >
        {/* ── CATEGORIES + SUPPLIERS ── */}
        <aside className="rounded-2xl border shadow-lg p-3 bg-white text-[11px] flex flex-col overflow-hidden">
          <input
            className="border rounded-lg px-2 py-1.5 mb-2 text-[11px] w-full focus:outline-none focus:border-blue-400"
            placeholder="Search category..."
            value={categorySearch}
            onChange={e => setCategorySearch(e.target.value)}
          />

          <div className="flex-1 overflow-y-auto no-scroll space-y-0.5">
            {/* All Items */}
            <button
              type="button"
              onClick={() => selectCategory("all")}
              className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                activeCategoryId === "all" && !activeSupplierId
                  ? "bg-blue-600 text-white"
                  : "hover:bg-gray-100 text-gray-700"
              }`}
            >
              <div className="flex justify-between items-center">
                <span className="font-semibold text-[11px]">All Items</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  activeCategoryId === "all" && !activeSupplierId ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
                }`}>
                  {items.filter(i => !i.is_raw_material).length}
                </span>
              </div>
            </button>

            {/* Category list */}
            {filteredCategories.map(c => {
              const id = String(c.category_id);
              const isActive = !activeSupplierId && String(activeCategoryId) === id;
              const count = itemCountByCategory[id] || 0;
              return (
                <button
                  key={c.category_id}
                  type="button"
                  onClick={() => selectCategory(id)}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                    isActive ? "bg-blue-600 text-white" : "hover:bg-gray-100 text-gray-700"
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-[11px] truncate pr-1">{c.category_name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                      isActive ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
                    }`}>{count}</span>
                  </div>
                </button>
              );
            })}

            {/* Uncategorised virtual filter */}
            {(itemCountByCategory["__uncategorised__"] || 0) > 0 && (
              <button
                type="button"
                onClick={() => { setActiveCategoryId("__uncategorised__"); setActiveSupplierId(null); }}
                className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                  !activeSupplierId && activeCategoryId === "__uncategorised__"
                    ? "bg-gray-500 text-white"
                    : "hover:bg-gray-100 text-gray-500"
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-medium text-[11px] truncate pr-1 italic">Uncategorised</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                    !activeSupplierId && activeCategoryId === "__uncategorised__"
                      ? "bg-white/20 text-white"
                      : "bg-gray-100 text-gray-500"
                  }`}>{itemCountByCategory["__uncategorised__"]}</span>
                </div>
              </button>
            )}

            {/* Raw Materials by Supplier */}
            {suppliers.length > 0 && (
              <>
                <div className="pt-2 pb-1 px-1">
                  <div className="text-[9px] font-bold text-amber-600 uppercase tracking-widest border-t pt-2">
                    Raw Materials
                  </div>
                </div>
                {suppliers.map(s => {
                  const sid = String(s.supplier_id);
                  const isActive = String(activeSupplierId) === sid;
                  const count = items.filter(i => i.is_raw_material && String(i.supplier_id) === sid).length;
                  return (
                    <button
                      key={s.supplier_id}
                      type="button"
                      onClick={() => selectSupplier(sid)}
                      className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                        isActive ? "bg-amber-500 text-white" : "hover:bg-amber-50 text-gray-700"
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-[11px] truncate pr-1">{s.supplier_name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                          isActive ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700"
                        }`}>{count}</span>
                      </div>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </aside>

        {/* ── ITEM LIST ── */}
        <div className="rounded-2xl border shadow-lg p-3 bg-white flex flex-col overflow-hidden">
          <h2 className="text-[11px] font-bold text-center text-gray-500 uppercase tracking-widest mb-2">Item List</h2>

          <input
            className="border rounded-lg px-2 py-1.5 mb-3 text-[11px] w-full focus:outline-none focus:border-blue-400"
            placeholder="Search items..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          <div className="flex-1 overflow-y-auto no-scroll pr-1">
            <div className="grid grid-cols-[repeat(auto-fill,_minmax(240px,_1fr))] gap-2">
              {filteredItems.map(item => {
                const imgUrl = item.image_filename
                  ? `${API_BASE}/item-images/${item.image_filename}`
                  : "";
                const isSelected = editingId === item.item_id;
                const catName =
                  categories.find(c => c.category_id === item.category_id)?.category_name || (item.category_id == null && !item.is_raw_material ? "Uncategorised" : "");
                const supplierName = item.is_raw_material
                  ? (suppliers.find(s => String(s.supplier_id) === String(item.supplier_id))?.supplier_name || "")
                  : "";
                const branchName = branchWise
                  ? (branches.find(b => String(b.branch_id) === String(item.branch_id))?.branch_name || null)
                  : null;

                return (
                  <div
                    key={item.item_id}
                    className={`rounded-xl border cursor-pointer transition-all
                      ${isSelected
                        ? "border-blue-400 bg-blue-50 shadow-md"
                        : "border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm"
                      }`}
                    onClick={() => editItem(item)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === "Enter" || e.key === " ") editItem(item); }}
                  >
                    <div className="flex items-start gap-2 p-2">
                      {/* Image */}
                      <div className="w-11 h-11 rounded-lg border bg-gray-50 overflow-hidden flex-shrink-0">
                        {imgUrl ? (
                          <img
                            src={imgUrl}
                            alt={item.item_name}
                            className="w-full h-full object-cover"
                            onError={e => { e.currentTarget.style.display = "none"; }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[9px] text-gray-300 font-medium">
                            IMG
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-1">
                          <div className="font-semibold text-[12px] text-gray-800 leading-tight break-words min-w-0">
                            {item.item_name}
                          </div>
                          {item.is_raw_material && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-700 flex-shrink-0 font-medium">
                              RAW
                            </span>
                          )}
                          {!item.is_raw_material && item.sold_by_weight && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded border border-blue-300 bg-blue-50 text-blue-700 flex-shrink-0 font-medium">
                              KG
                            </span>
                          )}
                        </div>

                        {item.is_raw_material ? (
                          <div className="text-[11px] text-amber-600 font-medium mt-0.5">Raw Material</div>
                        ) : (
                          <div className="text-[12px] text-blue-700 font-bold mt-0.5">
                            ₹{Number(item.price || 0).toFixed(0)}
                          </div>
                        )}

                        <div className="text-[10px] text-gray-400 mt-0.5 truncate">
                          {item.is_raw_material
                            ? supplierName && <span className="text-amber-600">{supplierName}</span>
                            : <>
                                {activeCategoryId === "all" && catName ? catName : ""}
                                {!hotelShop && (
                                  <span> · Buy ₹{Number(item.buy_price || 0).toFixed(0)} · MRP ₹{Number(item.mrp_price || 0).toFixed(0)}</span>
                                )}
                                {item.min_stock > 0 && <span> · Min {item.min_stock}</span>}
                              </>
                          }
                        </div>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between px-2 pb-2">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          item.item_status
                            ? "text-emerald-700 bg-emerald-50 border border-emerald-200"
                            : "text-red-600 bg-red-50 border border-red-200"
                        }`}>
                          {item.item_status ? "Active" : "Disabled"}
                        </span>
                        {branchName && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full border border-blue-200 bg-blue-50 text-blue-700">
                            {branchName}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); toggleStatus(item); }}
                        className={`text-[10px] px-2 py-0.5 rounded-lg border transition-colors ${
                          item.item_status
                            ? "text-red-500 border-red-200 hover:bg-red-50"
                            : "text-emerald-600 border-emerald-200 hover:bg-emerald-50"
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
              <div className="text-[12px] text-gray-400 text-center py-10">
                No items found
              </div>
            )}
          </div>
        </div>

        {/* ── ADD / EDIT PANEL ── */}
        <div className="rounded-2xl border shadow-lg bg-white flex flex-col overflow-hidden">
          {/* Panel header */}
          <div className={`px-4 py-3 border-b ${editingId ? "bg-blue-600" : "bg-emerald-600"}`}>
            <h2 className="text-[12px] font-bold text-white text-center tracking-wide">
              {editingId ? "✏️ EDIT ITEM" : "＋ ADD ITEM"}
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto no-scroll px-3 py-3 space-y-3">

            {/* Raw Material toggle — at top so user sees it first */}
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
              <div>
                <div className="text-[11px] font-semibold text-amber-800">Raw Material</div>
                <div className="text-[10px] text-amber-600">Supplier-linked, no price</div>
              </div>
              <label className="toggle-switch toggle-switch-blue">
                <input
                  type="checkbox"
                  checked={form.is_raw_material}
                  onChange={e => {
                    const raw = e.target.checked;
                    setForm({ ...form, is_raw_material: raw, sold_by_weight: raw ? false : form.sold_by_weight, price: "", buy_price: "", mrp_price: "", category_id: raw ? "" : form.category_id, supplier_id: raw ? form.supplier_id : "" });
                    if (!raw) setActiveSupplierId(null);
                  }}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            {/* Supplier (raw material) OR Category (normal item) */}
            {form.is_raw_material ? (
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">Supplier *</label>
                <select
                  className="border rounded-lg px-3 py-2 w-full text-[12px] focus:outline-none focus:border-amber-400 bg-white"
                  value={form.supplier_id}
                  onChange={e => setForm({ ...form, supplier_id: e.target.value })}
                >
                  <option value="">— Select supplier —</option>
                  {suppliers.map(s => (
                    <option key={s.supplier_id} value={String(s.supplier_id)}>{s.supplier_name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Category <span className="normal-case font-normal">(optional)</span></div>
                {form.category_id ? (
                  <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                    <span className="text-[11px] text-blue-700 font-semibold truncate">{formCategoryName}</span>
                    <button
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, category_id: "" }))}
                      className="ml-auto text-[10px] text-blue-400 hover:text-red-500 flex-shrink-0"
                    >✕</button>
                  </div>
                ) : (
                  <div className="px-3 py-2 bg-gray-50 border border-dashed border-gray-300 rounded-lg text-[11px] text-gray-400 italic">
                    ← Select from left panel or leave blank for Uncategorised
                  </div>
                )}
              </div>
            )}

            {/* Item Name */}
            <div>
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">Item Name *</label>
              <input
                className="border rounded-lg px-3 py-2 w-full text-[12px] focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                placeholder="Enter item name..."
                value={form.item_name}
                onChange={e => setForm({ ...form, item_name: e.target.value })}
              />
            </div>

            {/* Pricing — only for normal items */}
            {!form.is_raw_material && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 space-y-2">
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Pricing</div>
                <div>
                  <label className="text-[10px] text-gray-500 mb-0.5 block">Selling Price *</label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">₹</span>
                    <input
                      type="number"
                      className="border rounded-lg pl-6 pr-2 py-1.5 w-full text-[12px] focus:outline-none focus:border-blue-400 bg-white"
                      placeholder="0"
                      value={form.price}
                      onChange={e => setForm({ ...form, price: e.target.value })}
                    />
                  </div>
                </div>
                {!hotelShop && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-500 mb-0.5 block">Buy Price *</label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">₹</span>
                        <input
                          type="number"
                          className="border rounded-lg pl-6 pr-2 py-1.5 w-full text-[12px] focus:outline-none focus:border-blue-400 bg-white"
                          placeholder="0"
                          value={form.buy_price}
                          onChange={e => setForm({ ...form, buy_price: e.target.value })}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 mb-0.5 block">MRP *</label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">₹</span>
                        <input
                          type="number"
                          className="border rounded-lg pl-6 pr-2 py-1.5 w-full text-[12px] focus:outline-none focus:border-blue-400 bg-white"
                          placeholder="0"
                          value={form.mrp_price}
                          onChange={e => setForm({ ...form, mrp_price: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5">
                  <div>
                    <div className="text-[10px] font-semibold text-blue-800">Sell by Weight (KG)</div>
                    <div className="text-[10px] text-blue-600">Use grams in billing and auto-round line total</div>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={!!form.sold_by_weight}
                      onChange={e => setForm({ ...form, sold_by_weight: e.target.checked })}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>
            )}

            {/* Min Stock — for all items */}
            <div>
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">Min Stock</label>
              <input
                type="number"
                className="border rounded-lg px-3 py-1.5 w-full text-[12px] focus:outline-none focus:border-blue-400"
                placeholder="0"
                value={form.min_stock}
                onChange={e => setForm({ ...form, min_stock: e.target.value })}
              />
              <p className="text-[10px] text-gray-400 mt-0.5 pl-1">Alert when stock falls below this value</p>
            </div>

            {/* Image upload — only for normal items */}
            {!form.is_raw_material && (
              <div>
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Item Image</div>
                <div className="flex items-center gap-2">
                  <div className="w-14 h-14 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center flex-shrink-0">
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
                      <span className="text-[9px] text-gray-300">📷</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <label className="block w-full cursor-pointer">
                      <div className="px-2 py-1.5 border border-dashed border-gray-300 rounded-lg text-center text-[10px] text-gray-500 hover:border-blue-400 hover:bg-blue-50 transition-colors">
                        {imageFile ? imageFile.name : "Choose image"}
                      </div>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={e => setImageFile(e.target.files?.[0] || null)}
                      />
                    </label>
                    <div className="text-[9px] text-gray-400 mt-0.5 pl-1">JPG, PNG, WEBP</div>
                  </div>
                </div>
              </div>
            )}

            {/* Active toggle */}
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 border border-gray-200">
              <div>
                <div className="text-[11px] font-semibold text-gray-700">Active</div>
                <div className="text-[10px] text-gray-400">Show in billing</div>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={form.item_status}
                  onChange={e => setForm({ ...form, item_status: e.target.checked })}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

          </div>

          {/* Action buttons */}
          <div className="px-3 py-3 border-t bg-gray-50 flex gap-2">
            {editingId && (
              <button
                type="button"
                onClick={() => resetForm({ keepCategory: true })}
                className="flex-1 py-2 border border-gray-300 rounded-xl text-[12px] text-gray-600 hover:bg-gray-100 transition-colors font-medium"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={saveItem}
              className={`flex-1 py-2 rounded-xl text-[12px] text-white font-semibold transition-colors shadow-sm ${
                editingId
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "bg-emerald-600 hover:bg-emerald-700"
              }`}
            >
              {editingId ? "Update" : "Save Item"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
