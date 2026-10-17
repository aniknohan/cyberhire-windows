// CyberHire — Windows desktop app.
//
// Everything runs on this computer: the bundled backend (soc-backend.exe) serves the app UI and
// its /api on http://127.0.0.1:<port>, and stores accounts, interviews, reports, drills and
// recordings in the user's app-data folder. Only the AI itself (interviewer brain, voices and
// speech recognition) is reached over the internet, using the API keys from Settings.
const { app, BrowserWindow, Menu, dialog, ipcMain, safeStorage, session, shell } = require("electron");
const { spawn, execFile } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");

const APP_NAME = "CyberHire";
const PREFERRED_PORT = 47821;
const isDev = !app.isPackaged;

app.setName(APP_NAME);
app.setAppUserModelId("com.cyberhire.desktop");

const userData = app.getPath("userData");
const settingsFile = path.join(userData, "settings.json");
const logDir = path.join(userData, "logs");

let mainWindow = null;
let settingsWindow = null;
let backend = null;
let port = null;
let quitting = false;

// ───────────────────────── settings (API keys are encrypted with Windows DPAPI) ─────────────────────────

const SECRET_FIELDS = ["openaiKey", "anthropicKey", "stripeSecretKey", "stripeWebhookSecret", "paypalSecret"];
const DEFAULTS = {
  openaiKey: "",
  anthropicKey: "",
  localPro: true,
  stripeSecretKey: "",
  stripeWebhookSecret: "",
  paypalClientId: "",
  paypalSecret: "",
  paypalMode: "sandbox",
  adminEmail: "admin@socsim.com",
  adminPassword: "Admin@123",
  appTz: "",
};

function enc(v) {
  if (!v) return "";
  if (safeStorage.isEncryptionAvailable()) return "enc:" + safeStorage.encryptString(v).toString("base64");
  return "b64:" + Buffer.from(v, "utf8").toString("base64");
}

function dec(v) {
  if (!v) return "";
  try {
    if (v.startsWith("enc:")) return safeStorage.decryptString(Buffer.from(v.slice(4), "base64"));
    if (v.startsWith("b64:")) return Buffer.from(v.slice(4), "base64").toString("utf8");
  } catch {
    return "";
  }
  return v;
}

function readSettings() {
  let raw = {};
  try {
    raw = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
  } catch {}
  const s = { ...DEFAULTS, ...raw };
  for (const k of SECRET_FIELDS) s[k] = dec(raw[k] || "");
  if (!raw.jwtSecret) {
    s.jwtSecret = crypto.randomBytes(32).toString("hex");
    writeSettings(s);
  }
  return s;
}

function writeSettings(s) {
  const out = { ...s };
  for (const k of SECRET_FIELDS) out[k] = enc(s[k] || "");
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(settingsFile, JSON.stringify(out, null, 2));
}

function hasAiKey(s) {
  return Boolean((s.openaiKey || "").trim() || (s.anthropicKey || "").trim());
}

// ───────────────────────── local backend ─────────────────────────

function resourcesPath(...p) {
  return isDev ? path.join(__dirname, "..", ...p) : path.join(process.resourcesPath, ...p);
}

function freePort(preferred) {
  const tryPort = (p) =>
    new Promise((resolve) => {
      const srv = net.createServer();
      srv.once("error", () => resolve(null));
      srv.listen(p, "127.0.0.1", () => {
        const got = srv.address().port;
        srv.close(() => resolve(got));
      });
    });
  return tryPort(preferred).then((p) => p || tryPort(0));
}

