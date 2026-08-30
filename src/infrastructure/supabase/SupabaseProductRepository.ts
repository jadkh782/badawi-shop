import type { SupabaseClient } from '@supabase/supabase-js';
import { Barcode, DuplicateBarcodeError, type PriceChange, type Product, type StockBatch } from '@/domain';
import type {
  ArchiveResult,
  IProductRepository,
  ProductDraft,
  ProductQuery,
  StockChange,
  StockChangeResult,
} from '@/application/ports';
import { toPriceChange, toProduct, toStockBatch } from './mappers/toDomain';
import type { PriceHistoryRow, ProductRow, StockBatchRow, StockChangeRow } from './types';
import { num } from './types';
import { translateError } from './errors';

const SELECT = '*, categories ( name )';

export class SupabaseProductRepository implements IProductRepository {
  constructor(private readonly db: SupabaseClient) {}

  async findById(id: string): Promise<Product | null> {
    const { data, error } = await this.db.from('products').select(SELECT).eq('id', id).maybeSingle();
    if (error) throw translateError(error);
    return data ? toProduct(data as ProductRow) : null;
  }

  async findByBarcode(barcode: Barcode): Promise<Product | null> {
    const { data, error } = await this.db
      .from('products')
      .select(SELECT)
      .eq('barcode', barcode.value)
      .eq('is_active', true)
      .maybeSingle();
    if (error) throw translateError(error);
    return data ? toProduct(data as ProductRow) : null;
  }

  async list(query: ProductQuery = {}): Promise<Product[]> {
    let builder = this.db.from('products').select(SELECT).eq('is_active', true);

    if (query.categoryId) {
      builder = builder.eq('category_id', query.categoryId);
    }

    const search = query.search?.trim();
    if (search) {
      // A cashier searching "cola" should find "Coca Cola 1L", and typing a barcode prefix
      // should find it too, so name and barcode are matched together.
      const escaped = search.replace(/[%,()]/g, ' ');
      builder = builder.or(`name.ilike.%${escaped}%,barcode.ilike.${escaped}%`);
    }

    const { data, error } = await builder.order('name').limit(query.limit ?? 200);
    if (error) throw translateError(error);

    const products = (data as ProductRow[]).map(toProduct);
    return query.lowStockOnly ? products.filter((p) => p.isLowStock || p.isOutOfStock) : products;
  }

  async batches(productId: string): Promise<StockBatch[]> {
    const { data, error } = await this.db.rpc('list_stock_batches', { p_product_id: productId });
    if (error) throw translateError(error);
    return (data as StockBatchRow[]).map(toStockBatch);
  }

  async priceHistory(productId: string, limit = 50): Promise<PriceChange[]> {
    const { data, error } = await this.db.rpc('list_price_history', {
      p_product_id: productId,
      p_limit: limit,
    });
    if (error) throw translateError(error);
    return (data as PriceHistoryRow[]).map(toPriceChange);
  }

  /**
   * Creating an article is a purchase, so it goes through a function rather than an insert.
   *
   * The row and its opening stock land in one transaction, along with the cash entry saying
   * whose money paid for it. Inserting directly would leave a shelf full of goods that the
   * cash box has no record of anyone buying.
   */
  async create(draft: ProductDraft): Promise<Product> {
    const { data, error } = await this.db.rpc('create_product', {
      p_barcode: draft.barcode,
      p_name: draft.name,
      p_category_id: draft.categoryId,
      p_cost_price_cents: draft.costPriceCents,
      p_sale_price_cents: draft.salePriceCents,
      p_quantity: draft.quantityInStock,
      p_low_stock_threshold: draft.lowStockThreshold,
      p_unit: draft.unit,
      p_notes: draft.notes,
      p_funding: draft.funding ?? 'budget',
      p_variant_size: draft.variantSize ?? null,
      p_variant_trait: draft.variantTrait ?? null,
    });
    if (error) throw asDuplicate(error, draft.barcode);

    const created = await this.findById(String(data));
    if (!created) throw new Error('The article was saved but could not be read back');
    return created;
  }

  async update(id: string, draft: ProductDraft): Promise<Product> {
    // quantity_in_stock is deliberately absent: stock moves only through adjust_stock, so
    // that every change leaves a ledger entry behind it.
    const { data, error } = await this.db
      .from('products')
      .update(toRow(draft))
      .eq('id', id)
      .select(SELECT)
      .single();
    if (error) throw asDuplicate(error, draft.barcode);
    return toProduct(data as ProductRow);
  }

  async archive(id: string, reason?: string): Promise<ArchiveResult> {
    // Archived rather than deleted: sale history keeps its own snapshots, but an accidental
    // delete would still lose the article itself. Going through the function rather than
    // flipping the column is what puts the money for the remaining stock back in the budget.
    const { data, error } = await this.db.rpc('archive_product', {
      p_product_id: id,
      p_reason: reason ?? null,
    });
    if (error) throw translateError(error);

    const row = (data ?? {}) as Record<string, unknown>;
    return {
      units: Number(row.units ?? 0),
      valueCents: Number(row.value_cents ?? 0),
      alreadyRemoved: Boolean(row.already_removed),
    };
  }

  async adjustStock(id: string, change: StockChange): Promise<StockChangeResult> {
    const { data, error } = await this.db.rpc('adjust_stock', {
      p_product_id: id,
      p_delta: change.delta,
      p_reason: change.reason,
      p_note: change.note ?? null,
      // Null lets the database price the delivery at the article's own cost, which is the
      // right answer whenever the supplier charged what they usually do.
      p_unit_cost_cents: change.unitCostCents ?? null,
      p_funding: change.funding ?? 'budget',
      p_new_sale_price_cents: change.newSalePriceCents ?? null,
    });
    if (error) throw translateError(error);

    const row = (data ?? {}) as StockChangeRow;
    return {
      stock: num(row.stock),
      costPriceCents: num(row.cost_price_cents),
      previousCostCents: num(row.previous_cost_cents),
      salePriceCents: num(row.sale_price_cents),
      previousSaleCents: num(row.previous_sale_cents),
      lastCostCents: row.last_cost_cents === null ? null : num(row.last_cost_cents),
      costChanged: Boolean(row.cost_changed),
      salePriceChanged: Boolean(row.sale_price_changed),
    };
  }
}

function toRow(draft: ProductDraft): Record<string, unknown> {
  return {
    barcode: draft.barcode,
    name: draft.name,
    category_id: draft.categoryId,
    cost_price_cents: draft.costPriceCents,
    sale_price_cents: draft.salePriceCents,
    low_stock_threshold: draft.lowStockThreshold,
    unit: draft.unit,
    notes: draft.notes,
    variant_size: draft.variantSize ?? null,
    variant_trait: draft.variantTrait ?? null,
  };
}

function asDuplicate(error: { code?: string; message: string }, barcode: string | null): Error {
  if (error.code === '23505' && barcode) return new DuplicateBarcodeError(barcode);
  return translateError(error);
}
