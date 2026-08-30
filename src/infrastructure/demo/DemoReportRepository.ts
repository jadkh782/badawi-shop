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
    return store().liveSales().filter(
      (sale) => sale.soldAt >= range.from && sale.soldAt < range.to,
    );
  }

  async summary(range: DateRange): Promise<SalesSummary> {
    const sales = this.inRange(range);
    const sum = (pick: (s: Sale) => Money) => Money.sum(sales.map(pick));

    // Refunds count against the day they happened rather than the day of the sale, so the
    // figures agree with what actually went in and out of the drawer.
    const back = store().refundsIn(range.from, range.to);
    const backTotal = Money.sum(back.map((r) => r.total));
    const backCost = Money.sum(back.map((r) => r.cost));
    const currencyOf = (currency: 'USD' | 'LBP') =>
      Money.sum(
        back
          .filter((r) => store().sales.find((s) => s.id === r.saleId)?.paymentCurrency === currency)
          .map((r) => r.total),
      );

    // A void erases its sale outright, so it is counted in the period it was rung up on.
    const killed = [...store().voided.entries()].filter(
      ([, when]) => when.at >= range.from && when.at < range.to,
    );
    const killedTotal = Money.sum(
      killed.map(([id]) => store().sales.find((s) => s.id === id)?.total ?? Money.zero()),
    );

    return new SalesSummary(
      sum((s) => s.total).subtract(backTotal),
      sum((s) => s.totalCost).subtract(backCost),
      sum((s) => s.profit).subtract(backTotal.subtract(backCost)),
      sum((s) => s.discountAmount),
      sales.length,
      sales.reduce((n, s) => n + s.itemCount, 0) - back.reduce((n, r) => n + r.items, 0),
      Money.sum(sales.filter((s) => s.paymentCurrency === 'USD').map((s) => s.total))
        .subtract(currencyOf('USD')),
      Money.sum(sales.filter((s) => s.paymentCurrency === 'LBP').map((s) => s.total))
        .subtract(currencyOf('LBP')),
      backTotal,
      back.length,
      killedTotal,
      killed.length,
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

  /**
   * Every line that counts in the period, with returns coming back through as negatives on
   * the day they happened. Best sellers and category totals then net out without either of
   * them knowing that refunds exist.
   */
  private lines(range: DateRange) {
    const sold = this.inRange(range).flatMap((sale) =>
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

    const returned = store()
      .refundsIn(range.from, range.to)
      .flatMap((refund) =>
        refund.lines.map((line) => ({
          name: line.productName,
          barcode: null as string | null,
          category: line.categoryName ?? 'Uncategorised',
          productId: line.productId,
          quantity: -line.quantity,
          net: Money.zero().subtract(line.net),
          profit: Money.zero().subtract(line.net.subtract(line.cost)),
        })),
      );

    return [...sold, ...returned];
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
      const sales = store().liveSales().filter((s) => s.soldAt >= cursor && s.soldAt < next);
      const back = store().refundsIn(cursor, next);
      const backTotal = Money.sum(back.map((r) => r.total));
      const backProfit = Money.sum(back.map((r) => r.total.subtract(r.cost)));

      points.push(
        new TimeSeriesPoint(
          new Date(cursor),
          label(cursor, bucket),
          Money.sum(sales.map((s) => s.total)).subtract(backTotal),
          Money.sum(sales.map((s) => s.profit)).subtract(backProfit),
          sales.length,
          sales.reduce((n, s) => n + s.itemCount, 0) - back.reduce((n, r) => n + r.items, 0),
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
