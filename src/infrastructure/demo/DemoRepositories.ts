import {
  Barcode,
  BudgetSummary,
  Category,
  ExchangeRate,
  InventoryValue,
  Money,
  PriceChange,
  Product,
  Quantity,
  Sale,
  SaleRecord,
  ShopSettings,
  SoldLine,
  StockBatch,
  CashMovement,
  type CashKind,
  type CostMethod,
  type DateRange,
} from '@/domain';
import type {
  CategoryDraft,
  CheckoutRequest,
  IAuthService,
  IBudgetRepository,
  ICategoryRepository,
  IProductRepository,
  ISaleRepository,
  ISettingsRepository,
  IShopReset,
  ProductDraft,
  ProductQuery,
  RefundLine,
  RefundResult,
  ResetCounts,
  ShopUser,
  StockChange,
  ArchiveResult,
  StockChangeResult,
  VoidResult,
} from '@/application/ports';
import { InMemoryStore } from './InMemoryStore';

const store = () => InMemoryStore.get();

export class DemoProductRepository implements IProductRepository {
  async findById(id: string): Promise<Product | null> {
    return store().products.find((p) => p.id === id) ?? null;
  }

  async findByBarcode(barcode: Barcode): Promise<Product | null> {
    return store().products.find((p) => p.barcode?.value === barcode.value) ?? null;
  }

  async list(query: ProductQuery = {}): Promise<Product[]> {
    const term = query.search?.trim().toLowerCase() ?? '';
    return store()
      .products.filter((p) => p.isActive)
      .filter((p) => (query.categoryId ? p.categoryId === query.categoryId : true))
      .filter((p) =>
        term
          ? p.name.toLowerCase().includes(term) || (p.barcode?.value.startsWith(term) ?? false)
          : true,
      )
      .filter((p) => (query.lowStockOnly ? p.isLowStock || p.isOutOfStock : true))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, query.limit ?? 200);
  }

  async batches(productId: string): Promise<StockBatch[]> {
    return store().batchesFor(productId);
  }

  async priceHistory(productId: string, limit = 50): Promise<PriceChange[]> {
    return store().historyFor(productId, limit);
  }

  async create(draft: ProductDraft): Promise<Product> {
    return store().createProduct(draft);
  }

  async update(id: string, draft: ProductDraft): Promise<Product> {
    const existing = store().products.find((p) => p.id === id);
    if (!existing) throw new Error('That product no longer exists');

    // Stock is deliberately untouched: it moves only through adjustStock, so every change
    // leaves a ledger entry behind it.
    return store().replaceProduct(
      new Product({
        id,
        barcode: draft.barcode ? Barcode.create(draft.barcode) : null,
        name: draft.name,
        categoryId: draft.categoryId,
        categoryName: store().categories.find((c) => c.id === draft.categoryId)?.name ?? null,
        costPrice: Money.fromCents(draft.costPriceCents),
        salePrice: Money.fromCents(draft.salePriceCents),
        stock: existing.stock,
        lowStockThreshold: Quantity.of(draft.lowStockThreshold),
        unit: draft.unit,
        notes: draft.notes,
        isActive: true,
        variantSize: draft.variantSize ?? null,
        variantTrait: draft.variantTrait ?? null,
        variantBase: draft.variantBase ?? null,
      }),
    );
  }

  async archive(id: string, reason?: string): Promise<ArchiveResult> {
    // The same money rule as the database, so the demo teaches the real behaviour.
    return store().archive(id, reason ?? null);
  }

  async adjustStock(id: string, change: StockChange): Promise<StockChangeResult> {
    return store().adjust(id, change);
  }
}

export class DemoCategoryRepository implements ICategoryRepository {
  async list(): Promise<Category[]> {
    return [...store().categories].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async create(draft: CategoryDraft): Promise<Category> {
    const category = build(store().nextId('c'), draft);
    store().categories.push(category);
    return category;
  }

  async update(id: string, draft: CategoryDraft): Promise<Category> {
    const next = build(id, draft);
    store().categories = store().categories.map((c) => (c.id === id ? next : c));
    return next;
  }

  async remove(id: string): Promise<void> {
    store().categories = store().categories.filter((c) => c.id !== id);
  }
}

/**
 * One shape for both writes, matching what the database stores: a shelf with no sizes keeps
 * no trait label either, so "does this shelf come in sizes" has a single answer.
 */
function build(id: string, draft: CategoryDraft): Category {
  const sizes = (draft.variantSizes ?? []).map((size) => size.trim()).filter(Boolean);
  return new Category(
    id,
    draft.name,
    draft.color,
    draft.sortOrder,
    true,
    sizes,
    sizes.length > 0 ? (draft.variantTraitLabel?.trim() || 'Variety') : null,
  );
}

export class DemoSaleRepository implements ISaleRepository {
  async checkout(request: CheckoutRequest): Promise<string> {
    return store().checkout(
      request.items,
      request.discountType,
      request.discountValue,
      request.paymentCurrency,
      request.note ?? null,
    );
  }

