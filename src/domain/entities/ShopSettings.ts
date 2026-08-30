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

/** The handful of values the shop can tune without a redeploy. */
export class ShopSettings {
  constructor(
    readonly shopName: string,
    readonly exchangeRate: ExchangeRate,
    readonly rateUpdatedAt: Date | null,
    readonly costMethod: CostMethod = 'average',
  ) {}

  static fallback(): ShopSettings {
    return new ShopSettings('Badawi Shop', ExchangeRate.create(89000, 1000), null, 'average');
  }

  /** True when selling may have to ask which price a unit was bought at. */
  get tracksPricesSeparately(): boolean {
    return this.costMethod === 'batch';
  }
}
