/**
 * offlineStore.js
 *
 * File-based offline storage for the Electron desktop app.
 * When the server is unreachable:
 *   - GET  requests return the last saved snapshot from local files.
 *   - Mutations (POST/PUT/DELETE) are queued in a pending file and
 *     auto-flushed when the server becomes reachable again.
 *
 * In the browser (non-Electron), all functions are no-ops.
 */

const isElectron = () =>
  typeof window !== "undefined" && !!window.electronAPI?.localData;

/**
 * Maps API URL patterns to local storage keys.
 * Only these endpoints are snapshotted for offline use.
 */
const SNAPSHOT_MAP = [
  { pattern: /\/items(\/list)?(\/)?(\?.*)?$/, key: "items" },
  { pattern: /\/category(\/list)?(\/)?(\?.*)?$/, key: "categories" },
  { pattern: /\/tables(\/list)?/, key: "tables" },
  { pattern: /\/customers(\/list)?/, key: "customers" },
  { pattern: /\/branch\/scoped/, key: "branch" },
  { pattern: /\/shop\/details/, key: "shop_details" },
  { pattern: /\/order(\/list)?/, key: "orders" },
  { pattern: /\/pricing\/levels/, key: "pricing_levels" },
  { pattern: /\/pricing\/all/, key: "pricing_all" },
  { pattern: /\/purchase-orders(\/list)?(\/)?(\?.*)?$/, key: "purchase_orders" },
  { pattern: /\/inventory\/list/, key: "inventory" },
  { pattern: /\/suppliers(\/list)?(\/)?(\?.*)?$/, key: "suppliers" },
];

export function getSnapshotKey(url) {
  if (!url) return null;
  for (const { pattern, key } of SNAPSHOT_MAP) {
    if (pattern.test(url)) return key;
  }
  return null;
}

/** Save API response data to a local JSON file (fire-and-forget). */
export function snapshotResponse(url, data) {
  if (!isElectron()) return;
  const key = getSnapshotKey(url);
  if (!key || data == null) return;
  window.electronAPI.localData.write(key, data).catch(() => {});
}

/** Read the last saved snapshot for a given storage key. Returns null if not found. */
export async function readSnapshot(key) {
  if (!isElectron()) return null;
  try {
    return await window.electronAPI.localData.read(key);
  } catch {
    return null;
  }
}

/** Queue a failed mutation to be retried when the server is reachable. */
export async function queueMutation(method, url, data) {
  if (!isElectron()) return;
  try {
    await window.electronAPI.localData.queuePush({ method, url, data });
  } catch {
    // Ignore — best-effort queuing.
  }
}

/**
 * Flush all pending queued mutations to the server.
 * Call this once on app start when connectivity is confirmed.
 * @param {import('axios').AxiosInstance} apiInstance
 */
export async function flushPendingQueue(apiInstance) {
  if (!isElectron()) return { flushed: 0, remaining: 0 };
  try {
    const queue = await window.electronAPI.localData.queueGet();
    if (!queue || !queue.length) return { flushed: 0, remaining: 0 };

    const flushedIds = [];
    for (const item of queue) {
      try {
        const { method, url, data } = item;
        if (method === "POST") await apiInstance.post(url, data);
        else if (method === "PUT") await apiInstance.put(url, data);
        else if (method === "DELETE") await apiInstance.delete(url);
        flushedIds.push(item.id);
      } catch {
        // Stop at first failure — order matters for billing transactions.
        break;
      }
    }

    if (flushedIds.length) {
      await window.electronAPI.localData.queueRemove(flushedIds);
    }

    const remaining = queue.length - flushedIds.length;
    return { flushed: flushedIds.length, remaining };
  } catch {
    return { flushed: 0, remaining: 0 };
  }
}

/** Returns true if there are pending offline mutations waiting to sync. */
export async function hasPendingQueue() {
  if (!isElectron()) return false;
  try {
    const queue = await window.electronAPI.localData.queueGet();
    return Array.isArray(queue) && queue.length > 0;
  } catch {
    return false;
  }
}
