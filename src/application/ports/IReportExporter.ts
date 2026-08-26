import type { DateRange, ReportBucket } from '@/domain';

export interface ExportedReport {
  blob: Blob;
  filename: string;
}

/**
 * Turns a period into a downloadable file. The workbook itself is built server side, so the
 * spreadsheet library never reaches the phone bundle. Adding a CSV or PDF export means adding
 * an implementation here, not editing the reports screen.
 */
export interface IReportExporter {
  export(range: DateRange, bucket: ReportBucket): Promise<ExportedReport>;
}
