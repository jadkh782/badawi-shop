import { Money } from '../value-objects/Money';

export type CashKind =
  | 'sale'
  | 'restock'
  | 'opening'
  | 'investment'
  | 'correction'
  | 'void'
  | 'refund';

/**
 * What is in the cash box and how it got there.
 *
 * Takings go in, deliveries come out, and the balance is what there is to spend on the next
 * one. Money the owner puts in from their own pocket is counted separately, so the shop can
 * tell what it has earned apart from what has been propped up.
 *
 * Four of these are new and each is a way money moved that the box used to ignore: the first
 * stock of a new article, a miscount found on the shelf, a sale rung up in error, and goods
 * handed back over the counter.
 */
export class BudgetSummary {
  constructor(
    readonly balance: Money,
    readonly fromSales: Money,
    readonly spentOnRestock: Money,
    readonly spentOnOpening: Money,
    readonly investedFromOutside: Money,
    /** Signed: found stock costs money, missing stock gives it back. */
    readonly corrections: Money,
    readonly refunded: Money,
    readonly voided: Money,
    readonly entryCount: number,
  ) {}

  static empty(): BudgetSummary {
    const zero = Money.zero();
    return new BudgetSummary(zero, zero, zero, zero, zero, zero, zero, zero, 0);
  }

  /** True when more has gone out than has come in, which the screen shows in red. */
  get isOverdrawn(): boolean {
    return this.balance.isNegative();
  }

  /** Everything spent on stock, whichever door it came in through. */
  get spentOnStock(): Money {
    return this.spentOnRestock.add(this.spentOnOpening);
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

/**
 * What the shelves are holding, valued two ways.
 *
 * The balance says what there is left to spend. This says what has already been spent and is
 * still sitting there waiting to be sold, which is the other half of the same question: an
 * empty till above a full stockroom is a very different shop from an empty till above empty
 * shelves.
 */
export class InventoryValue {
  constructor(
    readonly atCost: Money,
    readonly atRetail: Money,
    readonly articleCount: number,
    readonly unitCount: number,
  ) {}

  static empty(): InventoryValue {
    return new InventoryValue(Money.zero(), Money.zero(), 0, 0);
  }

  /** What the shelves would make if every unit sold at today's price. */
  get potentialProfit(): Money {
    return this.atRetail.subtract(this.atCost);
  }

  get isEmpty(): boolean {
    return this.unitCount <= 0;
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
      case 'refund':
        return 'Refund to a customer';
      case 'void':
        return 'Sale voided';
      case 'correction':
        return this.productName
          ? `Stock correction, ${this.productName}`
          : 'Stock correction';
      case 'opening':
        return this.productName ? `First stock, ${this.productName}` : 'First stock';
      case 'restock':
        return this.productName ? `Delivery, ${this.productName}` : 'Delivery';
    }
  }
}
