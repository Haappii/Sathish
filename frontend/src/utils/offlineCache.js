// Simple localStorage-based cache for master data to enable offline billing.
// We keep everything under a single key to reduce quota overhead.

const CACHE_KEY = "hb_offline_cache_v1";

const readCache = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeCache = (data) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data || {}));
  } catch {
    // ignore quota errors silently; offline will just miss cache
  }
};

const keyFor = (key, branchId = null) =>
  branchId ? `${key}__${branchId}` : key;

export const cacheEntries = {
  shop: "shop",
  categories: "categories",
  items: "items",
  priceLevels: "price_levels",
  priceMap: "price_map",
  branch: "branch",
  stock: "stock",
};

export const saveCacheEntry = (key, data, branchId = null) => {
  const cache = readCache();
  cache[keyFor(key, branchId)] = {
    data,
    updatedAt: Date.now(),
  };
  writeCache(cache);
};

export const getCacheEntry = (key, branchId = null) => {
  const cache = readCache();
  const entry = cache[keyFor(key, branchId)];
  return entry ? entry.data : null;
};

export const clearOfflineCache = () => {
  localStorage.removeItem(CACHE_KEY);
};

export const getCachedMasterData = (branchId = null) => {
  const shop = getCacheEntry(cacheEntries.shop);
  const branch = branchId ? getCacheEntry(cacheEntries.branch, branchId) : null;
  const categories = getCacheEntry(cacheEntries.categories) || [];
  const items = getCacheEntry(cacheEntries.items) || [];
  const priceLevels = getCacheEntry(cacheEntries.priceLevels) || ["BASE"];
  const priceMap = getCacheEntry(cacheEntries.priceMap) || {};
  const stock = branchId ? getCacheEntry(cacheEntries.stock, branchId) || [] : [];

  const hasAny =
    Boolean(shop) ||
    Boolean(branch) ||
    categories.length > 0 ||
    items.length > 0 ||
    stock.length > 0;

  return {
    shop,
    branch,
    categories,
    items,
    priceLevels,
    priceMap,
    stock,
    hasAny,
  };
};

export const cacheMasterData = ({
  shop = null,
  branchId = null,
  branch = null,
  categories = null,
  items = null,
  priceLevels = null,
  priceMap = null,
  stock = null,
} = {}) => {
  if (shop) saveCacheEntry(cacheEntries.shop, shop);
  if (branch && branchId) saveCacheEntry(cacheEntries.branch, branch, branchId);
  if (categories) saveCacheEntry(cacheEntries.categories, categories);
  if (items) saveCacheEntry(cacheEntries.items, items);
  if (priceLevels) saveCacheEntry(cacheEntries.priceLevels, priceLevels);
  if (priceMap) saveCacheEntry(cacheEntries.priceMap, priceMap);
  if (stock && branchId) saveCacheEntry(cacheEntries.stock, stock, branchId);
};
