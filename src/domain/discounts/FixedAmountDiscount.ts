import { DomainError } from '../errors/DomainError';
import { Money } from '../value-objects/Money';
import type { DiscountType, IDiscountStrategy } from './IDiscountStrategy';

/** Takes a flat USD amount off, capped at the subtotal so a sale never goes negative. */
export class FixedAmountDiscount implements IDiscountStrategy {
  readonly value: number;
  readonly type: DiscountType = 'amount';
  private readonly amount: Money;

  constructor(value: number) {
    if (!Number.isFinite(value) || value < 0) {
      throw new DomainError(`A fixed discount cannot be negative, got ${value}`);
    }
    this.value = value;
    this.amount = Money.fromDollars(value);
  }

  computeDiscount(subtotal: Money): Money {
    return this.amount.atMost(subtotal).clampToZero();
  }

  describe(): string {
    return `${this.amount.format()} off`;
  }
}
