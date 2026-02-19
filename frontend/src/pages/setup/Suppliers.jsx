import { useEffect, useState } from "react";
import authAxios from "../../api/authAxios";
import { useToast } from "../../components/Toast";
import { getSession } from "../../utils/auth";
import BackButton from "../../components/BackButton";

export default function Suppliers() {
  const { showToast } = useToast();
  const session = getSession();
  const isAdmin = (session?.role || "").toLowerCase() === "admin";

  const [suppliers, setSuppliers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(session?.branch_id || "");

  const [form, setForm] = useState({
    supplier_name: "",
    phone: "",
    email: "",
    gstin: "",
    address_line1: "",
    address_line2: "",
    address_line3: "",
    city: "",
    state: "",
    pincode: "",
    contact_person: "",
    credit_terms_days: ""
  });

  const [editingId, setEditingId] = useState(null);

  const loadSuppliers = async () => {
    try {
      const res = await authAxios.get("/suppliers/", {
        params: { branch_id: isAdmin ? branchId : undefined }
      });
      setSuppliers(res.data || []);
    } catch {
      showToast("Failed to load suppliers", "error");
    }
  };

  const loadBranches = async () => {
    if (!isAdmin) return;
    try {
      const res = await authAxios.get("/branch/active");
      setBranches(res.data || []);
    } catch {}
  };

  useEffect(() => {
    loadBranches();
  }, []);

  useEffect(() => {
    loadSuppliers();
  }, [branchId]);

  const resetForm = () => {
    setForm({
      supplier_name: "",
      phone: "",
      email: "",
      gstin: "",
      address_line1: "",
      address_line2: "",
      address_line3: "",
      city: "",
      state: "",
      pincode: "",
      contact_person: "",
      credit_terms_days: ""
    });
    setEditingId(null);
  };

  const saveSupplier = async () => {
    if (!form.supplier_name.trim()) {
      return showToast("Supplier name required", "error");
    }

    const payload = {
      ...form,
      credit_terms_days: Number(form.credit_terms_days) || 0,
      branch_id: isAdmin ? Number(branchId || session?.branch_id) : undefined
    };

    try {
      if (editingId) {
        await authAxios.put(`/suppliers/${editingId}`, payload);
        showToast("Supplier updated", "success");
      } else {
        await authAxios.post("/suppliers/", payload);
        showToast("Supplier added", "success");
      }
      resetForm();
      loadSuppliers();
    } catch {
      showToast("Save failed", "error");
    }
  };

  const editSupplier = s => {
    setEditingId(s.supplier_id);
    setForm({
      supplier_name: s.supplier_name || "",
      phone: s.phone || "",
      email: s.email || "",
      gstin: s.gstin || "",
      address_line1: s.address_line1 || "",
      address_line2: s.address_line2 || "",
      address_line3: s.address_line3 || "",
      city: s.city || "",
      state: s.state || "",
      pincode: s.pincode || "",
      contact_person: s.contact_person || "",
      credit_terms_days: s.credit_terms_days || ""
    });
  };

  const removeSupplier = async s => {
    try {
      await authAxios.delete(`/suppliers/${s.supplier_id}`);
      showToast("Supplier removed", "success");
      loadSuppliers();
    } catch {
      showToast("Delete failed", "error");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <BackButton />
        <h2 className="text-lg font-bold text-slate-800">Supplier Management</h2>
      </div>

      {isAdmin && (
        <div className="flex items-center gap-2 text-[12px]">
          <span className="text-slate-600">Branch</span>
          <select
            className="border rounded-lg px-2 py-1.5 text-[12px]"
            value={branchId}
            onChange={e => setBranchId(Number(e.target.value))}
          >
            {branches.map(b => (
              <option key={b.branch_id} value={b.branch_id}>
                {b.branch_name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-1 rounded-xl border bg-white p-4 space-y-2">
          <h3 className="text-sm font-semibold">
            {editingId ? "Edit Supplier" : "Add Supplier"}
          </h3>

          <input
            className="border rounded-lg px-2 py-1.5 text-[12px] w-full"
            placeholder="Supplier Name"
            value={form.supplier_name}
            onChange={e => setForm({ ...form, supplier_name: e.target.value })}
          />
          <input
            className="border rounded-lg px-2 py-1.5 text-[12px] w-full"
            placeholder="Phone"
            value={form.phone}
            onChange={e => setForm({ ...form, phone: e.target.value })}
          />
          <input
            className="border rounded-lg px-2 py-1.5 text-[12px] w-full"
            placeholder="Email"
            value={form.email}
            onChange={e => setForm({ ...form, email: e.target.value })}
          />
          <input
            className="border rounded-lg px-2 py-1.5 text-[12px] w-full"
            placeholder="GSTIN"
            value={form.gstin}
            onChange={e => setForm({ ...form, gstin: e.target.value })}
          />
          <input
            className="border rounded-lg px-2 py-1.5 text-[12px] w-full"
            placeholder="Address Line 1"
            value={form.address_line1}
            onChange={e => setForm({ ...form, address_line1: e.target.value })}
          />
          <input
            className="border rounded-lg px-2 py-1.5 text-[12px] w-full"
            placeholder="Address Line 2"
            value={form.address_line2}
            onChange={e => setForm({ ...form, address_line2: e.target.value })}
          />
          <input
            className="border rounded-lg px-2 py-1.5 text-[12px] w-full"
            placeholder="City"
            value={form.city}
            onChange={e => setForm({ ...form, city: e.target.value })}
          />
          <input
            className="border rounded-lg px-2 py-1.5 text-[12px] w-full"
            placeholder="State"
            value={form.state}
            onChange={e => setForm({ ...form, state: e.target.value })}
          />
          <input
            className="border rounded-lg px-2 py-1.5 text-[12px] w-full"
            placeholder="Pincode"
            value={form.pincode}
            onChange={e => setForm({ ...form, pincode: e.target.value })}
          />
          <input
            className="border rounded-lg px-2 py-1.5 text-[12px] w-full"
            placeholder="Contact Person"
            value={form.contact_person}
            onChange={e => setForm({ ...form, contact_person: e.target.value })}
          />
          <input
            type="number"
            className="border rounded-lg px-2 py-1.5 text-[12px] w-full"
            placeholder="Credit Terms (days)"
            value={form.credit_terms_days}
            onChange={e => setForm({ ...form, credit_terms_days: e.target.value })}
          />

          <div className="flex justify-end gap-2 pt-2">
            {editingId && (
              <button
                onClick={resetForm}
                className="px-3 py-1 border rounded-lg text-[12px]"
              >
                Cancel
              </button>
            )}
            <button
              onClick={saveSupplier}
              className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-[12px]"
            >
              {editingId ? "Update" : "Save"}
            </button>
          </div>
        </div>

        <div className="col-span-2 rounded-xl border bg-white p-3">
          <div className="grid grid-cols-2 gap-2">
            {suppliers.map(s => (
              <div key={s.supplier_id} className="border rounded-xl p-3">
                <div className="font-semibold text-[12px]">{s.supplier_name}</div>
                <div className="text-[11px] text-slate-500">
                  {s.phone || "-"} - {s.email || "-"}
                </div>
                <div className="text-[11px] text-slate-500">
                  {s.city || ""} {s.state || ""} {s.pincode || ""}
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => editSupplier(s)}
                    className="px-2 py-1 border rounded-lg text-[11px]"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => removeSupplier(s)}
                    className="px-2 py-1 border rounded-lg text-[11px] text-red-600"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}



