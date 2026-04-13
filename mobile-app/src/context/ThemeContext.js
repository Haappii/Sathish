import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const THEME_KEY = "hb_theme_preference"; // "light" | "dark" | "system"

export const THEMES = {
  light: {
    background: "#f3f6ff",
    card: "#ffffff",
    cardBorder: "#d9e3ff",
    surface: "#f8fafc",
    text: "#0b1220",
    textSub: "#64748b",
    textMuted: "#94a3b8",
    accent: "#0b57d0",
    danger: "#dc2626",
    success: "#059669",
    headerBg: "#ffffff",
    headerText: "#0b1220",
    inputBg: "#f8fafc",
    inputBorder: "#cbd5e1",
    pillBg: "#e0e7ff",
    statusBar: "dark",
    navTheme: {
      dark: false,
      colors: {
        primary: "#0b57d0",
        background: "#f3f6ff",
        card: "#ffffff",
        text: "#0b1220",
        border: "#d9e3ff",
        notification: "#ea580c",
      },
    },
  },
  dark: {
    background: "#0f172a",
    card: "#1e293b",
    cardBorder: "#334155",
    surface: "#1e293b",
    text: "#f1f5f9",
    textSub: "#94a3b8",
    textMuted: "#64748b",
    accent: "#3b82f6",
    danger: "#f87171",
    success: "#4ade80",
    headerBg: "#1e293b",
    headerText: "#f1f5f9",
    inputBg: "#0f172a",
    inputBorder: "#334155",
    pillBg: "#1e3a5f",
    statusBar: "light",
    navTheme: {
      dark: true,
      colors: {
        primary: "#3b82f6",
        background: "#0f172a",
        card: "#1e293b",
        text: "#f1f5f9",
        border: "#334155",
        notification: "#f87171",
      },
    },
  },
};

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme(); // "light" | "dark" | null
  const [preference, setPreference] = useState("system"); // user saved preference

  // Load saved preference on mount
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

  // Resolve effective theme
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
