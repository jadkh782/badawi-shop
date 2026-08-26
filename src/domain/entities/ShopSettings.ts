import { ExchangeRate } from '../value-objects/ExchangeRate';

/** The handful of values the shop can tune without a redeploy. */
export class ShopSettings {
  constructor(
    readonly shopName: string,
    readonly exchangeRate: ExchangeRate,
    readonly rateUpdatedAt: Date | null,
  ) {}

  static fallback(): ShopSettings {
    return new ShopSettings('Badawi Shop', ExchangeRate.create(89000, 1000), null);
  }
}
