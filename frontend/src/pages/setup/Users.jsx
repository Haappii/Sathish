import React, { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import authAxios from "../../api/authAxios";
import { useToast } from "../../components/Toast";
import BackButton from "../../components/BackButton";
import { getSession } from "../../utils/auth";
import { FaPlus, FaEdit, FaUserCircle, FaFileExcel } from "react-icons/fa";
import { MdPeople } from "react-icons/md";

const BLUE = "#0B3C8C";
const inputClass =
  "w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition";

export default function Users() {
  const { showToast } = useToast();
  const session = getSession() || {};
  const roleLower = (session?.role || "").toString().toLowerCase();
  const isAdmin = roleLower === "admin";
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [branches, setBranches] = useState([]);
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const xlsxRef = useRef(null);

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
        user_name: String(r["user_name"] || r["Username"] || r["username"] || "").trim(),
        full_name: String(r["full_name"] || r["Full Name"] || r["name"] || "").trim() || undefined,
        password: String(r["password"] || r["Password"] || "").trim() || undefined,
        role_name: String(r["role_name"] || r["Role"] || r["role"] || "").trim(),
        branch_name: String(r["branch_name"] || r["Branch"] || r["branch"] || "").trim() || undefined,
      })).filter(r => r.user_name && r.role_name);
      if (!rows.length) return showToast("No valid rows found in file", "error");
      const res = await authAxios.post("/users/bulk-import", rows);
      showToast(`Done — ${res.data.inserted} inserted, ${res.data.updated} updated${res.data.errors?.length ? `, ${res.data.errors.length} errors` : ""}`, "success");
      loadData();
    } catch (err) {
      showToast(err?.response?.data?.detail || "Import failed", "error");
    } finally {
      setImporting(false);
    }
  };

  const emptyForm = {
    user_id: null, user_name: "", password: "",
    name: "", role: "", branch_id: "", status: true,
  };
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);

  const loadData = async () => {
    try {
      const [u, r, b] = await Promise.all([
        authAxios.get("/users/"),
        authAxios.get("/roles/active"),
        authAxios.get("/branch/scoped"),
      ]);
      setUsers(u.data || []);
      const roleRows = (r.data || []).filter((x) => Boolean(x?.status));
      setRoles(isAdmin ? roleRows : roleRows.filter((x) => (x?.role_name || "").toLowerCase() !== "admin"));
      setBranches(b.data || []);
    } catch {
      showToast("Failed to load users", "error");
    }
  };

  useEffect(() => { loadData(); }, []);

  const filtered = users.filter(u =>
    (u?.user_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (u?.name || "").toLowerCase().includes(search.toLowerCase())
  );

  const saveUser = async () => {
    if (!form.user_name) return showToast("Username required", "error");
    try {
      const forcedBranchId = isAdmin ? form.branch_id : (session?.branch_id ?? form.branch_id);
      const payload = {
        user_name: form.user_name, password: form.password || undefined,
        name: form.name, role: Number(form.role) || null,
        status: form.status, branch_id: Number(forcedBranchId) || null,
      };
      if (form.user_id) await authAxios.put(`/users/${form.user_id}`, payload);
      else await authAxios.post("/users/", payload);
      setShowForm(false);
      setForm(emptyForm);
      loadData();
      showToast("User saved", "success");
    } catch {
      showToast("Failed to save user", "error");
    }
  };

  const editUser = (u) => {
    setForm({
      user_id: u.user_id, user_name: u.user_name, password: "",
      name: u.name || "", role: u.role || "",
      branch_id: isAdmin ? (u.branch_id || "") : (session?.branch_id || u.branch_id || ""),
      status: u.status ?? true,
    });
    setShowForm(true);
  };

  const toggleStatus = async (u) => {
    try {
      await authAxios.put(`/users/${u.user_id}`, { status: !u.status });
      loadData();
      showToast("User status updated", "success");
    } catch {
      showToast("Failed to update status", "error");
    }
  };

  const activeCount = users.filter(u => u.status).length;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-4">
          <BackButton />
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${BLUE}15` }}>
              <MdPeople size={20} style={{ color: BLUE }} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">User Management</h1>
              <p className="text-xs text-slate-500">{users.length} total · {activeCount} active</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <input ref={xlsxRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleExcelImport} />
            <button
              onClick={() => xlsxRef.current?.click()}
              disabled={importing}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition disabled:opacity-60"
            >
              <FaFileExcel size={13} />
              {importing ? "Importing…" : "Import Excel"}
            </button>
            <button
              onClick={() => { setForm(emptyForm); setShowForm(true); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-medium shadow-sm hover:opacity-90 transition"
              style={{ background: BLUE }}
            >
              <FaPlus size={12} /> Add User
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Search */}
        <div className="relative max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            className="w-full border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition"
            placeholder="Search users…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
            <FaUserCircle size={36} className="mx-auto mb-3 text-slate-300" />
            <p className="text-sm text-slate-500">{search ? "No users match your search" : "No users yet"}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {filtered.map(u => {
              const roleName = roles.find(r => r.role_id === u.role)?.role_name || "—";
              const branchName = branches.find(b => b.branch_id === u.branch_id)?.branch_name || "—";
              return (
                <div key={u.user_id} className={`bg-white rounded-2xl border-2 p-4 flex flex-col gap-3 transition ${u.status ? "border-slate-100 hover:border-slate-200" : "border-slate-100 opacity-60"}`}>
                  <div className="flex flex-col items-center gap-2 text-center">
                    <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-base font-bold" style={{ background: `${BLUE}15`, color: BLUE }}>
                      {(u.user_name || "?").charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-slate-800 truncate max-w-[120px]">{u.user_name}</p>
                      <p className="text-xs text-slate-500 truncate max-w-[120px]">{u.name || "—"}</p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 text-center truncate">{roleName}</span>
                    <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100 text-center truncate">{branchName}</span>
                    <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border text-center ${u.status ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-red-50 text-red-600 border-red-100"}`}>
                      {u.status ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => editUser(u)} className="flex-1 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition flex items-center justify-center gap-1">
                      <FaEdit size={10} /> Edit
                    </button>
                    <button onClick={() => toggleStatus(u)} className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition ${u.status ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}>
                      {u.status ? "Disable" : "Enable"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${BLUE}15` }}>
                {form.user_id ? <FaEdit size={13} style={{ color: BLUE }} /> : <FaPlus size={13} style={{ color: BLUE }} />}
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">{form.user_id ? "Edit User" : "Add User"}</h3>
                <p className="text-xs text-slate-500">{form.user_id ? "Update user details" : "Create a new user account"}</p>
              </div>
            </div>
            <div className="p-6 space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">Username <span className="text-red-400">*</span></label>
                <input className={inputClass} placeholder="username" value={form.user_name} onChange={e => setForm({ ...form, user_name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">Password {form.user_id && <span className="text-slate-400 font-normal">(leave blank to keep current)</span>}</label>
                <input type="password" className={inputClass} placeholder="••••••••" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">Full Name</label>
                <input className={inputClass} placeholder="Full name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600">Role</label>
                  <select className={inputClass} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                    <option value="">Select Role</option>
                    {roles.map(r => <option key={r.role_id} value={r.role_id}>{r.role_name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600">Branch</label>
                  {isAdmin ? (
                    <select className={inputClass} value={form.branch_id} onChange={e => setForm({ ...form, branch_id: e.target.value })}>
                      <option value="">Select Branch</option>
                      {branches.map(b => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}
                    </select>
                  ) : (
                    <div className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-500 bg-slate-50">
                      {session?.branch_name || "Current branch"}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition">Cancel</button>
              <button onClick={saveUser} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm hover:opacity-90 transition" style={{ background: BLUE }}>
                {form.user_id ? "Update User" : "Create User"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
