import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../utils/apiClient";
import { useToast } from "../../components/Toast";
import {
  FaPlus,
  FaTrash,
  FaEdit,
  FaSave,
  FaTimes
} from "react-icons/fa";

const BLUE = "#0B3C8C";

export default function ManageTables() {
  const { branchId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [tables, setTables] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const [form, setForm] = useState({
    table_name: "",
    capacity: 4
  });

  const [editForm, setEditForm] = useState({
    table_name: "",
    capacity: 4
  });

  /* ================= LOAD TABLES ================= */
  const loadTables = async () => {
    try {
      const res = await api.get(`/tables/branch/${branchId}`);
      setTables(res.data || []);
    } catch {
      showToast("Failed to load tables", "error");
    }
  };

  useEffect(() => {
    loadTables();
  }, [branchId]);

  /* ================= ADD TABLE ================= */
  const addTable = async () => {
    if (!form.table_name) {
      showToast("Table name required", "error");
      return;
    }

    try {
      await api.post("/tables/create", {
        table_name: form.table_name,
        capacity: Number(form.capacity),
        branch_id: Number(branchId)
      });

      setForm({ table_name: "", capacity: 4 });
      loadTables();
      showToast("Table added", "success");
    } catch {
      showToast("Failed to add table", "error");
    }
  };

  /* ================= EDIT ================= */
  const startEdit = (t) => {
    setEditingId(t.table_id);
    setEditForm({
      table_name: t.table_name,
      capacity: t.capacity
    });
  };

  const saveEdit = async (id) => {
    if (!editForm.table_name) {
      showToast("Table name required", "error");
      return;
    }

    try {
      await api.put(`/tables/${id}`, {
        table_name: editForm.table_name,
        capacity: Number(editForm.capacity)
      });

      setEditingId(null);
      loadTables();
      showToast("Table updated", "success");
    } catch {
      showToast("Update failed", "error");
    }
  };

  /* ================= DELETE (TOAST CONFIRM) ================= */
  const requestDelete = (id) => {
    if (confirmDeleteId === id) {
      deleteTable(id);
      setConfirmDeleteId(null);
      return;
    }

    setConfirmDeleteId(id);
    showToast("Tap delete again to confirm", "error");

    setTimeout(() => {
      setConfirmDeleteId(null);
    }, 3000);
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

  return (
    <div className="space-y-6">

      {/* HEADER */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="px-3 py-2 border rounded-lg text-[12px] hover:bg-gray-50"
        >
          ← Back
        </button>

        <span className="text-lg text-slate-800">
          Manage Tables
        </span>
      </div>

      {/* ADD TABLE */}
      <div className="bg-white p-3 rounded-xl shadow flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-gray-500">Table Name</label>
          <input
            placeholder="Table 1"
            value={form.table_name}
            onChange={e =>
              setForm({ ...form, table_name: e.target.value })
            }
            className="border rounded-lg px-3 py-2 w-40"
          />
        </div>

        <div>
          <label className="text-xs text-gray-500">Seats</label>
          <input
            type="number"
            min="1"
            value={form.capacity}
            onChange={e =>
              setForm({ ...form, capacity: e.target.value })
            }
            className="border rounded-lg px-3 py-2 w-20"
          />
        </div>

        <button
          onClick={addTable}
          className="px-4 py-2 rounded-lg text-white flex items-center gap-2"
          style={{ background: BLUE }}
        >
          <FaPlus /> Add
        </button>
      </div>

      {/* TABLE CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {tables.map(t => (
          <div
            key={t.table_id}
            className="bg-white rounded-xl shadow p-3 flex flex-col gap-2"
          >
            {editingId === t.table_id ? (
              <div className="bg-slate-50 border rounded-lg p-2 space-y-2">
                <input
                  value={editForm.table_name}
                  onChange={e =>
                    setEditForm({ ...editForm, table_name: e.target.value })
                  }
                  className="border rounded px-2 py-1 w-full"
                />

                <input
                  type="number"
                  min="1"
                  value={editForm.capacity}
                  onChange={e =>
                    setEditForm({ ...editForm, capacity: e.target.value })
                  }
                  className="border rounded px-2 py-1 w-full"
                />

                <div className="flex gap-2">
                  <button
                    onClick={() => saveEdit(t.table_id)}
                    className="flex-1 bg-emerald-600 text-white py-1.5 rounded text-sm"
                  >
                    <FaSave /> Save
                  </button>

                  <button
                    onClick={() => setEditingId(null)}
                    className="flex-1 bg-gray-200 py-1.5 rounded text-sm"
                  >
                    <FaTimes /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* TABLE NAME (HIGHLIGHTED) */}
                <div className="text-[13px] font-medium text-slate-900 truncate">
                  {t.table_name}
                </div>

                <div className="text-xs text-gray-600">
                  Seats: {t.capacity}
                </div>

                <div className="flex justify-end gap-3 pt-1">
                  <button
                    onClick={() => startEdit(t)}
                    className="text-blue-700 flex items-center gap-1 text-xs"
                  >
                    <FaEdit /> Edit
                  </button>

                  <button
                    onClick={() => requestDelete(t.table_id)}
                    className={`flex items-center gap-1 text-xs ${
                      confirmDeleteId === t.table_id
                        ? "text-red-700 font-semibold"
                        : "text-red-600"
                    }`}
                  >
                    <FaTrash /> Delete
                  </button>
                </div>
              </>
            )}
          </div>
        ))}

        {!tables.length && (
          <div className="col-span-full text-center text-gray-400 py-8">
            No tables added
          </div>
        )}
      </div>
    </div>
  );
}
