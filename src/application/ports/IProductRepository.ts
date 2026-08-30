import type { Barcode, PriceChange, Product, StockBatch } from '@/domain';

export interface ProductQuery {
  search?: string;
  categoryId?: string | null;
  lowStockOnly?: boolean;
  limit?: number;
}

/**
 * Read access to the catalogue.
 *
 * Sell mode depends on this and nothing wider, so a bug in the till can never delete an
 * article. Splitting reads from writes is the interface-segregation half of SOLID doing
 * real work rather than decorating a diagram.
 */
export interface IProductReader {
  findById(id: string): Promise<Product | null>;
  findByBarcode(barcode: Barcode): Promise<Product | null>;
  list(query?: ProductQuery): Promise<Product[]>;
  /**
   * The open batches behind an article, oldest first.
   *
   * More than one means the shelf is holding stock bought at different prices, which is the
   * only time the till has anything to ask about.
   */
  batches(productId: string): Promise<StockBatch[]>;
  priceHistory(productId: string, limit?: number): Promise<PriceChange[]>;
}

/** Where the money for stock came from. */
export type RestockFunding = 'budget' | 'outside';

export interface ProductDraft {
  barcode: string | null;
  name: string;
  categoryId: string | null;
  costPriceCents: number;
  salePriceCents: number;
  quantityInStock: number;
  lowStockThreshold: number;
  unit: string;
  notes: string | null;
  /**
   * Who paid for the opening stock. Only meaningful on create: the first stock of an article
   * is a purchase, and the books have to say whose money bought it.
   */
  funding?: RestockFunding;
}

export interface StockChange {
  delta: number;
  reason: 'restock' | 'adjustment';
  note?: string;
  /**
   * What one unit of this delivery cost. Left out, the article's current cost stands, which
   * is right whenever the supplier charged what they usually do.
   */
  unitCostCents?: number;
  /** A new shelf price to go with a new cost. Left out, the price stays where it is. */
  newSalePriceCents?: number;
  /** `outside` means the owner paid, so the balance is left alone. */
  funding?: RestockFunding;
}

/** What a stock change did, which is more than just the new count once prices can move. */
export interface StockChangeResult {
  stock: number;
  costPriceCents: number;
  previousCostCents: number;
  salePriceCents: number;
  previousSaleCents: number;
  lastCostCents: number | null;
  costChanged: boolean;
  salePriceChanged: boolean;
}

/** Write access, used only by Inventory mode. */
export interface IProductWriter {
  create(draft: ProductDraft): Promise<Product>;
  update(id: string, draft: ProductDraft): Promise<Product>;
  archive(id: string): Promise<void>;
  /**
   * Moves stock, writes the ledger entry, restates the cost and moves the money, all in one
   * transaction.
   */
  adjustStock(id: string, change: StockChange): Promise<StockChangeResult>;
}

export interface IProductRepository extends IProductReader, IProductWriter {}
