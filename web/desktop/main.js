// VIOCHEM for Windows. Runs the same server as the website on this computer, with the data in a
// SQLite file in the user's AppData folder, and opens it in its own window. Other computers and
// phones on the same Wi-Fi open it in their browser at http://viochem.local:3000.
const { app, BrowserWindow, Menu, dialog, shell, utilityProcess } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Bonjour } = require("bonjour-service");
const signer = require("./signer");

const PORT = 3000;
const LOCAL = `http://localhost:${PORT}`;

const dataDir = app.getPath("userData");
const dbFile = path.join(dataDir, "viochem.db");
const serverDir = app.isPackaged ? path.join(process.resourcesPath, "app") : path.join(__dirname, "app");
const logFile = path.join(dataDir, "server.log");

let win = null;
let server = null;
let bonjour = null;
let quitting = false;

/** Secrets made on first start and kept in the data folder: the session key and the signer's password. */
function secrets() {
  const file = path.join(dataDir, "secrets.json");
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    const s = { sessionSecret: crypto.randomBytes(32).toString("hex"), signerToken: crypto.randomBytes(24).toString("hex") };
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(s, null, 2));
    return s;
  }
}

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(path.join(dataDir, "desktop.json"), "utf8"));
  } catch {
    return {};
  }
}

function writeSettings(change) {
  const file = path.join(dataDir, "desktop.json");
  fs.writeFileSync(`${file}.tmp`, JSON.stringify({ ...readSettings(), ...change }, null, 2));
  fs.renameSync(`${file}.tmp`, file);
}

const defaultBackupDir = () => path.join(app.getPath("documents"), "VIOCHEM Backups");
const backupDir = () => readSettings().backupDir || defaultBackupDir();

function startServer() {
  const { sessionSecret, signerToken } = secrets();
  const log = fs.createWriteStream(logFile, { flags: "a" });
  log.write(`\n--- ${new Date().toISOString()} starting ---\n`);
  server = utilityProcess.fork(path.join(serverDir, "server.js"), [], {
    cwd: serverDir,
    stdio: "pipe",
    serviceName: "VIOCHEM server",
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(PORT),
      // Every network this computer is on, so devices on the same Wi-Fi can reach it.
      HOSTNAME: "0.0.0.0",
      // One connection: a SQLite file takes one writer at a time, and this way requests queue instead of failing.
      DATABASE_URL: `file:${dbFile.replace(/\\/g, "/")}?connection_limit=1&socket_timeout=60`,
      SESSION_SECRET: sessionSecret,
      VIOCHEM_DATA_DIR: dataDir,
      VIOCHEM_BACKUP_DIR: defaultBackupDir(),
      ETA_SIGNER_URL: `http://localhost:${signer.PORT}/sign`,
      ETA_SIGNER_TOKEN: signerToken,
    },
  });
  server.stdout?.pipe(log);
  server.stderr?.pipe(log);
  server.on("exit", (code) => {
    server = null;
    if (!quitting && code !== 0) {
      dialog.showErrorBox("VIOCHEM stopped", `The VIOCHEM server stopped unexpectedly. Details are in:\n${logFile}`);
    }
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (!server) return resolve();
    server.once("exit", () => resolve());
    server.kill();
  });
}

async function waitForServer(timeoutMs = 90_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const res = await fetch(`${LOCAL}/api/health`);
      if (res.ok) return true;
    } catch {
      // Not listening yet.
    }
    if (!server) return false;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

/** Answers for viochem.local on the network, so devices find this computer whatever address the Wi-Fi gave it. */
function announce() {
  try {
    bonjour = new Bonjour();
    bonjour.publish({ name: "VIOCHEM", type: "http", port: PORT, host: "viochem.local" });
  } catch (e) {
    console.error("Couldn't announce viochem.local", e);
  }
}

