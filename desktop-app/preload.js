const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  /**
   * Silently print plain text (monospace) via main process.
   * Returns a promise that resolves true/false.
   */
  silentPrintText: async (text, options = {}) => {
    return ipcRenderer.invoke("silent-print-text", { text, options });
  },
});

