import type { DateRange, ReportBucket } from '@/domain';
import type { ExportedReport, IFileSaver, IReportExporter, SaveOutcome } from '../ports';

/**
 * Produces the spreadsheet for a period and gets it onto the device.
 *
 * Building the file and delivering it are two jobs, and they differ on two axes: what goes
 * into the workbook is the same everywhere, but how a file reaches the person holding the
 * phone is completely different in a browser and in an Android app. Hence two ports.
 */
export class ExportReport {
  constructor(
    private readonly exporter: IReportExporter,
    private readonly saver: IFileSaver,
  ) {}

  async execute(range: DateRange, bucket: ReportBucket): Promise<ExportedReport> {
    return this.exporter.export(range, bucket);
  }

  /** Builds and delivers in one go, which is what the button on the reports screen does. */
  async run(range: DateRange, bucket: ReportBucket): Promise<{ report: ExportedReport; outcome: SaveOutcome }> {
    const report = await this.exporter.export(range, bucket);
    const outcome = await this.saver.save(report);
    return { report, outcome };
  }
}
