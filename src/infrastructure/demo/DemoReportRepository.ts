import {
  CategorySalesStat,
  type DateRange,
  LowStockItem,
  Money,
  ProductSalesStat,
  type ReportBucket,
  Sale,
  SalesSummary,
  TimeSeriesPoint,
} from '@/domain';
import type { IReportRepository } from '@/application/ports';
import { InMemoryStore } from './InMemoryStore';

const store = () => InMemoryStore.get();

/**
 * The same aggregations the database performs, computed here over the in-memory sales.
 *
 * Including the pro-rata split of a basket discount across its lines, so demo figures
 * reconcile the same way the real ones do.
 */
export class DemoReportRepository implements IReportRepository {
  private inRange(range: DateRange): Sale[] {
    return store().sales.filter(
      (sale) => sale.soldAt >= range.from && sale.soldAt < range.to,
    );
  }

  async summary(range: DateRange): Promise<SalesSummary> {
    const sales = this.inRange(range);
    const sum = (pick: (s: Sale) => Money) => Money.sum(sales.map(pick));

    return new SalesSummary(
      sum((s) => s.total),
      sum((s) => s.totalCost),
      sum((s) => s.profit),
      sum((s) => s.discountAmount),
      sales.length,
      sales.reduce((n, s) => n + s.itemCount, 0),
      Money.sum(sales.filter((s) => s.paymentCurrency === 'USD').map((s) => s.total)),
      Money.sum(sales.filter((s) => s.paymentCurrency === 'LBP').map((s) => s.total)),
    );
  }

  /** Line revenue less this line share of the basket discount. */
  private netOf(sale: Sale, lineTotal: Money): Money {
    if (sale.subtotal.isZero() || sale.discountAmount.isZero()) return lineTotal;
    const share = Math.round(
      (sale.discountAmount.cents * lineTotal.cents) / sale.subtotal.cents,
    );
    return lineTotal.subtract(Money.fromCents(share));
  }

  private lines(range: DateRange) {
    return this.inRange(range).flatMap((sale) =>
      sale.items.map((item) => {
        const net = this.netOf(sale, item.lineTotal);
        return {
          name: item.productName,
          barcode: item.barcode,
          category: item.categoryName ?? 'Uncategorised',
          productId: item.productId,
          quantity: item.quantity.value,
          net,
          profit: net.subtract(item.lineCost),
        };
      }),
    );
  }

  async topProducts(range: DateRange, limit = 25): Promise<ProductSalesStat[]> {
    const grouped = new Map<string, ProductSalesStat>();

    for (const line of this.lines(range)) {
      const existing = grouped.get(line.name);
      grouped.set(
        line.name,
        new ProductSalesStat(
          line.productId,
          line.name,
          line.barcode,
          line.category,
          (existing?.quantitySold ?? 0) + line.quantity,
          (existing?.revenue ?? Money.zero()).add(line.net),
          (existing?.profit ?? Money.zero()).add(line.profit),
        ),
      );
    }

    return [...grouped.values()]
      .sort((a, b) => b.quantitySold - a.quantitySold || b.revenue.cents - a.revenue.cents)
      .slice(0, limit);
  }

  async byCategory(range: DateRange): Promise<CategorySalesStat[]> {
    const grouped = new Map<string, CategorySalesStat>();

    for (const line of this.lines(range)) {
      const existing = grouped.get(line.category);
      grouped.set(
        line.category,
        new CategorySalesStat(
          line.category,
          (existing?.quantitySold ?? 0) + line.quantity,
          (existing?.revenue ?? Money.zero()).add(line.net),
          (existing?.profit ?? Money.zero()).add(line.profit),
        ),
      );
    }

    return [...grouped.values()].sort((a, b) => b.revenue.cents - a.revenue.cents);
  }

  async timeSeries(range: DateRange, bucket: ReportBucket): Promise<TimeSeriesPoint[]> {
    const points: TimeSeriesPoint[] = [];
    const cursor = startOf(range.from, bucket);

    while (cursor < range.to) {
      const next = advance(cursor, bucket);
      const sales = store().sales.filter((s) => s.soldAt >= cursor && s.soldAt < next);

      points.push(
        new TimeSeriesPoint(
          new Date(cursor),
          label(cursor, bucket),
          Money.sum(sales.map((s) => s.total)),
          Money.sum(sales.map((s) => s.profit)),
          sales.length,
          sales.reduce((n, s) => n + s.itemCount, 0),
        ),
      );

      cursor.setTime(next.getTime());
    }

    return points;
  }

  async salesInRange(range: DateRange): Promise<Sale[]> {
    return this.inRange(range);
  }

  async lowStock(): Promise<LowStockItem[]> {
    return store()
      .products.filter((p) => p.isLowStock || p.isOutOfStock)
      .sort((a, b) => a.stock.value - b.stock.value)
      .map(
        (p) =>
          new LowStockItem(
            p.id,
            p.name,
            p.barcode?.value ?? null,
            p.categoryName,
            p.stock.value,
            p.lowStockThreshold.value,
            p.unit,
          ),
      );
  }
}

function startOf(date: Date, bucket: ReportBucket): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (bucket === 'monthly') return new Date(date.getFullYear(), date.getMonth(), 1);
  if (bucket === 'weekly') {
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  }
  return d;
}

function advance(date: Date, bucket: ReportBucket): Date {
  const next = new Date(date);
  if (bucket === 'monthly') next.setMonth(next.getMonth() + 1);
  else if (bucket === 'weekly') next.setDate(next.getDate() + 7);
  else next.setDate(next.getDate() + 1);
  return next;
}

function label(date: Date, bucket: ReportBucket): string {
  if (bucket === 'monthly') {
    return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  }
  if (bucket === 'weekly') {
    return `w/c ${date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`;
  }
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}
