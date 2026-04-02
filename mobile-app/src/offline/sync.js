/**
 * Offline Sync — processes the offline queue and uploads bills to the server.
 * Call syncOfflineQueue() whenever the app comes back online.
 */
import api from "../api/client";
import { getPendingQueue, removeFromQueue, markAsFailed } from "./queue";

const MAX_RETRIES = 3;

/**
 * Try to sync all pending offline bills.
 * @returns {{ synced: number, failed: number }}
 */
export async function syncOfflineQueue() {
  const queue = await getPendingQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (const entry of queue) {
    try {
      await api.post("/invoice/", entry.payload);
      await removeFromQueue(entry.id);
      synced++;
    } catch (err) {
      const status = err?.response?.status;

      // 4xx errors (bad payload) → move to failed permanently
      if (status && status >= 400 && status < 500) {
        await markAsFailed(entry, `HTTP ${status}: ${err?.response?.data?.detail || err.message}`);
        failed++;
      } else {
        // Network/5xx → increment retry count; remove if too many retries
        entry.retries = (entry.retries || 0) + 1;
        if (entry.retries >= MAX_RETRIES) {
          await markAsFailed(entry, "Max retries exceeded");
          failed++;
        }
        // else leave in queue for next sync attempt
      }
    }
  }

  return { synced, failed };
}

/**
 * Quick connectivity check — tries to reach the API health endpoint.
 * Returns true if online, false if offline.
 */
export async function checkOnline() {
  try {
    await api.get("/health", { timeout: 5000 });
    return true;
  } catch (err) {
    // If we got an HTTP response (even 404), the server is reachable
    if (err?.response) return true;
    return false;
  }
}
