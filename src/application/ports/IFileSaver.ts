import type { ExportedReport } from './IReportExporter';

export type SaveOutcome = 'shared' | 'saved' | 'cancelled';

/**
 * Hands a finished file to whatever the device does with files.
 *
 * This is a port and not a helper function because the two platforms genuinely differ. A
 * browser downloads. An Android WebView cannot: a download attribute on a link there does
 * nothing at all, silently, which is exactly how the first version of this failed. The file
 * has to be written to disk and offered to the share sheet instead.
 */
export interface IFileSaver {
  save(report: ExportedReport): Promise<SaveOutcome>;
}
