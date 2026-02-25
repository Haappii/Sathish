const escapeHtml = (text) =>
  String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

/**
 * Attempt silent print via Electron (desktop). Falls back to browser print.
 * Returns a promise resolving to true on success.
 */
export async function printDirectText(text, { fontSize = 12 } = {}) {
  // Try Electron silent print first (desktop app)
  if (window?.electronAPI?.silentPrintText) {
    try {
      const ok = await window.electronAPI.silentPrintText(text, { fontSize });
      if (ok) return true;
    } catch (e) {
      console.warn("Silent print failed, falling back to browser print", e);
    }
  }

  // Browser fallback: hidden iframe + print dialog
  try {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.visibility = "hidden";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) throw new Error("print window missing");

    doc.open();
    doc.write(
      `<pre style="font-family: monospace; font-size: ${fontSize}px; margin:0;">${escapeHtml(
        text
      )}</pre>`
    );
    doc.close();

    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();

    setTimeout(() => iframe.remove(), 500);
    return true;
  } catch (err) {
    console.error("Fallback print failed", err);
    return false;
  }
}
