import { Money } from '../value-objects/Money';
import { Quantity } from '../value-objects/Quantity';

/** Where a batch of stock came from. */
export type BatchSource = 'opening' | 'restock' | 'average' | 'correction';

/**
 * Units on the shelf that all cost the same.
 *
 * An article holding stock bought at two prices holds two of these. In average mode there is
 * only ever one, because each delivery folds what is left into a single blended price; in
 * batch mode they stay apart until the older one sells out.
 */
export class StockBatch {
  constructor(
    readonly id: string,
    readonly unitCost: Money,
    readonly remaining: Quantity,
    readonly received: Quantity,
    readonly source: BatchSource,
    readonly note: string | null,
    readonly receivedAt: Date,
  ) {}

  /** What this batch is worth at what it cost, which is what it adds to the stock value. */
  get value(): Money {
    return this.unitCost.multiply(this.remaining.value);
  }

  /** How the till labels it when asking which price is going over the counter. */
  describe(): string {
    switch (this.source) {
      case 'opening':
        return 'Opening stock';
      case 'average':
        return 'Averaged';
      case 'correction':
        return 'Found on the shelf';
      case 'restock':
        return 'Delivery';
    }
  }
}

/** What moved a price, as recorded in the article's history. */
export type PriceChangeSource = 'opening' | 'restock' | 'manual' | 'method';

/**
 * One line of an article's price trail.
 *
 * Both prices are kept on every row, even when only one of them moved, so a row can be read
 * on its own without walking back through the ones before it.
 */
export class PriceChange {
  constructor(
    readonly id: string,
    readonly at: Date,
    readonly source: PriceChangeSource,
    readonly quantity: number | null,
    /** What the supplier charged per unit on this delivery. Null for a hand edit. */
    readonly purchaseCost: Money | null,
    readonly oldCost: Money,
    readonly newCost: Money,
    readonly oldSalePrice: Money,
    readonly newSalePrice: Money,
    readonly note: string | null,
  ) {}

  get costMoved(): boolean {
    return !this.oldCost.equals(this.newCost);
  }

  get salePriceMoved(): boolean {
    return !this.oldSalePrice.equals(this.newSalePrice);
  }

  get costWentUp(): boolean {
    return this.newCost.greaterThan(this.oldCost);
  }

  describe(): string {
    switch (this.source) {
      case 'opening':
        return 'Added to the shop';
      case 'restock':
        return 'Delivery';
      case 'method':
        return 'Cost method changed';
      case 'manual':
        return 'Edited by hand';
    }
  }
}
