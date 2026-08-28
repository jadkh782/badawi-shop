import { Money } from '../value-objects/Money';

export type CashKind = 'sale' | 'restock' | 'investment';

/**
 * What is in the cash box and how it got there.
 *
 * Takings go in, deliveries come out, and the balance is what there is to spend on the next
 * one. Money the owner puts in from their own pocket is counted separately, so the shop can
 * tell what it has earned apart from what has been propped up.
 */
export class BudgetSummary {
  constructor(
    readonly balance: Money,
    readonly fromSales: Money,
    readonly spentOnRestock: Money,
    readonly investedFromOutside: Money,
    readonly entryCount: number,
  ) {}

  static empty(): BudgetSummary {
    const zero = Money.zero();
    return new BudgetSummary(zero, zero, zero, zero, 0);
  }

  /** True when more has gone out than has come in, which the screen shows in red. */
  get isOverdrawn(): boolean {
    return this.balance.isNegative();
  }

  /**
   * What the shop has made on its own, setting aside anything the owner put in.
   *
   * Worth separating: a balance held up by investment looks the same as a balance earned,
   * and they are not the same thing at all.
   */
  get earned(): Money {
    return this.balance.subtract(this.investedFromOutside);
  }

  /** Whether a delivery of this cost can be paid for out of the shop's own money. */
  canAfford(cost: Money): boolean {
    return this.balance.greaterThanOrEqual(cost);
  }
}

/** One line of the ledger behind the balance. */
export class CashMovement {
  constructor(
    readonly id: string,
    readonly kind: CashKind,
    readonly amount: Money,
    readonly productName: string | null,
    readonly note: string | null,
    readonly at: Date,
  ) {}

  get isMoneyIn(): boolean {
    return !this.amount.isNegative();
  }

  describe(): string {
    switch (this.kind) {
      case 'sale':
        return 'Sale';
      case 'investment':
        return 'Put in from outside';
      case 'restock':
        return this.productName ? `Delivery, ${this.productName}` : 'Delivery';
    }
  }
}
