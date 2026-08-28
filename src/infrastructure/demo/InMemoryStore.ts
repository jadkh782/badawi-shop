import {
  Barcode,
  Category,
  CategorySalesStat,
  DateRange,
  DiscountFactory,
  ExchangeRate,
  InsufficientStockError,
  LowStockItem,
  Money,
  Product,
  ProductSalesStat,
  Quantity,
  ReportBucket,
  Sale,
  SaleItem,
  SalesSummary,
  ShopSettings,
  TimeSeriesPoint,
  CashMovement,
} from '@/domain';
import type { CashKind } from '@/domain';
import { DEMO_CATEGORIES, demoProducts } from './DemoData';

/**
 * The whole shop, held in memory for the length of a browser session.
 *
 * This exists so the app can be tried, and its screens reviewed, before anyone creates a
 * Supabase project. It is also the clearest proof that the layering works: nothing above
 * infrastructure changes, because every screen talks to the port interfaces and the
 * composition root is the only place that decides which implementation answers.
 *
 * Nothing here survives a reload, which is exactly what a demo should do.
 */
export class InMemoryStore {
  /** Mirrors what cash_movements does in Postgres, so the budget screen behaves the same. */
  recordCash(kind: CashKind, amount: Money, productName: string | null, note: string | null = null): void {
    this.cash.push(
      new CashMovement(this.nextId('cash'), kind, amount, productName, note, new Date()),
    );
  }

  private static shared: InMemoryStore | null = null;

  categories: Category[] = [...DEMO_CATEGORIES];
  products: Product[] = demoProducts();
  sales: Sale[] = [];
  cash: CashMovement[] = [];
  settings = new ShopSettings('Badawi Shop (demo)', ExchangeRate.create(89000, 1000), new Date());

  private counter = 0;

  static get(): InMemoryStore {
    if (!InMemoryStore.shared) {
      InMemoryStore.shared = new InMemoryStore();
      InMemoryStore.shared.seedHistory();
    }
    return InMemoryStore.shared;
  }

  nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}-${Date.now().toString(36)}-${this.counter}`;
  }

  replaceProduct(next: Product): Product {
    this.products = this.products.map((p) => (p.id === next.id ? next : p));
    return next;
  }

  withStock(product: Product, stock: number): Product {
    return new Product({
      id: product.id,
      barcode: product.barcode,
      name: product.name,
      categoryId: product.categoryId,
      categoryName: product.categoryName,
      costPrice: product.costPrice,
      salePrice: product.salePrice,
      stock: Quantity.of(stock),
      lowStockThreshold: product.lowStockThreshold,
      unit: product.unit,
      notes: product.notes,
      isActive: product.isActive,
    });
  }

  /**
   * Records a sale the same way the database does: prices come from the catalogue, not from
   * the caller, and the discount is recomputed and clamped here too.
   */
  checkout(
    items: ReadonlyArray<{ productId: string; quantity: number }>,
    discountType: 'none' | 'percent' | 'amount',
    discountValue: number,
    paymentCurrency: 'USD' | 'LBP',
    note: string | null,
    soldAt = new Date(),
  ): string {
    const folded = new Map<string, number>();
    for (const item of items) {
      folded.set(item.productId, (folded.get(item.productId) ?? 0) + item.quantity);
    }

    const lines: SaleItem[] = [];
    let subtotal = Money.zero();
    let cost = Money.zero();
    let count = 0;

    for (const [productId, quantity] of folded) {
      const product = this.products.find((p) => p.id === productId);
      if (!product) throw new Error('That product no longer exists');
      if (product.stock.value < quantity) {
        throw new InsufficientStockError(product.name, quantity, product.stock.value);
      }

      const lineTotal = product.salePrice.multiply(quantity);
      const lineCost = product.costPrice.multiply(quantity);

      lines.push(
        new SaleItem(
          this.nextId('li'),
          product.id,
          product.name,
          product.barcode?.value ?? null,
          product.categoryName,
          product.unit,
          product.salePrice,
          product.costPrice,
          Quantity.of(quantity),
          lineTotal,
          lineCost,
          lineTotal.subtract(lineCost),
        ),
      );

      this.replaceProduct(this.withStock(product, product.stock.value - quantity));
      subtotal = subtotal.add(lineTotal);
      cost = cost.add(lineCost);
      count += quantity;
    }

    const discount = DiscountFactory.create(discountType, discountValue).computeDiscount(subtotal);
    const total = subtotal.subtract(discount).clampToZero();
    const id = this.nextId('sale');

    this.recordCash('sale', total, null);
    this.sales.push(
      new Sale(
        id,
        soldAt,
        subtotal,
        discountType,
        discountValue,
        discount,
        total,
        cost,
        total.subtract(cost),
        paymentCurrency,
        this.settings.exchangeRate.usdToLbp,
        this.settings.exchangeRate.toLbp(total),
        count,
        note,
        lines,
      ),
    );

    return id;
  }

  /** A fortnight of trading, so the reports screen has a shape to show rather than a flat line. */
  private seedHistory(): void {
    const now = new Date();
    for (let daysAgo = 13; daysAgo >= 0; daysAgo--) {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, 11, 0, 0);
      // Weekends are busier, which is what makes the trend chart worth looking at.
      const busy = day.getDay() === 0 || day.getDay() === 6;
      const transactions = busy ? 7 : 4;

      for (let n = 0; n < transactions; n++) {
        const picks = this.products
          .filter((p) => p.stock.value > 4)
          .slice((n * 3) % 8, ((n * 3) % 8) + 3)
          .map((p) => ({ productId: p.id, quantity: 1 + ((n + daysAgo) % 3) }));
        if (picks.length === 0) continue;

        const at = new Date(day.getTime() + n * 42 * 60 * 1000);
        try {
          this.checkout(
            picks,
            n % 5 === 0 ? 'percent' : 'none',
            n % 5 === 0 ? 10 : 0,
            n % 3 === 0 ? 'LBP' : 'USD',
            null,
            at,
          );
        } catch {
          // A seeded basket that outruns the shelf is skipped; the shape is what matters.
        }
      }

      // Keep the shelves stocked so a fortnight of trading does not empty the shop.
      this.products = this.products.map((p) =>
        p.stock.value < 6 && p.id !== 'p8' ? this.withStock(p, p.stock.value + 18) : p,
      );
    }
  }
}
