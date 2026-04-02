/**
 * Offline Queue — stores bills created while offline.
 * Each entry is a full invoice payload that will be sent to /invoice/ when back online.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const QUEUE_KEY  = "hb_offline_queue";
const FAILED_KEY = "hb_offline_failed";

// ── Internal helpers ──────────────────────────────────────────────────────────

async function readQueue(key) {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeQueue(key, data) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Ignore storage errors
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Add an invoice payload to the offline queue.
 * Returns the local id assigned to this entry.
 */
export async function enqueueInvoice(payload) {
  const queue = await readQueue(QUEUE_KEY);
  const entry = {
    id: `offline_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    payload,
    queuedAt: new Date().toISOString(),
    retries: 0,
  };
  queue.push(entry);
  await writeQueue(QUEUE_KEY, queue);
  return entry.id;
}

/** Return all pending offline entries */
export async function getPendingQueue() {
  return readQueue(QUEUE_KEY);
}

/** Return count of pending items */
export async function getPendingCount() {
  const q = await readQueue(QUEUE_KEY);
  return q.length;
}

/** Remove a successfully synced entry */
export async function removeFromQueue(id) {
  const queue = await readQueue(QUEUE_KEY);
  await writeQueue(QUEUE_KEY, queue.filter((e) => e.id !== id));
}

/** Move a permanently failed entry out of the main queue */
export async function markAsFailed(entry, error) {
  await removeFromQueue(entry.id);
  const failed = await readQueue(FAILED_KEY);
  failed.push({ ...entry, failedAt: new Date().toISOString(), error: String(error) });
  await writeQueue(FAILED_KEY, failed);
}

/** Return entries that permanently failed to sync */
export async function getFailedQueue() {
  return readQueue(FAILED_KEY);
}

export async function clearFailedQueue() {
  await AsyncStorage.removeItem(FAILED_KEY);
}
