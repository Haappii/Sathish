import React, { useEffect, useState } from "react";
import authAxios from "../../api/authAxios";
import { useToast } from "../../components/Toast";
import BackButton from "../../components/BackButton";

export default function Users() {
  const { showToast } = useToast();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [branches, setBranches] = useState([]);
  const [search, setSearch] = useState("");

  const [form, setForm] = useState({
    user_id: null,
    user_name: "",
    password: "",
    name: "",
    role: "",
    branch_id: "",
    status: true
  });

  const [showForm, setShowForm] = useState(false);


  // ---------- LOAD ----------
  const loadData = async () => {
    try {
      const u = await authAxios.get("/users/");
      const r = await authAxios.get("/roles/");
      const b = await authAxios.get("/branch/list");

      setUsers(u.data || []);
      setRoles(r.data || []);
      setBranches(b.data || []);

    } catch {
      showToast("Failed to load users", "error");
    }
  };

  useEffect(() => { loadData(); }, []);


  // ---------- FILTER ----------
  const filtered = users.filter(u =>
    (u?.user_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (u?.name || "").toLowerCase().includes(search.toLowerCase())
  );


  // ---------- SAVE ----------
  const saveUser = async () => {
    if (!form.user_name) return showToast("Username required", "error");

    try {
      const payload = {
        user_name: form.user_name,
        password: form.password || undefined,
        name: form.name,
        role: Number(form.role) || null,
        status: form.status,
        branch_id: Number(form.branch_id) || null
      };

      if (form.user_id)
        await authAxios.put(`/users/${form.user_id}`, payload);
      else
        await authAxios.post("/users/", payload);

      setShowForm(false);
      setForm({
        user_id: null, user_name: "", password: "",
        name: "", role: "", branch_id: "", status: true
      });

      loadData();
      showToast("User saved", "success");

    } catch {
      showToast("Failed to save user", "error");
    }
  };


  // ---------- EDIT ----------
  const editUser = (u) => {
    setForm({
      user_id: u.user_id,
      user_name: u.user_name,
      password: "",
      name: u.name || "",
      role: u.role || "",
      branch_id: u.branch_id || "",
      status: u.status ?? true
    });
    setShowForm(true);
  };


  // ---------- TOGGLE STATUS ----------
  const toggleStatus = async (u) => {
    try {
      await authAxios.put(`/users/${u.user_id}`, { status: !u.status });

      loadData();
      showToast("User status updated", "success");

    } catch {
      showToast("Failed to update status", "error");
    }
  };


  return (
    <div className="space-y-4 text-[12px]">

      {/* HEADER */}
      <div className="flex justify-between items-center">
        <BackButton />

        <h2 className="text-lg font-bold text-emerald-700">
          User Management
        </h2>

        <button
          onClick={() => setShowForm(true)}
          className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg shadow"
        >
          Add User
        </button>
      </div>


      {/* SEARCH */}
      <input
        className="border rounded-lg px-2 py-1.5 w-64 shadow-sm"
        placeholder="Search user..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />


      {/* ===== TILE GRID ===== */}
      <div className="grid grid-cols-4 gap-2">

        {filtered.map(u => {

          const roleName =
            roles.find(r => r.role_id === u.role)?.role_name || "—";

          const branchName =
            branches.find(b => b.branch_id === u.branch_id)?.branch_name || "—";

          return (
            <div
              key={u.user_id}
              className="rounded-xl border shadow bg-white p-3 flex flex-col justify-between"
            >

              <div>
                <p className="font-semibold text-[13px] truncate">
                  {u.user_name}
                </p>

                <p className="text-gray-600 text-[11px] truncate">
                  {u.name || "—"}
                </p>

                <div className="mt-1 flex gap-1 flex-wrap">

                  <span className="px-2 py-0.5 text-[10px] rounded-full border bg-blue-50 text-blue-700">
                    {roleName}
                  </span>

                  <span className="px-2 py-0.5 text-[10px] rounded-full border bg-amber-50 text-amber-700">
                    {branchName}
                  </span>

                  <span className={`px-2 py-0.5 text-[10px] rounded-full border
                    ${u.status
                      ? "bg-green-50 text-green-700 border-green-300"
                      : "bg-red-50 text-red-700 border-red-300"}`}>
                    ● {u.status ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>


              <div className="mt-2 flex justify-between">
                <button
                  onClick={() => editUser(u)}
                  className="px-2 py-1 border rounded-lg text-[11px]"
                >
                  Edit
                </button>

                <button
                  onClick={() => toggleStatus(u)}
                  className="px-2 py-1 border rounded-lg text-[11px]"
                >
                  {u.status ? "Disable" : "Enable"}
                </button>
              </div>

            </div>
          );
        })}


        {filtered.length === 0 && (
          <p className="col-span-4 text-center text-gray-400 py-4">
            No users found
          </p>
        )}

      </div>


      {/* ===== POPUP FORM ===== */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex justify-center items-center z-50">

          <div className="bg-white rounded-2xl p-4 w-[420px] shadow-2xl space-y-2">

            <h3 className="text-sm font-bold">
              {form.user_id ? "Edit User" : "Add User"}
            </h3>

            <input
              className="w-full border rounded-lg px-2 py-1.5"
              placeholder="Username"
              value={form.user_name}
              onChange={e => setForm({ ...form, user_name: e.target.value })}
            />

            <input
              type="password"
              className="w-full border rounded-lg px-2 py-1.5"
              placeholder="Password"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
            />

            <input
              className="w-full border rounded-lg px-2 py-1.5"
              placeholder="Full Name"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
            />


            <select
              className="w-full border rounded-lg px-2 py-1.5"
              value={form.role}
              onChange={e => setForm({ ...form, role: e.target.value })}
            >
              <option value="">Select Role</option>
              {roles.map(r => (
                <option key={r.role_id} value={r.role_id}>
                  {r.role_name}
                </option>
              ))}
            </select>


            <select
              className="w-full border rounded-lg px-2 py-1.5"
              value={form.branch_id}
              onChange={e => setForm({ ...form, branch_id: e.target.value })}
            >
              <option value="">Select Branch</option>
              {branches.map(b => (
                <option key={b.branch_id} value={b.branch_id}>
                  {b.branch_name}
                </option>
              ))}
            </select>


            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setShowForm(false)}
                className="px-3 py-1 border rounded-lg text-[11px]"
              >
                Cancel
              </button>

              <button
                onClick={saveUser}
                className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-[11px]"
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



