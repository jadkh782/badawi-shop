import { FixedAmountDiscount } from './FixedAmountDiscount';
import type { DiscountType, IDiscountStrategy } from './IDiscountStrategy';
import { NoDiscount } from './NoDiscount';
import { PercentageDiscount } from './PercentageDiscount';

/**
 * The one place that maps a stored discount type onto a strategy. Registering a new kind here
 * is the only edit an extra discount rule requires outside of its own file.
 */
export class DiscountFactory {
  static create(type: DiscountType, value: number): IDiscountStrategy {
    switch (type) {
      case 'percent':
        return new PercentageDiscount(value);
      case 'amount':
        return new FixedAmountDiscount(value);
      case 'none':
      default:
        return new NoDiscount();
    }
  }
}
