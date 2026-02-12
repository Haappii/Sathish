import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import authAxios from "../../api/authAxios";
import { useToast } from "../../components/Toast";
import { getSession } from "../../utils/auth";

export default function Permissions() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const session = getSession() || {};
  const roleLower = (session?.role || "").toString().toLowerCase();
  const isAdmin = roleLower === "admin";

  const [modules, setModules] = useState([]);
  const [roles, setRoles] = useState([]);
  const [enabled, setEnabled] = useState(false);
  const [perms, setPerms] = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState(null);

  const loadAll = async () => {
    try {
      setLoading(true);
      const [m, r, e, p] = await Promise.all([
        authAxios.get("/permissions/modules"),
        authAxios.get("/roles/"),
        authAxios.get("/permissions/enabled"),
        authAxios.get("/permissions/"),
      ]);

      const roleRows = (r.data || []).filter((x) => Boolean(x?.status));
      setModules(m.data || []);
      setRoles(roleRows);
      setEnabled(Boolean(e.data?.enabled));
      setPerms(p.data || []);
      setSelectedRoleId((prev) => prev || String(roleRows?.[0]?.role_id || ""));
    } catch {
      showToast("Failed to load permissions", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    loadAll();
  }, [isAdmin]);

  const permMap = useMemo(() => {
    const map = {};
    for (const p of perms || []) {
      const roleId = String(p.role_id);
      map[roleId] = map[roleId] || {};
      map[roleId][p.module] = p;
    }
    return map;
  }, [perms]);

  const selectedRole = roles.find((r) => String(r.role_id) === String(selectedRoleId));
  const selectedRoleName = selectedRole?.role_name || "";

  const upsert = async (moduleKey, next) => {
    const roleIdNum = Number(selectedRoleId);
    if (!roleIdNum || !moduleKey) return;

    try {
      setSavingKey(`${selectedRoleId}:${moduleKey}`);
      const res = await authAxios.post("/permissions/upsert", {
        role_id: roleIdNum,
        module: moduleKey,
        can_read: Boolean(next.can_read),
        can_write: Boolean(next.can_write),
      });

      const row = res.data;
      setPerms((prev) => {
        const list = Array.isArray(prev) ? prev.slice() : [];
        const idx = list.findIndex(
          (x) => String(x.role_id) === String(row.role_id) && x.module === row.module
        );
        if (idx >= 0) list[idx] = row;
        else list.push(row);
        return list;
      });
    } catch {
      showToast("Failed to save permission", "error");
    } finally {
      setSavingKey(null);
    }
  };

  const toggle = async (moduleKey, field) => {
    const cur =
      permMap?.[String(selectedRoleId)]?.[moduleKey] || {
        can_read: false,
        can_write: false,
      };

    const next = { ...cur };
    if (field === "can_read") {
      next.can_read = !Boolean(cur.can_read);
      if (!next.can_read) next.can_write = false;
    }
    if (field === "can_write") {
      next.can_write = !Boolean(cur.can_write);
      if (next.can_write) next.can_read = true;
    }

    await upsert(moduleKey, next);
  };

  const bootstrap = async () => {
    if (!window.confirm("Enable permissions using default settings?")) return;
    try {
      setLoading(true);
      await authAxios.post("/permissions/bootstrap");
      showToast("Permissions enabled", "success");
      await loadAll();
    } catch (e) {
      showToast(e?.response?.data?.detail || "Failed to enable permissions", "error");
    } finally {
      setLoading(false);
    }
  };

  const disable = async () => {
    if (!window.confirm("Disable permissions and revert to default role access?")) return;
    try {
      setLoading(true);
      await authAxios.post("/permissions/disable");
      showToast("Permissions disabled", "success");
      await loadAll();
    } catch (e) {
      showToast(e?.response?.data?.detail || "Failed to disable permissions", "error");
    } finally {
      setLoading(false);
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
          ← Back
        </button>
        <h2 className="text-lg font-semibold text-gray-700">Permissions (RBAC)</h2>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`px-2 py-1 rounded text-xs font-semibold ${
            enabled ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"
          }`}
        >
          {enabled ? "Enabled" : "Not enabled"}
        </span>

        {!enabled ? (
          <button
            onClick={bootstrap}
            disabled={loading}
            className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm disabled:opacity-60"
          >
            Enable (Bootstrap)
          </button>
        ) : (
          <button
            onClick={disable}
            disabled={loading}
            className="px-3 py-1.5 rounded bg-red-600 text-white text-sm disabled:opacity-60"
          >
            Disable
          </button>
        )}

        <button
          onClick={loadAll}
          disabled={loading}
          className="px-3 py-1.5 rounded border bg-white text-sm hover:bg-gray-50 disabled:opacity-60"
        >
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm font-medium text-gray-700">Role</label>
        <select
          value={selectedRoleId}
          onChange={(e) => setSelectedRoleId(String(e.target.value))}
          className="border rounded px-2 py-1"
        >
          {roles.map((r) => (
            <option key={r.role_id} value={r.role_id}>
              {r.role_name}
            </option>
          ))}
        </select>

        <span className="text-xs text-gray-500">
          {selectedRoleName ? `Editing: ${selectedRoleName}` : ""}
        </span>
      </div>

      {!enabled && (
        <div className="text-sm text-gray-600 border rounded bg-white p-3">
          Permissions are not enabled yet. Click{" "}
          <span className="font-semibold">Enable (Bootstrap)</span> to create role-module rows.
        </div>
      )}

      <div className="border rounded bg-white overflow-hidden">
        <div className="grid grid-cols-12 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700">
          <div className="col-span-6">Module</div>
          <div className="col-span-3 text-center">Read</div>
          <div className="col-span-3 text-center">Write</div>
        </div>

        {modules.map((m) => {
          const moduleKey = m.key;
          const p = permMap?.[String(selectedRoleId)]?.[moduleKey] || {};
          const canRead = Boolean(p.can_read);
          const canWrite = Boolean(p.can_write);
          const busy = savingKey === `${selectedRoleId}:${moduleKey}`;

          return (
            <div
              key={moduleKey}
              className="grid grid-cols-12 px-3 py-2 border-t items-center"
            >
              <div className="col-span-6">
                <div className="text-sm font-medium text-gray-800">{m.label}</div>
                <div className="text-xs text-gray-500">{moduleKey}</div>
              </div>

              <div className="col-span-3 flex justify-center">
                <input
                  type="checkbox"
                  checked={canRead}
                  disabled={!enabled || busy}
                  onChange={() => toggle(moduleKey, "can_read")}
                />
              </div>

              <div className="col-span-3 flex justify-center">
                <input
                  type="checkbox"
                  checked={canWrite}
                  disabled={!enabled || busy}
                  onChange={() => toggle(moduleKey, "can_write")}
                />
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="p-3 text-sm text-gray-600 border-t">Loading…</div>
        )}
      </div>
    </div>
  );
}

