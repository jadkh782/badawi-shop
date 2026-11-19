/** What came of asking for a print. */
export type PrintOutcome = 'printed' | 'cancelled' | 'unavailable';

/** A document ready for paper: already laid out, already sized, nothing left to decide. */
export interface PrintJob {
  /** Shown in the print queue, so a stuck job can be told from another. */
  title: string;
  /** A complete HTML document. */
  html: string;
  /**
   * Which machine this belongs on.
   *
   *   receipt  the till printer, silently. The default.
   *   label    the label printer, silently. A different roll and a different page size, so
   *            sending these to the till printer would print them down a receipt.
   *   ask      show the dialog. For the A4 scan sheet, which belongs on an office printer
   *            and would come out of either thermal printer as a ribbon of fragments.
   *
   * A browser only ever shows the dialog, so this changes nothing there.
   */
  destination?: 'receipt' | 'label' | 'ask';
  /**
   * The paper this belongs on, in millimetres, where the app is the one that knows it.
   *
   * A die-cut label is that case: its size is a physical fact, and the document is composed
   * around it. Saying it in the document's CSS is not enough for the till app, because
   * Electron's print does not read `@page` at all — it takes the page from the printer's
   * stored settings. Left unsaid, a 58 by 30 label was laid out on a Letter sheet (measured:
   * 279.4 by 215.9) with the label in one corner, and since the printer advances one die-cut
   * label per page, every label got a corner of that sheet and the rest came out blank. A
   * browser never had the problem, because window.print does honour `@page`.
   *
   * A receipt leaves this unset: its length is measured from the finished document rather
   * than known beforehand. So does the A4 scan sheet, which goes through the dialog where
   * the paper is the operator's to choose.
   */
  pageSizeMm?: { widthMm: number; heightMm: number };
  /**
   * How wide to lay the document out, in millimetres, when printing through a browser.
   *
   * Not a page size and never sent to a printer: it is the width of the hidden frame the
   * document is rendered in. Laid out at the wrong width the content is squeezed or clipped
   * when it reaches the paper — a 58mm label composed in an 80mm frame arrives shrunk.
   * The till app ignores this and leaves everything to the driver.
   */
  layoutWidthMm?: number;
}

/**
 * Puts a finished document on paper.
 *
 * A port and not a helper, because the two places this app runs genuinely differ. In a
 * browser the only way to reach a printer is the print dialog, which means the shop taps
 * once more and the phone can print at all. In the desktop app there is a real printer
 * handle, so the same document goes straight to the till printer with no dialog.
 *
 * It takes a finished document rather than a sale, for the same reason IFileSaver takes a
 * finished file: what a receipt says is a question about the shop, and where the paper comes
 * out is a question about the machine. Keeping them apart is what lets the receipt be
 * written once and tested without a printer anywhere near it.
 */
export interface IReceiptPrinter {
  readonly name: string;
  print(job: PrintJob): Promise<PrintOutcome>;
}
