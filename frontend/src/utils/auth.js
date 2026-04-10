// src/utils/auth.js

import { API_BASE } from "../config/api";
import {
  removeSharedLocalValue,
  writeSharedLocalValue,
} from "./sharedLocalState.js";

const KEY = "hb_session";
const BUSINESS_DATE_KEY = "hb_business_date";
const EXPIRY_MINUTES = 15; // increase in production
const SERVER_ACTIVITY_SYNC_MS = 60 * 1000;
const AUTH_BASE = `${API_BASE}/auth`;

let lastServerActivitySync = 0;
let activitySyncPromise = null;
let logoutPromise = null;

function getSessionToken(session = getSession()) {
  return (
    session?.access_token ||
    session?.token ||
    localStorage.getItem("token") ||
    localStorage.getItem("access_token") ||
    ""
  );
}

async function postAuth(path, { token, keepalive = false } = {}) {
  if (!token) return null;

  return fetch(`${AUTH_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    keepalive,
  });
}

/* =========================
   SESSION HELPERS
========================= */

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || null;
  } catch {
    return null;
  }
}

export function setSession(data) {
  const session = {
    ...data,
    last_activity: Date.now()
  };
  lastServerActivitySync = 0;

  writeSharedLocalValue(KEY, JSON.stringify(session));

  if (session?.token) {
    writeSharedLocalValue("token", session.token);
    writeSharedLocalValue("access_token", session.token);
  }
  if (session?.access_token) {
    writeSharedLocalValue("access_token", session.access_token);
  }

  const appDate =
    typeof session?.app_date === "string" && session.app_date.trim()
      ? session.app_date.trim().slice(0, 10)
      : "";
  if (appDate) {
    writeSharedLocalValue(BUSINESS_DATE_KEY, appDate);
  } else {
    removeSharedLocalValue(BUSINESS_DATE_KEY);
  }
}

export function clearSession() {
  removeSharedLocalValue(KEY);
  removeSharedLocalValue("token");
  removeSharedLocalValue("access_token");
  removeSharedLocalValue(BUSINESS_DATE_KEY);
  lastServerActivitySync = 0;
}

export async function logoutSession({ redirect = true } = {}) {
  if (logoutPromise) return logoutPromise;

  const token = getSessionToken();

  logoutPromise = postAuth("/logout", { token, keepalive: true })
    .catch(() => {})
    .finally(() => {
      clearSession();
      logoutPromise = null;
      if (redirect && typeof window !== "undefined") {
        window.location.replace("/");
      }
    });

  return logoutPromise;
}

/* =========================
   EXPIRY LOGIC
========================= */

export function isSessionExpired() {
  const s = getSession();
  if (!s?.last_activity) return true;

  const diffMinutes =
    (Date.now() - s.last_activity) / 1000 / 60;

  return diffMinutes >= EXPIRY_MINUTES;
}

export function refreshSessionActivity() {
  const s = getSession();
  if (!s) return;

  s.last_activity = Date.now();
  writeSharedLocalValue(KEY, JSON.stringify(s));

  if (s?.token) {
    writeSharedLocalValue("token", s.token);
    writeSharedLocalValue("access_token", s.token);
  }
  if (s?.access_token) {
    writeSharedLocalValue("access_token", s.access_token);
  }
}

export async function syncSessionActivity(force = false) {
  const session = getSession();
  const token = getSessionToken(session);
  if (!session || !token) return;

  const now = Date.now();
  if (!force && now - lastServerActivitySync < SERVER_ACTIVITY_SYNC_MS) return;
  if (activitySyncPromise) return activitySyncPromise;

  lastServerActivitySync = now;
  activitySyncPromise = postAuth("/ping", { token, keepalive: true })
    .catch(() => {})
    .finally(() => {
      activitySyncPromise = null;
    });

  return activitySyncPromise;
}

export function isHeadOfficeBranch(session) {
  const headOfficeBranchId = Number(session?.head_office_branch_id || 0);
  const branchType = (session?.branch_type || "").toString().toLowerCase();
  const branchName = (session?.branch_name || "").toString().toLowerCase();

  return (
    (headOfficeBranchId > 0 && Number(session?.branch_id || 0) === headOfficeBranchId) ||
    branchType.includes("head") ||
    branchName.includes("head")
  );
}

export function isHeadOfficeBranchClosed(session) {
  return (
    isHeadOfficeBranch(session) &&
    String(session?.branch_close || "N").toUpperCase() === "Y"
  );
}

/* =========================
   USER ACTIVITY TRACKING
========================= */

let expiryTimer = null;
let activityHandler = null;

export function startActivityTracking() {
  const events = [
    "mousemove",
    "keydown",
    "click",
    "scroll",
    "touchstart"
  ];

  const scheduleExpiry = () => {
    if (expiryTimer) clearTimeout(expiryTimer);
    const s = getSession();
    if (!s) return;

    expiryTimer = setTimeout(() => {
      if (isSessionExpired()) {
        logoutSession();
      } else {
        // Activity refreshed just before timeout, reschedule
        scheduleExpiry();
      }
    }, EXPIRY_MINUTES * 60 * 1000 + 1000);
  };

  activityHandler = () => {
    if (!getSession()) return;
    refreshSessionActivity();
    syncSessionActivity();
    scheduleExpiry();
  };

  events.forEach(event =>
    window.addEventListener(event, activityHandler)
  );

  // start timer once if session already exists
  scheduleExpiry();
}

export function stopActivityTracking() {
  if (expiryTimer) clearTimeout(expiryTimer);
  if (activityHandler) {
    const events = [
      "mousemove",
      "keydown",
      "click",
      "scroll",
      "touchstart"
    ];
    events.forEach(event =>
      window.removeEventListener(event, activityHandler)
    );
  }
}
