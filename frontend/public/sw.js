// Service worker — network only, zero caching.
// Static assets are content-hashed by Vite so no caching needed here.
// API calls must NEVER be cached — billing data must always be real-time.

const CACHE_NAME = "shop-billing-pwa-v3";

// On install: clear any old caches left from previous versions.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.skipWaiting())
  );
});

// On activate: take control immediately.
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// All fetch requests: go straight to network, no caching at all.
// If the network is down, the request simply fails (Electron handles offline via file store).
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle same-origin GET requests; ignore everything else.
  if (request.method !== "GET") return;

  try {
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
  } catch {
    return;
  }

  // SPA navigation: network first, no caching.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        // Only fall back to a cached index.html if available (won't exist since we don't cache).
        caches.match("/index.html").then((r) => r || fetch(request))
      )
    );
    return;
  }

  // All other requests (assets, api, etc.): pure network, no cache read or write.
  event.respondWith(fetch(request));
});
