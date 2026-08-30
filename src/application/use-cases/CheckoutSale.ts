import { Cart, DomainError, type PaymentCurrency } from '@/domain';
import type { ISaleRepository } from '../ports';

/**
 * Posts the basket and returns the id of the sale that was recorded.
 *
 * Note what is not sent: no prices, no subtotal, no total. The cart computed those to show
 * the cashier a running figure, but the books are written from the catalogue by the database.
 * If the two ever disagree, the database is right and the screen was stale.
 */
export class CheckoutSale {
  constructor(private readonly sales: ISaleRepository) {}

  async execute(
    cart: Cart,
    paymentCurrency: PaymentCurrency,
    note: string | null = null,
  ): Promise<string> {
    if (cart.isEmpty) {
      throw new DomainError('There is nothing in the cart to check out');
    }

    return this.sales.checkout({
      items: cart.lines.map((line) => ({
        productId: line.product.id,
        quantity: line.quantity.value,
        // Only set when the till asked which purchase price was going over the counter.
        batchId: line.batch?.id ?? null,
      })),
      discountType: cart.discount.type,
      discountValue: cart.discount.value,
      paymentCurrency,
      note,
    });
  }
}