  async findById(id: string): Promise<Sale | null> {
    return store().sales.find((s) => s.id === id) ?? null;
  }

  async list(range: DateRange | null, limit = 50): Promise<SaleRecord[]> {
    return store().saleRecords(range?.from ?? null, range?.to ?? null, limit);
  }

  async lines(saleId: string): Promise<SoldLine[]> {
    return store().soldLines(saleId);
  }

  async void(saleId: string, reason: string | null = null): Promise<VoidResult> {
    return store().voidSale(saleId, reason);
  }

  async refund(
    saleId: string,
    lines: ReadonlyArray<RefundLine>,
    reason: string | null = null,
  ): Promise<RefundResult> {
    return store().refundSale(saleId, lines, reason);
  }
}

export class DemoSettingsRepository implements ISettingsRepository {
  async get(): Promise<ShopSettings> {
    return store().settings;
  }

  async updateExchangeRate(usdToLbp: number, rounding: number): Promise<ShopSettings> {
    store().settings = new ShopSettings(
      store().settings.shopName,
      ExchangeRate.create(usdToLbp, rounding),
      new Date(),
      store().settings.costMethod,
    );
    return store().settings;
  }

  async updateShopName(name: string): Promise<ShopSettings> {
    store().settings = new ShopSettings(
      name,
      store().settings.exchangeRate,
      store().settings.rateUpdatedAt,
      store().settings.costMethod,
    );
    return store().settings;
  }

  async updateCostMethod(method: CostMethod): Promise<ShopSettings> {
    return store().setCostMethod(method);
  }
}

export class DemoAuthService implements IAuthService {
  private static readonly USER: ShopUser = { id: 'demo', email: 'demo@badawi.shop' };

  async ensureSession(): Promise<ShopUser> {
    return DemoAuthService.USER;
  }

  async signOut(): Promise<void> {
    // Nothing to sign out of; the demo user is always present.
  }

  async currentUser(): Promise<ShopUser | null> {
    return DemoAuthService.USER;
  }
}

/** The demo cash box, reading from the same in-memory ledger the sales write to. */
export class DemoBudgetRepository implements IBudgetRepository {
  async summary(): Promise<BudgetSummary> {
    const cash = store().cash;
    const of = (kind: CashKind) =>
      Money.sum(cash.filter((m) => m.kind === kind).map((m) => m.amount));
    // Money out is stored negative and reported as the amount that left.
    const out = (kind: CashKind) => Money.zero().subtract(of(kind));

    return new BudgetSummary(
      Money.sum(cash.map((m) => m.amount)),
      of('sale'),
      out('restock'),
      out('opening'),
      of('investment'),
      of('correction'),
      out('refund'),
      out('void'),
      of('removal'),
      cash.length,
    );
  }

  async inventoryValue(): Promise<InventoryValue> {
    return store().inventoryValue();
  }

  async movements(limit = 100): Promise<CashMovement[]> {
    return [...store().cash].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
  }
}

/** Resetting the demo shop just empties the store; reopening the app reseeds it. */
export class DemoShopReset implements IShopReset {
  async reset(): Promise<ResetCounts> {
    const s = store();
    const counts: ResetCounts = {
      sales: s.sales.length,
      saleItems: s.sales.reduce((n, sale) => n + sale.items.length, 0),
      stockMovements: 0,
      cashMovements: s.cash.length,
      products: s.products.length,
      categories: s.categories.length,
    };
    s.sales = [];
    s.cash = [];
    s.products = [];
    s.categories = [];
    s.batches = [];
    s.priceHistory = [];
    s.refunds = [];
    s.allocations.clear();
    s.voided.clear();
    s.lastCost.clear();
    s.priceOwner.clear();
    return counts;
  }
}
