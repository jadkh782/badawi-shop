import { ExchangeRate } from '../value-objects/ExchangeRate';

/**
 * How the shop decides what a thing cost.
 *
 *   average  every delivery folds the remaining stock into one blended price. One number per
 *            article, and the till never asks anything.
 *   batch    every delivery keeps its own price. The till asks which one is going over the
 *            counter, but only while an article is holding stock at more than one price.
 */
export type CostMethod = 'average' | 'batch';

/**
 * What the shop is called and how to reach it, as a customer reads it off a receipt.
 *
 * All three are optional because a shop that prints nothing never needs them, and a receipt
 * simply leaves out the lines it has no text for.
 */
export interface ShopSettingsProps {
  shopName: string;
  exchangeRate: ExchangeRate;
  rateUpdatedAt: Date | null;
  costMethod?: CostMethod;
  shopPhone?: string | null;
  shopAddress?: string | null;
  /** The line at the bottom of a receipt, such as a thank you or a returns policy. */
  receiptFooter?: string | null;
}

/**
 * The handful of values the shop can tune without a redeploy.
 *
 * Built from an object rather than positional arguments. It started positional with four,
 * and the receipt details would have made it seven: the demo layer copies this record by
 * hand in three places, and a seventh argument quietly dropped in one of them is a setting
 * that saves and then vanishes. Naming each field makes that mistake impossible to write.
 */
export class ShopSettings {
  readonly shopName: string;
  readonly exchangeRate: ExchangeRate;
  readonly rateUpdatedAt: Date | null;
  readonly costMethod: CostMethod;
  readonly shopPhone: string | null;
  readonly shopAddress: string | null;
  readonly receiptFooter: string | null;

  constructor(props: ShopSettingsProps) {
    this.shopName = props.shopName;
    this.exchangeRate = props.exchangeRate;
    this.rateUpdatedAt = props.rateUpdatedAt;
    this.costMethod = props.costMethod ?? 'average';
    this.shopPhone = props.shopPhone ?? null;
    this.shopAddress = props.shopAddress ?? null;
    this.receiptFooter = props.receiptFooter ?? null;
  }

  /**
   * A copy with some fields changed.
   *
   * The demo store and anything else holding settings in memory needs to change one field
   * and keep the rest. Spreading the current values is the whole implementation, which is
   * exactly the point: there is no list of fields to forget to copy.
   */
  with(changes: Partial<ShopSettingsProps>): ShopSettings {
    return new ShopSettings({
      shopName: this.shopName,
      exchangeRate: this.exchangeRate,
      rateUpdatedAt: this.rateUpdatedAt,
      costMethod: this.costMethod,
      shopPhone: this.shopPhone,
      shopAddress: this.shopAddress,
      receiptFooter: this.receiptFooter,
      ...changes,
    });
  }

  static fallback(): ShopSettings {
    return new ShopSettings({
      shopName: 'Badawi Shop',
      exchangeRate: ExchangeRate.create(89000, 1000),
      rateUpdatedAt: null,
      costMethod: 'average',
    });
  }

  /** True when selling may have to ask which price a unit was bought at. */
  get tracksPricesSeparately(): boolean {
    return this.costMethod === 'batch';
  }
}
