import { writeSharedLocalValue } from "./sharedLocalState.js";

export const ThemeModes = {
  LIGHT: "light",
  DARK: "dark",
};

const THEME_KEY = "hb_theme";

const safeTheme = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === ThemeModes.DARK ? ThemeModes.DARK : ThemeModes.LIGHT;
};

export const getTheme = () => {
  if (typeof window === "undefined") return ThemeModes.LIGHT;
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) return safeTheme(saved);

  if (window.matchMedia?.("(prefers-color-scheme: dark)")?.matches) {
    return ThemeModes.DARK;
  }

  return ThemeModes.LIGHT;
};

export const applyTheme = (theme = ThemeModes.LIGHT) => {
  if (typeof document === "undefined") return;
  const nextTheme = safeTheme(theme);
  document.documentElement.classList.toggle("theme-dark", nextTheme === ThemeModes.DARK);
  document.documentElement.classList.toggle("theme-light", nextTheme !== ThemeModes.DARK);
};

export const setTheme = (theme) => {
  const nextTheme = safeTheme(theme);
  writeSharedLocalValue(THEME_KEY, nextTheme);
  try {
    localStorage.setItem(THEME_KEY, nextTheme);
  } catch {
    // ignore storage failures
  }
  applyTheme(nextTheme);
  return nextTheme;
};
