import type { SupabaseClient } from '@supabase/supabase-js';
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
import type { IReportRepository } from '@/application/ports';
import { toSale } from './mappers/toDomain';
import type { SaleRow } from './types';
import {
  toCategoryStat,
  toLowStock,
  toProductStat,
  toSeriesPoint,
  toSummary,
} from './mappers/toDomain';
import type {
  CategoryStatRow,
  LowStockRow,
  ReportSummaryRow,
  TimeSeriesRow,
  TopProductRow,
} from './types';
import { translateError } from './errors';

/** The zone the shop lives in, which is what decides where one trading day ends. */
function shopTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function bucketLabel(date: Date, bucket: ReportBucket): string {
  if (bucket === 'monthly') {
    return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  }
  if (bucket === 'weekly') {
    return `w/c ${date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`;
  }
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export class SupabaseReportRepository implements IReportRepository {
  constructor(private readonly db: SupabaseClient) {}

  async summary(range: DateRange): Promise<SalesSummary> {
    const { from, to } = range.toIsoStrings();
    const { data, error } = await this.db.rpc('report_summary', { p_from: from, p_to: to });
    if (error) throw translateError(error);
    return toSummary((data as ReportSummaryRow[])[0]);
  }

  async topProducts(range: DateRange, limit = 25): Promise<ProductSalesStat[]> {
    const { from, to } = range.toIsoStrings();
    const { data, error } = await this.db.rpc('report_top_products', {
      p_from: from,
      p_to: to,
      p_limit: limit,
    });
    if (error) throw translateError(error);
    return (data as TopProductRow[]).map(toProductStat);
  }

  async byCategory(range: DateRange): Promise<CategorySalesStat[]> {
    const { from, to } = range.toIsoStrings();
    const { data, error } = await this.db.rpc('report_by_category', { p_from: from, p_to: to });
    if (error) throw translateError(error);
    return (data as CategoryStatRow[]).map(toCategoryStat);
  }

  async timeSeries(range: DateRange, bucket: ReportBucket): Promise<TimeSeriesPoint[]> {
    const { from, to } = range.toIsoStrings();
    const { data, error } = await this.db.rpc('report_time_series', {
      p_from: from,
      p_to: to,
      p_bucket: bucket,
      p_timezone: shopTimezone(),
    });
    if (error) throw translateError(error);
    return (data as TimeSeriesRow[]).map((row) =>
      toSeriesPoint(row, bucketLabel(new Date(row.bucket_start), bucket)),
    );
  }

  async salesInRange(range: DateRange): Promise<Sale[]> {
    const { from, to } = range.toIsoStrings();
    const { data, error } = await this.db
      .from('sales')
      .select('*, sale_items ( * )')
      .gte('sold_at', from)
      .lt('sold_at', to)
      .order('sold_at');
    if (error) throw translateError(error);
    return (data as SaleRow[]).map(toSale);
  }

  async lowStock(): Promise<LowStockItem[]> {
    const { data, error } = await this.db.rpc('report_low_stock');
    if (error) throw translateError(error);
    return (data as LowStockRow[]).map(toLowStock);
  }
}
