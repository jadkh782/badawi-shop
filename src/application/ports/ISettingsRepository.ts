import type { ShopSettings } from '@/domain';

export interface ISettingsRepository {
  get(): Promise<ShopSettings>;
  updateExchangeRate(usdToLbp: number, rounding: number): Promise<ShopSettings>;
  updateShopName(name: string): Promise<ShopSettings>;
}
