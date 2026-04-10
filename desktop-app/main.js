const { app, BrowserWindow, ipcMain, session } = require("electron");
const path = require("path");
const fs = require("fs");
const child_process = require("child_process");
const http = require("http");
const https = require("https");
const crypto = require("crypto");

const PROTOCOL = "poss";
const CONFIG_FILE = "config.json";

function loadSharedEnv() {
  const candidates = [
    // Bundled production defaults (lowest priority — always present in packaged app)
    path.resolve(__dirname, "app.config.txt"),
    // Outer files override for dev / self-hosted deployments (not bundled in installer)
    path.resolve(__dirname, "..", ".env"),
    path.resolve(__dirname, "..", "config.example.txt"),
    path.resolve(__dirname, "..", "config.txt"),
  ];
  const merged = {};

  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;

    const lines = fs.readFileSync(envPath, "utf-8").split(/\r?\n/);
    for (const rawLine of lines) {
      const line = String(rawLine || "").trim();
      if (!line || line.startsWith("#")) continue;

      const idx = line.indexOf("=");
      if (idx <= 0) continue;

      const key = line.slice(0, idx).trim();
      if (!key) continue;

      let value = line.slice(idx + 1).trim();
      const quoted =
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"));
      if (quoted) value = value.slice(1, -1);

      merged[key] = value;
    }
  }

  for (const [key, value] of Object.entries(merged)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadSharedEnv();

// Default URL the packaged desktop app will open if nothing else is configured.
// Point this to the hosted frontend that talks to your backend API.
const DEFAULT_APP_URL = process.env.APP_URL_DEFAULT || "http://localhost:5180";

function normalizeAppUrl(url) {
  if (!url) return url;
  try {
    const parsed = new URL(String(url));
    const path = String(parsed.pathname || "").trim();
    if (!path || path === "/") {
      parsed.pathname = "/login";
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function findBluetoothPrinterPort() {
  try {
    const script =
      "$targets='MPT|POS|PRT|THERMAL|SC588|PRINTER';" +
      "$dev=Get-ChildItem HKLM:\\\\SYSTEM\\\\CurrentControlSet\\\\Services\\\\BTHPORT\\\\Parameters\\\\Devices | " +
      "ForEach-Object { try { $n=[System.Text.Encoding]::ASCII.GetString((Get-ItemProperty -Path $_.PSPath -Name Name -ErrorAction Stop).Name).Trim([char]0); " +
      "if($n -match $targets){ [PSCustomObject]@{Addr=$_.PSChildName; Name=$n} } } catch {} } | Select-Object -First 1;" +
      "if($dev){ $addr=$dev.Addr.ToUpper(); $key=\"HKLM:\\\\SYSTEM\\\\CurrentControlSet\\\\Enum\\\\BTHENUM\\\\{00001101-0000-1000-8000-00805f9b34fb}_LOCALMFG*\\\\*${addr}_*\\\\Device Parameters\"; " +
      "$pn=Get-ItemProperty -Path $key -Name PortName -ErrorAction SilentlyContinue | Select-Object -ExpandProperty PortName -First 1; if($pn){ $pn } }";
    const out = child_process.execSync(`powershell -NoProfile -Command "${script}"`, {
      encoding: "utf8",
    });
    const port = String(out || "").trim();
    return port || null;
  } catch {
    return null;
  }
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isValidHttpUrl(value) {
  try {
    const u = new URL(String(value || ""));
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function readUserConfig() {
  try {
    const cfgPath = path.join(app.getPath("userData"), CONFIG_FILE);
    if (!fs.existsSync(cfgPath)) return null;
    const cfg = safeParseJson(fs.readFileSync(cfgPath, "utf-8"));
    return cfg && typeof cfg === "object" ? cfg : null;
  } catch {
    return null;
  }
}

function writeUserConfig(nextConfig) {
  try {
    const cfgPath = path.join(app.getPath("userData"), CONFIG_FILE);
    fs.writeFileSync(cfgPath, JSON.stringify(nextConfig, null, 2), "utf-8");
    return true;
  } catch {
    return false;
  }
}

function isThermalDriverInstalled() {
  try {
    const out = child_process.execSync("pnputil /enum-drivers", { encoding: "utf8" });
    return /pos-?58|58mm series printer|sp-drv|pos58/i.test(out);
  } catch {
    return false;
  }
}

function findBundledDriverInstaller() {
  const candidates = [
    path.join(process.resourcesPath || "", "drivers", "SP-DRV2155Win.exe"),
    path.resolve(__dirname, "..", "drivers", "SC588", "SP-DRV2155Win.exe"),
    path.resolve(__dirname, "drivers", "SC588", "SP-DRV2155Win.exe"),
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p));
}

function ensureThermalDriverInstalled() {
  if (isThermalDriverInstalled()) return true;
  const installer = findBundledDriverInstaller();
  if (!installer) {
    console.warn("Printer driver installer not found in resources.");
    return false;
  }
  try {
    child_process.execFileSync(installer, ["/VERYSILENT", "/NORESTART"], { stdio: "ignore" });
    return true;
  } catch (err) {
    console.error("Printer driver install failed:", err.message || err);
    return false;
  }
}

function resolveAppUrl() {
  const argv = process.argv || [];
  const urlArg = argv.find((a) => String(a || "").startsWith("--url="));
  if (urlArg) return normalizeAppUrl(String(urlArg).slice("--url=".length));

  if (process.env.APP_URL) return normalizeAppUrl(String(process.env.APP_URL));
  // Optional: allow a build-time / deployment default via APP_URL_DEFAULT.
  if (process.env.APP_URL_DEFAULT) return normalizeAppUrl(String(process.env.APP_URL_DEFAULT));

  const cfg = readUserConfig();
  if (cfg && cfg.app_url) return normalizeAppUrl(String(cfg.app_url));

  // Fallback to a generic local development URL when no runtime config is present.
  return normalizeAppUrl(DEFAULT_APP_URL);
}

function persistAppUrl(url) {
  if (!isValidHttpUrl(url)) return;
  const cfg = readUserConfig() || {};
  if (String(cfg.app_url || "") === String(url)) return;
  writeUserConfig({ ...cfg, app_url: String(url) });
}

function getOfflineUiDir() {
  // Packaged app: files end up under resources/offline-ui
  const packaged = path.join(process.resourcesPath || "", "offline-ui");
  if (packaged && fs.existsSync(packaged)) return packaged;

  // Dev / repo path: desktop-app/offline-ui (synced from frontend/dist)
  const local = path.join(__dirname, "offline-ui");
  if (fs.existsSync(local)) return local;

  // Fallback to repo frontend/dist for local dev runs
  const repoDist = path.resolve(__dirname, "..", "frontend", "dist");
  if (fs.existsSync(repoDist)) return repoDist;

  return null;
}

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".map": "application/json",
};

function startOfflineServer(staticDir) {
  return new Promise((resolve, reject) => {
    const safeRoot = path.resolve(staticDir);

    const server = http.createServer((req, res) => {
      const url = new URL(req.url, "http://localhost");
      const decodedPath = decodeURIComponent(url.pathname || "/");
      const normalized = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, "");
      let filePath = path.join(safeRoot, normalized);

      if (!filePath.startsWith(safeRoot)) {
        filePath = path.join(safeRoot, "index.html");
      } else if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, "index.html");
      } else if (!fs.existsSync(filePath)) {
        filePath = path.join(safeRoot, "index.html");
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || "application/octet-stream";

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("offline bundle read error");
          return;
        }
        res.writeHead(200, { "Content-Type": contentType });
        res.end(data);
      });
    });

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      resolve({
        server,
        url: `http://127.0.0.1:${port}`,
      });
    });
  });
}

