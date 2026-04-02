/**
 * Offline Cache — stores items, categories, and customers in AsyncStorage
 * so the app can work without a network connection.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEYS = {
  ITEMS:      "hb_cache_items",
  CATEGORIES: "hb_cache_categories",
  CUSTOMERS:  "hb_cache_customers",
  CACHED_AT:  "hb_cache_timestamp",
};

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── Helpers ──────────────────────────────────────────────────────────────────

async function write(key, data) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Silently ignore storage errors
  }
}

async function read(key) {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function cacheItems(items) {
  await write(KEYS.ITEMS, items);
  await write(KEYS.CACHED_AT, Date.now());
}

export async function cacheCategories(categories) {
  await write(KEYS.CATEGORIES, categories);
}

export async function cacheCustomers(customers) {
  await write(KEYS.CUSTOMERS, customers);
}

export async function getCachedItems() {
  return (await read(KEYS.ITEMS)) || [];
}

export async function getCachedCategories() {
  return (await read(KEYS.CATEGORIES)) || [];
}

export async function getCachedCustomers() {
  return (await read(KEYS.CUSTOMERS)) || [];
}

/** True if cache exists and was refreshed within TTL */
export async function isCacheValid() {
  const ts = await read(KEYS.CACHED_AT);
  if (!ts) return false;
  return Date.now() - Number(ts) < TTL_MS;
}

/** Return when the cache was last refreshed, as a human string */
export async function getCacheAge() {
  const ts = await read(KEYS.CACHED_AT);
  if (!ts) return "never";
  const mins = Math.round((Date.now() - Number(ts)) / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

export async function clearCache() {
  await AsyncStorage.multiRemove(Object.values(KEYS));
}
