import axios from "axios";

import { API_BASE } from "../config/api";
import { clearStoredSession, getStoredSession } from "../storage/session";

export const authApi = axios.create({
  baseURL: API_BASE,
  timeout: 20000,
});

const SERVER_ACTIVITY_SYNC_MS = 60 * 1000;
let lastServerActivitySync = 0;
let activitySyncPromise = null;

let unauthorizedHandler = null;

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = typeof handler === "function" ? handler : null;
}

function shouldSkipActivitySync(config = {}) {
  const url = String(config?.url || "");
  if (!url) return false;
  return url.includes("/auth/login") || url.includes("/auth/logout") || url.includes("/auth/ping");
}

function syncSessionActivity(token) {
  const now = Date.now();
  if (now - lastServerActivitySync < SERVER_ACTIVITY_SYNC_MS) return;
  if (activitySyncPromise) return;

  lastServerActivitySync = now;
  activitySyncPromise = authApi
    .post("/auth/ping", null, {
      headers: { Authorization: `Bearer ${token}` },
    })
    .catch(() => {})
    .finally(() => {
      activitySyncPromise = null;
    });
}

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

  if (token && !shouldSkipActivitySync(config)) {
    syncSessionActivity(token);
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error?.response?.status === 401) {
      await clearStoredSession();
      if (unauthorizedHandler) unauthorizedHandler();
    }
    return Promise.reject(error);
  }
);

export default api;
