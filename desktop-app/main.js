const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

const PROTOCOL = "poss";

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function resolveAppUrl() {
  const argv = process.argv || [];
  const urlArg = argv.find((a) => String(a || "").startsWith("--url="));
  if (urlArg) return String(urlArg).slice("--url=".length);

  if (process.env.APP_URL) return String(process.env.APP_URL);

  try {
    const cfgPath = path.join(app.getPath("userData"), "config.json");
    if (fs.existsSync(cfgPath)) {
      const cfg = safeParseJson(fs.readFileSync(cfgPath, "utf-8"));
      if (cfg && cfg.app_url) return String(cfg.app_url);
    }
  } catch {
    // ignore
  }

  return "http://localhost:8000";
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

