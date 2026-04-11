import { writeSharedLocalValue } from "./sharedLocalState.js";

export const ThemeModes = {
  LIGHT: "light",
  DARK: "dark",
};

const THEME_KEY = "hb_theme";

const getSessionShopId = () => {
  if (typeof window === "undefined") return "";
  try {
    const raw = localStorage.getItem("hb_session");
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    return String(parsed?.shop_id || "").trim();
  } catch {
    return "";
  }
};

const getThemeKey = () => {
  const shopId = getSessionShopId();
  return shopId ? `${THEME_KEY}__shop_${shopId}` : `${THEME_KEY}__guest`;
};

const safeTheme = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === ThemeModes.DARK ? ThemeModes.DARK : ThemeModes.LIGHT;
};

export const getTheme = () => {
  if (typeof window === "undefined") return ThemeModes.LIGHT;
  const saved = localStorage.getItem(getThemeKey());
  if (saved) return safeTheme(saved);
  return ThemeModes.LIGHT;
};

export const applyTheme = (theme = ThemeModes.LIGHT) => {
  if (typeof document === "undefined") return;
  const nextTheme = safeTheme(theme);
  const root = document.documentElement;
  const body = document.body;

  root.classList.toggle("theme-dark", nextTheme === ThemeModes.DARK);
  root.classList.toggle("theme-light", nextTheme !== ThemeModes.DARK);
  body.classList.toggle("theme-dark", nextTheme === ThemeModes.DARK);
  body.classList.toggle("theme-light", nextTheme !== ThemeModes.DARK);
};

export const setTheme = (theme) => {
  const nextTheme = safeTheme(theme);
  writeSharedLocalValue(getThemeKey(), nextTheme);
  try {
    localStorage.setItem(getThemeKey(), nextTheme);
  } catch {
    // ignore storage failures
  }
  applyTheme(nextTheme);
  return nextTheme;
};
