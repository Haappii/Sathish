import React, { useState, useEffect } from "react";
import authAxios from "../../api/authAxios";
import { useToast } from "../../components/Toast";
import BackButton from "../../components/BackButton";

export default function Categories() {
  const { showToast } = useToast();

  const [categories, setCategories] = useState([]);
  const [newCat, setNewCat] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [editingId, setEditingId] = useState(null);


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

    try {
      await authAxios.post("/category/", {
        category_name: newCat.toUpperCase(),
        category_status: true
      });

      setNewCat("");
      loadData();
      showToast("Category added", "success");

    } catch {
      showToast("Unable to add category", "error");
    }
  };


  // ---------- STATUS TOGGLE ----------
  const toggleStatus = async (cat) => {
    try {
      await authAxios.put(`/category/${cat.category_id}`, {
        category_status: !cat.category_status
      });

      loadData();
      showToast("Status updated", "success");

    } catch {
      showToast("Failed to update", "error");
    }
  };


  // ---------- OPEN EDIT POPUP ----------
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
        category_name: editForm.category_name.toUpperCase()
      });

      setEditOpen(false);
      setEditingId(null);
      loadData();
      showToast("Category updated", "success");

    } catch {
      showToast("Update failed", "error");
    }
  };


  return (
    <div className="space-y-4 text-[12px]">

      {/* HEADER */}
      <div className="flex items-center justify-between">
        <BackButton />

        <h2 className="text-lg font-bold text-gray-800">
          Category Management
        </h2>
      </div>


      {/* ADD PANEL */}
      <div className="rounded-xl border shadow bg-white p-3 flex gap-2">

        <input
          className="border rounded-lg px-2 py-1 flex-1 text-[12px]"
          placeholder="Enter new category"
          value={newCat}
          onChange={e => setNewCat(e.target.value.toUpperCase())}
        />

        <button
          onClick={addCategory}
          className="px-3 rounded-lg bg-blue-600 text-white shadow text-[12px]"
        >
          Add
        </button>
      </div>


      {/* ===== TILE GRID ===== */}
      <div className="grid grid-cols-4 gap-2">

        {categories.map(cat => (
          <div
            key={cat.category_id}
            className="rounded-xl border shadow bg-white p-3 flex flex-col justify-between"
          >

            <p className="font-semibold truncate text-[13px]">
              {cat.category_name}
            </p>

            <span className={`mt-1 px-2 py-0.5 text-[10px] rounded-full border w-fit
              ${cat.category_status
                ? "bg-green-50 text-green-700 border-green-300"
                : "bg-red-50 text-red-700 border-red-300"}`}>
              ● {cat.category_status ? "Active" : "Inactive"}
            </span>

            <div className="mt-2 flex justify-between gap-1">

              <button
                onClick={() => openEdit(cat)}
                className="px-2 py-1 border rounded-lg text-[11px]"
              >
                Edit
              </button>

              <button
                onClick={() => toggleStatus(cat)}
                className="px-2 py-1 border rounded-lg text-[11px]"
              >
                {cat.category_status ? "Disable" : "Enable"}
              </button>

            </div>
          </div>
        ))}
      </div>


      {/* ===== EDIT DRAWER ===== */}
      {editOpen && (
        <div className="fixed inset-0 bg-black/30 flex justify-end z-50">

          <div className="w-[340px] bg-white h-full shadow-2xl p-4 space-y-2">

            <h3 className="text-sm font-bold">Edit Category</h3>

            <input
              className="border rounded-lg px-2 py-1.5 text-[12px] w-full"
              value={editForm.category_name}
              onChange={e =>
                setEditForm({ ...editForm, category_name: e.target.value.toUpperCase() })}
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => { setEditOpen(false); setEditingId(null); }}
                className="px-3 py-1 border rounded-lg text-[11px]"
              >
                Cancel
              </button>

              <button
                onClick={saveEdit}
                className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-[11px]"
              >
                Save
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}



