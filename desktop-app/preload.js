const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
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
