import axios from "axios";

export const API_BASE = "http://13.60.186.234:8000/api";

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
