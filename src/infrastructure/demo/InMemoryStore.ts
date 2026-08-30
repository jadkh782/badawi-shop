import {
  Barcode,
  Category,
  DiscountFactory,
  ExchangeRate,
  InsufficientStockError,
  InventoryValue,
  Money,
  PriceChange,
  Product,
  Quantity,
  Sale,
  SaleItem,
  SaleRecord,
  ShopSettings,
  SoldLine,
  StockBatch,
  CashMovement,
} from '@/domain';
import type { BatchSource, CashKind, CostMethod, PriceChangeSource } from '@/domain';
import type {
  ArchiveResult,
  ProductDraft,
  RefundLine,
  StockChange,
  StockChangeResult,
} from '@/application/ports';
import { DEMO_CATEGORIES, demoProducts } from './DemoData';

/** A batch as the store holds it: mutable, unlike the value object the app reads. */
interface Batch {
  id: string;
  productId: string;
  unitCostCents: number;
  received: number;
  remaining: number;
  source: BatchSource;
  note: string | null;
  at: Date;
}

/** Which batches a sold line drew on, so a return can put the units back where they came from. */
interface Allocation {
  batchId: string;
  quantity: number;
  unitCostCents: number;
}

interface RefundRecord {
  id: string;
  saleId: string;
  at: Date;
  total: Money;
  cost: Money;
  items: number;
  lines: Array<{
    saleItemId: string;
    productId: string | null;
    productName: string;
    categoryName: string | null;
    unit: string;
    quantity: number;
    unitPrice: Money;
    net: Money;
    cost: Money;
  }>;
}

/**
 * The whole shop, held in memory for the length of a browser session.
 *
 * This exists so the app can be tried, and its screens reviewed, before anyone creates a
 * Supabase project. It is also the clearest proof that the layering works: nothing above
 * infrastructure changes, because every screen talks to the port interfaces and the
 * composition root is the only place that decides which implementation answers.
 *
 * It follows the same money rules the database does, batches and all, so the demo teaches
 * the real behaviour rather than a simplified one that would mislead.
 *
 * Nothing here survives a reload, which is exactly what a demo should do.
 */
export class InMemoryStore {
  private static shared: InMemoryStore | null = null;

  categories: Category[] = [...DEMO_CATEGORIES];
  products: Product[] = demoProducts();
  sales: Sale[] = [];
  cash: CashMovement[] = [];
  settings = new ShopSettings('Badawi Shop (demo)', ExchangeRate.create(89000, 1000), new Date());

  batches: Batch[] = [];
  priceHistory: PriceChange[] = [];
  refunds: RefundRecord[] = [];
  /** saleItemId to the batches it drew on. */
  allocations = new Map<string, Allocation[]>();
  voided = new Map<string, { at: Date; reason: string | null }>();
  lastCost = new Map<string, number>();
  /** PriceChange carries no product id of its own, so the store keeps the link beside it. */
  priceOwner = new Map<string, string>();

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

  /** Mirrors what cash_movements does in Postgres, so the budget screen behaves the same. */
  recordCash(
    kind: CashKind,
    amount: Money,
    productName: string | null,
    note: string | null = null,
    at = new Date(),
  ): void {
    this.cash.push(new CashMovement(this.nextId('cash'), kind, amount, productName, note, at));
  }

  replaceProduct(next: Product): Product {
    this.products = this.products.map((p) => (p.id === next.id ? next : p));
    return next;
  }

  withStock(product: Product, stock: number): Product {
    return this.rebuild(product, { stock });
  }

  /** Archived rather than dropped, so the demo keeps the record the way the database does. */
  private deactivate(product: Product): Product {
    return this.rebuild(product, { isActive: false });
  }

  private rebuild(
    product: Product,
    patch: {
      stock?: number;
      costCents?: number;
      saleCents?: number;
      lastCostCents?: number;
      isActive?: boolean;
    },
  ): Product {
    return new Product({
      id: product.id,
      barcode: product.barcode,
      name: product.name,
      categoryId: product.categoryId,
      categoryName: product.categoryName,
      costPrice:
        patch.costCents === undefined ? product.costPrice : Money.fromCents(patch.costCents),
      lastCostPrice:
        patch.lastCostCents === undefined
          ? product.lastCostPrice
          : Money.fromCents(patch.lastCostCents),
      salePrice:
        patch.saleCents === undefined ? product.salePrice : Money.fromCents(patch.saleCents),
      stock: Quantity.of(patch.stock ?? product.stock.value),
      lowStockThreshold: product.lowStockThreshold,
      unit: product.unit,
      notes: product.notes,
      isActive: patch.isActive ?? product.isActive,
      variantSize: product.variantSize,
      variantTrait: product.variantTrait,
      variantBase: product.variantBase,
    });
  }

