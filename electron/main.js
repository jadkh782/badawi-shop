/**
 * Badawi Shop on the till.
 *
 * A window onto the live site, plus the one thing a browser cannot do: put a receipt on the
 * printer without asking. The app itself is not bundled in here — it is loaded from the same
 * address the phone uses, so pushing a change reaches the till without anyone reinstalling
 * anything. The shop cannot sell without reaching Supabase in any case, so nothing is lost
 * by also needing to reach the site.
 *
 * The web app notices it is running in here by the presence of window.badawiPrint, decides
 * on its own to print silently rather than through a dialog, and otherwise behaves exactly
 * as it does in a browser.
 */
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

/** Where the shop lives. Overridable so a test build can point somewhere else. */
const SHOP_URL = process.env.BADAWI_URL || 'https://badawi-shop.vercel.app';
const SHOP_ORIGIN = new URL(SHOP_URL).origin;

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 380,
    backgroundColor: '#17150f',
    title: 'Badawi Shop',
    icon: path.join(__dirname, 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // The page is remote, so it gets no access to Node and no shared globals with the
      // preload beyond the one narrow bridge below.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.once('ready-to-show', () => mainWindow.show());

  /*
    The window only ever shows the shop. A link that would take it somewhere else opens in
    the real browser instead, so the till cannot end up stranded on a page with no way back
    and no address bar to fix it with.
  */
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (new URL(url).origin !== SHOP_ORIGIN) void shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== SHOP_ORIGIN) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  mainWindow.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    // -3 is an aborted load, which happens routinely on redirects and means nothing.
    if (!isMainFrame || code === -3) return;
    showOffline(description, url);
  });

  void mainWindow.loadURL(SHOP_URL);
}

/**
 * What the till shows when it cannot reach the shop.
 *
 * A blank window with no address bar tells whoever is standing there nothing at all. This
 * says which address failed and offers to try again, which is the whole of what they can
 * usefully do about it.
 */
function showOffline(reason, url) {
  const page = `<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin:0; height:100vh; display:flex; align-items:center; justify-content:center;
           background:#17150f; color:#f5f0e6; font-family:system-ui,sans-serif; text-align:center; }
    div { max-width:30rem; padding:2rem; }
    h1 { font-size:1.3rem; margin:0 0 .75rem; }
    p { color:#a8a195; line-height:1.6; margin:0 0 1.5rem; font-size:.9rem; }
    code { color:#f0b429; font-size:.85rem; word-break:break-all; }
    button { min-height:48px; padding:0 1.5rem; border:0; border-radius:14px;
             background:#f0b429; color:#17150f; font-weight:700; font-size:1rem; cursor:pointer; }
  </style></head><body><div>
    <h1>Cannot reach the shop</h1>
    <p>The till could not load <code>${escapeHtml(url || SHOP_URL)}</code>.<br>${escapeHtml(
      reason || '',
    )}</p>
    <p>Check this computer is online, then try again.</p>
    <button onclick="location.href='${SHOP_URL}'">Try again</button>
  </div></body></html>`;

  void mainWindow?.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(page));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

// ---------------------------------------------------------------------------
// Printing
// ---------------------------------------------------------------------------

/**
 * Prints a finished document, with no dialog.
 *
 * The document arrives as HTML, already laid out for 80mm paper by the same code that builds
 * it for the browser, so a receipt printed here and one printed on a phone are the same
 * receipt. It is rendered in an offscreen window because printing needs something laid out,
 * and that window is destroyed whether the print worked or not.
 */
ipcMain.handle('badawi:print', async (_event, job) => {
  if (!job || typeof job.html !== 'string') return 'unavailable';

  const worker = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, javascript: false },
  });

  try {
    await worker.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(job.html));

    return await new Promise((resolve) => {
      worker.webContents.print(
        {
          silent: true,
          printBackground: true,
          // The paper size comes from the printer's own driver settings, which is where the
          // 80mm roll is already configured. Forcing a height here would either clip a long
          // receipt or feed blank paper after a short one.
          margins: { marginType: 'none' },
          ...(job.deviceName ? { deviceName: job.deviceName } : {}),
        },
        (success, failureReason) => {
          if (success) resolve('printed');
          else resolve(failureReason === 'cancelled' ? 'cancelled' : 'unavailable');
        },
      );
    });
  } catch {
    return 'unavailable';
  } finally {
    if (!worker.isDestroyed()) worker.destroy();
  }
});

/** The printers Windows knows about, so the shop can pick one rather than guess. */
ipcMain.handle('badawi:printers', async () => {
  if (!mainWindow) return [];
  const printers = await mainWindow.webContents.getPrintersAsync();
  return printers.map((printer) => ({
    name: printer.name,
    description: printer.displayName || printer.description || '',
    isDefault: Boolean(printer.isDefault),
  }));
});

// ---------------------------------------------------------------------------

// One till, one window. A second copy pointed at the same shop would be two people taking
// the same sale.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

// Keeps the packaged app from dying silently on a bad day.
process.on('uncaughtException', (error) => {
  try {
    fs.appendFileSync(
      path.join(app.getPath('userData'), 'error.log'),
      `${new Date().toISOString()} ${error.stack || error}\n`,
    );
  } catch {
    // Nothing useful to do if even the log cannot be written.
  }
  dialog.showErrorBox('Badawi Shop', String(error && error.message ? error.message : error));
});
