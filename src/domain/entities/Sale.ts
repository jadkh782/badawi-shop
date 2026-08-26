import type { DiscountType } from '../discounts/IDiscountStrategy';
import { Money } from '../value-objects/Money';
import { Quantity } from '../value-objects/Quantity';

export type PaymentCurrency = 'USD' | 'LBP';

/**
 * One line of a completed sale.
 *
 * Name, barcode, price and cost are copied onto the row at the moment of sale rather than
 * being read back through the product. That is what keeps last month's profit figure correct
 * after a price change, and what stops a deleted product blanking out its own history.
 */
export class SaleItem {
  constructor(
    readonly id: string,
    readonly productId: string | null,
    readonly productName: string,
    readonly barcode: string | null,
    readonly categoryName: string | null,
    readonly unit: string,
    readonly unitPrice: Money,
    readonly unitCost: Money,
    readonly quantity: Quantity,
    readonly lineTotal: Money,
    readonly lineCost: Money,
    readonly lineProfit: Money,
  ) {}
}

/** A completed transaction, as read back from the database. */
export class Sale {
  constructor(
    readonly id: string,
    readonly soldAt: Date,
    readonly subtotal: Money,
    readonly discountType: DiscountType,
    readonly discountValue: number,
    readonly discountAmount: Money,
    readonly total: Money,
    readonly totalCost: Money,
    readonly profit: Money,
    readonly paymentCurrency: PaymentCurrency,
    readonly usdToLbpRate: number,
    readonly totalLbp: number,
    readonly itemCount: number,
    readonly note: string | null,
    readonly items: readonly SaleItem[] = [],
  ) {}

  get profitMarginPercent(): number | null {
    if (this.total.isZero()) return null;
    return (this.profit.cents / this.total.cents) * 100;
  }
}
