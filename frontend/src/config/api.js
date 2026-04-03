import axios from "axios";

const normalizeBaseUrl = (value) => String(value || "").replace(/\/+$/, "");

const isLocalHost = () => {
  if (typeof window === "undefined") return false;
  const h = String(window.location?.hostname || "").toLowerCase();
  return h === "localhost" || h === "127.0.0.1";
};

// Vite build-time env var (set this in Amplify/CI as well)
// Example: VITE_API_BASE=https://api.example.com/api
const envBase =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_BACKEND_URL;

// When running inside the Electron desktop app, main.js injects the actual
// server URL via preload.js so the frontend can reach the real backend even
// when the offline bundle is served from a local 127.0.0.1 server.
const electronServerUrl = (() => {
  try {
    const raw = typeof window !== "undefined" && /** @type {any} */ (window).electronAPI?.serverUrl;
    if (!raw) return null;
    const u = new URL(String(raw));
    // Derive the API base from the server origin (nginx proxies /api/ to backend)
    return `${u.protocol}//${u.host}/api`;
  } catch {
    return null;
  }
})();

// Fallback kept for local/legacy usage.
// For production HTTPS (Amplify), set `VITE_API_BASE` to an HTTPS endpoint
// like `https://api.example.com/api` (or `/api` only if you have a proxy).
const fallbackBase = (() => {
  if (typeof window === "undefined") return "http://localhost:8000/api";

  // If frontend is served from the backend (same port), use same-origin /api.
  if (String(window.location?.port || "") === "8000") {
    return `${window.location.origin}/api`;
  }

  // For non-localhost production hosting behind Nginx/Apache, prefer same-origin /api.
  if (!isLocalHost()) {
    return `${window.location.origin}/api`;
  }

  // Default local/dev: frontend on :5173, backend on :8000.
  const proto = window.location?.protocol || "http:";
  const host = window.location?.hostname || "localhost";
  return `${proto}//${host}:8000/api`;
})();

// Local dev override:
// When running the frontend on http://localhost:5173, it's very common to want
// the backend on http://localhost:8000 even if the build env has a remote base.
const envLocalBase = import.meta.env.VITE_API_BASE_LOCAL;

// Priority: Electron-injected server URL > env var > fallback
const runtimeBase = electronServerUrl
  || (isLocalHost() ? (envLocalBase || fallbackBase) : (envBase || fallbackBase));

export const API_BASE = normalizeBaseUrl(runtimeBase);

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
