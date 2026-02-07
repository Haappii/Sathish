// src/utils/apiClient.js

import axios from "axios";
import {
  getSession,
  clearSession,
  refreshSessionActivity,
} from "./auth";

const api = axios.create({
  baseURL: "http://13.60.186.234:8000/api",
  timeout: 20000,
});

/* =========================
   REQUEST INTERCEPTOR
========================= */
api.interceptors.request.use(
  (config) => {
    const session = getSession();
    config.headers = config.headers || {};

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
