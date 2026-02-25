import authAxios from "../api/authAxios";

export const OFFLINE_BILLS_KEY = "offline_bills_v1";

const safeParse = (raw) => {
  try {
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};

export const getOfflineBills = () => safeParse(localStorage.getItem(OFFLINE_BILLS_KEY));

export const saveOfflineBills = (rows) => {
  try {
    localStorage.setItem(OFFLINE_BILLS_KEY, JSON.stringify(rows || []));
  } catch {
    // ignore quota issues
  }
};

export const addOfflineBill = (payload) => {
  const rows = getOfflineBills();
  const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  rows.unshift({
    id,
    createdAt: new Date().toISOString(),
    payload,
    attempts: 0,
    lastAttemptAt: null,
    lastError: null,
  });
  saveOfflineBills(rows);
  return id;
};

export const removeOfflineBill = (id) => {
  const next = getOfflineBills().filter((r) => r.id !== id);
  saveOfflineBills(next);
  return next;
};

export const updateOfflineBill = (id, patch = {}) => {
  const next = getOfflineBills().map((r) =>
    r.id === id ? { ...r, ...patch } : r
  );
  saveOfflineBills(next);
  return next;
};

export const clearOfflineBills = () => saveOfflineBills([]);

export const hasPendingOfflineBills = () => getOfflineBills().length > 0;

let syncLock = false;

export const syncOfflineBills = async ({
  ids = null,
  showToast = null,
} = {}) => {
  if (syncLock) return { ok: true, synced: 0, failed: 0, skipped: true };
  if (!navigator.onLine) return { ok: false, synced: 0, failed: 0, skipped: true, reason: "offline" };

  const rows = getOfflineBills();
  const target = ids ? rows.filter((r) => ids.includes(r.id)) : rows;
  if (!target.length) return { ok: true, synced: 0, failed: 0 };

  syncLock = true;
  let synced = 0;
  let failed = 0;

  for (const row of target) {
    try {
      const nowIso = new Date().toISOString();
      updateOfflineBill(row.id, { lastAttemptAt: nowIso });
      await authAxios.post("/invoice/", row.payload);
      removeOfflineBill(row.id);
      synced += 1;
      if (typeof showToast === "function") {
        showToast(`Synced bill ${row?.payload?.customer_name || ""}`.trim(), "success");
      }
    } catch (err) {
      failed += 1;
      const msg = err?.response?.data?.detail || err?.message || "Sync failed";
      updateOfflineBill(row.id, {
        attempts: Number(row.attempts || 0) + 1,
        lastAttemptAt: new Date().toISOString(),
        lastError: msg,
      });
      if (typeof showToast === "function") {
        showToast(msg, "error");
      }
    }
  }

  syncLock = false;
  return { ok: failed === 0, synced, failed };
};
