// src/utils/auth.js

const KEY = "hb_session";
const EXPIRY_MINUTES = 15; // increase in production

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

  localStorage.setItem(KEY, JSON.stringify(session));

  if (session?.token) {
    localStorage.setItem("token", session.token);
    localStorage.setItem("access_token", session.token);
  }
  if (session?.access_token) {
    localStorage.setItem("access_token", session.access_token);
  }
}

export function clearSession() {
  localStorage.removeItem(KEY);
  localStorage.removeItem("token");
  localStorage.removeItem("access_token");
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
  localStorage.setItem(KEY, JSON.stringify(s));

  if (s?.token) {
    localStorage.setItem("token", s.token);
    localStorage.setItem("access_token", s.token);
  }
  if (s?.access_token) {
    localStorage.setItem("access_token", s.access_token);
  }
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
        clearSession();
        window.location.replace("/");
      } else {
        // Activity refreshed just before timeout, reschedule
        scheduleExpiry();
      }
    }, EXPIRY_MINUTES * 60 * 1000 + 1000);
  };

  activityHandler = () => {
    if (!getSession()) return;
    refreshSessionActivity();
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
