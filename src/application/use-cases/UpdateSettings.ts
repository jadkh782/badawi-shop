import { DomainError, ExchangeRate, type CostMethod, type ShopSettings } from '@/domain';
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

  /**
   * Switches how cost is counted.
   *
   * Moving to average rewrites every article's batches, so this is not a preference the
   * screen can toggle and forget: the repository sends it to a function that folds the
   * batches and restates the costs in the same transaction.
   */
  async setCostMethod(method: CostMethod): Promise<ShopSettings> {
    if (method !== 'average' && method !== 'batch') {
      throw new DomainError('Unknown way of counting cost');
    }
    return this.settings.updateCostMethod(method);
  }

  /**
   * The details printed on a receipt.
   *
   * Every one of them is optional: a receipt with no phone number simply has no phone line.
   * Blank is therefore stored as null rather than an empty string, so the document builder
   * has one thing to check instead of two.
   */
  async setReceiptDetails(
    phone: string,
    address: string,
    footer: string,
  ): Promise<ShopSettings> {
    const tidy = (value: string) => {
      const trimmed = value.trim();
      return trimmed.length === 0 ? null : trimmed;
    };
    return this.settings.updateReceiptDetails(tidy(phone), tidy(address), tidy(footer));
  }

  async setShopName(name: string): Promise<ShopSettings> {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new DomainError('The shop needs a name');
    }
    return this.settings.updateShopName(trimmed);
  }
}
