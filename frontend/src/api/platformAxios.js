import axios from "axios";
import { API_BASE, getApiBaseIssue } from "../config/api";

const platformAxios = axios.create({
  baseURL: API_BASE,
  timeout: 20000,
});

platformAxios.interceptors.request.use(
  (config) => {
    const apiIssue = getApiBaseIssue();
    if (apiIssue) return Promise.reject(new Error(apiIssue));

    const token = localStorage.getItem("platform_token");
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

platformAxios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem("platform_token");
      window.location.replace("/platform/login");
    }
    return Promise.reject(error);
  }
);

export default platformAxios;

