import axios from "axios";

import { API_BASE } from "../config/api";
import { clearStoredSession, getStoredSession } from "../storage/session";

export const authApi = axios.create({
  baseURL: API_BASE,
  timeout: 20000,
});

const api = axios.create({
  baseURL: API_BASE,
  timeout: 20000,
});

api.interceptors.request.use(async (config) => {
  const session = await getStoredSession();
  const token = session?.access_token || session?.token || null;

  config.headers = config.headers || {};
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (session?.branch_id) config.headers["x-branch-id"] = String(session.branch_id);

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error?.response?.status === 401) {
      await clearStoredSession();
    }
    return Promise.reject(error);
  }
);

export default api;
