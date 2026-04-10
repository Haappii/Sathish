import axios from "axios";
import { API_BASE, getApiBaseIssue } from "../config/api";
import { clearSession, getSession } from "../utils/auth";
import {
  snapshotResponse,
  getSnapshotKey,
  readSnapshot,
  queueMutation,
} from "../utils/offlineStore";

const shouldQueueMutation = (url = "") =>
  !/^\/auth\/(login|logout|ping|set-branch)(\/|$)/i.test(String(url || "")) &&
  !/^\/invoice(\/|$)/i.test(String(url || ""));

const authAxios = axios.create({
  baseURL: API_BASE,
  timeout: 20000,
});

authAxios.interceptors.request.use((config) => {
  const apiIssue = getApiBaseIssue();
  if (apiIssue) return Promise.reject(new Error(apiIssue));

  const session = getSession();
  config.headers = config.headers || {};
  config.params = config.params || {};

  const roleLower = (session?.role || "").toString().toLowerCase();
  const isAdmin = roleLower === "admin";
  const token =
    session?.access_token ||
    session?.token ||
    localStorage.getItem("token") ||
    localStorage.getItem("access_token") ||
    null;

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (session?.branch_id && !config.headers["x-branch-id"]) {
    config.headers["x-branch-id"] = session.branch_id;
  }

  if (!isAdmin) {
    if (
      session?.branch_id &&
      Object.prototype.hasOwnProperty.call(config.params, "branch_id")
    ) {
      config.params.branch_id = session.branch_id;
    }
  }

  return config;
});

authAxios.interceptors.response.use(
  (response) => {
    if (response.config?.method === "get") {
      snapshotResponse(response.config.url, response.data);
    }
    return response;
  },
  async (error) => {
    if (error?.response?.status === 401) {
      clearSession();
      window.location.replace("/");
      return Promise.reject(error);
    }

    if (!error.response && error.config) {
      const method = (error.config.method || "").toLowerCase();
      const url = error.config.url || "";

      if (method === "get") {
        const key = getSnapshotKey(url);
        if (key) {
          const cached = await readSnapshot(key);
          if (cached != null) {
            return { data: cached, status: 200, _offline: true };
          }
        }
      }

      if (["post", "put", "delete"].includes(method) && shouldQueueMutation(url)) {
        let body = null;
        try {
          body = error.config.data ? JSON.parse(error.config.data) : null;
        } catch {
          body = null;
        }
        await queueMutation(method.toUpperCase(), url, body);
        const offlineErr = new Error(
          "You are offline. This action will sync when reconnected."
        );
        offlineErr.offline = true;
        return Promise.reject(offlineErr);
      }
    }

    return Promise.reject(error);
  }
);

export default authAxios;
