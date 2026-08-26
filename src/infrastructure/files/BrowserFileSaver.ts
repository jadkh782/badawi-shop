import type { ExportedReport, IFileSaver, SaveOutcome } from '@/application/ports';

/**
 * Saving a file in a browser.
 *
 * The share sheet is tried first, because on a phone browser a downloaded file is awkward to
 * find again, and falls back to an ordinary download everywhere else.
 */
export class BrowserFileSaver implements IFileSaver {
  async save(report: ExportedReport): Promise<SaveOutcome> {
    const file = new File([report.blob], report.filename, {
      type: report.blob.type || 'application/octet-stream',
    });

    const nav = navigator as Navigator & {
      canShare?: (data: ShareData) => boolean;
      share?: (data: ShareData) => Promise<void>;
    };

    if (nav.canShare?.({ files: [file] }) && nav.share) {
      try {
        await nav.share({ files: [file], title: report.filename });
        return 'shared';
      } catch (error) {
        // Backing out of the share sheet is a decision, not a failure. Reporting it as an
        // error would be wrong, and falling through to a download would be worse.
        if ((error as Error)?.name === 'AbortError') return 'cancelled';
      }
    }

    const url = URL.createObjectURL(report.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = report.filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Revoking straight away cancels the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return 'saved';
  }
}
