import type { DiscountType, PaymentCurrency, Sale } from '@/domain';

export interface CheckoutRequest {
  items: ReadonlyArray<{ productId: string; quantity: number }>;
  discountType: DiscountType;
  discountValue: number;
  paymentCurrency: PaymentCurrency;
  note?: string | null;
}

export interface ISaleRepository {
  /**
   * Posts the basket. Only ids, quantities and the discount travel: every price and total is
   * recomputed by the database, so the figure that lands in the books cannot be one the
   * device made up or one it read before the last price change.
   */
  checkout(request: CheckoutRequest): Promise<string>;
  findById(id: string): Promise<Sale | null>;
}
