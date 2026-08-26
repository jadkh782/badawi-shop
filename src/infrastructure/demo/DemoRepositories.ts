import {
  Barcode,
  Category,
  CategorySalesStat,
  DateRange,
  LowStockItem,
  Money,
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

  async adjustStock(id: string, delta: number): Promise<number> {
    const existing = store().products.find((p) => p.id === id);
    if (!existing) throw new Error('That product no longer exists');
    const next = existing.stock.value + delta;
    if (next < 0) throw new Error(`That would leave "${existing.name}" below zero`);
    store().replaceProduct(store().withStock(existing, next));
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
