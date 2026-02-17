// src/pages/setup/Branches.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../utils/apiClient";
import { useToast } from "../../components/Toast";
import BackButton from "../../components/BackButton";
import { isHotelShop } from "../../utils/shopType";
import {
  FaPlus,
  FaEdit,
  FaTable
} from "react-icons/fa";

const BLUE = "#0B3C8C";

export default function Branches() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hotelShop, setHotelShop] = useState(false);

  const emptyForm = {
    branch_name: "",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    country: "",
    pincode: "",
    type: "Branch",
    discount_enabled: false,
    discount_type: "flat",
    discount_value: 0
  };

  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  /* ===== LOAD ===== */
  const loadBranches = async () => {
    const res = await api.get("/branch/list");
    setBranches(res.data || []);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadBranches();
    api
      .get("/shop/details")
      .then((res) => setHotelShop(isHotelShop(res.data || {})))
      .catch(() => setHotelShop(false));
  }, []);

  /* ===== SAVE ===== */
  const saveBranch = async () => {
    if (!form.branch_name || !form.city || !form.country) {
      showToast("Branch Name, City & Country are required", "error");
      return;
    }

    if (form.discount_enabled) {
      const t = String(form.discount_type || "flat").toLowerCase();
      const v = Number(form.discount_value || 0);
      if (!v || v < 0) {
        showToast("Enter valid discount value", "error");
        return;
      }
      if (t === "percent" && v > 100) {
        showToast("Percent discount cannot exceed 100", "error");
        return;
      }
    }

    setLoading(true);
    try {
      if (editingId) {
        await api.put(`/branch/${editingId}`, form);
        showToast("Branch updated", "success");
      } else {
        await api.post("/branch/create", form);
        showToast("Branch created", "success");
      }

      setForm(emptyForm);
      setEditingId(null);
      loadBranches();
    } catch {
      showToast("Save failed", "error");
    }
    setLoading(false);
  };

  const editBranch = b => {
    setEditingId(b.branch_id);
    setForm({
      ...emptyForm,
      ...b,
      discount_enabled: Boolean(b?.discount_enabled),
      discount_type: (b?.discount_type || "flat").toLowerCase(),
      discount_value: Number(b?.discount_value || 0),
    });
  };

  const toggleStatus = async (id, status) => {
    try {
      await api.post(`/branch/${id}/status?status=${status}`);
      loadBranches();
    } catch {
      showToast("Status update failed", "error");
    }
  };

  return (
    <div className="space-y-6">

      {/* HEADER */}
      <div className="flex items-center gap-3">
        <BackButton />

        <h2 className="text-2xl font-extrabold" style={{ color: BLUE }}>
          Branch Management
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-6">

        {/* FORM */}
        <div className="bg-white p-6 rounded-2xl shadow">
          <h3 className="font-semibold mb-3">
            {editingId ? "Edit Branch" : "Create Branch"}
          </h3>

          <div className="grid grid-cols-2 gap-3">
            <input className="border rounded-lg px-3 py-2"
              placeholder="Branch Name *"
              value={form.branch_name}
              onChange={e => setForm({ ...form, branch_name: e.target.value })}
            />
            <select className="border rounded-lg px-3 py-2"
              value={form.type}
              onChange={e => setForm({ ...form, type: e.target.value })}
            >
              <option value="Branch">Branch</option>
              <option value="Head Office">Head Office</option>
            </select>
            <input className="border rounded-lg px-3 py-2 col-span-2"
              placeholder="City *"
              value={form.city}
              onChange={e => setForm({ ...form, city: e.target.value })}
            />
            <input className="border rounded-lg px-3 py-2 col-span-2"
              placeholder="Country *"
              value={form.country}
              onChange={e => setForm({ ...form, country: e.target.value })}
            />
          </div>

          <div className="mt-4 rounded-xl border bg-slate-50 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-800">Default Discount</div>
              <label className="flex items-center gap-2 text-[12px]">
                <input
                  type="checkbox"
                  checked={Boolean(form.discount_enabled)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      discount_enabled: e.target.checked,
                      discount_type: form.discount_type || "flat",
                      discount_value: form.discount_value ?? 0,
                    })
                  }
                />
                Enable
              </label>
            </div>

            {form.discount_enabled && (
              <div className="grid grid-cols-2 gap-3">
                <select
                  className="border rounded-lg px-3 py-2"
                  value={String(form.discount_type || "flat").toLowerCase()}
                  onChange={(e) => setForm({ ...form, discount_type: e.target.value })}
                >
                  <option value="flat">Flat</option>
                  <option value="percent">Percent %</option>
                </select>
                <input
                  type="number"
                  className="border rounded-lg px-3 py-2"
                  placeholder="Value"
                  value={form.discount_value}
                  onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
                />
              </div>
            )}
          </div>

          <button
            onClick={saveBranch}
            disabled={loading}
            className="mt-4 px-4 py-2 rounded-xl text-white flex items-center gap-2"
            style={{ background: BLUE }}
          >
            {editingId ? <FaEdit /> : <FaPlus />}
            {editingId ? "Update" : "Create"}
          </button>
        </div>

        {/* LIST */}
        <div className="bg-white p-6 rounded-2xl shadow">
          <h3 className="font-semibold mb-3">Branch List</h3>

          <table className="w-full text-sm">
            <thead className="bg-blue-50">
              <tr>
                <th className="p-2 text-left">Branch</th>
                <th className="p-2 text-left">City</th>
                <th className="p-2 text-center">Status</th>
                <th className="p-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {branches.map(b => (
                <tr key={b.branch_id} className="border-b">
                  <td className="p-2 font-semibold">{b.branch_name}</td>
                  <td className="p-2">{b.city}</td>
                  <td className="p-2 text-center">{b.status}</td>
                  <td className="p-2 flex gap-2 justify-center">
                    <button
                      onClick={() => editBranch(b)}
                      className="px-3 py-1 border rounded-full"
                    >
                      Edit
                    </button>
                    {hotelShop && (
                      <button
                        onClick={() =>
                          navigate(`/setup/branches/${b.branch_id}/tables`)
                        }
                        className="px-3 py-1 border rounded-full flex items-center gap-1"
                      >
                        <FaTable size={12} /> Tables
                      </button>
                    )}
                    <button
                      onClick={() =>
                        toggleStatus(
                          b.branch_id,
                          b.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"
                        )
                      }
                      className="px-3 py-1 border rounded-full"
                    >
                      {b.status === "ACTIVE" ? "Disable" : "Enable"}
                    </button>
                  </td>
                </tr>
              ))}

              {!branches.length && (
                <tr>
                  <td colSpan="4" className="p-4 text-center text-gray-400">
                    No branches found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}



