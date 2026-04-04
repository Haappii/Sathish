import { useCallback, useEffect, useMemo, useState } from "react";
import authAxios from "../../api/authAxios";
import { useToast } from "../../components/Toast";
import { getSession } from "../../utils/auth";
import { FaPlus, FaEdit, FaTrash, FaShieldAlt } from "react-icons/fa";
import BackButton from "../../components/BackButton";

const BLUE = "#0B3C8C";
const inputClass =
  "w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition";

const asId = (value) => String(value || "");
const errorDetail = (err, fallback) => err?.response?.data?.detail || fallback;

export default function Permissions() {
  const { showToast } = useToast();
  const session = getSession() || {};
  const isAdmin = String(session?.role || "").toLowerCase() === "admin";

  const [modules, setModules] = useState([]);
  const [roles, setRoles] = useState([]);
  const [perms, setPerms] = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [newRoleName, setNewRoleName] = useState("");
  const [editRoleName, setEditRoleName] = useState("");
  const [menuSearch, setMenuSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [roleBusy, setRoleBusy] = useState(false);
  const [savingKey, setSavingKey] = useState("");

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const [moduleRes, roleRes, enabledRes, permRes] = await Promise.all([
        authAxios.get("/permissions/modules"),
        authAxios.get("/roles/"),
        authAxios.get("/permissions/enabled"),
        authAxios.get("/permissions/"),
      ]);
      let roleRows = (roleRes.data || []).filter((x) => Boolean(x?.status));
      let permRows = permRes.data || [];
      const moduleRows = moduleRes.data || [];

      if (!enabledRes?.data?.enabled) {
        try { await authAxios.post("/permissions/bootstrap"); } catch (err) {
          const msg = String(err?.response?.data?.detail || "").toLowerCase();
          if (!msg.includes("already enabled")) throw err;
        }
        const [rolesAfter, permsAfter] = await Promise.all([authAxios.get("/roles/"), authAxios.get("/permissions/")]);
        roleRows = (rolesAfter.data || []).filter((x) => Boolean(x?.status));
        permRows = permsAfter.data || [];
      }

      let nextRoleId = "";
      setSelectedRoleId((prev) => {
        const keep = roleRows.some((r) => asId(r.role_id) === asId(prev));
        nextRoleId = keep ? asId(prev) : asId(roleRows?.[0]?.role_id);
        return nextRoleId;
      });
      const nextRole = roleRows.find((r) => asId(r.role_id) === asId(nextRoleId));
      setEditRoleName(nextRole?.role_name || "");
      setRoles(roleRows);
      setModules(moduleRows);
      setPerms(permRows);
    } catch (err) {
      showToast(errorDetail(err, "Failed to load role mappings"), "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { if (!isAdmin) return; loadAll(); }, [isAdmin, loadAll]);

  const permMap = useMemo(() => {
    const map = {};
    for (const row of perms || []) {
      const roleId = asId(row.role_id);
      map[roleId] = map[roleId] || {};
      map[roleId][row.module] = row;
    }
    return map;
  }, [perms]);

  const selectedRole = useMemo(() => roles.find((r) => asId(r.role_id) === asId(selectedRoleId)), [roles, selectedRoleId]);

  const filteredModules = useMemo(() => {
    const query = String(menuSearch || "").trim().toLowerCase();
    if (!query) return modules;
    return modules.filter((m) => `${m.label || ""} ${m.key || ""}`.toLowerCase().includes(query));
  }, [modules, menuSearch]);

  const mappedModules = useMemo(() =>
    modules.filter((m) => { const p = permMap?.[asId(selectedRoleId)]?.[m.key]; return Boolean(p?.can_read || p?.can_write); }),
    [modules, permMap, selectedRoleId]
  );

  const setRoleSelection = (nextId) => {
    const roleId = asId(nextId);
    setSelectedRoleId(roleId);
    const row = roles.find((r) => asId(r.role_id) === roleId);
    setEditRoleName(row?.role_name || "");
  };

  const upsertAccess = async (moduleKey, nextAccess) => {
    const roleIdNum = Number(selectedRoleId);
    if (!roleIdNum || !moduleKey) return;
    try {
      setSavingKey(`${selectedRoleId}:${moduleKey}`);
      const res = await authAxios.post("/permissions/upsert", { role_id: roleIdNum, module: moduleKey, can_read: Boolean(nextAccess), can_write: Boolean(nextAccess) });
      const row = res.data;
      setPerms((prev) => {
        const next = Array.isArray(prev) ? prev.slice() : [];
        const idx = next.findIndex((x) => asId(x.role_id) === asId(row.role_id) && x.module === row.module);
        if (idx >= 0) next[idx] = row; else next.push(row);
        return next;
      });
    } catch (err) {
      showToast(errorDetail(err, "Failed to update menu access"), "error");
    } finally {
      setSavingKey("");
    }
  };

  const toggleAccess = async (moduleKey) => {
    const current = permMap?.[asId(selectedRoleId)]?.[moduleKey];
    await upsertAccess(moduleKey, !Boolean(current?.can_read || current?.can_write));
  };

  const setVisibleModuleAccess = async (nextAccess) => {
    const roleIdNum = Number(selectedRoleId);
    if (!roleIdNum || !filteredModules.length) return;
    try {
      setRoleBusy(true);
      await Promise.all(filteredModules.map((m) => authAxios.post("/permissions/upsert", { role_id: roleIdNum, module: m.key, can_read: Boolean(nextAccess), can_write: Boolean(nextAccess) })));
      showToast(nextAccess ? "Menus mapped" : "Menus unmapped", "success");
      await loadAll();
    } catch (err) {
      showToast(errorDetail(err, "Failed to update menu mapping"), "error");
    } finally {
      setRoleBusy(false);
    }
  };

  const createRole = async () => {
    const roleName = String(newRoleName || "").trim();
    if (!roleName) { showToast("Role name is required", "error"); return; }
    try {
      setRoleBusy(true);
      const res = await authAxios.post("/roles/", { role_name: roleName, status: true });
      const created = res?.data;
      setNewRoleName("");
      showToast("Role created", "success");
      await loadAll();
      if (created?.role_id) { setRoleSelection(created.role_id); setEditRoleName(created.role_name || ""); }
    } catch (err) {
      showToast(errorDetail(err, "Failed to create role"), "error");
    } finally {
      setRoleBusy(false);
    }
  };

  const updateRole = async () => {
    if (!selectedRoleId) return;
    const nextName = String(editRoleName || "").trim();
    if (!nextName) { showToast("Role name is required", "error"); return; }
    if (nextName === String(selectedRole?.role_name || "")) { showToast("No changes to update", "warning"); return; }
    try {
      setRoleBusy(true);
      await authAxios.put(`/roles/${selectedRoleId}`, { role_name: nextName });
      showToast("Role updated", "success");
      await loadAll();
      setRoleSelection(selectedRoleId);
    } catch (err) {
      showToast(errorDetail(err, "Failed to update role"), "error");
    } finally {
      setRoleBusy(false);
    }
  };

  const deleteRole = async () => {
    if (!selectedRoleId || !selectedRole) return;
    const ok = window.confirm(`Delete role "${selectedRole.role_name}"?\nThis is allowed only when no active users are assigned.`);
    if (!ok) return;
    try {
      setRoleBusy(true);
      await authAxios.delete(`/roles/${selectedRoleId}`);
      showToast("Role deleted", "success");
      await loadAll();
    } catch (err) {
      showToast(errorDetail(err, "Failed to delete role"), "error");
    } finally {
      setRoleBusy(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl border border-red-100 p-8 text-center max-w-sm">
          <FaShieldAlt size={32} className="mx-auto mb-3 text-red-400" />
          <p className="font-semibold text-slate-800">Access Denied</p>
          <p className="text-sm text-slate-500 mt-1">You are not authorized to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-4">
          <BackButton />
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${BLUE}15` }}>
              <FaShieldAlt size={16} style={{ color: BLUE }} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">Role & Permission Management</h1>
              <p className="text-xs text-slate-500">Control what each role can access</p>
            </div>
          </div>
          <button onClick={loadAll} disabled={loading || roleBusy} className="ml-auto px-4 py-2 rounded-xl text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition disabled:opacity-60">
            Refresh
          </button>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Top: Create + Edit Role */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Create Role */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
              <FaPlus size={13} style={{ color: BLUE }} />
              <span className="font-semibold text-sm text-slate-800">Create New Role</span>
            </div>
            <div className="p-5 flex gap-3">
              <input value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} placeholder="Enter role name" className={inputClass} onKeyDown={e => e.key === "Enter" && createRole()} />
              <button onClick={createRole} disabled={loading || roleBusy} className="px-5 py-2.5 rounded-xl text-white text-sm font-semibold shadow-sm hover:opacity-90 transition disabled:opacity-60 whitespace-nowrap" style={{ background: BLUE }}>
                Create
              </button>
            </div>
          </div>

          {/* Manage Role */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
              <FaEdit size={13} style={{ color: BLUE }} />
              <span className="font-semibold text-sm text-slate-800">Manage Role</span>
            </div>
            <div className="p-5 space-y-3">
              <select value={selectedRoleId} onChange={(e) => setRoleSelection(e.target.value)} className={inputClass}>
                {!roles.length && <option value="">No roles found</option>}
                {roles.map((r) => <option key={r.role_id} value={r.role_id}>{r.role_name}</option>)}
              </select>
              <div className="flex gap-2">
                <input value={editRoleName} onChange={(e) => setEditRoleName(e.target.value)} placeholder="Rename role" className={inputClass} disabled={!selectedRoleId} />
                <button onClick={updateRole} disabled={!selectedRoleId || loading || roleBusy} className="px-4 py-2.5 rounded-xl text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50 transition disabled:opacity-60 whitespace-nowrap">
                  Rename
                </button>
                <button onClick={deleteRole} disabled={!selectedRoleId || loading || roleBusy} className="px-4 py-2.5 rounded-xl text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100 transition disabled:opacity-60 flex items-center gap-1.5">
                  <FaTrash size={11} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Menu Mapping */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-sm text-slate-800">Menu Access</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {selectedRole?.role_name ? `Managing: ${selectedRole.role_name}` : "Select a role above"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">{mappedModules.length} mapped</span>
              </div>
            </div>
          </div>

          {/* Mapped badges */}
          {mappedModules.length > 0 && (
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex flex-wrap gap-1.5">
              {mappedModules.map((m) => (
                <span key={m.key} className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">{m.label}</span>
              ))}
            </div>
          )}

          {/* Search + bulk actions */}
          <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input value={menuSearch} onChange={(e) => setMenuSearch(e.target.value)} placeholder="Search menus…" className="w-full border border-slate-200 rounded-xl pl-8 pr-4 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition" />
            </div>
            <button onClick={() => setVisibleModuleAccess(true)} disabled={!selectedRoleId || loading || roleBusy || !filteredModules.length} className="px-4 py-2 rounded-xl text-sm font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition disabled:opacity-60">
              Map All Visible
            </button>
            <button onClick={() => setVisibleModuleAccess(false)} disabled={!selectedRoleId || loading || roleBusy || !filteredModules.length} className="px-4 py-2 rounded-xl text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100 transition disabled:opacity-60">
              Unmap All Visible
            </button>
          </div>

          {/* Module list */}
          <div className="divide-y divide-slate-100">
            {loading && <div className="p-4 text-sm text-slate-500 text-center">Loading…</div>}
            {!loading && !filteredModules.length && <div className="p-4 text-sm text-slate-500 text-center">No menus found</div>}
            {!loading && filteredModules.map((m) => {
              const p = permMap?.[asId(selectedRoleId)]?.[m.key] || {};
              const hasAccess = Boolean(p.can_read || p.can_write);
              const busy = savingKey === `${selectedRoleId}:${m.key}`;
              return (
                <label key={m.key} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 cursor-pointer transition">
                  <div>
                    <div className="text-sm font-medium text-slate-800">{m.label}</div>
                    <div className="text-xs text-slate-400">{m.key}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-medium ${hasAccess ? "text-emerald-700" : "text-slate-400"}`}>
                      {busy ? "Saving…" : hasAccess ? "Mapped" : "Not mapped"}
                    </span>
                    <div className="relative flex-shrink-0" onClick={() => !busy && selectedRoleId && toggleAccess(m.key)}>
                      <div className={`w-10 h-5 rounded-full transition-colors ${hasAccess ? "bg-blue-600" : "bg-slate-200"} ${busy || !selectedRoleId ? "opacity-50" : ""}`} />
                      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${hasAccess ? "translate-x-5" : "translate-x-0.5"}`} />
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
