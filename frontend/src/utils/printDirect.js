const escapeHtml = (text) =>
  String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const waitForPrintAssets = async (targetWindow, timeoutMs = 2000) => {
  const doc = targetWindow?.document;
  if (!doc) return;

  const settle = async () => {
    try {
      if (doc.fonts?.ready) {
        await doc.fonts.ready.catch(() => {});
      }
    } catch {}

    const images = Array.from(doc.images || []);
    if (!images.length) {
      await new Promise((resolve) => setTimeout(resolve, 120));
      return;
    }

    await Promise.all(
      images.map(
        (img) =>
          new Promise((resolve) => {
            let done = false;
            const finish = () => {
              if (done) return;
              done = true;
              resolve();
            };

            if (img.complete) {
              if (typeof img.decode === "function") {
                img.decode().catch(() => {}).finally(finish);
              } else {
                finish();
              }
              return;
            }

            img.addEventListener("load", finish, { once: true });
            img.addEventListener("error", finish, { once: true });
          })
      )
    );

    await new Promise((resolve) => setTimeout(resolve, 120));
  };

  await Promise.race([
    settle(),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
};

/**
 * Attempt silent print via Electron (desktop). Falls back to browser print.
 * Returns a promise resolving to true on success.
 */
export async function printDirectText(text, { fontSize = 9, port = "COM7", paperSize = "58mm", extraHtml = "", headerHtml = "" } = {}) {
  const hasExtraHtml = String(extraHtml || "").trim().length > 0 || String(headerHtml || "").trim().length > 0;
  const paperWidth = String(paperSize || "58mm") === "80mm" ? "80mm" : "58mm";

  // Try Electron silent print first (desktop app)
  if (window?.electronAPI?.rawPrintText || window?.electronAPI?.silentPrintText) {
    // QR/image receipts need the browser print path because raw ESC/POS text cannot render HTML images.
    const skipRawPrint = Number(fontSize) <= 8 || hasExtraHtml;

    // 1) Raw ESC/POS (only when text-only printing is safe)
    if (!skipRawPrint && window.electronAPI.rawPrintText) {
      try {
        await window.electronAPI.rawPrintText({
          text,
          port,
          fontSize: Number(fontSize) || 12,
          feedLines: 4,
          paperSize,
        });
        return true;
      } catch (e) {
        console.warn("Raw print failed, falling back to browser print", e);
      }
    }
    // 2) Silent browser print (honors fontSize and paperSize)
    if (window.electronAPI.silentPrintText) {
      try {
        const ok = await window.electronAPI.silentPrintText(text, { fontSize, paperSize, extraHtml, headerHtml });
        if (ok) return true;
      } catch (e) {
        console.warn("Silent browser print failed", e);
      }
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
      `<!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Receipt</title>
          <style>
            @page { size: ${paperWidth} auto; margin: 0; }
            html, body {
              margin: 0;
              padding: 0;
              width: ${paperWidth};
              background: #fff;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            body {
              font-family: monospace;
            }
            .receipt {
              width: ${paperWidth};
              margin: 0;
              padding: 1.5mm 2.2mm 0 0;
              box-sizing: border-box;
            }
            pre {
              margin: 0;
              box-sizing: border-box;
              padding: 1.5mm 2.2mm 0 1.5mm;
              font-family: Consolas, "Courier New", monospace;
              font-size: ${Math.max(Number(fontSize) || 9, 6)}px;
              line-height: 1.1;
              width: 100%;
              letter-spacing: 0;
              white-space: pre;
            }
            .header-html {
              box-sizing: border-box;
              width: 100%;
              margin: 0;
              padding: 1.5mm 1.5mm 0;
              text-align: center;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
            }
            .header-html img {
              display: block;
              margin: 0 auto;
              max-width: calc(${paperWidth} - 8mm);
              max-height: 20mm;
              height: auto;
              object-fit: contain;
            }
            .extra-html {
              box-sizing: border-box;
              width: 100%;
              margin: 0;
              padding: 2mm 1.5mm 0;
              text-align: center;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
            }
            .extra-html img {
              display: block;
              margin: 0 auto;
              max-width: calc(${paperWidth} - 8mm);
              height: auto;
            }
            .header-html * {
              text-align: center !important;
            }
            .extra-html * {
              text-align: center !important;
            }
            .header-html img,
            .header-html svg,
            .header-html canvas,
            .extra-html img,
            .extra-html svg,
            .extra-html canvas {
              margin-left: auto !important;
              margin-right: auto !important;
            }
          </style>
        </head>
        <body>
          <div class="receipt">
            ${headerHtml ? `<div class="header-html">${headerHtml}</div>` : ""}
            <pre>${escapeHtml(text)}</pre>
            <div class="extra-html">${extraHtml || ""}</div>
          </div>
        </body>
      </html>`
    );
    doc.close();

    await waitForPrintAssets(iframe.contentWindow);
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();

    setTimeout(() => iframe.remove(), 1200);
    return true;
  } catch (err) {
    console.error("Fallback print failed", err);
    return false;
  }
}
