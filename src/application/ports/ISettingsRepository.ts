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
  /**
   * The shop's own details, as they appear on a printed receipt.
   *
   * One method for the three of them rather than three methods, because they are edited
   * together on one screen behind one save button, and nothing in the shop ever wants to
   * change the phone number without looking at the address.
   */
  updateReceiptDetails(
    phone: string | null,
    address: string | null,
    footer: string | null,
  ): Promise<ShopSettings>;
}
