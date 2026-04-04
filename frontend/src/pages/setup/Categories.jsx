import React, { useRef, useState, useEffect } from "react";
import * as XLSX from "xlsx";
import authAxios from "../../api/authAxios";
import { useToast } from "../../components/Toast";
import BackButton from "../../components/BackButton";
import { FaPlus, FaEdit, FaTag, FaFileExcel } from "react-icons/fa";
import { MdCategory } from "react-icons/md";

const BLUE = "#0B3C8C";

export default function Categories() {
  const { showToast } = useToast();

  const [categories, setCategories] = useState([]);
  const [newCat, setNewCat] = useState("");
  const [adding, setAdding] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [editingId, setEditingId] = useState(null);

  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const xlsxRef = useRef(null);

  // ---------- EXCEL IMPORT ----------
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
      const rows = raw
        .map(r => ({
          category_name: String(r["category_name"] || r["Category Name"] || r["name"] || "").trim(),
          status: String(r["status"] || r["Status"] || "active").toLowerCase() !== "inactive",
        }))
        .filter(r => r.category_name);
      if (!rows.length) return showToast("No valid rows found in file", "error");
      const res = await authAxios.post("/category/bulk-import", rows);
      showToast(`Done — ${res.data.inserted} inserted, ${res.data.updated} updated${res.data.errors?.length ? `, ${res.data.errors.length} errors` : ""}`, "success");
      loadData();
    } catch (err) {
      showToast(err?.response?.data?.detail || "Import failed", "error");
    } finally {
      setImporting(false);
    }
  };

  // ---------- LOAD ----------
  const loadData = async () => {
    try {
      const res = await authAxios.get("/category/");
      setCategories(res.data || []);
    } catch {
      showToast("Failed to load categories", "error");
    }
  };

  useEffect(() => { loadData(); }, []);

  // ---------- ADD ----------
  const addCategory = async () => {
    if (!newCat.trim()) return showToast("Enter category name", "error");
    setAdding(true);
    try {
      await authAxios.post("/category/", {
        category_name: newCat.toUpperCase(),
        category_status: true,
      });
      setNewCat("");
      loadData();
      showToast("Category added", "success");
    } catch {
      showToast("Unable to add category", "error");
    } finally {
      setAdding(false);
    }
  };

  // ---------- STATUS TOGGLE ----------
  const toggleStatus = async (cat) => {
    try {
      await authAxios.put(`/category/${cat.category_id}`, {
        category_status: !cat.category_status,
      });
      loadData();
      showToast("Status updated", "success");
    } catch {
      showToast("Failed to update", "error");
    }
  };

  // ---------- OPEN EDIT ----------
  const openEdit = (cat) => {
    setEditingId(cat.category_id);
    setEditForm({ ...cat });
    setEditOpen(true);
  };

  // ---------- SAVE EDIT ----------
  const saveEdit = async () => {
    if (!editForm.category_name?.trim())
      return showToast("Name cannot be empty", "error");
    try {
      await authAxios.put(`/category/${editingId}`, {
        category_name: editForm.category_name.toUpperCase(),
      });
      setEditOpen(false);
      setEditingId(null);
      loadData();
      showToast("Category updated", "success");
    } catch {
      showToast("Update failed", "error");
    }
  };

  const filtered = categories.filter((c) =>
    (c.category_name || "").toLowerCase().includes(search.toLowerCase())
  );
  const activeCount = categories.filter((c) => c.category_status).length;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Page Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-4">
          <BackButton />
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: `${BLUE}15` }}
            >
              <MdCategory size={20} style={{ color: BLUE }} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">Category Management</h1>
              <p className="text-xs text-slate-500">
                {categories.length} total &middot; {activeCount} active
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Add + Search bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5"
            >
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              className="w-full border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition"
              placeholder="Search categories…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Add input + button */}
          <div className="flex gap-2">
            <input
              className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition w-52"
              placeholder="New category name"
              value={newCat}
              onChange={(e) => setNewCat(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && addCategory()}
            />
            <button
              onClick={addCategory}
              disabled={adding}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold shadow-sm hover:opacity-90 transition disabled:opacity-60"
              style={{ background: BLUE }}
            >
              <FaPlus size={11} />
              Add
            </button>
            <input ref={xlsxRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleExcelImport} />
            <button
              onClick={() => xlsxRef.current?.click()}
              disabled={importing}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition disabled:opacity-60"
            >
              <FaFileExcel size={13} />
              {importing ? "Importing…" : "Import Excel"}
            </button>
          </div>
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
            <FaTag size={32} className="mx-auto mb-3 text-slate-300" />
            <p className="text-sm text-slate-500">
              {search ? "No categories match your search" : "No categories yet"}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {!search && "Add your first category above"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {filtered.map((cat) => (
              <CategoryCard
                key={cat.category_id}
                cat={cat}
                onEdit={() => openEdit(cat)}
                onToggle={() => toggleStatus(cat)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Edit Drawer */}
      {editOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex justify-end"
          onClick={() => { setEditOpen(false); setEditingId(null); }}
        >
          <div
            className="w-80 bg-white h-full shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: `${BLUE}15` }}
              >
                <FaEdit size={13} style={{ color: BLUE }} />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">Edit Category</h3>
                <p className="text-xs text-slate-500">Update category name</p>
              </div>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">Category Name</label>
                <input
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition"
                  value={editForm.category_name || ""}
                  onChange={(e) =>
                    setEditForm({ ...editForm, category_name: e.target.value.toUpperCase() })
                  }
                  autoFocus
                />
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="px-5 py-4 border-t border-slate-100 flex gap-2">
              <button
                onClick={() => { setEditOpen(false); setEditingId(null); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm hover:opacity-90 transition"
                style={{ background: BLUE }}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryCard({ cat, onEdit, onToggle }) {
  const active = cat.category_status;

  // Pick a color from the name (consistent per category)
  const colors = [
    { bg: "#EEF2FF", text: "#4338CA" },
    { bg: "#FFF7ED", text: "#C2410C" },
    { bg: "#F0FDF4", text: "#15803D" },
    { bg: "#FDF4FF", text: "#9333EA" },
    { bg: "#FFF1F2", text: "#BE123C" },
    { bg: "#F0F9FF", text: "#0369A1" },
    { bg: "#FFFBEB", text: "#B45309" },
    { bg: "#F0FDFA", text: "#0F766E" },
  ];
  const idx =
    (cat.category_name || "").split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) %
    colors.length;
  const palette = colors[idx];

  return (
    <div
      className={`bg-white rounded-2xl border-2 p-4 flex flex-col gap-3 transition ${
        active ? "border-slate-100 hover:border-slate-200" : "border-slate-100 opacity-60"
      }`}
    >
      {/* Icon + Name */}
      <div className="flex flex-col items-center gap-2 text-center">
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center text-base font-bold"
          style={{ background: palette.bg, color: palette.text }}
        >
          {(cat.category_name || "?").charAt(0)}
        </div>
        <p className="font-semibold text-slate-800 text-sm leading-tight line-clamp-2">
          {cat.category_name}
        </p>
      </div>

      {/* Status badge */}
      <span
        className={`mx-auto text-[10px] font-semibold px-2.5 py-0.5 rounded-full border ${
          active
            ? "bg-emerald-50 text-emerald-700 border-emerald-100"
            : "bg-red-50 text-red-600 border-red-100"
        }`}
      >
        {active ? "Active" : "Inactive"}
      </span>

      {/* Actions */}
      <div className="flex gap-1.5">
        <button
          onClick={onEdit}
          className="flex-1 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition flex items-center justify-center gap-1"
        >
          <FaEdit size={10} /> Edit
        </button>
        <button
          onClick={onToggle}
          className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition ${
            active
              ? "bg-red-50 text-red-600 hover:bg-red-100"
              : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          }`}
        >
          {active ? "Disable" : "Enable"}
        </button>
      </div>
    </div>
  );
}
