export async function generateFeedbackQrHtml({
  shopId,
  invoiceNo,
  enabled = true,
} = {}) {
  if (!enabled || !shopId || !invoiceNo || typeof window === "undefined") {
    return "";
  }

  try {
    const QRCode = (await import("qrcode")).default;
    const url = `${window.location.origin}/feedback?shop_id=${encodeURIComponent(shopId)}&invoice_no=${encodeURIComponent(invoiceNo)}`;
    const dataUrl = await QRCode.toDataURL(url, { width: 56, margin: 1, color: { dark: "#000000", light: "#ffffff" } });

    return `
<div style="font-family:monospace;text-align:center;margin:4px 0 0;width:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;">
  <div style="font-size:8px;letter-spacing:1px;margin-bottom:3px;">- - - - - - - - - - - - - - - - -</div>
  <div style="font-size:8px;font-weight:bold;margin-bottom:3px;">Rate Your Experience</div>
  <img src="${dataUrl}" width="56" height="56" alt="Feedback QR" style="display:block;margin:0 auto;"/>
  <div style="font-size:7px;margin-top:3px;color:#444;">Scan QR to share feedback</div>
</div>`;
  } catch {
    return "";
  }
}
