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
 * The document arrives as HTML, already laid out by the same code that builds it for the
 * browser, so a receipt printed here and one printed on a phone are the same receipt. It is
 * rendered in an offscreen window because printing needs something laid out, and that window
 * is torn down whether the print worked or not.
 *
 * Written to a file rather than handed over as a data: URL. The data URL route printed the
 * HTML source as plain text on the real printer — feet of paper covered in angle brackets —
 * and a file has no encoding to get wrong, no length limit to exceed and an extension that
 * settles what it is.
 */
ipcMain.handle('badawi:print', async (_event, job) => {
  if (!job || typeof job.html !== 'string' || job.html.length === 0) return 'unavailable';

  const scratch = path.join(
    app.getPath('temp'),
    `badawi-print-${Date.now()}-${Math.random().toString(36).slice(2)}.html`,
  );

  const worker = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  try {
    fs.writeFileSync(scratch, job.html, 'utf8');
    await worker.loadFile(scratch);

    /*
      What size of paper this is going onto.

      It has to be said here. The document declares its own page in CSS, and this does not
      read it: webContents.print takes the page from the printer's stored settings and
      ignores @page entirely. That is the difference between the two builds, and it is why
      the same label printed correctly from a phone and came out blank from the till —
      window.print does honour @page, and this does not. Measured, a label document that
      says fifty-eight by thirty was being paginated onto 279.4 by 215.9, a Letter sheet,
      with the label in one corner of it; the printer advances one die-cut label per page,
      so each label got that corner and the rest of the roll came out empty.

      Two cases, and a third that deliberately says nothing:

        pageSizeMm  the app knows the paper — a die-cut label — and passes it through.
        receipt     no natural length: it is as long as the sale, so the finished document
                    is measured here. Left unsaid, a four-line receipt comes out on half a
                    metre of roll.
        ask         the A4 scan sheet, where the paper belongs to the dialog.
    */
    let pageSize;
    if (job.pageSizeMm) {
      // Millimetres on the way in, microns on the way out.
      pageSize = {
        width: Math.round(job.pageSizeMm.widthMm * 1000),
        height: Math.round(job.pageSizeMm.heightMm * 1000),
      };
    } else if (job.destination === 'receipt' || !job.destination) {
      const heightPx = await worker.webContents.executeJavaScript(
        'Math.ceil(document.documentElement.scrollHeight)',
      );
      // CSS pixels are 1/96 inch; Electron wants microns.
      const micronsPerPx = 25400 / 96;
      pageSize = {
        width: 72000, // the XP-80T prints 72mm wide inside a 79.5mm roll
        height: Math.max(Math.round(heightPx * micronsPerPx) + 4000, 20000),
      };
    }

    return await new Promise((resolve) => {
      worker.webContents.print(
        {
          // A receipt goes straight to the till printer. Anything else asks, because the
          // roll in that printer is 80mm wide and an A4 sheet sent to it is wasted paper.
          silent: !job.chooseDestination,
          printBackground: true,
          margins: { marginType: 'none' },
          ...(pageSize ? { pageSize } : {}),
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
    try {
      fs.unlinkSync(scratch);
    } catch {
      // A leftover file in the temp folder is not worth failing a print over.
    }
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
