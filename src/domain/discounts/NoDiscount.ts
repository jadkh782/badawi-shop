import { Money } from '../value-objects/Money';
import type { DiscountType, IDiscountStrategy } from './IDiscountStrategy';

/**
 * The default. Being a real strategy rather than `null` means checkout never branches on
 * whether a discount exists.
 */
export class NoDiscount implements IDiscountStrategy {
  readonly type: DiscountType = 'none';
  readonly value = 0;

  computeDiscount(): Money {
    return Money.zero();
  }

  describe(): string {
    return 'No discount';
  }
}
