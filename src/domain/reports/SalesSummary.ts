import { Money } from '../value-objects/Money';

/** Headline numbers for a period, as computed by the report_summary function in Postgres. */
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
  ) {}

  static empty(): SalesSummary {
    const zero = Money.zero();
    return new SalesSummary(zero, zero, zero, zero, 0, 0, zero, zero);
  }

  get averageBasket(): Money {
    if (this.transactionCount === 0) return Money.zero();
    return Money.fromCents(Math.round(this.totalSales.cents / this.transactionCount));
  }

  get profitMarginPercent(): number | null {
    if (this.totalSales.isZero()) return null;
    return (this.totalProfit.cents / this.totalSales.cents) * 100;
  }
}
