import { API_BASE } from "../config/api";

const isAbsoluteUrl = (v) => /^https?:\/\//i.test(String(v || ""));

export const slugifyShopName = (value) => {
  const s = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]+/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return s || "shop";
};

export const buildShopLogoFilename = (shopName, shopId) =>
  `logo_${slugifyShopName(shopName)}_${shopId}.png`;

export const resolveApiUrl = (path) => {
  const v = String(path || "").trim();
  if (!v) return "";
  if (isAbsoluteUrl(v) || v.startsWith("data:")) return v;

  // When API_BASE is absolute, resolve against it.
  if (isAbsoluteUrl(API_BASE)) {
    const base = API_BASE.endsWith("/") ? API_BASE : `${API_BASE}/`;
    return new URL(v, base).toString();
  }

  // When API_BASE is relative (eg: "/api"), prepend it to form an absolute path.
  const base = API_BASE.endsWith("/") ? API_BASE : `${API_BASE}/`;
  return `${base}${v}`;
};

export const getShopLogoUrl = (shop) => {
  const logoUrl = typeof shop?.logo_url === "string" ? shop.logo_url.trim() : "";

  // 1) DB-provided logo_url (preferred)
  if (logoUrl) {
    if (isAbsoluteUrl(logoUrl) || logoUrl.startsWith("data:")) return logoUrl;
    if (logoUrl.includes("/")) return resolveApiUrl(logoUrl);
    return resolveApiUrl(`shop-logos/${logoUrl}`);
  }

  // 2) Default file name based on shop name + id (requested behavior)
  const shopId = shop?.shop_id ?? shop?.shopId;
  const shopName = shop?.shop_name ?? shop?.shopName ?? shop?.name;
  if (!shopId || !shopName) return "";

  const filename = buildShopLogoFilename(shopName, shopId);
  return resolveApiUrl(`shop-logos/${filename}`);
};

