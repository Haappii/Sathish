import axios from "axios";

const normalizeBaseUrl = (value) => String(value || "").replace(/\/+$/, "");

// Vite build-time env var (set this in Amplify/CI as well)
// Example: VITE_API_BASE=https://api.example.com/api
const envBase = import.meta.env.VITE_API_BASE;

// Fallback kept for local/legacy usage
const fallbackBase = "http://13.60.186.234:8000/api";

export const API_BASE = normalizeBaseUrl(envBase || fallbackBase);

// Helpful warning: https frontend cannot call http backend (mixed content)
if (typeof window !== "undefined") {
  const pageIsHttps = window.location?.protocol === "https:";
  const apiIsHttp = API_BASE.startsWith("http://");
  if (pageIsHttps && apiIsHttp) {
    console.warn(
      `[API] API_BASE is HTTP (${API_BASE}) but this page is HTTPS. ` +
        "Browsers block mixed-content requests; use an HTTPS API endpoint " +
        "and set VITE_API_BASE accordingly."
    );
  }
}

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
