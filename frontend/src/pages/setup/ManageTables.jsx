import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../utils/apiClient";
import { useToast } from "../../components/Toast";
import { isHotelShop } from "../../utils/shopType";
import BackButton from "../../components/BackButton";
import QRCode from "qrcode";
import {
  FaPlus, FaTrash, FaEdit, FaSave, FaTimes,
  FaQrcode, FaCopy, FaSync, FaPrint, FaChair,
} from "react-icons/fa";
import { MdTableRestaurant } from "react-icons/md";

const BLUE = "#0B3C8C";
const inputCls = "w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white";

/* ── status badge ─────────────────────────────────────────────────────────── */
function StatusBadge({ status }) {
  const s = String(status || "").toUpperCase();
  if (s === "OCCUPIED")
    return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">Occupied</span>;
  if (s === "RESERVED")
    return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Reserved</span>;
  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Available</span>;
}

/* ── table card ───────────────────────────────────────────────────────────── */
function TableCard({ t, editingId, editForm, setEditForm, onStartEdit, onSaveEdit, onCancelEdit, onQr, onDelete, confirmDeleteId, categories }) {
  const isEditing = editingId === t.table_id;
  const isConfirmDelete = confirmDeleteId === t.table_id;
  const status = String(t.status || "AVAILABLE").toUpperCase();

  return (
    <div className={`bg-white rounded-2xl border shadow-sm flex flex-col overflow-hidden transition-shadow hover:shadow-md ${
      status === "OCCUPIED" ? "border-rose-200" : status === "RESERVED" ? "border-amber-200" : "border-slate-200"
    }`}>
      {/* coloured top bar */}
      <div className={`h-1 w-full ${
        status === "OCCUPIED" ? "bg-rose-400" : status === "RESERVED" ? "bg-amber-400" : "bg-emerald-400"
      }`} />

      <div className="p-4 flex-1 flex flex-col gap-3">
        {isEditing ? (
          /* ── inline edit form ── */
          <div className="space-y-2">
            <input
              autoFocus
              value={editForm.table_name}
              onChange={(e) => setEditForm((f) => ({ ...f, table_name: e.target.value }))}
              placeholder="Table name"
              className={inputCls}
            />
            <div className="flex items-center gap-2">
              <FaChair className="text-slate-400 flex-shrink-0" size={13} />
              <input
                type="number"
                min="1"
                value={editForm.capacity}
                onChange={(e) => setEditForm((f) => ({ ...f, capacity: e.target.value }))}
                className={`${inputCls} w-20`}
              />
              <span className="text-xs text-slate-500">seats</span>
            </div>
            <select
              value={editForm.category_id}
              onChange={(e) => setEditForm((f) => ({ ...f, category_id: e.target.value }))}
              className={inputCls}
            >
              <option value="">No Category</option>
              {categories.map(c => (
                <option key={c.category_id} value={c.category_id}>{c.category_name}</option>
              ))}
            </select>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => onSaveEdit(t.table_id)}
                className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white py-1.5 rounded-xl text-xs font-semibold transition"
              >
                <FaSave size={11} /> Save
              </button>
              <button
                onClick={onCancelEdit}
                className="flex-1 flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 py-1.5 rounded-xl text-xs font-semibold transition"
              >
                <FaTimes size={11} /> Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ── table icon + name ── */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  status === "OCCUPIED" ? "bg-rose-50" : status === "RESERVED" ? "bg-amber-50" : "bg-blue-50"
                }`}>
                  <MdTableRestaurant size={18} style={{ color: BLUE }} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{t.table_name}</p>
                  <div className="flex items-center gap-1 mt-0.5 text-xs text-slate-500">
                    <FaChair size={10} />
                    <span>{t.capacity} seats</span>
                  </div>
                  {t.category_name && (
                    <div className="text-xs text-blue-600 font-medium mt-0.5">
                      {t.category_name}
                    </div>
                  )}
                </div>
              </div>
              <StatusBadge status={t.status} />
            </div>

            {/* ── actions ── */}
            <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100">
              <button
                onClick={() => onQr(t)}
                title="Show QR"
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl border text-[11px] font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                <FaQrcode size={11} /> QR
              </button>
              <button
                onClick={() => onStartEdit(t)}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl border text-[11px] font-semibold text-blue-700 hover:bg-blue-50 transition"
              >
                <FaEdit size={11} /> Edit
              </button>
              <button
                onClick={() => onDelete(t.table_id)}
                className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl border text-[11px] font-semibold transition ${
                  isConfirmDelete
                    ? "bg-rose-600 text-white border-rose-600"
                    : "text-rose-600 hover:bg-rose-50"
                }`}
              >
                <FaTrash size={10} /> {isConfirmDelete ? "Sure?" : "Delete"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── QR modal ─────────────────────────────────────────────────────────────── */
function QrModal({ open, loading, qrData, qrImage, onClose, onCopy, onRegenerate, onPrint }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <p className="text-sm font-bold text-slate-800">
              {qrData?.table_name ? `Table ${qrData.table_name}` : "Table QR Code"}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">Scan to view menu & place order</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500 transition text-sm"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <div className="w-8 h-8 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" />
              <p className="text-xs text-slate-500">Generating QR code…</p>
            </div>
          ) : (
            <>
              {/* QR image */}
              <div className="flex justify-center">
                {qrImage ? (
                  <div className="p-3 border-2 border-slate-100 rounded-2xl inline-block">
                    <img src={qrImage} alt="QR Code" className="w-56 h-56 block" />
                  </div>
                ) : (
                  <div className="w-56 h-56 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center text-slate-400 text-sm">
                    QR not available
                  </div>
                )}
              </div>

              {/* URL pill */}
              {qrData?.url && (
                <div className="bg-slate-50 rounded-xl border px-3 py-2 flex items-center gap-2">
                  <span className="text-[11px] text-slate-600 truncate flex-1 font-mono">
                    {qrData.url}
                  </span>
                  <button
                    type="button"
                    onClick={onCopy}
                    className="flex-shrink-0 text-blue-700 hover:text-blue-900"
                    title="Copy link"
                  >
                    <FaCopy size={13} />
                  </button>
                </div>
              )}

              {/* action buttons */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={onCopy}
                  className="flex flex-col items-center gap-1.5 py-2.5 rounded-xl border hover:bg-slate-50 transition text-slate-700"
                >
                  <FaCopy size={14} />
                  <span className="text-[10px] font-semibold">Copy Link</span>
                </button>
                <button
                  type="button"
                  onClick={onRegenerate}
                  className="flex flex-col items-center gap-1.5 py-2.5 rounded-xl border hover:bg-slate-50 transition text-slate-700"
                >
                  <FaSync size={14} />
                  <span className="text-[10px] font-semibold">Regenerate</span>
                </button>
                <button
                  type="button"
                  onClick={onPrint}
                  className="flex flex-col items-center gap-1.5 py-2.5 rounded-xl border hover:bg-slate-50 transition text-slate-700"
                >
                  <FaPrint size={14} />
                  <span className="text-[10px] font-semibold">Print</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════════════════════ */
export default function ManageTables() {
  const { branchId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [tables, setTables] = useState([]);
  const [categories, setCategories] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ table_name: "", capacity: 4, category_id: "" });
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [hotelAllowed, setHotelAllowed] = useState(null);

  const [form, setForm] = useState({ table_name: "", capacity: 4, category_id: "" });
  const [categoryForm, setCategoryForm] = useState({ category_name: "" });
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editCategoryForm, setEditCategoryForm] = useState({ category_name: "" });

  const [qrOpen, setQrOpen] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrData, setQrData] = useState(null);
  const [qrImage, setQrImage] = useState("");

  /* ── hotel guard ── */
  useEffect(() => {
    let mounted = true;
    api.get("/shop/details")
      .then((res) => { if (mounted) setHotelAllowed(isHotelShop(res.data || {})); })
      .catch(() => {
        if (!mounted) return;
        const cached = localStorage.getItem("billing_type");
        setHotelAllowed(cached === "hotel");
      });
    return () => { mounted = false; };
  }, []);

  /* ── load tables ── */
  const loadTables = async () => {
    try {
      const res = await api.get(`/tables/branch/${branchId}`);
      setTables(res.data || []);
    } catch {
      showToast("Failed to load tables", "error");
    }
  };

  /* ── load categories ── */
  const loadCategories = async () => {
    try {
      const res = await api.get("/table-categories/", { params: { branch_id: branchId } });
      setCategories(res.data || []);
    } catch {
      showToast("Failed to load categories", "error");
    }
  };

  /* ── add category ── */
  const addCategory = async () => {
    if (!categoryForm.category_name.trim()) { showToast("Category name required", "error"); return; }
    try {
      await api.post("/table-categories/", {
        category_name: categoryForm.category_name.trim(),
        branch_id: Number(branchId),
      });
      setCategoryForm({ category_name: "" });
      loadCategories();
      showToast("Category added", "success");
    } catch {
      showToast("Failed to add category", "error");
    }
  };

  /* ── edit category ── */
  const startEditCategory = (category) => {
    setEditingCategoryId(category.category_id);
    setEditCategoryForm({ category_name: category.category_name });
  };

  const saveEditCategory = async () => {
    if (!editCategoryForm.category_name.trim()) { showToast("Category name required", "error"); return; }
    try {
      await api.put(`/table-categories/${editingCategoryId}/`, {
        category_name: editCategoryForm.category_name.trim(),
      });
      setEditingCategoryId(null);
      setEditCategoryForm({ category_name: "" });
      loadCategories();
      showToast("Category updated", "success");
    } catch {
      showToast("Failed to update category", "error");
    }
  };

  const cancelEditCategory = () => {
    setEditingCategoryId(null);
    setEditCategoryForm({ category_name: "" });
  };

  /* ── delete category ── */
  const deleteCategory = async (categoryId) => {
    try {
      await api.delete(`/table-categories/${categoryId}/`);
      loadCategories();
      loadTables(); // reload tables to update category references
      showToast("Category deleted", "success");
    } catch {
      showToast("Failed to delete category", "error");
    }
  };

  useEffect(() => {
    if (!hotelAllowed) return;
    loadTables();
    loadCategories();
  }, [branchId, hotelAllowed]);

  /* ── add ── */
  const addTable = async () => {
    if (!form.table_name.trim()) { showToast("Table name required", "error"); return; }
    try {
      await api.post("/tables/create", {
        table_name: form.table_name.trim(),
        capacity: Number(form.capacity),
        category_id: form.category_id ? Number(form.category_id) : null,
        branch_id: Number(branchId),
      });
      setForm({ table_name: "", capacity: 4, category_id: "" });
      loadTables();
      showToast("Table added", "success");
    } catch {
      showToast("Failed to add table", "error");
    }
  };

  /* ── edit ── */
  const startEdit = (t) => {
    setEditingId(t.table_id);
    setEditForm({ table_name: t.table_name, capacity: t.capacity, category_id: t.category_id || "" });
  };

  const saveEdit = async (id) => {
    if (!editForm.table_name.trim()) { showToast("Table name required", "error"); return; }
    try {
      await api.put(`/tables/${id}`, {
        table_name: editForm.table_name.trim(),
        capacity: Number(editForm.capacity),
        category_id: editForm.category_id ? Number(editForm.category_id) : null,
      });
      setEditingId(null);
      loadTables();
      showToast("Table updated", "success");
    } catch {
      showToast("Update failed", "error");
    }
  };

  /* ── delete ── */
  const requestDelete = (id) => {
    if (confirmDeleteId === id) {
      deleteTable(id);
      setConfirmDeleteId(null);
      return;
    }
    setConfirmDeleteId(id);
    setTimeout(() => setConfirmDeleteId(null), 3000);
  };

  const deleteTable = async (id) => {
    try {
      await api.delete(`/tables/${id}`);
      loadTables();
      showToast("Table deleted", "success");
    } catch {
      showToast("Cannot delete occupied table", "error");
    }
  };

  /* ── QR ── */
  const buildQrUrl = (token) => `${window?.location?.origin || ""}/qr/${token}`;

  const openQr = async (t, regenerate = false) => {
    setQrOpen(true);
    setQrLoading(true);
    setQrData(null);
    setQrImage("");
    try {
      const res = regenerate
        ? await api.post(`/table-qr/token/regenerate/${t.table_id}`)
        : await api.get(`/table-qr/token/by-table/${t.table_id}`);
      const token = res.data?.token;
      if (!token) throw new Error("Missing token");
      const url = buildQrUrl(token);
      const img = await QRCode.toDataURL(url, { margin: 1, width: 240 });
      setQrData({ table_id: t.table_id, table_name: t.table_name, token, url });
      setQrImage(img);
    } catch (e) {
      showToast(e?.response?.data?.detail || "Failed to generate QR", "error");
      setQrOpen(false);
    } finally {
      setQrLoading(false);
    }
  };

  const copyQrLink = async () => {
    try {
      await navigator.clipboard.writeText(qrData?.url || "");
      showToast("QR link copied", "success");
    } catch {
      showToast("Copy failed", "error");
    }
  };

  const printQr = () => {
    if (!qrData?.url || !qrImage) return;
    const w = window.open("", "QR_PRINT");
    if (!w) { showToast("Allow popups to print", "warning"); return; }
    const title = `Table ${qrData.table_name || qrData.table_id}`;
    w.document.write(`
      <html><body style="font-family:Arial,sans-serif;text-align:center;padding:20px;">
        <h2 style="margin:0 0 4px">${title}</h2>
        <p style="margin:0 0 16px;font-size:12px;color:#555">Scan to view menu &amp; place order</p>
        <img src="${qrImage}" style="width:240px;height:240px;" />
        <p style="margin-top:12px;font-size:11px;color:#777;word-break:break-all">${qrData.url}</p>
      </body></html>
    `);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 200);
  };

  /* ── guards ── */
  if (hotelAllowed === null) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <div className="w-8 h-8 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" />
          <p className="text-sm">Loading table setup…</p>
        </div>
      </div>
    );
  }

  if (!hotelAllowed) {
    return (
      <div className="min-h-[40vh] flex flex-col items-center justify-center gap-4 text-center px-6">
        <MdTableRestaurant size={40} className="text-slate-300" />
        <p className="text-sm font-medium text-slate-600">
          Table management is only available for hotel billing type.
        </p>
        <BackButton to="/setup/branches" label="← Back to Branches" />
      </div>
    );
  }

  const available = tables.filter((t) => String(t.status || "").toUpperCase() === "AVAILABLE").length;
  const occupied  = tables.filter((t) => String(t.status || "").toUpperCase() === "OCCUPIED").length;

  return (
    <div className="space-y-6">

      {/* ── page header ── */}
      <div className="flex items-center gap-3">
        <BackButton to="/setup/branches" />
        <div>
          <h2 className="text-xl font-extrabold text-slate-800">Manage Tables</h2>
          <p className="text-xs text-slate-500 mt-0.5">Branch #{branchId}</p>
        </div>
      </div>

      {/* ── summary pills ── */}
      {tables.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 bg-white border rounded-2xl px-4 py-2 shadow-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
            <span className="text-sm font-semibold text-slate-700">{tables.length} total</span>
          </div>
          <div className="flex items-center gap-2 bg-white border rounded-2xl px-4 py-2 shadow-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <span className="text-sm font-semibold text-slate-700">{available} available</span>
          </div>
          <div className="flex items-center gap-2 bg-white border rounded-2xl px-4 py-2 shadow-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
            <span className="text-sm font-semibold text-slate-700">{occupied} occupied</span>
          </div>
        </div>
      )}

      {/* ── categories section ── */}
      <div className="bg-white border rounded-2xl shadow-sm p-5">
        <h3 className="text-sm font-bold text-slate-800 mb-4">Table Categories</h3>
        <div className="space-y-3">
          {categories.map(c => (
            <div key={c.category_id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
              {editingCategoryId === c.category_id ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    value={editCategoryForm.category_name}
                    onChange={(e) => setEditCategoryForm({ category_name: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && saveEditCategory()}
                    className={`${inputCls} flex-1`}
                    autoFocus
                  />
                  <button
                    onClick={saveEditCategory}
                    className="text-xs text-green-600 hover:text-green-800 font-semibold"
                  >
                    Save
                  </button>
                  <button
                    onClick={cancelEditCategory}
                    className="text-xs text-gray-600 hover:text-gray-800"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <span className="text-sm font-medium text-slate-700">{c.category_name}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => startEditCategory(c)}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteCategory(c.category_id)}
                      className="text-xs text-rose-600 hover:text-rose-800"
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <input
              placeholder="New category name"
              value={categoryForm.category_name}
              onChange={(e) => setCategoryForm({ category_name: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && addCategory()}
              className={`${inputCls} flex-1`}
            />
            <button
              onClick={addCategory}
              className="px-4 py-2 rounded-xl text-white text-sm font-semibold"
              style={{ background: BLUE }}
            >
              Add
            </button>
          </div>
        </div>
      </div>

      {/* ── add table card ── */}
      <div className="bg-white border rounded-2xl shadow-sm p-5">
        <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
          <FaPlus size={12} style={{ color: BLUE }} /> Add New Table
        </h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-semibold text-slate-500 mb-1">Table Name</label>
            <input
              placeholder="e.g. Table 1, T-01"
              value={form.table_name}
              onChange={(e) => setForm((f) => ({ ...f, table_name: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && addTable()}
              className={inputCls}
            />
          </div>
          <div className="w-28">
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              <span className="flex items-center gap-1"><FaChair size={10} /> Seats</span>
            </label>
            <input
              type="number"
              min="1"
              value={form.capacity}
              onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
              className={inputCls}
            />
          </div>
          <div className="w-40">
            <label className="block text-xs font-semibold text-slate-500 mb-1">Category</label>
            <select
              value={form.category_id}
              onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
              className={inputCls}
            >
              <option value="">No Category</option>
              {categories.map(c => (
                <option key={c.category_id} value={c.category_id}>{c.category_name}</option>
              ))}
            </select>
          </div>
          <button
            onClick={addTable}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-white text-sm font-bold transition hover:opacity-90"
            style={{ background: BLUE }}
          >
            <FaPlus size={11} /> Add Table
          </button>
        </div>
      </div>

      {/* ── table grid ── */}
      {tables.length === 0 ? (
        <div className="bg-white border rounded-2xl shadow-sm py-16 flex flex-col items-center gap-3 text-center">
          <MdTableRestaurant size={40} className="text-slate-200" />
          <p className="text-sm font-semibold text-slate-500">No tables yet</p>
          <p className="text-xs text-slate-400">Add your first table above</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {tables.map((t) => (
            <TableCard
              key={t.table_id}
              t={t}
              editingId={editingId}
              editForm={editForm}
              setEditForm={setEditForm}
              onStartEdit={startEdit}
              onSaveEdit={saveEdit}
              onCancelEdit={() => setEditingId(null)}
              onQr={(table) => openQr(table, false)}
              onDelete={requestDelete}
              confirmDeleteId={confirmDeleteId}
              categories={categories}
            />
          ))}
        </div>
      )}

      {/* ── QR modal ── */}
      <QrModal
        open={qrOpen}
        loading={qrLoading}
        qrData={qrData}
        qrImage={qrImage}
        onClose={() => setQrOpen(false)}
        onCopy={copyQrLink}
        onRegenerate={() => qrData && openQr({ table_id: qrData.table_id, table_name: qrData.table_name }, true)}
        onPrint={printQr}
      />
    </div>
  );
}
