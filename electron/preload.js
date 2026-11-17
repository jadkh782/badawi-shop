/**
 * The only thing the page is given beyond an ordinary browser.
 *
 * Two functions, both about paper. The page is loaded over the network, so it is treated the
 * way any remote page should be: it gets a named bridge and nothing else — no Node, no file
 * system, no way to reach the rest of the machine. Widening this is how a shop till becomes
 * a way into the computer it runs on.
 *
 * Its presence is also the signal. The web app looks for window.badawiPrint to decide
 * whether it can print silently or has to open the browser's print dialog, which is how one
 * build serves both the till and the phone.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('badawiPrint', {
  /**
   * Puts a finished HTML document on the printer, with no dialog.
   * Resolves to 'printed', 'cancelled' or 'unavailable'.
   */
  print: (job) =>
    ipcRenderer.invoke('badawi:print', {
      html: String(job?.html ?? ''),
      title: String(job?.title ?? 'Receipt'),
      deviceName: job?.deviceName ? String(job.deviceName) : undefined,
      chooseDestination: Boolean(job?.chooseDestination),
    }),

  /** The printers this machine has, so the shop can choose rather than hope. */
  listPrinters: () => ipcRenderer.invoke('badawi:printers'),
});
