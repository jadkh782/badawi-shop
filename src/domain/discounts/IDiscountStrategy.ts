import { Money } from '../value-objects/Money';

export type DiscountType = 'none' | 'percent' | 'amount';

/**
 * How a discount turns a subtotal into an amount off.
 *
 * Adding a new kind of discount (buy-one-get-one, loyalty tier, staff rate) means adding a
 * class here and registering it in the factory. Nothing in the cart or the checkout flow has
 * to change, which is the whole point of keeping this behind an interface.
 */
export interface IDiscountStrategy {
  readonly type: DiscountType;
  /** The raw input the cashier gave: 10 for "10%", 2.50 for "$2.50 off". */
  readonly value: number;
  /** The amount to take off, already clamped so it can never exceed the subtotal. */
  computeDiscount(subtotal: Money): Money;
  /** Short label for the cart and the receipt. */
  describe(): string;
}
