import type { DateRange, ReportBucket, Sale } from '@/domain';
import type {
  ExportedReport,
  IReportExporter,
  IReportRepository,
  ISettingsRepository,
} from '@/application/ports';
import { GetReport } from '@/application/use-cases';
import type { ExportPayload } from './exportTypes';

/**
 * Builds the spreadsheet on the device.
 *
 * It used to run on a server, which meant the app needed one. Doing it here instead makes the
 * whole system a static bundle: it can be dropped on any host, and it is what lets the same
 * build be packaged inside the Android app and work with no website behind it at all.
 *
 * The spreadsheet library is the largest dependency in the project, so it is loaded only when
 * someone actually taps Export. Until then it is not in the bundle the till waits for.
 */
export class ClientReportExporter implements IReportExporter {
  constructor(
    private readonly reports: IReportRepository,
    private readonly settings: ISettingsRepository,
  ) {}

  async export(range: DateRange, bucket: ReportBucket): Promise<ExportedReport> {
    const [data, settings, sales] = await Promise.all([
      new GetReport(this.reports).execute(range, bucket),
      this.settings.get(),
      this.reports.salesInRange(range),
    ]);

    const payload: ExportPayload = {
      shopName: settings.shopName,
      rangeLabel: range.label(),
      bucket,
      usdToLbp: settings.exchangeRate.usdToLbp,
      summary: {
        total_sales_cents: data.summary.totalSales.cents,
        total_cost_cents: data.summary.totalCost.cents,
        total_profit_cents: data.summary.totalProfit.cents,
        total_discount_cents: data.summary.totalDiscount.cents,
        transaction_count: data.summary.transactionCount,
        items_sold: data.summary.itemsSold,
        paid_usd_cents: data.summary.salesPaidInUsd.cents,
        paid_lbp_cents: data.summary.salesPaidInLbp.cents,
        refunded_cents: data.summary.refunded.cents,
        refund_count: data.summary.refundCount,
        voided_cents: data.summary.voided.cents,
        voided_count: data.summary.voidedCount,
      },
      series: data.series.map((point) => ({
        bucket_start: point.bucketStart.toISOString(),
        sales_cents: point.sales.cents,
        profit_cents: point.profit.cents,
        transaction_count: point.transactionCount,
        items_sold: point.itemsSold,
      })),
      topProducts: data.topProducts.map((item) => ({
        product_name: item.productName,
        barcode: item.barcode,
        category_name: item.categoryName,
        quantity_sold: item.quantitySold,
        revenue_cents: item.revenue.cents,
        profit_cents: item.profit.cents,
      })),
      byCategory: data.byCategory.map((item) => ({
        category_name: item.categoryName,
        quantity_sold: item.quantitySold,
        revenue_cents: item.revenue.cents,
        profit_cents: item.profit.cents,
      })),
      lowStock: data.lowStock.map((item) => ({
        product_name: item.productName,
        barcode: item.barcode,
        category_name: item.categoryName,
        stock: item.stock,
        threshold: item.threshold,
        unit: item.unit,
      })),
      sales: sales.map((sale) => ({
        id: sale.id,
        sold_at: sale.soldAt.toISOString(),
        subtotal_cents: sale.subtotal.cents,
        discount_type: sale.discountType,
        discount_value: sale.discountValue,
        discount_cents: sale.discountAmount.cents,
        total_cents: sale.total.cents,
        total_cost_cents: sale.totalCost.cents,
        profit_cents: sale.profit.cents,
        payment_currency: sale.paymentCurrency,
        usd_to_lbp_rate: sale.usdToLbpRate,
        total_lbp: sale.totalLbp,
        item_count: sale.itemCount,
        note: sale.note,
      })),
      lines: sales.flatMap((sale) => sale.items.map((item) => lineOf(sale, item))),
    };

    // Deferred until the tap, so the library never sits in the path of the till loading.
    const { ExcelWorkbookBuilder } = await import('./ExcelWorkbookBuilder');
    const bytes = await new ExcelWorkbookBuilder().build(payload);

    return {
      blob: new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      filename: `badawi-shop-${bucket}-${range.fileSlug()}.xlsx`,
    };
  }
}

/**
 * A basket discount is taken against the whole sale, so each line carries its share in
 * proportion to its value. Without that, per-product revenue would overstate what the shop
 * actually took by the whole discount.
 */
function lineOf(sale: Sale, item: Sale['items'][number]): ExportPayload['lines'][number] {
  const share = sale.subtotal.isZero()
    ? 0
    : Math.round((sale.discountAmount.cents * item.lineTotal.cents) / sale.subtotal.cents);
  const net = item.lineTotal.cents - share;

  return {
    sale_id: sale.id,
    sold_at: sale.soldAt.toISOString(),
    product_name: item.productName,
    barcode: item.barcode,
    category_name: item.categoryName ?? 'Uncategorised',
    unit: item.unit,
    quantity: item.quantity.value,
    unit_price_cents: item.unitPrice.cents,
    unit_cost_cents: item.unitCost.cents,
    gross_cents: item.lineTotal.cents,
    net_cents: net,
    cost_cents: item.lineCost.cents,
    net_profit_cents: net - item.lineCost.cents,
  };
}
