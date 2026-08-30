import { Money } from '../value-objects/Money';
import { Quantity } from '../value-objects/Quantity';
import type { Product } from './Product';
import type { StockBatch } from './StockBatch';

/**
 * One row of the cart. Immutable: changing a quantity produces a new line, which keeps React
 * state updates honest and makes the cart trivially comparable.
 *
 * A line may name the batch its units are coming off. That only happens when the shop is
 * keeping delivery prices apart and the article is holding stock bought at more than one of
 * them, in which case the same article can legitimately appear twice in one basket: the same
 * price to the customer, a different cost to the shop.
 */
export class CartLine {
  constructor(
    readonly product: Product,
    readonly quantity: Quantity,
    readonly batch: StockBatch | null = null,
  ) {}

  /**
   * What identifies this row.
   *
   * The product id alone is not enough once a basket can hold the same article at two costs,
   * so every cart operation addresses a line by this rather than by the product.
   */
  get key(): string {
    return `${this.product.id}|${this.batch?.id ?? ''}`;
  }

  get unitPrice(): Money {
    return this.product.salePrice;
  }

  /** What one unit of this line cost: the batch's price when there is one, else the article's. */
  get unitCost(): Money {
    return this.batch?.unitCost ?? this.product.costPrice;
  }

  get lineTotal(): Money {
    return this.product.salePrice.multiply(this.quantity.value);
  }

  get lineCost(): Money {
    return this.unitCost.multiply(this.quantity.value);
  }

  get lineProfit(): Money {
    return this.lineTotal.subtract(this.lineCost);
  }

  /** How many units this line may draw on: the batch's remainder, or the whole shelf. */
  get available(): number {
    return this.batch ? this.batch.remaining.value : this.product.stock.value;
  }

  /**
   * True when the cart is asking for more than is there. The UI flags these amber; the
   * checkout function in Postgres is what actually refuses them.
   */
  get exceedsStock(): boolean {
    return this.quantity.value > this.available;
  }

  withQuantity(quantity: Quantity): CartLine {
    return new CartLine(this.product, quantity, this.batch);
  }

  plus(quantity: Quantity): CartLine {
    return new CartLine(this.product, this.quantity.add(quantity), this.batch);
  }
}
