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
