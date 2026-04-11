const defaultApi = "https://haappiibilling.in/api";
const defaultWeb = "https://haappiibilling.in";

const normalize = (v) => String(v || "").replace(/\/+$/, "");

export const API_BASE = normalize(process.env.EXPO_PUBLIC_API_BASE || defaultApi);
export const WEB_APP_BASE = process.env.EXPO_PUBLIC_WEB_BASE || defaultWeb;

export const apiBaseHint = () => {
  if (process.env.EXPO_PUBLIC_API_BASE) return null;
  return "Set EXPO_PUBLIC_API_BASE to your backend URL for phone/emulator access.";
};
