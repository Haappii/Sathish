const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

const PROTOCOL = "poss";
const CONFIG_FILE = "config.json";

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

function resolveAppUrl() {
  const argv = process.argv || [];
  const urlArg = argv.find((a) => String(a || "").startsWith("--url="));
  if (urlArg) return String(urlArg).slice("--url=".length);

  if (process.env.APP_URL) return String(process.env.APP_URL);

  const cfg = readUserConfig();
  if (cfg && cfg.app_url) return String(cfg.app_url);

  return "http://localhost:8000";
}

function persistAppUrl(url) {
  if (!isValidHttpUrl(url)) return;
  const cfg = readUserConfig() || {};
  if (String(cfg.app_url || "") === String(url)) return;
  writeUserConfig({ ...cfg, app_url: String(url) });
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

function createWindow(targetUrl) {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    backgroundColor: "#050b1e",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.once("ready-to-show", () => win.show());
  win.webContents.on("did-fail-load", (_evt, code, description, validatedUrl) => {
    const html = errorHtml({
      baseUrl: targetUrl,
      code,
      description,
      validatedUrl,
    });
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  });
  win.loadURL(targetUrl);
  return win;
}

let mainWindow = null;
let baseUrl = null;

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

    const openArg = (argv || []).find((a) => String(a || "").startsWith(`${PROTOCOL}://`));
    const target = toAbsoluteUrl(openArg);
    if (target && mainWindow) mainWindow.loadURL(target);
  });
}

app.whenReady().then(() => {
  baseUrl = resolveAppUrl();
  persistAppUrl(baseUrl);

  if (!app.isDefaultProtocolClient(PROTOCOL)) {
    try {
      app.setAsDefaultProtocolClient(PROTOCOL);
    } catch {
      // ignore
    }
  }

  mainWindow = createWindow(baseUrl);
});

app.on("open-url", (event, url) => {
  event.preventDefault();
  const target = toAbsoluteUrl(url);
  if (target && mainWindow) mainWindow.loadURL(target);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    baseUrl = baseUrl || resolveAppUrl();
    mainWindow = createWindow(baseUrl);
  }
});
