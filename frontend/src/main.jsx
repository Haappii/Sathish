import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import api from "./utils/apiClient.js";
import { flushPendingQueue } from "./utils/offlineStore.js";
import {
  hydrateSharedLocalState,
  isDesktopApp,
} from "./utils/sharedLocalState.js";

async function bootstrap() {
  if (isDesktopApp()) {
    try {
      await hydrateSharedLocalState();
    } catch {
      // Ignore hydration issues and keep current-origin localStorage as fallback.
    }
  }

  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );

  // Register service worker only in production builds.
  // In dev, SW caching can cause blank screens / stuck requests after deployments.
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }

  // Electron desktop: on startup, try to flush any mutations queued while offline.
  if (isDesktopApp()) {
    const flushQueued = async () => {
      try {
        const { flushed } = await flushPendingQueue(api);
        if (flushed > 0) {
          console.info(`[offline-sync] Flushed ${flushed} queued mutation(s) to server.`);
        }
      } catch {
        // Ignore - sync will retry later.
      }
    };

    window.addEventListener("load", async () => {
      // Small delay to let the app finish rendering before background sync.
      await new Promise((r) => setTimeout(r, 3000));
      await flushQueued();
    });

    window.addEventListener("online", flushQueued);
  }
}

bootstrap();