  // ---------------------------------------------------------------------------
  // Batches: the same rules the database follows.
  // ---------------------------------------------------------------------------

  openBatches(productId: string): Batch[] {
    return this.batches
      .filter((b) => b.productId === productId && b.remaining > 0)
      .sort((a, b) => a.at.getTime() - b.at.getTime());
  }

  batchesFor(productId: string): StockBatch[] {
    return this.openBatches(productId).map(
      (b) =>
        new StockBatch(
          b.id,
          Money.fromCents(b.unitCostCents),
          Quantity.of(b.remaining),
          Quantity.of(b.received),
          b.source,
          b.note,
          b.at,
        ),
    );
  }

  private addBatch(
    productId: string,
    unitCostCents: number,
    quantity: number,
    source: BatchSource,
    note: string | null = null,
    at = new Date(),
  ): Batch {
    const batch: Batch = {
      id: this.nextId('batch'),
      productId,
      unitCostCents,
      received: quantity,
      remaining: quantity,
      source,
      note,
      at,
    };
    this.batches.push(batch);
    return batch;
  }

  /** Brings the batches level with the count on the shelf, filling any gap at cost price. */
  reconcile(productId: string, expected: number): void {
    const open = this.openBatches(productId);
    const have = open.reduce((n, b) => n + b.remaining, 0);
    if (Math.abs(have - expected) < 1e-9) return;

    if (have < expected) {
      const product = this.products.find((p) => p.id === productId);
      this.addBatch(
        productId,
        product?.costPrice.cents ?? 0,
        expected - have,
        'opening',
        'Stock on the shelf with no purchase behind it',
      );
      return;
    }

    // Newest first, so the oldest prices survive to be sold at.
    let over = have - expected;
    for (const batch of [...open].reverse()) {
      if (over <= 0) break;
      const drop = Math.min(batch.remaining, over);
      batch.remaining -= drop;
      over -= drop;
    }
  }

  consume(productId: string, quantity: number, batchId?: string | null): Allocation[] {
    const open = this.openBatches(productId);
    // The chosen batch first, everything else oldest first.
    const order = batchId ? [...open].sort((a) => (a.id === batchId ? -1 : 1)) : open;

    const out: Allocation[] = [];
    let left = quantity;

    for (const batch of order) {
      if (left <= 0) break;
      const take = Math.min(batch.remaining, left);
      batch.remaining -= take;
      out.push({ batchId: batch.id, quantity: take, unitCostCents: batch.unitCostCents });
      left -= take;
    }

    return out;
  }

  returnTo(allocations: readonly Allocation[]): void {
    for (const allocation of allocations) {
      const batch = this.batches.find((b) => b.id === allocation.batchId);
      if (!batch) continue;
      batch.remaining = Math.min(batch.received, batch.remaining + allocation.quantity);
    }
  }

  /** Folds every open batch of an article into one at the weighted average of what is left. */
  collapse(productId: string): void {
    const open = this.openBatches(productId);
    if (open.length === 0) return;

    const quantity = open.reduce((n, b) => n + b.remaining, 0);
    const value = open.reduce((n, b) => n + b.remaining * b.unitCostCents, 0);

    // Spent batches are history and are kept; only the open ones are merged.
    this.batches = this.batches.filter((b) => !(b.productId === productId && b.remaining > 0));

    if (quantity <= 0) return;
    this.addBatch(
      productId,
      Math.round(value / quantity),
      quantity,
      'average',
      'Averaged across the stock on hand',
    );
  }

  /** Restates the article's cost from the batches behind it. Returns the new figure. */
  syncCost(productId: string): number | null {
    const open = this.openBatches(productId);
    const quantity = open.reduce((n, b) => n + b.remaining, 0);
    if (quantity <= 0) return null;

    const unit = Math.round(open.reduce((n, b) => n + b.remaining * b.unitCostCents, 0) / quantity);
    const product = this.products.find((p) => p.id === productId);
    if (product) this.replaceProduct(this.rebuild(product, { costCents: unit }));
    return unit;
  }

