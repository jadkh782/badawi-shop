import type { SupabaseClient } from '@supabase/supabase-js';
import type { Sale } from '@/domain';
import type { CheckoutRequest, ISaleRepository } from '@/application/ports';
import { toSale } from './mappers/toDomain';
import type { SaleRow } from './types';
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
}
