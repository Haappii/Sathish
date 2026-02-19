// src/utils/apiClient.js

import axios from "axios";
import { API_BASE, getApiBaseIssue } from "../config/api";
import {
  getSession,
  clearSession,
  refreshSessionActivity,
} from "./auth";

const api = axios.create({
  baseURL: API_BASE,
  timeout: 20000,
});

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

    // 🔑 SUPPORT BOTH session + localStorage token names
    const token =
      session?.access_token ||
      session?.token ||
      localStorage.getItem("token") ||
      localStorage.getItem("access_token") ||
      null;

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;

      // user is active → refresh timer
      refreshSessionActivity();
    }

    // ❗ DO NOT redirect from request interceptor
    // Let backend decide auth validity
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
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      clearSession();
      window.location.replace("/");
    }
    return Promise.reject(error);
  }
);

export default api;
