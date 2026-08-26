import type {
  CategorySalesStat,
  DateRange,
  LowStockItem,
  ProductSalesStat,
  ReportBucket,
  SalesSummary,
  TimeSeriesPoint,
} from '@/domain';
import type { IReportRepository } from '../ports';

export interface ReportData {
  summary: SalesSummary;
  topProducts: ProductSalesStat[];
  byCategory: CategorySalesStat[];
  series: TimeSeriesPoint[];
  lowStock: LowStockItem[];
}

/**
 * Loads everything the reports screen shows in one pass.
 *
 * The five queries are independent, so they go out together rather than in sequence: on a
 * phone over a slow connection that is the difference between one wait and five.
 */
export class GetReport {
  constructor(private readonly reports: IReportRepository) {}

  async execute(range: DateRange, bucket: ReportBucket): Promise<ReportData> {
    const [summary, topProducts, byCategory, series, lowStock] = await Promise.all([
      this.reports.summary(range),
      this.reports.topProducts(range, 25),
      this.reports.byCategory(range),
      this.reports.timeSeries(range, bucket),
      this.reports.lowStock(),
    ]);

    return { summary, topProducts, byCategory, series, lowStock };
  }
}
