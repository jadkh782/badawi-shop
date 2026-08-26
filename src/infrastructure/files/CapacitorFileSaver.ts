import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { DomainError } from '@/domain';
import type { ExportedReport, IFileSaver, SaveOutcome } from '@/application/ports';

/**
 * Saving a file inside the Android app.
 *
 * A WebView will not download anything. A link with a download attribute is ignored without
 * an error, which is why the export appeared to do nothing at all: the workbook was built
 * correctly every time and then had nowhere to go.
 *
 * So the file is written to the app documents directory, which survives the app closing and
 * is reachable from a file manager, and then offered to the share sheet so it can go straight
 * to Drive, WhatsApp or email. Even if the share is dismissed, the file is already saved.
 */
export class CapacitorFileSaver implements IFileSaver {
  static isAvailable(): boolean {
    return Capacitor.isNativePlatform();
  }

  async save(report: ExportedReport): Promise<SaveOutcome> {
    const base64 = await toBase64(report.blob);

    let uri: string;
    try {
      const written = await Filesystem.writeFile({
        path: report.filename,
        data: base64,
        directory: Directory.Documents,
        recursive: true,
      });
      uri = written.uri;
    } catch (error) {
      throw new DomainError(
        `The report could not be saved to the phone: ${(error as Error)?.message ?? 'unknown error'}`,
      );
    }

    try {
      await Share.share({
        title: report.filename,
        text: `Badawi Shop report: ${report.filename}`,
        url: uri,
        dialogTitle: 'Send the report',
      });
      return 'shared';
    } catch {
      // Dismissing the share sheet is not a problem. The file is on the phone either way, so
      // the honest answer is that it was saved, not that anything failed.
      return 'saved';
    }
  }
}

/**
 * Filesystem takes base64, not bytes.
 *
 * FileReader is used rather than looping over the array, because a month of sales is a few
 * hundred kilobytes and building a string a character at a time blows the call stack.
 */
function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The report could not be read back'));
    reader.onload = () => {
      const result = String(reader.result);
      // Strip the "data:...;base64," prefix that FileReader puts on the front.
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}
