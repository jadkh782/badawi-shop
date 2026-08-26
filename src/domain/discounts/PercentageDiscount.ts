import { DomainError } from '../errors/DomainError';
import { Money } from '../value-objects/Money';
import type { DiscountType, IDiscountStrategy } from './IDiscountStrategy';

/** Takes a percentage off the subtotal. */
export class PercentageDiscount implements IDiscountStrategy {
  readonly type: DiscountType = 'percent';

  constructor(readonly value: number) {
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new DomainError(`A percentage discount must be between 0 and 100, got ${value}`);
    }
  }

  computeDiscount(subtotal: Money): Money {
    return subtotal.percentage(this.value).atMost(subtotal).clampToZero();
  }

  describe(): string {
    return `${this.value}% off`;
  }
}