/**
 * Inject permissive CORS headers on all responses from the production server.
 * Required when the offline bundle (http://127.0.0.1:{port}) makes API calls to
 * the remote server — Chromium enforces CORS even inside Electron.
 * This must be called after app.whenReady() so defaultSession exists.
 */
function setupDesktopCors(serverUrl) {
  if (!serverUrl) return;
  let serverOrigin;
  try {
    serverOrigin = new URL(serverUrl).origin;
  } catch {
    return;
  }

  // Handle preflight (OPTIONS) requests: respond immediately with 200 + CORS headers
  // so the browser doesn't block the actual request.
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: [`${serverOrigin}/api/*`] },
    (details, callback) => {
      const headers = Object.assign({}, details.requestHeaders);
      // Strip problematic origin so the server CORS middleware stays out of the way.
      // We inject the allow-origin ourselves on the response side.
      callback({ requestHeaders: headers });
    }
  );

  session.defaultSession.webRequest.onHeadersReceived(
    { urls: [`${serverOrigin}/*`] },
    (details, callback) => {
      callback({
        responseHeaders: Object.assign({}, details.responseHeaders, {
          "access-control-allow-origin":      ["*"],
          "access-control-allow-credentials": ["true"],
          "access-control-allow-methods":     ["GET, POST, PUT, DELETE, PATCH, OPTIONS"],
          "access-control-allow-headers":     [
            "Authorization, Content-Type, x-branch-id, x-user-role, x-real-ip",
          ],
        }),
      });
    }
  );
}

