import type {
  CategorySalesStat,
  DateRange,
  LowStockItem,
  ProductSalesStat,
  ReportBucket,
  Sale,
  SalesSummary,
  TimeSeriesPoint,
} from '@/domain';

/** Everything the reports screen and the Excel export read. */
export interface IReportRepository {
  summary(range: DateRange): Promise<SalesSummary>;
  topProducts(range: DateRange, limit?: number): Promise<ProductSalesStat[]>;
  byCategory(range: DateRange): Promise<CategorySalesStat[]>;
  timeSeries(range: DateRange, bucket: ReportBucket): Promise<TimeSeriesPoint[]>;
  lowStock(): Promise<LowStockItem[]>;
  /**
   * Every transaction in the period with its lines attached.
   *
   * The screen never needs this, only the spreadsheet does: the shop wants a row per sale and
   * a row per item sold, which is far more than any aggregate carries.
   */
  salesInRange(range: DateRange): Promise<Sale[]>;
}