  historyFor(productId: string, limit: number): PriceChange[] {
    return this.priceHistory
      .filter((h) => this.priceOwner.get(h.id) === productId)
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, limit);
  }

  // ---------------------------------------------------------------------------
  // Stock, priced.
  // ---------------------------------------------------------------------------

  /**
   * Removing an article, and handing back what its stock cost.
   *
   * Priced from the batches rather than from today's average, so an article holding stock
   * bought at two prices gives back what was really paid for each of them.
   */
  archive(productId: string, reason: string | null): ArchiveResult {
    const existing = this.products.find((p) => p.id === productId);
    if (!existing) throw new Error('That product no longer exists');
    if (!existing.isActive) return { units: 0, valueCents: 0, alreadyRemoved: true };

    const units = existing.stock.value;
    let valueCents = 0;

    if (units > 0) {
      this.reconcile(productId, units);
      valueCents = Math.round(
        this.consume(productId, units).reduce((n, a) => n + a.quantity * a.unitCostCents, 0),
      );
      if (valueCents > 0) {
        this.recordCash('removal', Money.fromCents(valueCents), existing.name, reason);
      }
    }

    this.products = this.products.map((p) =>
      p.id === productId ? this.rebuild(p, { stock: 0, isActive: false }) : p,
    );

    return { units, valueCents, alreadyRemoved: false };
  }

  adjust(productId: string, change: StockChange): StockChangeResult {
    const existing = this.products.find((p) => p.id === productId);
    if (!existing) throw new Error('That product no longer exists');

    this.reconcile(productId, existing.stock.value);

    const previousCost = existing.costPrice.cents;
    const previousSale = existing.salePrice.cents;
    const next = existing.stock.value + change.delta;
    if (next < 0) throw new Error(`That would leave "${existing.name}" below zero`);

    this.replaceProduct(this.withStock(existing, next));

    if (change.reason === 'restock' && change.delta > 0) {
      const unit = change.unitCostCents ?? previousCost;
      const total = Math.round(unit * change.delta);

      this.addBatch(productId, unit, change.delta, 'restock', change.note ?? null);
      if (this.settings.costMethod === 'average') this.collapse(productId);

      const costNow = this.syncCost(productId) ?? unit;
      this.lastCost.set(productId, unit);
      this.replaceProduct(
        this.rebuild(this.products.find((p) => p.id === productId)!, { lastCostCents: unit }),
      );

      if (change.newSalePriceCents !== undefined) {
        const withPrice = this.products.find((p) => p.id === productId)!;
        this.replaceProduct(this.rebuild(withPrice, { saleCents: change.newSalePriceCents }));
      }

      const saleNow = change.newSalePriceCents ?? previousSale;
      if (costNow !== previousCost || saleNow !== previousSale || unit !== previousCost) {
        const id = this.nextId('price');
        this.priceOwner.set(id, productId);
        this.priceHistory.push(
          new PriceChange(
            id,
            new Date(),
            'restock',
            change.delta,
            Money.fromCents(unit),
            Money.fromCents(previousCost),
            Money.fromCents(costNow),
            Money.fromCents(previousSale),
            Money.fromCents(saleNow),
            change.note ?? null,
          ),
        );
      }

      if (total > 0) {
        if (change.funding === 'outside') {
          this.recordCash('investment', Money.fromCents(total), existing.name, change.note ?? null);
        }
        this.recordCash('restock', Money.fromCents(-total), existing.name, change.note ?? null);
      }
    } else if (change.reason === 'adjustment') {
      // Found stock was paid for by someone, so the box comes down. Missing stock was never
      // really bought, so it goes back up.
      let moved: number;

      if (change.delta > 0) {
        const unit = change.unitCostCents ?? previousCost;
        this.addBatch(productId, unit, change.delta, 'correction', change.note ?? null);
        if (this.settings.costMethod === 'average') this.collapse(productId);
        moved = Math.round(unit * change.delta);
      } else {
        const taken = this.consume(productId, -change.delta);
        moved = -Math.round(taken.reduce((n, a) => n + a.quantity * a.unitCostCents, 0));
      }

      this.syncCost(productId);

      if (moved !== 0) {
        this.recordCash('correction', Money.fromCents(-moved), existing.name, change.note ?? null);
      }
    }

    const after = this.products.find((p) => p.id === productId)!;
    return {
      stock: next,
      costPriceCents: after.costPrice.cents,
      previousCostCents: previousCost,
      salePriceCents: after.salePrice.cents,
      previousSaleCents: previousSale,
      lastCostCents: this.lastCost.get(productId) ?? null,
      costChanged: after.costPrice.cents !== previousCost,
      salePriceChanged: after.salePrice.cents !== previousSale,
    };
  }

  createProduct(draft: ProductDraft): Product {
    const product = new Product({
      id: this.nextId('p'),
      barcode: draft.barcode ? Barcode.create(draft.barcode) : null,
      name: draft.name,
      categoryId: draft.categoryId,
      categoryName: this.categories.find((c) => c.id === draft.categoryId)?.name ?? null,
      costPrice: Money.fromCents(draft.costPriceCents),
      lastCostPrice:
        draft.quantityInStock > 0 ? Money.fromCents(draft.costPriceCents) : null,
      salePrice: Money.fromCents(draft.salePriceCents),
      stock: Quantity.of(0),
      lowStockThreshold: Quantity.of(draft.lowStockThreshold),
      unit: draft.unit,
      notes: draft.notes,
      isActive: true,
      variantSize: draft.variantSize ?? null,
      variantTrait: draft.variantTrait ?? null,
      variantBase: draft.variantBase ?? null,
    });
    this.products.push(product);

    const id = this.nextId('price');
    this.priceOwner.set(id, product.id);
    this.priceHistory.push(
      new PriceChange(
        id,
        new Date(),
        'opening',
        draft.quantityInStock,
        Money.fromCents(draft.costPriceCents),
        Money.fromCents(draft.costPriceCents),
        Money.fromCents(draft.costPriceCents),
        Money.fromCents(draft.salePriceCents),
        Money.fromCents(draft.salePriceCents),
        'Article added',
      ),
    );

    if (draft.quantityInStock > 0) {
      // The first stock of an article is a purchase like any other, so it leaves the same
      // trail: a batch, a price row and an entry in the cash box.
      this.replaceProduct(this.withStock(product, draft.quantityInStock));
      this.addBatch(
        product.id,
        draft.costPriceCents,
        draft.quantityInStock,
        'opening',
        'Opening stock',
      );
      this.lastCost.set(product.id, draft.costPriceCents);

      const total = Math.round(draft.costPriceCents * draft.quantityInStock);
      if (total > 0) {
        if (draft.funding === 'outside') {
          this.recordCash('investment', Money.fromCents(total), product.name, 'Opening stock');
        }
        this.recordCash('opening', Money.fromCents(-total), product.name, 'Opening stock');
      }
    }

    return this.products.find((p) => p.id === product.id)!;
  }

  setCostMethod(method: CostMethod): ShopSettings {
    this.settings = new ShopSettings(
      this.settings.shopName,
      this.settings.exchangeRate,
      this.settings.rateUpdatedAt,
      method,
    );

    if (method === 'average') {
      for (const product of this.products) {
        this.collapse(product.id);
        this.syncCost(product.id);
      }
    }

    return this.settings;
  }

  inventoryValue(): InventoryValue {
    const live = this.products.filter((p) => p.isActive);
    return new InventoryValue(
      Money.sum(live.map((p) => p.costPrice.multiply(p.stock.value))),
      Money.sum(live.map((p) => p.salePrice.multiply(p.stock.value))),
      live.filter((p) => p.stock.value > 0).length,
      live.reduce((n, p) => n + p.stock.value, 0),
    );
  }

  // ---------------------------------------------------------------------------
  // Selling, and taking it back.
  // ---------------------------------------------------------------------------

  /**
   * Records a sale the same way the database does: prices come from the catalogue, not from
   * the caller, the discount is recomputed and clamped here too, and what each line cost is
   * the sum of what those exact units were bought for.
   */
  checkout(
    items: ReadonlyArray<{ productId: string; quantity: number; batchId?: string | null }>,
    discountType: 'none' | 'percent' | 'amount',
    discountValue: number,
    paymentCurrency: 'USD' | 'LBP',
    note: string | null,
    soldAt = new Date(),
  ): string {
    const folded = new Map<string, { productId: string; batchId: string | null; quantity: number }>();
    for (const item of items) {
      const key = `${item.productId}|${item.batchId ?? ''}`;
      const seen = folded.get(key);
      if (seen) seen.quantity += item.quantity;
      else
        folded.set(key, {
          productId: item.productId,
          batchId: item.batchId ?? null,
          quantity: item.quantity,
        });
    }

    const lines: SaleItem[] = [];
    const pending: Array<{ itemId: string; allocation: Allocation[] }> = [];
    let subtotal = Money.zero();
    let cost = Money.zero();
    let count = 0;

    for (const line of folded.values()) {
      const product = this.products.find((p) => p.id === line.productId);
      if (!product) throw new Error('That product no longer exists');
      if (product.stock.value < line.quantity) {
        throw new InsufficientStockError(product.name, line.quantity, product.stock.value);
      }

      this.reconcile(product.id, product.stock.value);
      const allocation = this.consume(product.id, line.quantity, line.batchId);

      const lineTotal = product.salePrice.multiply(line.quantity);
      const lineCost = Money.fromCents(
        Math.round(allocation.reduce((n, a) => n + a.quantity * a.unitCostCents, 0)),
      );

      const itemId = this.nextId('li');
      lines.push(
        new SaleItem(
          itemId,
          product.id,
          product.name,
          product.barcode?.value ?? null,
          product.categoryName,
          product.unit,
          product.salePrice,
          Money.fromCents(Math.round(lineCost.cents / line.quantity)),
          Quantity.of(line.quantity),
          lineTotal,
          lineCost,
          lineTotal.subtract(lineCost),
        ),
      );
      pending.push({ itemId, allocation });

      this.replaceProduct(
        this.withStock(
          this.products.find((p) => p.id === product.id)!,
          product.stock.value - line.quantity,
        ),
      );
      this.syncCost(product.id);

      subtotal = subtotal.add(lineTotal);
      cost = cost.add(lineCost);
      count += line.quantity;
    }

    for (const { itemId, allocation } of pending) {
      this.allocations.set(itemId, allocation);
    }

    const discount = DiscountFactory.create(discountType, discountValue).computeDiscount(subtotal);
    const total = subtotal.subtract(discount).clampToZero();
    const id = this.nextId('sale');

    this.recordCash('sale', total, null, null, soldAt);
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

  /** Sales that still count. A voided one is kept but never reaches a report. */
  liveSales(): Sale[] {
    return this.sales.filter((s) => !this.voided.has(s.id));
  }

  refundsIn(from: Date, to: Date): RefundRecord[] {
    return this.refunds.filter(
      (r) => !this.voided.has(r.saleId) && r.at >= from && r.at < to,
    );
  }

  refundedQuantity(saleItemId: string): number {
    return this.refunds.reduce(
      (n, refund) =>
        n +
        refund.lines
          .filter((line) => line.saleItemId === saleItemId)
          .reduce((m, line) => m + line.quantity, 0),
      0,
    );
  }

  saleRecords(from: Date | null, to: Date | null, limit: number): SaleRecord[] {
    return this.sales
      .filter((s) => (from ? s.soldAt >= from : true) && (to ? s.soldAt < to : true))
      .sort((a, b) => b.soldAt.getTime() - a.soldAt.getTime())
      .slice(0, limit)
      .map((sale) => {
        const mine = this.refunds.filter((r) => r.saleId === sale.id);
        const dead = this.voided.get(sale.id);
        return new SaleRecord(
          sale.id,
          sale.soldAt,
          sale.total,
          sale.profit,
          sale.itemCount,
          sale.paymentCurrency,
          sale.totalLbp,
          sale.note,
          dead?.at ?? null,
          dead?.reason ?? null,
          Money.sum(mine.map((r) => r.total)),
          mine.reduce((n, r) => n + r.items, 0),
          mine.length,
        );
      });
  }

  soldLines(saleId: string): SoldLine[] {
    const sale = this.sales.find((s) => s.id === saleId);
    if (!sale) return [];

    return sale.items.map((item) => {
      // The line's share of the basket discount, spread the way the reports spread it.
      const share = sale.subtotal.isZero()
        ? Money.zero()
        : Money.fromCents(
            Math.round((sale.discountAmount.cents * item.lineTotal.cents) / sale.subtotal.cents),
          );

      return new SoldLine(
        item.id,
        item.productId,
        item.productName,
        item.barcode,
        item.categoryName,
        item.unit,
        item.quantity.value,
        item.unitPrice,
        item.unitCost,
        item.lineTotal,
        item.lineTotal.subtract(share),
        this.refundedQuantity(item.id),
      );
    });
  }

  voidSale(saleId: string, reason: string | null) {
    const sale = this.sales.find((s) => s.id === saleId);
    if (!sale) throw new Error('That sale no longer exists');
    if (this.voided.has(saleId)) throw new Error('That sale was already voided');
    if (this.refunds.some((r) => r.saleId === saleId)) {
      throw new Error('That sale has already been refunded in part, so it cannot be voided');
    }

    let units = 0;
    for (const item of sale.items) {
      this.returnTo(this.allocations.get(item.id) ?? []);
      const product = item.productId
        ? this.products.find((p) => p.id === item.productId)
        : undefined;
      if (product) {
        this.replaceProduct(this.withStock(product, product.stock.value + item.quantity.value));
        this.syncCost(product.id);
      }
      units += item.quantity.value;
    }

    if (!sale.total.isZero()) {
      this.recordCash('void', Money.zero().subtract(sale.total), null, reason);
    }
    this.voided.set(saleId, { at: new Date(), reason });

    return { saleId, lines: sale.items.length, units, totalCents: sale.total.cents };
  }

  refundSale(saleId: string, wanted: ReadonlyArray<RefundLine>, reason: string | null) {
    const sale = this.sales.find((s) => s.id === saleId);
    if (!sale) throw new Error('That sale no longer exists');
    if (this.voided.has(saleId)) {
      throw new Error('That sale was voided, so there is nothing to refund');
    }

    const record: RefundRecord = {
      id: this.nextId('refund'),
      saleId,
      at: new Date(),
      total: Money.zero(),
      cost: Money.zero(),
      items: 0,
      lines: [],
    };

    for (const line of wanted) {
      const item = sale.items.find((i) => i.id === line.saleItemId);
      if (!item) throw new Error('That line is not part of this sale');

      const already = this.refundedQuantity(item.id);
      if (already + line.quantity > item.quantity.value + 1e-9) {
        throw new Error(
          `Only ${item.quantity.value - already} of "${item.productName}" can still be returned`,
        );
      }

      // The line's share of the basket discount, spread the way the reports spread it.
      const share = sale.subtotal.isZero()
        ? Money.zero()
        : Money.fromCents(
            Math.round((sale.discountAmount.cents * item.lineTotal.cents) / sale.subtotal.cents),
          );
      const lineNet = item.lineTotal.subtract(share);
      const net = Money.fromCents(
        Math.round((lineNet.cents * line.quantity) / item.quantity.value),
      );

      const allocation = this.allocations.get(item.id) ?? [];
      const back: Allocation[] = [];
      let skip = already;
      let want = line.quantity;
      let cost = 0;

      for (const slice of allocation) {
        if (want <= 0) break;
        let free = slice.quantity;
        if (skip > 0) {
          const used = Math.min(skip, slice.quantity);
          skip -= used;
          free -= used;
        }
        if (free <= 0) continue;

        const take = Math.min(free, want);
        cost += take * slice.unitCostCents;
        want -= take;
        back.push({ batchId: slice.batchId, quantity: take, unitCostCents: slice.unitCostCents });
      }
      // A sale taken before batches existed has no allocation; the line's own cost stands.
      if (want > 0) cost += want * item.unitCost.cents;

      this.returnTo(back);

      const product = item.productId
        ? this.products.find((p) => p.id === item.productId)
        : undefined;
      if (product) {
        this.replaceProduct(this.withStock(product, product.stock.value + line.quantity));
        this.syncCost(product.id);
      }

      record.lines.push({
        saleItemId: item.id,
        productId: item.productId,
        productName: item.productName,
        categoryName: item.categoryName,
        unit: item.unit,
        quantity: line.quantity,
        unitPrice: item.unitPrice,
        net,
        cost: Money.fromCents(Math.round(cost)),
      });
      record.total = record.total.add(net);
      record.cost = record.cost.add(Money.fromCents(Math.round(cost)));
      record.items += line.quantity;
    }

    this.refunds.push(record);
    if (!record.total.isZero()) {
      this.recordCash('refund', Money.zero().subtract(record.total), null, reason);
    }

    return { refundId: record.id, totalCents: record.total.cents, units: record.items };
  }

  /** A fortnight of trading, so the reports screen has a shape to show rather than a flat line. */
  private seedHistory(): void {
    // Every seeded article needs the batch its stock came from, or the first sale would have
    // to invent one.
    for (const product of this.products) {
      if (product.stock.value > 0) {
        this.addBatch(
          product.id,
          product.costPrice.cents,
          product.stock.value,
          'opening',
          'Opening stock',
        );
      }
    }

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
      for (const product of this.products) {
        if (product.stock.value < 6 && product.id !== 'p8') {
          this.replaceProduct(this.withStock(product, product.stock.value + 18));
          this.addBatch(product.id, product.costPrice.cents, 18, 'restock', 'Weekly delivery');
        }
      }
    }
  }
}
