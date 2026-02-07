import axios from "axios";

const normalizeBaseUrl = (value) => String(value || "").replace(/\/+$/, "");

// Vite build-time env var (set this in Amplify/CI as well)
// Example: VITE_API_BASE=https://api.example.com/api
const envBase =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_BACKEND_URL;

// Fallback kept for local/legacy usage.
// For production HTTPS (Amplify), set `VITE_API_BASE` to an HTTPS endpoint
// like `https://api.example.com/api` (or `/api` only if you have a proxy).
const fallbackBase = "http://13.60.186.234:8000/api";

export const API_BASE = normalizeBaseUrl(envBase || fallbackBase);

export const getApiBaseIssue = () => {
  if (typeof window === "undefined") return null;
  const pageIsHttpsRuntime = window.location?.protocol === "https:";
  const apiIsHttp = API_BASE.startsWith("http://");
  if (pageIsHttpsRuntime && apiIsHttp) {
    return (
      `API_BASE is HTTP (${API_BASE}) but this page is HTTPS. ` +
      "Browsers block mixed-content requests; use an HTTPS API endpoint " +
      "and set VITE_API_BASE accordingly."
    );
  }
  return null;
};

const apiBaseIssue = getApiBaseIssue();
if (apiBaseIssue) console.warn(`[API] ${apiBaseIssue}`);

const api = axios.create({
  baseURL: API_BASE,
});

// 🔹 Attach token automatically
api.interceptors.request.use(config => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
