const defaultApi = "http://127.0.0.1:8000";
const defaultWeb = "https://haappiibilling.in";

export const API_BASE = process.env.EXPO_PUBLIC_API_BASE || defaultApi;
export const WEB_APP_BASE = process.env.EXPO_PUBLIC_WEB_BASE || defaultWeb;

export const apiBaseHint = () => {
  if (process.env.EXPO_PUBLIC_API_BASE) return null;
  return "Set EXPO_PUBLIC_API_BASE to your backend URL for phone/emulator access.";
};
