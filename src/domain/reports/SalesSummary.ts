import { Money } from '../value-objects/Money';

/**
 * Headline numbers for a period, as computed by the report_summary function in Postgres.
 *
 * The totals are already net of anything handed back, and what was handed back is carried
 * alongside them: "we took $400" and "we took $520 and gave $120 back" are the same balance
 * and a very different day, and the shop should be able to tell which one it had.
 */
export class SalesSummary {
  constructor(
    readonly totalSales: Money,
    readonly totalCost: Money,
    readonly totalProfit: Money,
    readonly totalDiscount: Money,
    readonly transactionCount: number,
    readonly itemsSold: number,
    readonly salesPaidInUsd: Money,
    readonly salesPaidInLbp: Money,
    readonly refunded: Money = Money.zero(),
    readonly refundCount: number = 0,
    readonly voided: Money = Money.zero(),
    readonly voidedCount: number = 0,
  ) {}

  static empty(): SalesSummary {
    const zero = Money.zero();
    return new SalesSummary(zero, zero, zero, zero, 0, 0, zero, zero, zero, 0, zero, 0);
  }

  /** What was rung up before anything came back, which is what the till saw on the day. */
  get grossSales(): Money {
    return this.totalSales.add(this.refunded);
  }

  get averageBasket(): Money {
    if (this.transactionCount === 0) return Money.zero();
    return Money.fromCents(Math.round(this.totalSales.cents / this.transactionCount));
  }

  get profitMarginPercent(): number | null {
    if (this.totalSales.isZero()) return null;
    return (this.totalProfit.cents / this.totalSales.cents) * 100;
  }

  get hasReturns(): boolean {
    return this.refundCount > 0 || this.voidedCount > 0;
  }
}
