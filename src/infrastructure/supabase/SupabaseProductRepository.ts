import type { SupabaseClient } from '@supabase/supabase-js';
import { Barcode, DuplicateBarcodeError, type Product } from '@/domain';
import type { IProductRepository, ProductDraft, ProductQuery } from '@/application/ports';
import { toProduct } from './mappers/toDomain';
import type { ProductRow } from './types';
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

  async create(draft: ProductDraft): Promise<Product> {
    const { data, error } = await this.db
      .from('products')
      .insert(toRow(draft))
      .select(SELECT)
      .single();
    if (error) throw asDuplicate(error, draft.barcode);
    return toProduct(data as ProductRow);
  }

  async update(id: string, draft: ProductDraft): Promise<Product> {
    // quantity_in_stock is deliberately absent: stock moves only through adjust_stock, so
    // that every change leaves a ledger entry behind it.
    const { quantityInStock: _ignored, ...rest } = draft;
    const { data, error } = await this.db
      .from('products')
      .update(toRow({ ...rest, quantityInStock: 0 }, false))
      .eq('id', id)
      .select(SELECT)
      .single();
    if (error) throw asDuplicate(error, draft.barcode);
    return toProduct(data as ProductRow);
  }

  async archive(id: string): Promise<void> {
    // Archived rather than deleted: sale history keeps its own snapshots, but an accidental
    // delete would still lose the article itself.
    const { error } = await this.db.from('products').update({ is_active: false }).eq('id', id);
    if (error) throw translateError(error);
  }

  async adjustStock(
    id: string,
    delta: number,
    reason: 'restock' | 'adjustment',
    note?: string,
  ): Promise<number> {
    const { data, error } = await this.db.rpc('adjust_stock', {
      p_product_id: id,
      p_delta: delta,
      p_reason: reason,
      p_note: note ?? null,
    });
    if (error) throw translateError(error);
    return Number(data);
  }
}

function toRow(draft: ProductDraft, includeStock = true): Record<string, unknown> {
  const row: Record<string, unknown> = {
    barcode: draft.barcode,
    name: draft.name,
    category_id: draft.categoryId,
    cost_price_cents: draft.costPriceCents,
    sale_price_cents: draft.salePriceCents,
    low_stock_threshold: draft.lowStockThreshold,
    unit: draft.unit,
    notes: draft.notes,
  };
  if (includeStock) row.quantity_in_stock = draft.quantityInStock;
  return row;
}

function asDuplicate(error: { code?: string; message: string }, barcode: string | null): Error {
  if (error.code === '23505' && barcode) return new DuplicateBarcodeError(barcode);
  return translateError(error);
}
