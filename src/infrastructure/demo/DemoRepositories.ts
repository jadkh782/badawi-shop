import {
  Barcode,
  Category,
  CategorySalesStat,
  DateRange,
  LowStockItem,
  Money,
  BudgetSummary,
  CashMovement,
  Product,
  ProductSalesStat,
  Quantity,
  type ReportBucket,
  Sale,
  SalesSummary,
  ShopSettings,
  TimeSeriesPoint,
  ExchangeRate,
} from '@/domain';
import type { CashKind } from '@/domain';
import type {
  CategoryDraft,
  CheckoutRequest,
  IAuthService,
  ICategoryRepository,
  IProductRepository,
  IReportRepository,
  ISaleRepository,
  ISettingsRepository,
  ProductDraft,
  ProductQuery,
  ShopUser,
  StockChange,
  IBudgetRepository,
  IShopReset,
  ResetCounts,
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

  async create(draft: ProductDraft): Promise<Product> {
    const product = build(store().nextId('p'), draft);
    store().products.push(product);
    return product;
  }

  async update(id: string, draft: ProductDraft): Promise<Product> {
    const existing = store().products.find((p) => p.id === id);
    if (!existing) throw new Error('That product no longer exists');
    return store().replaceProduct(build(id, draft, existing.stock.value));
  }

  async archive(id: string): Promise<void> {
    store().products = store().products.filter((p) => p.id !== id);
  }

  async adjustStock(id: string, change: StockChange): Promise<number> {
    const existing = store().products.find((p) => p.id === id);
    if (!existing) throw new Error('That product no longer exists');

    const next = existing.stock.value + change.delta;
    if (next < 0) throw new Error(`That would leave "${existing.name}" below zero`);
    store().replaceProduct(store().withStock(existing, next));

    // Same money rules as the database, so the demo teaches the real behaviour.
    if (change.reason === 'restock' && change.delta > 0) {
      const cost =
        change.costCents !== undefined
          ? Money.fromCents(change.costCents)
          : existing.costPrice.multiply(change.delta);

      if (!cost.isZero()) {
        if (change.funding === 'outside') {
          store().recordCash('investment', cost, existing.name, change.note ?? null);
        }
        store().recordCash('restock', Money.zero().subtract(cost), existing.name, change.note ?? null);
      }
    }

    return next;
  }
}

function build(id: string, draft: ProductDraft, stock?: number): Product {
  return new Product({
    id,
    barcode: draft.barcode ? Barcode.create(draft.barcode) : null,
    name: draft.name,
    categoryId: draft.categoryId,
    categoryName: store().categories.find((c) => c.id === draft.categoryId)?.name ?? null,
    costPrice: Money.fromCents(draft.costPriceCents),
    salePrice: Money.fromCents(draft.salePriceCents),
    stock: Quantity.of(stock ?? draft.quantityInStock),
    lowStockThreshold: Quantity.of(draft.lowStockThreshold),
    unit: draft.unit,
    notes: draft.notes,
    isActive: true,
  });
}

export class DemoCategoryRepository implements ICategoryRepository {
  async list(): Promise<Category[]> {
    return [...store().categories].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async create(draft: CategoryDraft): Promise<Category> {
    const category = new Category(store().nextId('c'), draft.name, draft.color, draft.sortOrder);
    store().categories.push(category);
    return category;
  }

  async update(id: string, draft: CategoryDraft): Promise<Category> {
    const next = new Category(id, draft.name, draft.color, draft.sortOrder);
    store().categories = store().categories.map((c) => (c.id === id ? next : c));
    return next;
  }

  async remove(id: string): Promise<void> {
    store().categories = store().categories.filter((c) => c.id !== id);
  }
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
    );
    return store().settings;
  }

  async updateShopName(name: string): Promise<ShopSettings> {
    store().settings = new ShopSettings(
      name,
      store().settings.exchangeRate,
      store().settings.rateUpdatedAt,
    );
    return store().settings;
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

    const spent = of('restock');
    return new BudgetSummary(
      Money.sum(cash.map((m) => m.amount)),
      of('sale'),
      // Stored negative; shown as the amount that went out.
      Money.zero().subtract(spent),
      of('investment'),
      cash.length,
    );
  }

  async movements(limit = 100): Promise<CashMovement[]> {
    return [...store().cash]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, limit);
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
    return counts;
  }
}
