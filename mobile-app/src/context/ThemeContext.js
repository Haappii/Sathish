import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const THEME_KEY = "hb_theme_preference"; // "light" | "dark" | "system"

export const THEMES = {
  light: {
    background: "#f0f4ff",
    card: "#ffffff",
    cardBorder: "#dde6f7",
    surface: "#f6f8fe",
    text: "#0c1228",
    textSub: "#4a5a78",
    textMuted: "#8896ae",
    accent: "#2563eb",
    accentLight: "#eff4ff",
    gold: "#b87008",
    goldLight: "#fef3c7",
    danger: "#dc2626",
    dangerLight: "#fef2f2",
    success: "#059669",
    successLight: "#ecfdf5",
    warning: "#d97706",
    warningLight: "#fffbeb",
    headerBg: "#0c1228",
    headerText: "#ffffff",
    inputBg: "#f6f8fe",
    inputBorder: "#d0dcf0",
    pillBg: "#e0eaff",
    statusBar: "light",
    navTheme: {
      dark: false,
      colors: {
        primary: "#2563eb",
        background: "#f0f4ff",
        card: "#ffffff",
        text: "#0c1228",
        border: "#dde6f7",
        notification: "#dc2626",
      },
    },
  },
  dark: {
    background: "#07101e",
    card: "#0e1a2e",
    cardBorder: "#192840",
    surface: "#0e1a2e",
    text: "#e6ecf8",
    textSub: "#7a8fa8",
    textMuted: "#4a5a72",
    accent: "#4a8ef5",
    accentLight: "#0d1d35",
    gold: "#f0a820",
    goldLight: "#2a1e05",
    danger: "#f87171",
    dangerLight: "#2d1010",
    success: "#34d399",
    successLight: "#0a2218",
    warning: "#fbbf24",
    warningLight: "#241a04",
    headerBg: "#07101e",
    headerText: "#e6ecf8",
    inputBg: "#081020",
    inputBorder: "#192840",
    pillBg: "#0d1d35",
    statusBar: "light",
    navTheme: {
      dark: true,
      colors: {
        primary: "#4a8ef5",
        background: "#07101e",
        card: "#0e1a2e",
        text: "#e6ecf8",
        border: "#192840",
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