function probeUrlReachable(targetUrl, timeoutMs = 4000) {
  return new Promise((resolve) => {
    try {
      const u = new URL(targetUrl);
      const lib = u.protocol === "https:" ? https : http;
      const req = lib.request(
        {
          method: "HEAD",
          hostname: u.hostname,
          port: u.port || (u.protocol === "https:" ? 443 : 80),
          path: u.pathname || "/",
          timeout: timeoutMs,
        },
        (res) => {
          res.destroy();
          resolve(true);
        }
      );
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
      req.on("error", () => resolve(false));
      req.end();
    } catch {
      resolve(false);
    }
  });
}

function errorHtml({ baseUrl, code, description, validatedUrl }) {
  const safe = (v) =>
    String(v || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");

  const appPath = safe(process.execPath);
  const urlLine = validatedUrl ? safe(validatedUrl) : safe(baseUrl);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>POSS Desktop - Connection</title>
    <style>
      body { font-family: system-ui, Segoe UI, Arial; background:#050b1e; color:#e5e7eb; margin:0; }
      .wrap { max-width: 900px; margin: 0 auto; padding: 28px; }
      .card { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.14); border-radius: 16px; padding: 18px; }
      code { background: rgba(255,255,255,0.10); padding: 2px 6px; border-radius: 8px; }
      .muted { color:#9aa4c7; }
      a { color:#7aa2ff; }
      .btn { display:inline-block; margin-top:12px; padding:10px 14px; border-radius:12px; background: rgba(91,124,255,0.25); border:1px solid rgba(91,124,255,0.45); color:#e5e7eb; text-decoration:none; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h2>POSS Desktop couldn't load the server</h2>
      <div class="card">
        <div class="muted">Tried URL:</div>
        <div><code>${urlLine}</code></div>
        <div style="margin-top:10px" class="muted">Error:</div>
        <div><code>${safe(code)}</code> ${safe(description)}</div>
        <hr style="border:none;border-top:1px solid rgba(255,255,255,0.12);margin:14px 0" />
        <div><b>Fix</b></div>
        <ol class="muted">
          <li>Make sure your web app is running and reachable from this PC.</li>
          <li>Run the desktop app once with the server URL, then it will be saved for next time:</li>
        </ol>
        <div><code>"${appPath}" --url=http://YOUR_SERVER_IP:5180</code></div>
        <div class="muted" style="margin-top:8px">Example: <code>--url=http://13.60.186.234:5180</code></div>
        <a class="btn" href="${safe(baseUrl)}">Open in browser</a>
      </div>
    </div>
  </body>
</html>`;
}

function createWindow(targetUrl, offlineUrl, serverUrl) {
  const additionalArguments = serverUrl
    ? [`--poss-server=${serverUrl}`]
    : [];

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    backgroundColor: "#050b1e",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
      additionalArguments,
    }
  });

  let triedOffline = false;

  win.once("ready-to-show", () => win.show());
  win.webContents.on("did-fail-load", (_evt, code, description, validatedUrl) => {
    if (!triedOffline && offlineUrl) {
      triedOffline = true;
      baseUrl = offlineUrl;
      win.loadURL(offlineUrl);
      return;
    }

    const html = errorHtml({
      baseUrl: targetUrl,
      code,
      description,
      validatedUrl,
    });
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  });
  win.loadURL(targetUrl);

  // Periodic server reachability check (every 30 s).
  // If the window is on the offline bundle but the server came back online,
  // reload from the production URL so the user gets realtime data.
  if (serverUrl && offlineUrl) {
    const intervalId = setInterval(async () => {
      if (win.isDestroyed()) { clearInterval(intervalId); return; }
      const reachable = await probeUrlReachable(serverUrl, 3000);
      const current = win.webContents.getURL();
      const onOfflineBundle = current.startsWith("http://127.0.0.1");
      if (reachable && onOfflineBundle) {
        baseUrl = serverUrl;
        win.loadURL(serverUrl);
      }
    }, 30000);
    win.on("closed", () => clearInterval(intervalId));
  }

  return win;
}

function getProtocolArg(argv = process.argv) {
  return (argv || []).find((a) => String(a || "").startsWith(`${PROTOCOL}://`)) || null;
}

function registerProtocolClient() {
  try {
    if (app.isPackaged) {
      app.setAsDefaultProtocolClient(PROTOCOL);
      return;
    }

    const entry = process.argv[1] ? path.resolve(process.argv[1]) : null;
    if (entry) {
      app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [entry]);
    } else {
      app.setAsDefaultProtocolClient(PROTOCOL);
    }
  } catch {
    // ignore protocol registration failures
  }
}

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/* =============================================================
   FILE-BASED OFFLINE STORAGE
   Each snapshotted endpoint is saved as <userData>/local-data/<key>.json
   Pending mutations are queued in <userData>/local-data/pending-queue.json
   and replayed automatically when the server becomes reachable.
============================================================= */

function getLocalDataDir() {
  return path.join(app.getPath("userData"), "local-data");
}

function ensureLocalDataDir() {
  const dir = getLocalDataDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

ipcMain.handle("local-data-read", (_event, key) => {
  try {
    const file = path.join(ensureLocalDataDir(), `${String(key).replace(/[^a-z0-9_-]/gi, "_")}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
});

ipcMain.handle("local-data-write", (_event, key, value) => {
  try {
    const file = path.join(ensureLocalDataDir(), `${String(key).replace(/[^a-z0-9_-]/gi, "_")}.json`);
    fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf-8");
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle("offline-queue-push", (_event, item) => {
  try {
    const dir = ensureLocalDataDir();
    const file = path.join(dir, "pending-queue.json");
    let queue = [];
    if (fs.existsSync(file)) {
      try { queue = JSON.parse(fs.readFileSync(file, "utf-8")); } catch { queue = []; }
    }
    queue.push({
      ...item,
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      timestamp: new Date().toISOString(),
    });
    fs.writeFileSync(file, JSON.stringify(queue, null, 2), "utf-8");
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle("offline-queue-get", () => {
  try {
    const file = path.join(ensureLocalDataDir(), "pending-queue.json");
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return [];
  }
});

ipcMain.handle("offline-queue-remove", (_event, ids) => {
  try {
    const file = path.join(ensureLocalDataDir(), "pending-queue.json");
    if (!fs.existsSync(file)) return true;
    let queue = JSON.parse(fs.readFileSync(file, "utf-8"));
    const idSet = new Set(ids);
    queue = queue.filter((item) => !idSet.has(item.id));
    fs.writeFileSync(file, JSON.stringify(queue, null, 2), "utf-8");
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle("silent-print-text", async (_event, payload) => {
  const { text = "", options = {} } = payload || {};
  const fontSize = Number(options.fontSize || 12) || 12;
  const paperWidth = (String(options.paperSize || "58mm") === "80mm") ? "80mm" : "58mm";
  const pageWidth = paperWidth === "80mm" ? 80000 : 58000;
  const extraHtml = String(options.extraHtml || "");

  const printWin = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true },
  });

  const html = `<!DOCTYPE html><html><head><style>
    @page { size: ${paperWidth} auto; margin: 0; }
    body { margin: 0; padding: 0; width: ${paperWidth}; }
    pre {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      padding: 0 1.5mm;
      font-family: Consolas, "Courier New", monospace;
      font-size: ${Math.max(fontSize, 6)}px;
      line-height: 1.1;
      width: 100%;
      letter-spacing: 0;
      white-space: pre;
    }
    .extra-html {
      box-sizing: border-box;
      width: 100%;
      margin: 0;
      padding: 2mm 1.5mm 0;
    }
    .extra-html img {
      display: block;
      margin: 0 auto;
      max-width: calc(${paperWidth} - 8mm);
      height: auto;
    }
  </style></head><body><pre>${escapeHtml(text)}</pre><div class="extra-html">${extraHtml}</div></body></html>`;

  await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await printWin.webContents.executeJavaScript(
    `(async () => {
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      try {
        if (document.fonts?.ready) {
          await document.fonts.ready.catch(() => {});
        }
      } catch {}

      const images = Array.from(document.images || []);
      if (images.length) {
        await Promise.race([
          Promise.all(images.map((img) => new Promise((resolve) => {
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
          }))),
          delay(2000),
        ]);
      } else {
        await delay(120);
      }

      await delay(120);
      return true;
    })()`,
    true
  );

  return new Promise((resolve, reject) => {
    const opts = {
      silent: true,
      printBackground: true,
      margins: { marginType: "none" },
      pageSize: { width: pageWidth, height: 200000 },
    };
    if (process.env.THERMAL_PRINTER_NAME) opts.deviceName = process.env.THERMAL_PRINTER_NAME;

    printWin.webContents.print(opts, (success, failureReason) => {
      setTimeout(() => printWin.close(), 200);
      if (success) resolve(true);
      else reject(new Error(failureReason || "print failed"));
    });
  });
});

function buildEscPosBuffer(text, { codepage = 0, fontSize = 12, feedLines = 4 } = {}) {
  const chunks = [];
  const useFontB = Number(fontSize) <= 9; // choose smaller built-in font
  const normalizedFeed = Math.min(12, Math.max(4, Math.round(feedLines)));
  const safeText = String(text || "").replace(/\r\n/g, "\n");
  const body = safeText.endsWith("\n") ? safeText : `${safeText}\n`;

  // Initialize printer, select codepage, font, and default line spacing
  chunks.push(Buffer.from([0x1b, 0x40])); // ESC @
  chunks.push(Buffer.from([0x1b, 0x74, codepage])); // ESC t n
  chunks.push(Buffer.from([0x1b, 0x4d, useFontB ? 0x01 : 0x00])); // ESC M n (Font B for compact)
  chunks.push(Buffer.from([0x1b, 0x32])); // ESC 2 (default line spacing)
  chunks.push(Buffer.from([0x1d, 0x21, 0x00])); // GS ! 0 (no double-size)

  // Content + trailing line to guarantee footer prints before feed/cut
  chunks.push(Buffer.from(body, "binary"));

  // Feed a few blank lines so the last line clears the cutter, then cut
  chunks.push(Buffer.from([0x1b, 0x64, normalizedFeed])); // ESC d n (feed n lines)
  chunks.push(Buffer.from([0x1d, 0x56, 0x00])); // GS V 0 (full cut, if supported)
  return Buffer.concat(chunks);
}

ipcMain.handle("raw-print-text", async (_event, payload) => {
  const { text = "", port, codepage, fontSize, feedLines, paperSize } = payload || {};
  ensureThermalDriverInstalled();
  const detected = findBluetoothPrinterPort();
  const candidates = Array.from(
    new Set([
      port,
      process.env.THERMAL_PORT,
      detected,
      "COM7",
      "COM5",
      "COM3",
      "COM4",
      "COM6",
      "COM8",
    ].filter(Boolean))
  );

  return new Promise((resolve, reject) => {
    const tryNext = () => {
      if (!candidates.length) return reject(new Error("No available COM port for printer"));
      const targetPort = candidates.shift();
      try {
        try {
          child_process.execSync(`mode ${targetPort}: BAUD=9600 PARITY=N data=8 stop=1 xon=on`, { stdio: "ignore" });
        } catch {
          // ignore mode failures; will still attempt open
        }
        const path = `\\\\.\\${targetPort}`;
        const fd = fs.openSync(path, "w");
        const buf = buildEscPosBuffer(text, {
          codepage: typeof codepage === "number" ? codepage : 0,
          fontSize: typeof fontSize === "number" ? fontSize : 12,
          feedLines: typeof feedLines === "number" ? feedLines : 4,
        });
        fs.writeSync(fd, buf);
        try {
          fs.fsyncSync(fd); // ensure buffer is flushed before closing so footer doesn't drift to next job
        } catch {
          // ignore fsync failures
        }
        fs.closeSync(fd);
        console.log(`raw-print-text: sent to ${targetPort}`);
        resolve(true);
      } catch (err) {
        tryNext();
      }
    };
    tryNext();
  });
});

let mainWindow = null;
let baseUrl = null;
let offlineServer = null;
let offlineUrl = null;
let pendingProtocolUrl = getProtocolArg(process.argv);

function toAbsoluteUrl(openUrl) {
  const raw = String(openUrl || "");
  if (!raw.toLowerCase().startsWith(`${PROTOCOL}://`)) return null;
  if (!baseUrl) return null;

  try {
    const u = new URL(raw);
    const targetPath = u.searchParams.get("path") || "/";
    const b = new URL(baseUrl);
    b.pathname = targetPath.startsWith("/") ? targetPath : `/${targetPath}`;
    return b.toString();
  } catch {
    return null;
  }
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }

    const openArg = getProtocolArg(argv);
    pendingProtocolUrl = openArg || pendingProtocolUrl;
    const target = toAbsoluteUrl(openArg);
    if (target && mainWindow) mainWindow.loadURL(target);
  });
}

app.whenReady().then(async () => {
  const resolvedUrl = resolveAppUrl();
  persistAppUrl(resolvedUrl);

  // Must be called before creating the window so the session filter is in place.
  setupDesktopCors(resolvedUrl);

  // Start lightweight static server for the bundled offline UI (if present).
  const offlineDir = getOfflineUiDir();
  if (offlineDir) {
    try {
      offlineServer = await startOfflineServer(offlineDir);
      offlineUrl = offlineServer.url;
    } catch {
      offlineServer = null;
      offlineUrl = null;
    }
  }

  const reachable = await probeUrlReachable(resolvedUrl);
  baseUrl = reachable ? resolvedUrl : (offlineUrl || resolvedUrl);

  // Expose current online state so the renderer can check it on load.
  ipcMain.handle("is-server-reachable", () => probeUrlReachable(resolvedUrl));

  if (!app.isDefaultProtocolClient(PROTOCOL)) {
    registerProtocolClient();
  }

  const initialTarget = toAbsoluteUrl(pendingProtocolUrl) || baseUrl;
  pendingProtocolUrl = null;
  mainWindow = createWindow(initialTarget, offlineUrl, resolvedUrl);
});

app.on("open-url", (event, url) => {
  event.preventDefault();
  pendingProtocolUrl = url || pendingProtocolUrl;
  const target = toAbsoluteUrl(url);
  if (target && mainWindow) mainWindow.loadURL(target);
});

const stopOfflineServer = () => {
  if (offlineServer && offlineServer.server) {
    try {
      offlineServer.server.close();
    } catch {
      // ignore shutdown errors
    }
  }
  offlineServer = null;
  offlineUrl = null;
};

app.on("window-all-closed", () => {
  stopOfflineServer();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    baseUrl = baseUrl || resolveAppUrl();
    const target = toAbsoluteUrl(pendingProtocolUrl) || baseUrl;
    pendingProtocolUrl = null;
    mainWindow = createWindow(target, offlineUrl);
  }
});

app.on("will-quit", stopOfflineServer);