function backendEnv(s) {
  const env = {
    ...process.env,
    SOC_DATA_DIR: userData,
    SOC_FRONTEND_DIR: isDev ? path.join(__dirname, "..", "frontend", "dist") : resourcesPath("frontend"),
    JWT_SECRET: s.jwtSecret,
    COOKIE_SECURE: "0",
    DB_NAME: "soc_interview_simulator",
    OPENAI_API_KEY: (s.openaiKey || "").trim(),
    ANTHROPIC_API_KEY: (s.anthropicKey || "").trim(),
    SOC_LOCAL_PRO: "1", // CyberHire is free: every feature unlocked
    ADMIN_EMAIL: s.adminEmail || DEFAULTS.adminEmail,
    ADMIN_PASSWORD: s.adminPassword || DEFAULTS.adminPassword,
    PYTHONUNBUFFERED: "1",
    PYTHONIOENCODING: "utf-8",
  };
  if (s.appTz) env.APP_TZ = s.appTz;
  if (s.stripeSecretKey) env.STRIPE_SECRET_KEY = s.stripeSecretKey.trim();
  if (s.stripeWebhookSecret) env.STRIPE_WEBHOOK_SECRET = s.stripeWebhookSecret.trim();
  if (s.paypalClientId && s.paypalSecret) {
    env.PAYPAL_CLIENT_ID = s.paypalClientId.trim();
    env.PAYPAL_SECRET = s.paypalSecret.trim();
    env.PAYPAL_MODE = s.paypalMode === "live" ? "live" : "sandbox";
  }
  return env;
}

function startBackend() {
  const s = readSettings();
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, "backend.log");
  try {
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > 5 * 1024 * 1024) fs.renameSync(logFile, logFile + ".old");
  } catch {}
  const log = fs.createWriteStream(logFile, { flags: "a" });
  log.write(`\n===== ${new Date().toISOString()} starting backend on port ${port} =====\n`);

  let cmd;
  let args;
  if (isDev) {
    cmd = process.env.SOC_PYTHON || (process.platform === "win32" ? "python" : "python3");
    args = [path.join(__dirname, "..", "backend", "desktop_server.py"), "--port", String(port)];
  } else {
    cmd = resourcesPath("backend", process.platform === "win32" ? "soc-backend.exe" : "soc-backend");
    args = ["--port", String(port)];
  }
  const child = spawn(cmd, args, { env: backendEnv(s), windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  child.on("exit", (code) => {
    log.write(`===== backend exited with code ${code} =====\n`);
    if (backend === child) backend = null;
    if (!quitting && child.expectedExit !== true && mainWindow && !mainWindow.isDestroyed()) {
      showError("The local interview engine stopped unexpectedly.", tailLog());
    }
  });
  child.on("error", (err) => {
    log.write(`spawn error: ${err.message}\n`);
    if (!quitting) showError("The local interview engine could not start.", err.message);
  });
  backend = child;
  return child;
}

function stopBackend() {
  const child = backend;
  backend = null;
  if (!child || child.exitCode !== null) return Promise.resolve();
  child.expectedExit = true;
  return new Promise((resolve) => {
    const done = () => resolve();
    child.once("exit", done);
    if (process.platform === "win32") {
      execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"], () => setTimeout(done, 1500));
    } else {
      child.kill("SIGTERM");
      setTimeout(done, 1500);
    }
  });
}

function waitForBackend(timeoutMs = 90000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get({ host: "127.0.0.1", port, path: "/api/", timeout: 2000 }, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve();
        retry();
      });
      req.on("error", retry);
      req.on("timeout", () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      if (!backend) return reject(new Error("backend exited"));
      if (Date.now() - started > timeoutMs) return reject(new Error("timed out"));
      setTimeout(attempt, 400);
    };
    attempt();
  });
}

function tailLog() {
  try {
    const t = fs.readFileSync(path.join(logDir, "backend.log"), "utf8");
    return t.split("\n").slice(-25).join("\n");
  } catch {
    return "";
  }
}

const appOrigin = () => `http://127.0.0.1:${port}`;

function isAppUrl(url) {
  try {
    const u = new URL(url);
    return (u.hostname === "127.0.0.1" || u.hostname === "localhost") && String(u.port) === String(port);
  } catch {
    return false;
  }
}

