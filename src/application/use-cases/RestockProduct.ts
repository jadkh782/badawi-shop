import { DomainError, Money, type Product } from '@/domain';
import type { IProductWriter, RestockFunding, StockChangeResult } from '../ports';

export interface RestockInput {
  productId: string;
  /** Positive for a delivery. A correction sets the count instead. */
  delta: number;
  reason: 'restock' | 'adjustment';
  /** What one unit cost this time. Blank keeps the article's current cost price. */
  unitCost?: string;
  /** A new shelf price to go with a new cost. Blank leaves the price alone. */
  newSalePrice?: string;
  funding?: RestockFunding;
  note?: string;
}

/**
 * Adds delivered stock, or corrects a miscount.
 *
 * The interesting arithmetic is not here. What a delivery costs in total, what the blended
 * cost becomes and which way a correction moves the money are all worked out in the database,
 * in the same transaction as the stock change, because a figure computed on a phone and then
 * posted is a figure that can be wrong or stale by the time it lands.
 *
 * What does live here is what the shop typed, turned into cents and checked.
 */
export class RestockProduct {
  constructor(private readonly products: IProductWriter) {}

  /**
   * The shelf price that holds the current margin at a new cost.
   *
   * Offered rather than applied. A price on the shelf is a decision about customers, and
   * moving it because a supplier moved theirs is a decision the shop makes, not the app.
   */
  static priceHoldingMargin(product: Product, newCost: Money): Money {
    if (product.salePrice.isZero() || product.costPrice.isZero()) {
      return product.salePrice;
    }
    const ratio = product.salePrice.cents / product.costPrice.cents;
    return Money.fromCents(Math.round(newCost.cents * ratio));
  }

  async execute(input: RestockInput): Promise<StockChangeResult> {
    if (!Number.isFinite(input.delta) || input.delta === 0) {
      throw new DomainError('Enter how many to add or remove');
    }

    const typedCost = input.unitCost?.trim();
    const typedPrice = input.newSalePrice?.trim();

    const unitCostCents = typedCost ? Money.fromInput(typedCost).cents : undefined;
    const newSalePriceCents = typedPrice ? Money.fromInput(typedPrice).cents : undefined;

    if (unitCostCents !== undefined && unitCostCents < 0) {
      throw new DomainError('A price cannot be less than nothing');
    }
    if (newSalePriceCents !== undefined && newSalePriceCents < 0) {
      throw new DomainError('A price cannot be less than nothing');
    }

    const isDelivery = input.reason === 'restock' && input.delta > 0;

    return this.products.adjustStock(input.productId, {
      delta: input.delta,
      reason: input.reason,
      note: input.note,
      unitCostCents,
      // A correction is not a purchase, so a new shelf price has no business riding along
      // with one; that is an edit, and the article form is where edits belong.
      newSalePriceCents: isDelivery ? newSalePriceCents : undefined,
      funding: isDelivery ? (input.funding ?? 'budget') : undefined,
    });
  }
}
