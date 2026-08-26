import { DomainError, ExchangeRate, type ShopSettings } from '@/domain';
import type { ISettingsRepository } from '../ports';

/** Changes the rate every LBP figure in the app is derived from. */
export class UpdateSettings {
  constructor(private readonly settings: ISettingsRepository) {}

  async setExchangeRate(rateInput: string, roundingInput: string): Promise<ShopSettings> {
    const rate = Number(rateInput.replace(/[,\s]/g, ''));
    const rounding = Number(roundingInput.replace(/[,\s]/g, '')) || 1000;
    // Constructing the value object is the validation: an unusable rate never reaches the
    // repository.
    ExchangeRate.create(rate, rounding);
    return this.settings.updateExchangeRate(rate, rounding);
  }

  async setShopName(name: string): Promise<ShopSettings> {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new DomainError('The shop needs a name');
    }
    return this.settings.updateShopName(trimmed);
  }
}
