import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const THEME_KEY = "hb_theme_preference";

export const THEMES = {
  light: {
    background: "#f4f6fb",
    card: "#ffffff",
    cardBorder: "#e4e9f2",
    cardElevated: "#ffffff",
    surface: "#f8f9fd",
    surfaceAlt: "#eef1f8",
    text: "#0a0f1e",
    textSub: "#4b5563",
    textMuted: "#9ca3af",
    accent: "#6366f1",
    accentSoft: "#818cf8",
    accentLight: "#eef2ff",
    accentGlow: "rgba(99,102,241,0.25)",
    secondary: "#f97316",
    secondaryLight: "#fff7ed",
    gold: "#d97706",
    goldLight: "#fef3c7",
    danger: "#ef4444",
    dangerLight: "#fef2f2",
    success: "#10b981",
    successLight: "#ecfdf5",
    warning: "#f59e0b",
    warningLight: "#fffbeb",
    info: "#0ea5e9",
    infoLight: "#f0f9ff",
    headerBg: "#0a0f1e",
    headerText: "#ffffff",
    inputBg: "#f8f9fd",
    inputBorder: "#d1d5db",
    inputFocus: "#6366f1",
    pillBg: "#eef2ff",
    divider: "#e5e7eb",
    overlay: "rgba(0,0,0,0.4)",
    shadow: "#0a0f1e",
    gradient1: "#6366f1",
    gradient2: "#8b5cf6",
    gradient3: "#a855f7",
    tileIcon: "#6366f1",
    tileBg: "#ffffff",
    statusBar: "light",
    navTheme: {
      dark: false,
      colors: {
        primary: "#6366f1",
        background: "#f4f6fb",
        card: "#ffffff",
        text: "#0a0f1e",
        border: "#e4e9f2",
        notification: "#ef4444",
      },
    },
  },
  dark: {
    background: "#050810",
    card: "#0c1220",
    cardBorder: "#1a2240",
    cardElevated: "#111830",
    surface: "#0c1220",
    surfaceAlt: "#111830",
    text: "#f0f2f8",
    textSub: "#8892a8",
    textMuted: "#4a5268",
    accent: "#818cf8",
    accentSoft: "#6366f1",
    accentLight: "#0f1535",
    accentGlow: "rgba(129,140,248,0.2)",
    secondary: "#fb923c",
    secondaryLight: "#1a1008",
    gold: "#fbbf24",
    goldLight: "#1a1505",
    danger: "#f87171",
    dangerLight: "#1a0808",
    success: "#34d399",
    successLight: "#081a12",
    warning: "#fbbf24",
    warningLight: "#1a1505",
    info: "#38bdf8",
    infoLight: "#081520",
    headerBg: "#050810",
    headerText: "#f0f2f8",
    inputBg: "#0c1220",
    inputBorder: "#1a2240",
    inputFocus: "#818cf8",
    pillBg: "#0f1535",
    divider: "#1a2240",
    overlay: "rgba(0,0,0,0.6)",
    shadow: "#000000",
    gradient1: "#6366f1",
    gradient2: "#7c3aed",
    gradient3: "#a855f7",
    tileIcon: "#818cf8",
    tileBg: "#0c1220",
    statusBar: "light",
    navTheme: {
      dark: true,
      colors: {
        primary: "#818cf8",
        background: "#050810",
        card: "#0c1220",
        text: "#f0f2f8",
        border: "#1a2240",
        notification: "#f87171",
      },
    },
  },
};

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState("system");

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY)
      .then((val) => {
        if (val === "light" || val === "dark" || val === "system") {
          setPreference(val);
        }
      })
      .catch(() => {});
  }, []);

  const savePreference = useCallback(async (pref) => {
    setPreference(pref);
    try {
      await AsyncStorage.setItem(THEME_KEY, pref);
    } catch {}
  }, []);

  const effectiveTheme = useMemo(() => {
    if (preference === "system") {
      return systemScheme === "dark" ? "dark" : "light";
    }
    return preference;
  }, [preference, systemScheme]);

  const theme = THEMES[effectiveTheme];

  const value = useMemo(
    () => ({ theme, preference, effectiveTheme, setPreference: savePreference }),
    [theme, preference, effectiveTheme, savePreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
