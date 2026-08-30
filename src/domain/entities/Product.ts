import { Barcode } from '../value-objects/Barcode';
import { Money } from '../value-objects/Money';
import { Quantity } from '../value-objects/Quantity';

export interface ProductProps {
  id: string;
  barcode: Barcode | null;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  costPrice: Money;
  /**
   * What the last delivery was actually charged, as opposed to what the stock on hand
   * averages out to. Null until an article has been through a priced delivery.
   */
  lastCostPrice?: Money | null;
  salePrice: Money;
  stock: Quantity;
  lowStockThreshold: Quantity;
  unit: string;
  notes: string | null;
  isActive: boolean;
  /** The parts the name was assembled from, on shelves that come in sizes. */
  variantSize?: string | null;
  variantTrait?: string | null;
  variantBase?: string | null;
}

/**
 * An article the shop sells.
 *
 * Knows how to answer questions about itself (margin, is it running low, can it cover this
 * quantity) but never talks to the database. Persistence lives behind the repository ports.
 */
export class Product {
  readonly id: string;
  readonly barcode: Barcode | null;
  readonly name: string;
  readonly categoryId: string | null;
  readonly categoryName: string | null;
  readonly costPrice: Money;
  readonly lastCostPrice: Money | null;
  readonly salePrice: Money;
  readonly stock: Quantity;
  readonly lowStockThreshold: Quantity;
  readonly unit: string;
  readonly notes: string | null;
  readonly isActive: boolean;
  readonly variantSize: string | null;
  readonly variantTrait: string | null;
  readonly variantBase: string | null;

  constructor(props: ProductProps) {
    this.id = props.id;
    this.barcode = props.barcode;
    this.name = props.name;
    this.categoryId = props.categoryId;
    this.categoryName = props.categoryName;
    this.costPrice = props.costPrice;
    this.lastCostPrice = props.lastCostPrice ?? null;
    this.salePrice = props.salePrice;
    this.stock = props.stock;
    this.lowStockThreshold = props.lowStockThreshold;
    this.unit = props.unit;
    this.notes = props.notes;
    this.isActive = props.isActive;
    this.variantSize = props.variantSize ?? null;
    this.variantTrait = props.variantTrait ?? null;
    this.variantBase = props.variantBase ?? null;
  }

  /**
   * The filed name, assembled from the parts in the order the shop asks for them.
   *
   * Brand, then taste, then weight: "Al Fakher Double Apple 250g". Everything that reads one
   * name — the till roll, the reports, the search box — reads this, so the three parts only
   * have to be kept straight in the one place that builds it.
   */
  static assembleName(base: string, trait?: string | null, size?: string | null): string {
    return [base.trim(), trait?.trim(), size?.trim()].filter(Boolean).join(' ');
  }

  /**
   * The brand on its own, which is what the form edits and what the till groups by.
   *
   * Stored rather than chopped off the front of the name. Recovering it by removing the other
   * parts worked until a name was edited by hand, and then the article silently stopped
   * grouping with the rest of its brand.
   */
  get brandName(): string {
    return this.variantBase ?? this.name;
  }

  /** True when this article is one of a family rather than a thing on its own. */
  get hasVariantParts(): boolean {
    return this.variantBase !== null && (this.variantTrait !== null || this.variantSize !== null);
  }

  /** Profit on a single unit at the current prices. */
  get unitProfit(): Money {
    return this.salePrice.subtract(this.costPrice);
  }

  /** Margin as a percentage of the sale price, or null when the item is given away free. */
  get marginPercent(): number | null {
    if (this.salePrice.isZero()) return null;
    return (this.unitProfit.cents / this.salePrice.cents) * 100;
  }

  /**
   * True when the stock on hand was bought at more than one price.
   *
   * Only knowable by asking for the batches, so this is the cheap hint: an average that has
   * drifted from the last price paid means the shelf is a blend of at least two deliveries.
   */
  get hasMixedCost(): boolean {
    return this.lastCostPrice !== null && !this.lastCostPrice.equals(this.costPrice);
  }

  get isOutOfStock(): boolean {
    return !this.stock.isPositive();
  }

  get isLowStock(): boolean {
    return this.stock.lessThanOrEqual(this.lowStockThreshold) && !this.isOutOfStock;
  }

  /** True when the item is priced below what it cost, which is usually a data-entry slip. */
  get isSoldAtLoss(): boolean {
    return this.unitProfit.isNegative();
  }

  canFulfil(quantity: Quantity): boolean {
    return quantity.lessThanOrEqual(this.stock);
  }
}
