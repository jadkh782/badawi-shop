import { Money } from '../value-objects/Money';
import { Quantity } from '../value-objects/Quantity';
import type { Product } from './Product';

/**
 * One row of the cart. Immutable: changing a quantity produces a new line, which keeps React
 * state updates honest and makes the cart trivially comparable.
 */
export class CartLine {
  constructor(
    readonly product: Product,
    readonly quantity: Quantity,
  ) {}

  get unitPrice(): Money {
    return this.product.salePrice;
  }

  get lineTotal(): Money {
    return this.product.salePrice.multiply(this.quantity.value);
  }

  get lineCost(): Money {
    return this.product.costPrice.multiply(this.quantity.value);
  }

  get lineProfit(): Money {
    return this.lineTotal.subtract(this.lineCost);
  }

  /**
   * True when the cart is asking for more than the shelf holds. The UI flags these amber;
   * the checkout function in Postgres is what actually refuses them.
   */
  get exceedsStock(): boolean {
    return !this.product.canFulfil(this.quantity);
  }

  withQuantity(quantity: Quantity): CartLine {
    return new CartLine(this.product, quantity);
  }

  plus(quantity: Quantity): CartLine {
    return new CartLine(this.product, this.quantity.add(quantity));
  }
}
