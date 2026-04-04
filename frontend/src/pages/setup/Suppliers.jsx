import { useEffect, useState } from "react";
import authAxios from "../../api/authAxios";
import { useToast } from "../../components/Toast";
import { getSession } from "../../utils/auth";
import BackButton from "../../components/BackButton";
import { FaPlus, FaEdit, FaTrash, FaTruck } from "react-icons/fa";
import { MdBusiness } from "react-icons/md";

const BLUE = "#0B3C8C";
const inputClass =
  "w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition";

const emptyForm = {
  supplier_name: "", phone: "", email: "", gstin: "",
  address_line1: "", address_line2: "", address_line3: "",
  city: "", state: "", pincode: "", contact_person: "", credit_terms_days: "",
};

export default function Suppliers() {
  const { showToast } = useToast();
  const session = getSession();
  const isAdmin = (session?.role || "").toLowerCase() === "admin";

  const [suppliers, setSuppliers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(session?.branch_id || "");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadSuppliers = async () => {
    try {
      const res = await authAxios.get("/suppliers/", {
        params: { branch_id: isAdmin ? branchId : undefined },
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

  useEffect(() => { loadBranches(); }, []);
  useEffect(() => { loadSuppliers(); }, [branchId]);

  const setField = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const resetForm = () => { setForm(emptyForm); setEditingId(null); };

  const saveSupplier = async () => {
    if (!form.supplier_name.trim()) return showToast("Supplier name required", "error");
    setSaving(true);
    const payload = {
      ...form,
      credit_terms_days: Number(form.credit_terms_days) || 0,
      branch_id: isAdmin ? Number(branchId || session?.branch_id) : undefined,
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
    } finally {
      setSaving(false);
    }
  };

  const editSupplier = s => {
    setEditingId(s.supplier_id);
    setForm({
      supplier_name: s.supplier_name || "", phone: s.phone || "",
      email: s.email || "", gstin: s.gstin || "",
      address_line1: s.address_line1 || "", address_line2: s.address_line2 || "",
      address_line3: s.address_line3 || "", city: s.city || "",
      state: s.state || "", pincode: s.pincode || "",
      contact_person: s.contact_person || "", credit_terms_days: s.credit_terms_days || "",
    });
  };

  const removeSupplier = async s => {
    if (!window.confirm(`Delete "${s.supplier_name}"?`)) return;
    try {
      await authAxios.delete(`/suppliers/${s.supplier_id}`);
      showToast("Supplier removed", "success");
      loadSuppliers();
    } catch {
      showToast("Delete failed", "error");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-4">
          <BackButton />
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${BLUE}15` }}>
              <FaTruck size={16} style={{ color: BLUE }} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">Supplier Management</h1>
              <p className="text-xs text-slate-500">{suppliers.length} suppliers</p>
            </div>
          </div>
          {isAdmin && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-slate-500">Branch</span>
              <select
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition"
                value={branchId}
                onChange={e => setBranchId(Number(e.target.value))}
              >
                {branches.map(b => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 xl:grid-cols-[360px,1fr] gap-6">
        {/* Form Panel */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${BLUE}15` }}>
              {editingId ? <FaEdit size={13} style={{ color: BLUE }} /> : <FaPlus size={13} style={{ color: BLUE }} />}
            </div>
            <div>
              <h2 className="font-semibold text-slate-800">{editingId ? "Edit Supplier" : "Add Supplier"}</h2>
              <p className="text-xs text-slate-500">{editingId ? "Update supplier details" : "Add a new supplier"}</p>
            </div>
          </div>

          <div className="p-5 space-y-3">
            <FormRow label="Supplier Name" required>
              <input className={inputClass} placeholder="Supplier name" value={form.supplier_name} onChange={e => setField("supplier_name", e.target.value)} />
            </FormRow>
            <div className="grid grid-cols-2 gap-3">
              <FormRow label="Phone">
                <input className={inputClass} placeholder="Phone" value={form.phone} onChange={e => setField("phone", e.target.value)} />
              </FormRow>
              <FormRow label="Email">
                <input className={inputClass} placeholder="Email" value={form.email} onChange={e => setField("email", e.target.value)} />
              </FormRow>
            </div>
            <FormRow label="GSTIN">
              <input className={inputClass} placeholder="GSTIN" value={form.gstin} onChange={e => setField("gstin", e.target.value)} />
            </FormRow>
            <FormRow label="Address Line 1">
              <input className={inputClass} placeholder="Street address" value={form.address_line1} onChange={e => setField("address_line1", e.target.value)} />
            </FormRow>
            <FormRow label="Address Line 2">
              <input className={inputClass} placeholder="Apt, landmark" value={form.address_line2} onChange={e => setField("address_line2", e.target.value)} />
            </FormRow>
            <div className="grid grid-cols-2 gap-3">
              <FormRow label="City">
                <input className={inputClass} placeholder="City" value={form.city} onChange={e => setField("city", e.target.value)} />
              </FormRow>
              <FormRow label="State">
                <input className={inputClass} placeholder="State" value={form.state} onChange={e => setField("state", e.target.value)} />
              </FormRow>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormRow label="Pincode">
                <input className={inputClass} placeholder="Pincode" value={form.pincode} onChange={e => setField("pincode", e.target.value)} />
              </FormRow>
              <FormRow label="Credit Terms (days)">
                <input type="number" className={inputClass} placeholder="0" value={form.credit_terms_days} onChange={e => setField("credit_terms_days", e.target.value)} />
              </FormRow>
            </div>
            <FormRow label="Contact Person">
              <input className={inputClass} placeholder="Contact person name" value={form.contact_person} onChange={e => setField("contact_person", e.target.value)} />
            </FormRow>
          </div>

          <div className="px-5 py-4 border-t border-slate-100 flex gap-2">
            {editingId && (
              <button onClick={resetForm} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition">
                Cancel
              </button>
            )}
            <button onClick={saveSupplier} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm hover:opacity-90 transition disabled:opacity-60" style={{ background: BLUE }}>
              {saving ? "Saving…" : editingId ? "Update Supplier" : "Add Supplier"}
            </button>
          </div>
        </div>

        {/* Supplier list */}
        <div className="space-y-3">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">
            Suppliers ({suppliers.length})
          </div>
          {suppliers.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
              <MdBusiness size={36} className="mx-auto mb-3 text-slate-300" />
              <p className="text-sm text-slate-500">No suppliers yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {suppliers.map(s => (
                <div key={s.supplier_id} className={`bg-white rounded-2xl border-2 p-4 transition ${editingId === s.supplier_id ? "border-blue-400 shadow-md" : "border-transparent border-slate-100 shadow-sm hover:border-slate-200"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold" style={{ background: `${BLUE}15`, color: BLUE }}>
                        {(s.supplier_name || "?").charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-slate-800">{s.supplier_name}</p>
                        {s.contact_person && <p className="text-xs text-slate-500">{s.contact_person}</p>}
                      </div>
                    </div>
                    {s.credit_terms_days > 0 && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-100 flex-shrink-0">
                        {s.credit_terms_days}d credit
                      </span>
                    )}
                  </div>

                  <div className="mt-3 space-y-1">
                    {(s.phone || s.email) && (
                      <p className="text-xs text-slate-500 truncate">{[s.phone, s.email].filter(Boolean).join(" · ")}</p>
                    )}
                    {(s.city || s.state) && (
                      <p className="text-xs text-slate-500">{[s.city, s.state, s.pincode].filter(Boolean).join(", ")}</p>
                    )}
                    {s.gstin && <p className="text-xs text-slate-400">GSTIN: {s.gstin}</p>}
                  </div>

                  <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
                    <button onClick={() => editSupplier(s)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition">
                      <FaEdit size={10} /> Edit
                    </button>
                    <button onClick={() => removeSupplier(s)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 transition">
                      <FaTrash size={10} /> Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FormRow({ label, required, children }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-slate-600">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