async function restore() {
  const pick = await dialog.showOpenDialog(win, {
    title: "Restore from backup",
    defaultPath: backupDir(),
    filters: [{ name: "VIOCHEM backup", extensions: ["db"] }],
    properties: ["openFile"],
  });
  if (pick.canceled || !pick.filePaths[0]) return;
  const chosen = pick.filePaths[0];
  const { response } = await dialog.showMessageBox(win, {
    type: "warning",
    buttons: ["Restore", "Cancel"],
    defaultId: 1,
    cancelId: 1,
    title: "Restore from backup",
    message: `Replace all data with the backup ${path.basename(chosen)}?`,
    detail: "Everything entered after that backup was taken will be replaced. A copy of the data as it is now is saved in the backup folder first, so you can go back.",
  });
  if (response !== 0) return;

  await stopServer();
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  fs.mkdirSync(backupDir(), { recursive: true });
  const safety = path.join(backupDir(), `before-restore-${stamp}.db`);
  try {
    if (fs.existsSync(dbFile)) fs.copyFileSync(dbFile, safety);
    for (const suffix of ["-wal", "-shm"]) fs.rmSync(dbFile + suffix, { force: true });
    fs.copyFileSync(chosen, dbFile);
  } catch (e) {
    dialog.showErrorBox("Restore failed", String(e));
  }
  startServer();
  if (await waitForServer()) win?.loadURL(LOCAL);
  dialog.showMessageBox(win, { type: "info", message: "Restored.", detail: `The data as it was before is saved as:\n${safety}` });
}

async function chooseBackupFolder() {
  const pick = await dialog.showOpenDialog(win, { title: "Choose the backup folder", defaultPath: backupDir(), properties: ["openDirectory", "createDirectory"] });
  if (pick.canceled || !pick.filePaths[0]) return;
  writeSettings({ backupDir: pick.filePaths[0] });
  win?.webContents.reload();
}

async function startSigner() {
  const result = await signer.start(serverDir, dataDir, secrets().signerToken, LOCAL);
  writeSettings({ startSigner: result.ok });
  dialog.showMessageBox(win, { type: result.ok ? "info" : "warning", message: result.ok ? "The e-seal signer is running." : "The e-seal signer didn't start.", detail: result.message });
  buildMenu();
}

function buildMenu() {
  const isWindows = process.platform === "win32";
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "File",
        submenu: [
          { label: "Open on other devices…", click: () => win?.loadURL(`${LOCAL}/settings/desktop`) },
          { label: "Open in browser", click: () => shell.openExternal(LOCAL) },
          { type: "separator" },
          { label: "Choose backup folder…", click: chooseBackupFolder },
          {
            label: "Open backup folder",
            click: () => {
              fs.mkdirSync(backupDir(), { recursive: true });
              shell.openPath(backupDir());
            },
          },
          { label: "Restore from backup…", click: restore },
          { label: "Open data folder", click: () => shell.openPath(dataDir) },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      {
        label: "E-invoice",
        submenu: [
          { label: signer.running() ? "E-seal signer is running" : "E-seal signer is not running", enabled: false },
          { label: "Start e-seal signer", enabled: isWindows && !signer.running(), click: startSigner },
          {
            label: "Stop e-seal signer",
            enabled: signer.running(),
            click: () => {
              signer.stop();
              writeSettings({ startSigner: false });
              buildMenu();
            },
          },
        ],
      },
      { label: "View", submenu: [{ role: "reload" }, { role: "zoomIn" }, { role: "zoomOut" }, { role: "resetZoom" }, { type: "separator" }, { role: "togglefullscreen" }] },
    ]),
  );
}

async function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 880,
    title: "VIOCHEM",
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  // Links to other websites (the tax authority's portal, for one) open in the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(LOCAL)) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });
  // Closing VIOCHEM closes it for everyone on the Wi-Fi, so it asks first.
  win.on("close", (e) => {
    if (quitting) return;
    const choice = dialog.showMessageBoxSync(win, {
      type: "question",
      buttons: ["Close VIOCHEM", "Keep it open"],
      defaultId: 1,
      cancelId: 1,
      message: "Close VIOCHEM?",
      detail: "Other computers and phones on the Wi-Fi can't use VIOCHEM while it's closed on this computer.",
    });
    if (choice === 1) e.preventDefault();
    else quitting = true;
  });
  win.on("closed", () => (win = null));
  await win.loadFile(path.join(__dirname, "splash.html"));
  if (await waitForServer()) await win.loadURL(LOCAL);
  else dialog.showErrorBox("VIOCHEM didn't start", `Is VIOCHEM already open, or another program using port ${PORT}? Details are in:\n${logFile}`);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    fs.mkdirSync(dataDir, { recursive: true });
    startServer();
    announce();
    buildMenu();
    await createWindow();
    if (process.platform === "win32" && readSettings().startSigner) {
      await signer.start(serverDir, dataDir, secrets().signerToken, LOCAL);
      buildMenu();
    }
  });

  app.on("window-all-closed", () => app.quit());

  app.on("before-quit", () => {
    quitting = true;
    signer.stop();
    bonjour?.unpublishAll(() => bonjour?.destroy());
    server?.kill();
  });
}
