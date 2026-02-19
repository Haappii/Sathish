import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import authAxios from "../../api/authAxios";
import { useToast } from "../../components/Toast";
import { getSession } from "../../utils/auth";

const asId = (value) => String(value || "");
const errorDetail = (err, fallback) => err?.response?.data?.detail || fallback;

export default function Permissions() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const session = getSession() || {};
  const isAdmin = String(session?.role || "").toLowerCase() === "admin";

  if (!isAdmin) {
    return (
      <div className="mt-10 text-center text-sm font-medium text-red-600">
        You are not authorized to access this page
      </div>
    );
  }

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
        try {
          await authAxios.post("/permissions/bootstrap");
        } catch (err) {
          const msg = String(err?.response?.data?.detail || "").toLowerCase();
          if (!msg.includes("already enabled")) {
            throw err;
          }
        }
        const [rolesAfterBootstrap, permsAfterBootstrap] = await Promise.all([
          authAxios.get("/roles/"),
          authAxios.get("/permissions/"),
        ]);
        roleRows = (rolesAfterBootstrap.data || []).filter((x) => Boolean(x?.status));
        permRows = permsAfterBootstrap.data || [];
      }

      let nextRoleId = "";
      setSelectedRoleId((prev) => {
        const keepCurrent = roleRows.some((r) => asId(r.role_id) === asId(prev));
        nextRoleId = keepCurrent ? asId(prev) : asId(roleRows?.[0]?.role_id);
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

  useEffect(() => {
    if (!isAdmin) return;
    loadAll();
  }, [isAdmin, loadAll]);

  const permMap = useMemo(() => {
    const map = {};
    for (const row of perms || []) {
      const roleId = asId(row.role_id);
      map[roleId] = map[roleId] || {};
      map[roleId][row.module] = row;
    }
    return map;
  }, [perms]);

  const selectedRole = useMemo(
    () => roles.find((r) => asId(r.role_id) === asId(selectedRoleId)),
    [roles, selectedRoleId]
  );

  const filteredModules = useMemo(() => {
    const query = String(menuSearch || "").trim().toLowerCase();
    if (!query) return modules;
    return modules.filter((m) =>
      `${m.label || ""} ${m.key || ""}`.toLowerCase().includes(query)
    );
  }, [modules, menuSearch]);

  const mappedModules = useMemo(
    () =>
      modules.filter((m) => {
        const p = permMap?.[asId(selectedRoleId)]?.[m.key];
        return Boolean(p?.can_read || p?.can_write);
      }),
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
      const res = await authAxios.post("/permissions/upsert", {
        role_id: roleIdNum,
        module: moduleKey,
        can_read: Boolean(nextAccess),
        can_write: Boolean(nextAccess),
      });

      const row = res.data;
      setPerms((prev) => {
        const next = Array.isArray(prev) ? prev.slice() : [];
        const idx = next.findIndex(
          (x) => asId(x.role_id) === asId(row.role_id) && x.module === row.module
        );
        if (idx >= 0) next[idx] = row;
        else next.push(row);
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
    const hasAccess = Boolean(current?.can_read || current?.can_write);
    await upsertAccess(moduleKey, !hasAccess);
  };

  const setVisibleModuleAccess = async (nextAccess) => {
    const roleIdNum = Number(selectedRoleId);
    if (!roleIdNum || !filteredModules.length) return;
    try {
      setRoleBusy(true);
      await Promise.all(
        filteredModules.map((m) =>
          authAxios.post("/permissions/upsert", {
            role_id: roleIdNum,
            module: m.key,
            can_read: Boolean(nextAccess),
            can_write: Boolean(nextAccess),
          })
        )
      );
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
    if (!roleName) {
      showToast("Role name is required", "error");
      return;
    }

    try {
      setRoleBusy(true);
      const res = await authAxios.post("/roles/", { role_name: roleName, status: true });
      const created = res?.data;
      setNewRoleName("");
      showToast("Role created", "success");
      await loadAll();
      if (created?.role_id) {
        setRoleSelection(created.role_id);
        setEditRoleName(created.role_name || "");
      }
    } catch (err) {
      showToast(errorDetail(err, "Failed to create role"), "error");
    } finally {
      setRoleBusy(false);
    }
  };

  const updateRole = async () => {
    if (!selectedRoleId) return;

    const nextName = String(editRoleName || "").trim();
    if (!nextName) {
      showToast("Role name is required", "error");
      return;
    }
    if (nextName === String(selectedRole?.role_name || "")) {
      showToast("No changes to update", "warning");
      return;
    }

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

    const ok = window.confirm(
      `Delete role "${selectedRole.role_name}"?\nThis is allowed only when no active users are assigned.`
    );
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
      <div className="mt-10 text-center text-sm font-medium text-red-600">
        You are not authorized to access this page
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate("/setup", { replace: true })}
          className="px-3 py-1.5 rounded-lg border bg-white text-[12px] hover:bg-gray-100"
        >
          {"<-"} Back
        </button>
        <h2 className="text-lg font-semibold text-gray-700">Role Management</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border rounded bg-white p-3 space-y-3">
          <div className="text-sm font-semibold text-gray-700">Create Role</div>
          <input
            value={newRoleName}
            onChange={(e) => setNewRoleName(e.target.value)}
            placeholder="Enter new role name"
            className="w-full border rounded px-2 py-1.5 text-sm"
          />
          <button
            onClick={createRole}
            disabled={loading || roleBusy}
            className="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm disabled:opacity-60"
          >
            Create Role
          </button>
        </div>

        <div className="border rounded bg-white p-3 space-y-3">
          <div className="text-sm font-semibold text-gray-700">Existing Role</div>
          <select
            value={selectedRoleId}
            onChange={(e) => setRoleSelection(e.target.value)}
            className="w-full border rounded px-2 py-1.5 text-sm"
          >
            {!roles.length && <option value="">No roles found</option>}
            {roles.map((r) => (
              <option key={r.role_id} value={r.role_id}>
                {r.role_name}
              </option>
            ))}
          </select>

          <input
            value={editRoleName}
            onChange={(e) => setEditRoleName(e.target.value)}
            placeholder="Edit selected role name"
            className="w-full border rounded px-2 py-1.5 text-sm"
            disabled={!selectedRoleId}
          />

          <div className="flex flex-wrap gap-2">
            <button
              onClick={updateRole}
              disabled={!selectedRoleId || loading || roleBusy}
              className="px-3 py-1.5 rounded border bg-white text-sm hover:bg-gray-50 disabled:opacity-60"
            >
              Update Role
            </button>
            <button
              onClick={deleteRole}
              disabled={!selectedRoleId || loading || roleBusy}
              className="px-3 py-1.5 rounded bg-rose-600 text-white text-sm disabled:opacity-60"
            >
              Delete Role
            </button>
          </div>
        </div>
      </div>

      <div className="border rounded bg-white p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-gray-700">Menu Mapping</div>
            <div className="text-xs text-gray-500">
              {selectedRole?.role_name
                ? `Selected role: ${selectedRole.role_name}`
                : "Select a role to manage menu access"}
            </div>
          </div>
          <button
            onClick={loadAll}
            disabled={loading || roleBusy}
            className="px-3 py-1.5 rounded border bg-white text-sm hover:bg-gray-50 disabled:opacity-60"
          >
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_auto] gap-2">
          <input
            value={menuSearch}
            onChange={(e) => setMenuSearch(e.target.value)}
            placeholder="Search menu"
            className="w-full border rounded px-2 py-1.5 text-sm"
          />
          <button
            onClick={() => setVisibleModuleAccess(true)}
            disabled={!selectedRoleId || loading || roleBusy || !filteredModules.length}
            className="px-3 py-1.5 rounded border bg-white text-sm hover:bg-gray-50 disabled:opacity-60"
          >
            Map Visible Menus
          </button>
          <button
            onClick={() => setVisibleModuleAccess(false)}
            disabled={!selectedRoleId || loading || roleBusy || !filteredModules.length}
            className="px-3 py-1.5 rounded border bg-white text-sm hover:bg-gray-50 disabled:opacity-60"
          >
            Unmap Visible Menus
          </button>
        </div>

        <div className="border rounded p-2 bg-gray-50">
          <div className="text-xs font-medium text-gray-600 mb-1">
            Mapped Menus ({mappedModules.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {!mappedModules.length && (
              <span className="text-xs text-gray-500">No menu mapped for this role</span>
            )}
            {mappedModules.map((m) => (
              <span
                key={m.key}
                className="px-2 py-1 rounded text-xs bg-emerald-100 text-emerald-700"
              >
                {m.label}
              </span>
            ))}
          </div>
        </div>

        <div className="border rounded overflow-hidden">
          <div className="grid grid-cols-12 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700">
            <div className="col-span-8">Menu</div>
            <div className="col-span-4 text-center">Access</div>
          </div>

          {filteredModules.map((m) => {
            const moduleKey = m.key;
            const p = permMap?.[asId(selectedRoleId)]?.[moduleKey] || {};
            const hasAccess = Boolean(p.can_read || p.can_write);
            const busy = savingKey === `${selectedRoleId}:${moduleKey}`;

            return (
              <div
                key={moduleKey}
                className="grid grid-cols-12 px-3 py-2 border-t items-center"
              >
                <div className="col-span-8">
                  <div className="text-sm font-medium text-gray-800">{m.label}</div>
                  <div className="text-xs text-gray-500">{moduleKey}</div>
                </div>
                <div className="col-span-4 flex justify-center items-center gap-2">
                  <input
                    type="checkbox"
                    checked={hasAccess}
                    disabled={!selectedRoleId || loading || roleBusy || busy}
                    onChange={() => toggleAccess(moduleKey)}
                  />
                  <span
                    className={`text-xs font-medium ${
                      hasAccess ? "text-emerald-700" : "text-gray-500"
                    }`}
                  >
                    {hasAccess ? "Mapped" : "Not mapped"}
                  </span>
                </div>
              </div>
            );
          })}

          {loading && (
            <div className="p-3 text-sm text-gray-600 border-t">Loading...</div>
          )}
          {!loading && !filteredModules.length && (
            <div className="p-3 text-sm text-gray-600 border-t">No menus found</div>
          )}
        </div>
      </div>
    </div>
  );
}
