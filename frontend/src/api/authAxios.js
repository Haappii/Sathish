import axios from "axios";
import { API_BASE, getApiBaseIssue } from "../config/api";
import { clearSession, getSession } from "../utils/auth";

const authAxios = axios.create({
  baseURL: API_BASE
});

authAxios.interceptors.request.use(config => {
  const apiIssue = getApiBaseIssue();
  if (apiIssue) return Promise.reject(new Error(apiIssue));

  const session = getSession();
  config.headers = config.headers || {};
  config.params = config.params || {};

  const roleLower = (session?.role || "").toString().toLowerCase();
  const isAdmin = roleLower === "admin";
  let token =
    localStorage.getItem("token") ||
    localStorage.getItem("access_token");   // 👈 fallback

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  } else {
    console.warn("No token found for request:", config.url);
  }

  // Only set x-branch-id from session if the caller hasn't already set it explicitly
  if (session?.branch_id && !config.headers["x-branch-id"]) {
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
});

authAxios.interceptors.response.use(
  response => response,
  error => {
    if (error?.response?.status === 401) {
      clearSession();
      window.location.replace("/");
    }
    return Promise.reject(error);
  }
);

export default authAxios;
