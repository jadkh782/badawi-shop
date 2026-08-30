import { Money } from '../value-objects/Money';
import type { PaymentCurrency } from './Sale';

/**
 * A sale as it appears on the till roll.
 *
 * Lighter than a full Sale: the list screen wants a row per transaction and what has since
 * happened to it, not every line of every basket. Loading the lines is a separate step taken
 * only when one is opened.
 */
export class SaleRecord {
  constructor(
    readonly id: string,
    readonly soldAt: Date,
    readonly total: Money,
    readonly profit: Money,
    readonly itemCount: number,
    readonly paymentCurrency: PaymentCurrency,
    readonly totalLbp: number,
    readonly note: string | null,
    readonly voidedAt: Date | null,
    readonly voidReason: string | null,
    readonly refunded: Money,
    readonly refundedItems: number,
    readonly refundCount: number,
  ) {}

  get isVoided(): boolean {
    return this.voidedAt !== null;
  }

  get isRefunded(): boolean {
    return this.refundCount > 0;
  }

  /** What the sale is actually worth now, once anything handed back is taken off. */
  get net(): Money {
    if (this.isVoided) return Money.zero();
    return this.total.subtract(this.refunded);
  }

  /** True once every unit has been handed back, which reads differently from a part return. */
  get isFullyRefunded(): boolean {
    return this.isRefunded && this.refunded.greaterThanOrEqual(this.total);
  }

  /**
   * Whether there is anything left to take back.
   *
   * A voided sale is finished with, and so is one already returned in full.
   */
  get canBeReturned(): boolean {
    return !this.isVoided && !this.isFullyRefunded;
  }

  /** A void erases the sale outright, so it is only offered while nothing has been returned. */
  get canBeVoided(): boolean {
    return !this.isVoided && !this.isRefunded;
  }

  describeState(): string | null {
    if (this.isVoided) return 'Voided';
    if (this.isFullyRefunded) return 'Returned in full';
    if (this.isRefunded) return `${this.refunded.format()} returned`;
    return null;
  }
}

/**
 * One line of a sale, with how much of it has already gone back.
 *
 * The remaining quantity is what the refund screen offers, and it is computed here rather
 * than trusted from the screen, so two refunds taken from two devices cannot together hand
 * back more than was ever sold.
 */
export class SoldLine {
  constructor(
    readonly id: string,
    readonly productId: string | null,
    readonly productName: string,
    readonly barcode: string | null,
    readonly categoryName: string | null,
    readonly unit: string,
    readonly quantity: number,
    readonly unitPrice: Money,
    readonly unitCost: Money,
    readonly lineTotal: Money,
    /**
     * What this line actually earned: its total less its share of the basket discount.
     *
     * This, not the shelf price, is what a return is worth. A line sold inside a 10% basket
     * discount was paid for at 10% less, and handing back the full price would be handing
     * back money the shop never took.
     */
    readonly lineNet: Money,
    readonly refundedQuantity: number,
  ) {}

  get returnable(): number {
    return Math.max(0, this.quantity - this.refundedQuantity);
  }

  /** What handing back this many units is worth. */
  refundValue(quantity: number): Money {
    if (this.quantity <= 0 || quantity <= 0) return Money.zero();
    return Money.fromCents(Math.round((this.lineNet.cents * quantity) / this.quantity));
  }

  /** True when the customer paid less than the shelf price because of a basket discount. */
  get wasDiscounted(): boolean {
    return !this.lineNet.equals(this.lineTotal);
  }

  get isFullyReturned(): boolean {
    return this.returnable <= 0;
  }
}
