import { NoDiscount } from '../discounts/NoDiscount';
import type { IDiscountStrategy } from '../discounts/IDiscountStrategy';
import { Money } from '../value-objects/Money';
import { Quantity } from '../value-objects/Quantity';
import { CartLine } from './CartLine';
import type { Product } from './Product';
import type { StockBatch } from './StockBatch';

/**
 * The basket being built in Sell mode.
 *
 * Its single responsibility is arithmetic over lines: add, merge, remove, total. It has no
 * idea what a database is, so all of its behaviour is testable without any test doubles.
 * Every mutating call returns a new Cart.
 */
export class Cart {
  private constructor(
    readonly lines: readonly CartLine[],
    readonly discount: IDiscountStrategy,
  ) {}

  static empty(): Cart {
    return new Cart([], new NoDiscount());
  }

  static fromLines(lines: readonly CartLine[], discount: IDiscountStrategy = new NoDiscount()): Cart {
    return new Cart(lines, discount);
  }

  get isEmpty(): boolean {
    return this.lines.length === 0;
  }

  /** Distinct articles in the basket. */
  get lineCount(): number {
    return this.lines.length;
  }

  /** Total units across all lines, which is what the header counter shows. */
  get itemCount(): number {
    return this.lines.reduce((sum, line) => sum + line.quantity.value, 0);
  }

  get subtotal(): Money {
    return Money.sum(this.lines.map((line) => line.lineTotal));
  }

  get totalCost(): Money {
    return Money.sum(this.lines.map((line) => line.lineCost));
  }

  get discountAmount(): Money {
    return this.discount.computeDiscount(this.subtotal);
  }

  get total(): Money {
    return this.subtotal.subtract(this.discountAmount).clampToZero();
  }

  /** Profit after the discount is absorbed, which is the figure reporting cares about. */
  get profit(): Money {
    return this.total.subtract(this.totalCost);
  }

  /** Lines asking for more than is in stock, used to warn before confirming. */
  get overstockedLines(): readonly CartLine[] {
    return this.lines.filter((line) => line.exceedsStock);
  }

  /**
   * Lines are addressed by key rather than by product.
   *
   * The same article bought at two prices is two rows, and "remove the cola" would otherwise
   * be an ambiguous instruction that quietly removed the wrong one.
   */
  findLine(key: string): CartLine | undefined {
    return this.lines.find((line) => line.key === key);
  }

  /** Scanning the same item twice bumps its quantity rather than adding a second row. */
  add(product: Product, quantity: Quantity = Quantity.one(), batch: StockBatch | null = null): Cart {
    const incoming = new CartLine(product, quantity, batch);
    const existing = this.findLine(incoming.key);
    const lines = existing
      ? this.lines.map((line) => (line.key === incoming.key ? line.plus(quantity) : line))
      : [...this.lines, incoming];
    return new Cart(lines, this.discount);
  }

  /** Setting a quantity to zero or below removes the line entirely. */
  setQuantity(key: string, quantity: Quantity): Cart {
    if (!quantity.isPositive()) return this.remove(key);
    return new Cart(
      this.lines.map((line) => (line.key === key ? line.withQuantity(quantity) : line)),
      this.discount,
    );
  }

  increment(key: string): Cart {
    const line = this.findLine(key);
    if (!line) return this;
    return this.setQuantity(key, line.quantity.add(Quantity.one()));
  }

  decrement(key: string): Cart {
    const line = this.findLine(key);
    if (!line) return this;
    return this.setQuantity(key, line.quantity.subtract(Quantity.one()));
  }

  remove(key: string): Cart {
    return new Cart(
      this.lines.filter((line) => line.key !== key),
      this.discount,
    );
  }

  /** How many units of an article the basket already holds, across every batch of it. */
  quantityOf(productId: string): number {
    return this.lines
      .filter((line) => line.product.id === productId)
      .reduce((n, line) => n + line.quantity.value, 0);
  }

  withDiscount(discount: IDiscountStrategy): Cart {
    return new Cart(this.lines, discount);
  }

  clear(): Cart {
    return Cart.empty();
  }
}