// Sign-in and checkout pages that must open inside the app window so they can return to it.
const IN_APP_HOSTS = [/(^|\.)emergentagent\.com$/, /(^|\.)accounts\.google\.com$/, /(^|\.)google\.com$/, /(^|\.)stripe\.com$/, /(^|\.)paypal\.com$/];
function isInAppExternal(url) {
  try {
    const h = new URL(url).hostname;
    return IN_APP_HOSTS.some((re) => re.test(h));
  } catch {
    return false;
  }
}

// ───────────────────────── windows ─────────────────────────

function loadingPage(title, detail = "", actions = false) {
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${APP_NAME}</title>
<style>body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#090D14;color:#F1F5F9;font-family:"Segoe UI",system-ui,sans-serif}
.c{max-width:640px;padding:32px;text-align:center}.s{width:34px;height:34px;border:3px solid #1E293B;border-top-color:#2563EB;border-radius:50%;margin:0 auto 18px;animation:r 1s linear infinite}
@keyframes r{to{transform:rotate(360deg)}}h1{font-size:18px;font-weight:600;margin:0 0 8px}p{color:#94A3B8;font-size:13px}
pre{text-align:left;background:#0E1524;border:1px solid #1E293B;border-radius:10px;padding:12px;color:#94A3B8;font-size:11px;max-height:300px;overflow:auto;white-space:pre-wrap}</style></head>
<body><div class="c">${actions ? "" : '<div class="s"></div>'}<h1>${esc(title)}</h1>${detail ? (actions ? `<pre>${esc(detail)}</pre>` : `<p>${esc(detail)}</p>`) : ""}
${actions ? '<p>Use the <b>App</b> menu → <b>Restart interview engine</b>, or <b>Open data folder</b> → logs to see the full log.</p>' : ""}</div></body></html>`;
  return "data:text/html;charset=utf-8," + encodeURIComponent(html);
}

function showError(title, detail) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(loadingPage(title, detail, true));
}


// Right-click menu for text: Electron shows none by default, so add Cut / Copy / Paste / Select all.
function attachContextMenu(win) {
  win.webContents.on("context-menu", (_e, params) => {
    const items = [];
    if (params.isEditable) {
      items.push({ role: "undo", enabled: params.editFlags.canUndo }, { role: "redo", enabled: params.editFlags.canRedo }, { type: "separator" },
        { role: "cut", enabled: params.editFlags.canCut }, { role: "copy", enabled: params.editFlags.canCopy },
        { role: "paste", enabled: params.editFlags.canPaste }, { type: "separator" }, { role: "selectAll" });
    } else if (params.selectionText && params.selectionText.trim()) {
      items.push({ role: "copy" }, { role: "selectAll" });
    }
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 420,
    minHeight: 600,
    title: APP_NAME,
    backgroundColor: "#090D14",
    show: false,
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  attachContextMenu(mainWindow);
  mainWindow.loadURL(loadingPage("Starting CyberHire…", "Preparing your local interview engine."));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url)) return { action: "allow" };
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (e, url) => {
    if (isAppUrl(url) || isInAppExternal(url) || url.startsWith("data:")) return;
    e.preventDefault();
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
  });
  mainWindow.on("closed", () => (mainWindow = null));
}

async function bootApp() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(loadingPage("Starting CyberHire…", "Preparing your local interview engine."));
  port = port || (await freePort(PREFERRED_PORT));
  startBackend();
  try {
    await waitForBackend();
  } catch (e) {
    showError("The local interview engine could not start.", tailLog() || String(e));
    return;
  }
  if (mainWindow && !mainWindow.isDestroyed()) await mainWindow.loadURL(appOrigin() + "/");
}

async function restartBackend() {
  await stopBackend();
  await bootApp();
}

function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 620,
    height: 760,
    minWidth: 480,
    minHeight: 500,
    title: "Settings — " + APP_NAME,
    backgroundColor: "#090D14",
    parent: mainWindow || undefined,
    modal: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "settings-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // Keep Ctrl+C / Ctrl+V / Ctrl+A working in the Settings window (its menu bar is hidden, not removed).
  settingsWindow.setMenu(Menu.buildFromTemplate([{ label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] }]));
  settingsWindow.setMenuBarVisibility(false);
  attachContextMenu(settingsWindow);
  settingsWindow.loadFile(path.join(__dirname, "settings.html"));
  settingsWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  settingsWindow.on("closed", () => (settingsWindow = null));
}

function buildMenu() {
  const template = [
    {
      label: "App",
      submenu: [
        { label: "Settings && API keys…", accelerator: "CmdOrCtrl+,", click: openSettings },
        { type: "separator" },
        { label: "Open data folder", click: () => shell.openPath(userData) },
        { label: "Restart interview engine", click: () => restartBackend() },
        { type: "separator" },
        { role: "quit", label: "Quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        { role: "toggleDevTools", visible: isDev },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About",
          click: () =>
            dialog.showMessageBox({
              type: "info",
              title: APP_NAME,
              message: `${APP_NAME} ${app.getVersion()}`,
              detail:
                "Runs entirely on this computer. Your account, interviews, reports, drills and recordings are stored locally in:\n" +
                userData +
                "\n\nThe AI interviewer, voices and speech recognition use your own OpenAI / Anthropic API keys (App → Settings).",
            }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ───────────────────────── IPC for the settings window ─────────────────────────

ipcMain.handle("settings:get", () => {
  const s = readSettings();
  const { jwtSecret, ...rest } = s;
  return { ...rest, dataDir: userData, version: app.getVersion() };
});

ipcMain.handle("settings:save", async (_e, incoming) => {
  const cur = readSettings();
  const allowed = Object.keys(DEFAULTS);
  const next = { ...cur };
  for (const k of allowed) if (k in incoming) next[k] = incoming[k];
  next.localPro = true;
  writeSettings(next);
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close();
  await restartBackend();
  return true;
});

ipcMain.handle("settings:test", async (_e, which, key) => {
  key = (key || "").trim();
  if (!key) return { ok: false, message: "Enter a key first." };
  const { net: enet } = require("electron");
  const url = which === "anthropic" ? "https://api.anthropic.com/v1/models" : "https://api.openai.com/v1/models";
  const headers = which === "anthropic" ? { "x-api-key": key, "anthropic-version": "2023-06-01" } : { Authorization: `Bearer ${key}` };
  try {
    const res = await enet.fetch(url, { headers });
    if (res.ok) return { ok: true, message: "Key works." };
    const body = await res.text();
    let msg = body.slice(0, 200);
    try {
      msg = JSON.parse(body).error.message || msg;
    } catch {}
    return { ok: false, message: `Rejected (${res.status}): ${msg}` };
  } catch (e) {
    return { ok: false, message: "Could not reach the service: " + e.message };
  }
});

ipcMain.handle("settings:openData", () => shell.openPath(userData));
ipcMain.handle("settings:clipboard", () => require("electron").clipboard.readText().trim());

// ───────────────────────── app lifecycle ─────────────────────────

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    // Camera + microphone for the lobby and interview room — granted to the app's own local page only.
    const allowed = new Set(["media", "mediaKeySystem", "speaker-selection", "clipboard-sanitized-write", "fullscreen"]);
    session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
      callback(allowed.has(permission) && isAppUrl(details.requestingUrl || wc.getURL()));
    });
    session.defaultSession.setPermissionCheckHandler((_wc, permission, origin) => allowed.has(permission) && isAppUrl(origin || ""));

    buildMenu();
    createMainWindow();
    const s = readSettings();
    await bootApp();
    if (!hasAiKey(s)) openSettings();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", (e) => {
    if (quitting) return;
    quitting = true;
    if (backend) {
      e.preventDefault();
      stopBackend().finally(() => app.quit());
    }
  });
}
