const { contextBridge, ipcRenderer } = require("electron");

// Read the actual server URL injected by main.js via additionalArguments.
// This lets api.js know the real backend host even when running the offline bundle.
const serverArg = (process.argv || []).find((a) =>
  String(a).startsWith("--poss-server=")
);
const serverUrl = serverArg ? serverArg.slice("--poss-server=".length) : null;

contextBridge.exposeInMainWorld("electronAPI", {
  /**
   * The actual production server URL (e.g. "http://13.61.181.139/").
   * Set by main.js so the frontend can reach the correct backend even when
   * the offline bundle is loaded from a local 127.0.0.1 server.
   */
  serverUrl,

  /**
   * File-based offline storage.
   * read/write snapshot JSON files per entity key.
   * queue/remove pending mutations for auto-sync on reconnect.
   */
  localData: {
    read:        (key)       => ipcRenderer.invoke("local-data-read", key),
    write:       (key, data) => ipcRenderer.invoke("local-data-write", key, data),
    queuePush:   (item)      => ipcRenderer.invoke("offline-queue-push", item),
    queueGet:    ()          => ipcRenderer.invoke("offline-queue-get"),
    queueRemove: (ids)       => ipcRenderer.invoke("offline-queue-remove", ids),
  },

  /** Check live reachability of the server (resolves to true/false). */
  checkOnline: () => ipcRenderer.invoke("is-server-reachable"),

  /**
   * Silently print plain text (monospace) via main process.
   * Returns a promise that resolves true/false.
   */
  silentPrintText: async (text, options = {}) => {
    return ipcRenderer.invoke("silent-print-text", { text, options });
  },

  /**
   * Raw ESC/POS print over serial/USB (COM path on Windows).
   * Args: { text: string, port?: string, codepage?: number }
   * Returns true on success, throws on failure.
   */
  rawPrintText: async ({ text = "", port, codepage } = {}) => {
    return ipcRenderer.invoke("raw-print-text", { text, port, codepage });
  },
});
