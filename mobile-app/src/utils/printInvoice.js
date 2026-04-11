import * as Print from "expo-print";
import { Asset } from "expo-asset";
import { Image, Platform } from "react-native";
import appLogo from "../../assets/app_logo.png";
import { API_BASE, WEB_APP_BASE } from "../config/api";
import { getPrinterSettings } from "./printerSettings";

let nativePrinterModule = null;

function getNativePrinterModule() {
  if (nativePrinterModule) return nativePrinterModule;
  try {
    // Lazy require avoids runtime crash if native module is unavailable in a build.
    const mod = require("react-native-esc-pos-printer");
    if (mod?.Printer && mod?.PrinterConstants && mod?.PrinterModelLang) {
      nativePrinterModule = mod;
      return nativePrinterModule;
    }
    return null;
  } catch {
    return null;
  }
}

async function toDataUri(uri) {
  if (!uri) return "";
  if (String(uri).startsWith("data:")) return String(uri);

  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ""));
      reader.onerror = () => resolve("");
      reader.readAsDataURL(blob);
    });
  } catch {
    return "";
  }
}

function esc(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function money(v) {
  return Number(v || 0).toFixed(2);
}

function maskMobileForPrint(mobile) {
  let digits = String(mobile || "").replace(/\D/g, "");
  if (digits.length > 10) digits = digits.slice(-10);
  if (digits.length !== 10) return String(mobile || "");
  return `${digits.slice(0, 2)}*****${digits.slice(-3)}`;
}

function getReceiptAddressLines({ branch = {}, shop = {} } = {}) {
  const hasBranchAddress = [
    branch?.address_line1,
    branch?.address_line2,
    branch?.city,
    branch?.state,
    branch?.pincode,
  ].some((v) => String(v || "").trim());

  if (hasBranchAddress) {
    const lines = [];
    if (branch?.address_line1) lines.push(branch.address_line1);
    if (branch?.address_line2) lines.push(branch.address_line2);
    if (branch?.city) lines.push(branch.city);
    if (branch?.state || branch?.pincode) {
      lines.push(`${branch.state || ""} ${branch.pincode || ""}`.trim());
    }
    return lines;
  }

  const lines = [];
  if (shop?.address_line1) lines.push(shop.address_line1);
  if (shop?.address_line2) lines.push(shop.address_line2);
  if (shop?.address_line3) lines.push(shop.address_line3);
  if (shop?.city) lines.push(shop.city);
  if (shop?.state || shop?.pincode) lines.push(`${shop.state || ""} ${shop.pincode || ""}`.trim());
  return lines;
}

function isAbsoluteUrl(v) {
  return /^https?:\/\//i.test(String(v || ""));
}

function resolveApiUrl(path) {
  const value = String(path || "").trim();
  if (!value) return "";
  if (isAbsoluteUrl(value) || value.startsWith("data:")) return value;

  if (isAbsoluteUrl(API_BASE)) {
    const base = API_BASE.endsWith("/") ? API_BASE : `${API_BASE}/`;
    return new URL(value, base).toString();
  }

  const base = API_BASE.endsWith("/") ? API_BASE : `${API_BASE}/`;
  return `${base}${value}`;
}

function resolvePrinterUrl(options = {}) {
  const directOption = String(options?.printerUrl || "").trim();
  if (directOption) return directOption;

  const branch = options?.branch || {};
  const candidates = [
    branch?.printer_url,
    branch?.network_printer_url,
    branch?.bluetooth_printer_url,
    branch?.printerUrl,
    branch?.networkPrinterUrl,
    branch?.bluetoothPrinterUrl,
  ];

  for (const value of candidates) {
    const v = String(value || "").trim();
    if (v) return v;
  }
  return "";
}

async function sendToPrinter(html, options = {}) {
  const settings = await getPrinterSettings();
  const shouldUseNative =
    Platform.OS === "android" &&
    Boolean(settings?.directThermalEnabled) &&
    options?.disableNative !== true;
  if (shouldUseNative) {
    const nativeMod = getNativePrinterModule();
    if (!nativeMod) {
      throw new Error("Direct thermal module is not available in this build.");
    }

    const target = String(options?.printerTarget || settings?.target || "").trim();
    if (!target) throw new Error("Direct thermal printing is enabled but printer target is not configured.");

    const deviceName = String(
      options?.printerDeviceName ||
      settings?.deviceName ||
      options?.branch?.printer_model ||
      "TM-T88V"
    ).trim();

    const payload = String(options?.nativeText || "");
    if (!payload) throw new Error("No printable payload available for native printer.");

    const validTarget = /^((TCP|BT):|[0-9]{1,3}(\.[0-9]{1,3}){3}|[0-9A-Fa-f:]{11,})/.test(target);
    if (!validTarget) {
      throw new Error("Printer target is invalid for direct thermal printing.");
    }

    const printer = new nativeMod.Printer({
      target,
      deviceName,
      lang: nativeMod.PrinterModelLang.MODEL_ANK,
    });

    await printer.connect();
    try {
      await printer.addTextAlign(nativeMod.PrinterConstants.ALIGN_LEFT);
      await printer.addText(payload);
      await printer.addFeedLine(3);
      await printer.addCut(nativeMod.PrinterConstants.CUT_FEED);
      await printer.sendData();
    } finally {
      await printer.disconnect().catch(() => {});
    }
    return;
  }

  const mergedOptions = {
    ...options,
    printerUrl: options?.printerUrl || settings?.printerUrl || "",
  };
  const printerUrl = resolvePrinterUrl(mergedOptions);
  if (printerUrl) {
    await Print.printAsync({ html, printerUrl });
    return;
  }
  await Print.printAsync({ html });
}

function slugifyShopName(value) {
  const s = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]+/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return s || "shop";
}

