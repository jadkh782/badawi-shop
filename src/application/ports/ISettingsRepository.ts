import type { CostMethod, ShopSettings } from '@/domain';

export interface ISettingsRepository {
  get(): Promise<ShopSettings>;
  updateExchangeRate(usdToLbp: number, rounding: number): Promise<ShopSettings>;
  updateShopName(name: string): Promise<ShopSettings>;
  /**
   * Switches how cost is counted.
   *
   * Not a plain column write: moving to average has to fold every article's open batches
   * into one, so it goes through a function that does both in the same transaction.
   */
  updateCostMethod(method: CostMethod): Promise<ShopSettings>;
}
