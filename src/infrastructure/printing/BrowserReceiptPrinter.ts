import type { IReceiptPrinter, PrintJob, PrintOutcome } from '@/application/ports';

/**
 * Printing through whatever printer the device already has installed.
 *
 * The document goes into a hidden iframe and that iframe is printed, rather than the page.
 * Printing the page itself would mean the whole app needed print rules, and every screen
 * would have to keep them right forever; this way the till screen knows nothing about paper
 * and the receipt is the only thing that does.
 *
 * It uses the installed driver on purpose. The alternative, raw ESC/POS over WebUSB, needs
 * the Windows printer driver replaced with WinUSB on every till — which also takes the
 * printer out of the normal print queue, and is unavailable on iOS and Safari entirely. That
 * would trade a working phone for a marginally quicker till.
 *
 * The dialog can be skipped by starting Chrome with --kiosk-printing and making the XP-80T
 * the default printer, which turns the tap into a print with no further interaction.
 */
export class BrowserReceiptPrinter implements IReceiptPrinter {
  readonly name = 'Browser print';

  async print(job: PrintJob): Promise<PrintOutcome> {
    if (typeof document === 'undefined') return 'unavailable';

    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('title', job.title);
    /*
      Off to the side at a real size rather than display:none or zero-by-zero. A frame with
      no box does not lay out in every browser, and an unlaid-out frame prints blank paper.
    */
    frame.style.cssText =
      'position:fixed;left:-10000px;top:0;width:80mm;height:600px;border:0;opacity:0;';

    document.body.appendChild(frame);

    try {
      await new Promise<void>((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        frame.addEventListener('load', done, { once: true });
        // A document that somehow never fires load should not leave the shop staring at a
        // button that did nothing.
        setTimeout(done, 2000);
        frame.srcdoc = job.html;
      });

      const view = frame.contentWindow;
      if (!view) return 'unavailable';

      // Focus first: without it the print command can land on the parent document in some
      // browsers, which would print the till screen.
      view.focus();
      view.print();
      return 'printed';
    } finally {
      // Chrome blocks on print() until the dialog closes, but not every browser does, so the
      // frame outlives the call briefly rather than being pulled out from under it.
      setTimeout(() => frame.remove(), 1000);
    }
  }
}
