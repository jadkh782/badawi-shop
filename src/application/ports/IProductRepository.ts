import type { Barcode, Product } from '@/domain';

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
}

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
}

/** Where the money for a delivery came from. */
export type RestockFunding = 'budget' | 'outside';

export interface StockChange {
  delta: number;
  reason: 'restock' | 'adjustment';
  note?: string;
  /**
   * What the delivery cost, in cents. Left out, it is priced at the article's cost price.
   * Only a delivery costs anything; correcting a miscount never does.
   */
  costCents?: number;
  /** `outside` means the owner paid, so the balance is left alone. */
  funding?: RestockFunding;
}

/** Write access, used only by Inventory mode. */
export interface IProductWriter {
  create(draft: ProductDraft): Promise<Product>;
  update(id: string, draft: ProductDraft): Promise<Product>;
  archive(id: string): Promise<void>;
  /**
   * Moves stock, writes the ledger entry and moves the money, all in one transaction.
   * Returns the new stock level.
   */
  adjustStock(id: string, change: StockChange): Promise<number>;
}

export interface IProductRepository extends IProductReader, IProductWriter {}
