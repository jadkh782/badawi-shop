import type { SupabaseClient } from '@supabase/supabase-js';
import type { DateRange, Sale, SaleRecord, SoldLine } from '@/domain';
import type {
  CheckoutRequest,
  ISaleRepository,
  RefundLine,
  RefundResult,
  VoidResult,
} from '@/application/ports';
import { toSale, toSaleRecord, toSoldLine } from './mappers/toDomain';
import type { SaleListRow, SaleRow, SoldLineRow } from './types';
import { num } from './types';
import { translateError } from './errors';

export class SupabaseSaleRepository implements ISaleRepository {
  constructor(private readonly db: SupabaseClient) {}

  /**
   * One call, one transaction. If the shelf runs short halfway through, nothing is written
   * at all: no half sale, no stock taken for the lines that did fit.
   */
  async checkout(request: CheckoutRequest): Promise<string> {
    const { data, error } = await this.db.rpc('checkout_sale', {
      p_items: request.items.map((item) => ({
        product_id: item.productId,
        quantity: item.quantity,
        // Only present when the till asked which price was going over the counter. Left out,
        // the database takes the oldest stock first.
        batch_id: item.batchId ?? null,
      })),
      p_discount_type: request.discountType,
      p_discount_value: request.discountValue,
      p_payment_currency: request.paymentCurrency,
      p_note: request.note ?? null,
    });
    if (error) throw translateError(error);
    return String(data);
  }

  async findById(id: string): Promise<Sale | null> {
    const { data, error } = await this.db
      .from('sales')
      .select('*, sale_items ( * )')
      .eq('id', id)
      .maybeSingle();
    if (error) throw translateError(error);
    return data ? toSale(data as SaleRow) : null;
  }

  async list(range: DateRange | null, limit = 50): Promise<SaleRecord[]> {
    const window = range?.toIsoStrings();
    const { data, error } = await this.db.rpc('list_sales', {
      p_from: window?.from ?? null,
      p_to: window?.to ?? null,
      p_limit: limit,
    });
    if (error) throw translateError(error);
    return (data as SaleListRow[]).map(toSaleRecord);
  }

  async lines(saleId: string): Promise<SoldLine[]> {
    const { data, error } = await this.db.rpc('get_sale_lines', { p_sale_id: saleId });
    if (error) throw translateError(error);
    return (data as SoldLineRow[]).map(toSoldLine);
  }

  async void(saleId: string, reason: string | null = null): Promise<VoidResult> {
    const { data, error } = await this.db.rpc('void_sale', {
      p_sale_id: saleId,
      p_reason: reason,
    });
    if (error) throw translateError(error);

    const row = (data ?? {}) as Record<string, unknown>;
    return {
      saleId: String(row.sale_id ?? saleId),
      lines: num(row.lines as number),
      units: num(row.units as number),
      totalCents: num(row.total_cents as number),
    };
  }

  async refund(
    saleId: string,
    lines: ReadonlyArray<RefundLine>,
    reason: string | null = null,
  ): Promise<RefundResult> {
    const { data, error } = await this.db.rpc('refund_sale', {
      p_sale_id: saleId,
      p_items: lines.map((line) => ({
        sale_item_id: line.saleItemId,
        quantity: line.quantity,
      })),
      p_reason: reason,
    });
    if (error) throw translateError(error);

    const row = (data ?? {}) as Record<string, unknown>;
    return {
      refundId: String(row.refund_id ?? ''),
      totalCents: num(row.total_cents as number),
      units: num(row.units as number),
    };
  }
}
