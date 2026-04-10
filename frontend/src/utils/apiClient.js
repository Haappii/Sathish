// src/utils/apiClient.js

import axios from "axios";
import { API_BASE, getApiBaseIssue } from "../config/api";
import { getSession, clearSession } from "./auth";
import { snapshotResponse, getSnapshotKey, readSnapshot, queueMutation } from "./offlineStore";

const api = axios.create({
  baseURL: API_BASE,
  timeout: 20000,
});

const shouldQueueMutation = (url = "") =>
  !/^\/auth\/(login|logout|ping|set-branch)(\/|$)/i.test(String(url || ""));

/* =========================
   REQUEST INTERCEPTOR
========================= */
api.interceptors.request.use(
  (config) => {
    const apiIssue = getApiBaseIssue();
    if (apiIssue) return Promise.reject(new Error(apiIssue));

    const session = getSession();
    config.headers = config.headers || {};
    config.params = config.params || {};

    const roleLower = (session?.role || "").toString().toLowerCase();
    const isAdmin = roleLower === "admin";

    // Support both session and localStorage token names.
    const token =
      session?.access_token ||
      session?.token ||
      localStorage.getItem("token") ||
      localStorage.getItem("access_token") ||
      null;

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Let backend decide auth validity.
    if (session?.branch_id) {
      config.headers["x-branch-id"] = session.branch_id;
    }

    // Enforce branch scope for non-admin users only.
    if (!isAdmin) {
      if (
        session?.branch_id &&
        Object.prototype.hasOwnProperty.call(config.params, "branch_id")
      ) {
        config.params.branch_id = session.branch_id;
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

/* =========================
   RESPONSE INTERCEPTOR
========================= */
api.interceptors.response.use(
  (response) => {
    // On every successful GET: snapshot the data to a local file (Electron only, fire-and-forget).
    // This keeps the local file store fresh so it's ready if the server goes offline.
    if (response.config?.method === "get") {
      snapshotResponse(response.config.url, response.data);
    }
    return response;
  },
  async (error) => {
    const status = error?.response?.status;

    // 401 — session expired, force logout.
    if (status === 401) {
      clearSession();
      window.location.replace("/");
      return Promise.reject(error);
    }

    // Network error (no response at all) — server is unreachable.
    if (!error.response && error.config) {
      const method = (error.config.method || "").toLowerCase();
      const url = error.config.url || "";

      // GET: return the last saved snapshot so the UI still renders offline.
      if (method === "get") {
        const key = getSnapshotKey(url);
        if (key) {
          const cached = await readSnapshot(key);
          if (cached != null) {
            return { data: cached, status: 200, _offline: true };
          }
        }
      }

      // Mutations: queue for replay when server comes back.
      if (["post", "put", "delete"].includes(method) && shouldQueueMutation(url)) {
        let body = null;
        try { body = error.config.data ? JSON.parse(error.config.data) : null; } catch { /* ignore */ }
        await queueMutation(method.toUpperCase(), url, body);
        // Reject with a typed error so the caller can show an "offline" message.
        const offlineErr = new Error("You are offline. This action will sync when reconnected.");
        offlineErr.offline = true;
        return Promise.reject(offlineErr);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
