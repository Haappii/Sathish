export async function generateFeedbackQrHtml({
  shopId,
  invoiceNo,
  enabled = true,
  label = "Scan to give feedback",
} = {}) {
  if (!enabled || !shopId || !invoiceNo || typeof window === "undefined") {
    return "";
  }

  try {
    const QRCode = (await import("qrcode")).default;
    const url = `${window.location.origin}/feedback?shop_id=${encodeURIComponent(shopId)}&invoice_no=${encodeURIComponent(invoiceNo)}`;
    const dataUrl = await QRCode.toDataURL(url, { width: 120, margin: 1 });

    return [
      '<div style="page-break-inside:avoid;text-align:center;margin-top:4px;font-family:monospace;font-size:9px;">',
      label,
      "</div>",
      '<div style="page-break-inside:avoid;text-align:center;">',
      `<img src="${dataUrl}" width="100" height="100" alt="Feedback QR" />`,
      "</div>",
    ].join("");
  } catch {
    return "";
  }
}