async function getReceiptLogoUrl() {
  try {
    const candidates = [];

    const resolved = Image.resolveAssetSource(appLogo)?.uri;
    if (resolved) candidates.push(resolved);

    const asset = Asset.fromModule(appLogo);
    if (!asset.localUri) {
      await asset.downloadAsync();
    }

    if (asset.localUri) candidates.push(asset.localUri);
    if (asset.uri) candidates.push(asset.uri);

    for (const uri of candidates) {
      const dataUri = await toDataUri(uri);
      if (dataUri) return dataUri;
    }

    return "";
  } catch {
    return "";
  }
}

function center(text, width) {
  const value = String(text || "");
  return " ".repeat(Math.max(0, Math.floor((width - value.length) / 2))) + value;
}

function rightKV(label, value, width) {
  const text = `${label} : ${value}`;
  return " ".repeat(Math.max(0, width - text.length)) + text;
}

function formatInvoiceDate(input) {
  const d = new Date(input || Date.now());
  if (Number.isNaN(d.getTime())) return String(input || "");
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function getKotToken(invoice = {}, options = {}) {
  const fromOptions = String(options?.kotToken || "").trim();
  if (fromOptions) return fromOptions;

  const candidates = [
    invoice?.kot_token,
    invoice?.kotToken,
    invoice?.kot_number,
    invoice?.kotNumber,
    invoice?.kot_no,
    invoice?.token_no,
    invoice?.token_number,
  ];

  for (const value of candidates) {
    const token = String(value || "").trim();
    if (token) return token;
  }
  return "";
}

function buildReceiptText(invoice, { shop = {}, branch = {}, paperSize = "58mm", kotToken = "" } = {}) {
  const is80mm = String(paperSize || "58mm") === "80mm";
  const WIDTH = is80mm ? 48 : 32;
  const ITEM_COL = is80mm ? 22 : 14;
  const QTY_COL = is80mm ? 5 : 4;
  const RATE_COL = is80mm ? 9 : 6;
  const TOTAL_COL = WIDTH - ITEM_COL - QTY_COL - RATE_COL;
  const line = "-".repeat(WIDTH);

  const items = Array.isArray(invoice?.items) ? invoice.items : [];
  const subtotal = items.reduce(
    (sum, item) => sum + Number(item?.amount ?? (Number(item?.price || 0) * Number(item?.quantity || 0))),
    0
  );

  let t = "";
  const headerName = branch?.branch_name
    ? `${shop?.shop_name || "Shop Name"} - ${branch.branch_name}`
    : shop?.shop_name || "Shop Name";
  t += `${center(headerName, WIDTH)}\n`;

  getReceiptAddressLines({ branch, shop }).forEach((row) => {
    if (!row) return;
    t += `${center(String(row), WIDTH)}\n`;
  });
  if (shop?.mobile) t += `${center(`Ph: ${shop.mobile}`, WIDTH)}\n`;
  if (shop?.gst_number) t += `${center(`GSTIN: ${shop.gst_number}`, WIDTH)}\n`;

  t += `${line}\n`;
  t += `Invoice No : ${invoice?.invoice_number || "-"}\n`;
  t += `Date : ${formatInvoiceDate(invoice?.created_time)}\n`;
  if (kotToken) t += `KOT Token : ${kotToken}\n`;
  t += `Payment : ${String(invoice?.payment_mode || "cash").toUpperCase()}\n`;

  const hasMobile = String(invoice?.mobile || "").trim();
  if (hasMobile) {
    t += `Customer : ${String(invoice?.customer_name || "Walk-in")}\n`;
    t += `Mobile : ${maskMobileForPrint(invoice?.mobile)}\n`;
  }

  t += `${line}\n`;
  t += "Item".padEnd(ITEM_COL) + "Qty".padStart(QTY_COL) + "Rate".padStart(RATE_COL) + "Total".padStart(TOTAL_COL) + "\n";
  t += `${line}\n`;

  items.forEach((item) => {
    const qty = Number(item?.quantity || 0);
    const amount = Number(item?.amount ?? (Number(item?.price || 0) * qty));
    const rate = qty > 0 ? amount / qty : Number(item?.price || 0);
    t +=
      String(item?.item_name || "Item").slice(0, ITEM_COL).padEnd(ITEM_COL) +
      String(qty).padStart(QTY_COL) +
      money(rate).padStart(RATE_COL) +
      money(amount).padStart(TOTAL_COL) +
      "\n";
  });

  t += `${line}\n`;
  t += rightKV("Subtotal", money(subtotal), WIDTH) + "\n";
  if (Number(invoice?.tax_amt || 0) > 0) t += rightKV("GST", money(invoice?.tax_amt || 0), WIDTH) + "\n";
  if (Number(invoice?.discounted_amt || 0) > 0) t += rightKV("Discount", money(invoice?.discounted_amt || 0), WIDTH) + "\n";
  t += rightKV("Grand Total", money(invoice?.total_amount || 0), WIDTH) + "\n";
  t += `${line}\n`;
  t += `${center("Thank You! Visit Again", WIDTH)}\n\n\n`;
  return t;
}

function buildKotTokenText(tokenData = {}, { shop = {}, branch = {}, paperSize = "58mm" } = {}) {
  const is80mm = String(paperSize || "58mm") === "80mm";
  const WIDTH = is80mm ? 48 : 32;
  const line = "-".repeat(WIDTH);
  const token = String(tokenData?.tokenNumber || "").trim();
  const orderId = tokenData?.orderId;
  const customerName = String(tokenData?.customerName || "").trim();
  const items = Array.isArray(tokenData?.items) ? tokenData.items : [];

  const headerName = branch?.branch_name
    ? `${shop?.shop_name || "Shop Name"} - ${branch.branch_name}`
    : shop?.shop_name || "Shop Name";

  let t = "";
  t += `${center(headerName, WIDTH)}\n`;
  t += `${center("KOT TOKEN", WIDTH)}\n`;
  t += `${line}\n`;
  t += `${center(token || `#${orderId || "-"}`, WIDTH)}\n`;
  if (customerName) t += `${center(customerName, WIDTH)}\n`;
  if (orderId) t += `${center(`Order #${orderId}`, WIDTH)}\n`;
  t += `${line}\n`;

  for (const row of items) {
    const itemName = String(row?.item_name || "Item");
    const qty = Number(row?.quantity || 0);
    t += `${itemName} x${qty}\n`;
  }

  t += `\n\n`;
  return t;
}

function buildFeedbackQrHtml({ shopId, invoiceNo, enabled = true, webBase = WEB_APP_BASE } = {}) {
  if (!enabled || !shopId || !invoiceNo || !webBase) return "";
  const feedbackUrl = `${String(webBase).replace(/\/$/, "")}/feedback?shop_id=${encodeURIComponent(shopId)}&invoice_no=${encodeURIComponent(invoiceNo)}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=96x96&data=${encodeURIComponent(feedbackUrl)}`;
  return `
    <div class="qr-wrap">
      <div class="qr-sep">- - - - - - - - - - - - - - - -</div>
      <div class="qr-title">Rate Your Experience</div>
      <img src="${qrUrl}" width="72" height="72" alt="Feedback QR" />
      <div class="qr-sub">Scan QR to share feedback</div>
    </div>
  `;
}

export async function printInvoiceByData(invoice, options = {}) {
  const {
    shop = {},
    branch = {},
    shopName = "Haappii Billing",
    webBase = WEB_APP_BASE,
  } = options;

  const normalizedShop = shop?.shop_name
    ? shop
    : { ...shop, shop_name: shopName };

  const paperSize = branch?.paper_size || "58mm";
  const kotToken = getKotToken(invoice, options);
  const paperWidth = String(paperSize) === "80mm" ? "80mm" : "58mm";
  const receiptText = buildReceiptText(invoice, {
    shop: normalizedShop,
    branch,
    paperSize,
    kotToken,
  });

  const logoUrl = await getReceiptLogoUrl();
  const logoHtml =
    branch?.print_logo_enabled === false
      ? ""
      : (() => {
          if (!logoUrl) return "";
          return `<div class="logo-wrap"><img class="logo" src="${esc(logoUrl)}" alt="logo" /></div>`;
        })();

  const feedbackQrHtml = buildFeedbackQrHtml({
    shopId: normalizedShop?.shop_id,
    invoiceNo: invoice?.invoice_number,
    enabled: branch?.feedback_qr_enabled !== false,
    webBase,
  });

  const html = `
    <html>
      <head>
        <style>
          @page { size: ${paperWidth} auto; margin: 0; }
          html, body {
            margin: 0;
            padding: 0;
            width: ${paperWidth};
            font-family: monospace;
            color: #000;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .ticket {
            width: ${paperWidth};
            padding: 2mm;
            box-sizing: border-box;
          }
          .logo-wrap {
            width: 100%;
            text-align: center;
            display: flex;
            justify-content: center;
            align-items: center;
          }
          .logo {
            display: block;
            margin: 0 auto 2px;
            max-width: 100%;
            max-height: 20mm;
            object-fit: contain;
          }
          pre {
            margin: 0;
            white-space: pre;
            font-size: 9px;
            line-height: 1.25;
          }
          .qr-wrap {
            text-align: center;
            margin-top: 4px;
            font-size: 8px;
            width: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
          }
          .qr-title { font-weight: 700; margin-bottom: 2px; }
          .qr-sub { font-size: 7px; margin-top: 2px; }
          .qr-sep { letter-spacing: 1px; margin-bottom: 2px; }
        </style>
      </head>
      <body>
        <div class="ticket">
          ${logoHtml}
          <pre>${esc(receiptText)}</pre>
          ${feedbackQrHtml}
        </div>
      </body>
    </html>
  `;

  await sendToPrinter(html, { ...options, nativeText: receiptText });
}

export async function printInvoiceByNumber(api, invoiceNo, options = {}) {
  const res = await api.get(`/invoice/by-number/${invoiceNo}`);
  await printInvoiceByData(res?.data || {}, options);
}

export async function printKotTokenSlip(tokenData = {}, options = {}) {
  const {
    tokenNumber,
    orderId,
    items = [],
    customerName,
  } = tokenData || {};
  const {
    shop = {},
    branch = {},
    shopName = "Haappii Billing",
  } = options;

  const normalizedShop = shop?.shop_name ? shop : { ...shop, shop_name: shopName };
  const paperSize = branch?.paper_size || "58mm";
  const paperWidth = String(paperSize) === "80mm" ? "80mm" : "58mm";
  const headerName = branch?.branch_name
    ? `${normalizedShop?.shop_name || "Shop Name"} - ${branch.branch_name}`
    : normalizedShop?.shop_name || "Shop Name";
  const token = String(tokenNumber || "").trim();
  const lines = Array.isArray(items)
    ? items.map((row) => `${row?.item_name || "Item"} x${Number(row?.quantity || 0)}`)
    : [];

  const logoUrl = await getReceiptLogoUrl();
  const logoHtml =
    branch?.print_logo_enabled === false
      ? ""
      : logoUrl
      ? `<div class="logo-wrap"><img class="logo" src="${esc(logoUrl)}" alt="logo" /></div>`
      : "";

  const html = `
    <html>
      <head>
        <style>
          @page { size: ${paperWidth} auto; margin: 0; }
          html, body {
            margin: 0;
            padding: 0;
            width: ${paperWidth};
            font-family: monospace;
            color: #000;
          }
          .ticket {
            width: ${paperWidth};
            padding: 2mm;
            box-sizing: border-box;
            text-align: center;
          }
          .logo-wrap {
            width: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
          }
          .logo {
            display: block;
            margin: 0 auto 2px;
            max-width: 100%;
            max-height: 16mm;
            object-fit: contain;
          }
          .shop { font-size: 11px; font-weight: 700; margin-bottom: 2px; }
          .label { font-size: 10px; margin: 2px 0; }
          .token { font-size: 26px; font-weight: 800; margin: 6px 0; }
          .sep { margin: 5px 0; letter-spacing: 1px; font-size: 9px; }
          .items { text-align: left; font-size: 9px; white-space: pre-line; margin-top: 4px; }
        </style>
      </head>
      <body>
        <div class="ticket">
          ${logoHtml}
          <div class="shop">${esc(headerName)}</div>
          <div class="label">KOT TOKEN</div>
          <div class="token">${esc(token || `#${orderId || "-"}`)}</div>
          ${customerName ? `<div class="label">${esc(customerName)}</div>` : ""}
          ${orderId ? `<div class="label">Order #${esc(orderId)}</div>` : ""}
          <div class="sep">- - - - - - - - - - - - - - - -</div>
          ${lines.length ? `<div class="items">${esc(lines.join("\n"))}</div>` : ""}
        </div>
      </body>
    </html>
  `;

  const nativeText = buildKotTokenText(
    {
      tokenNumber: token,
      orderId,
      customerName,
      items,
    },
    {
      shop: normalizedShop,
      branch,
      paperSize,
    }
  );

  await sendToPrinter(html, { ...options, nativeText });
}
