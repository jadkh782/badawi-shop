import { DomainError } from '@/domain';
import type { IShopReset, ResetCounts } from '../ports';

/**
 * Empties the shop.
 *
 * The word has to be typed in full. The database checks it too, so this is a courtesy to
 * whoever is holding the phone rather than the thing standing between them and an empty
 * database.
 */
export class ResetShop {
  static readonly WORD = 'RESET';

  constructor(private readonly reset: IShopReset) {}

  async execute(confirmation: string): Promise<ResetCounts> {
    if (confirmation.trim().toUpperCase() !== ResetShop.WORD) {
      throw new DomainError(`Type ${ResetShop.WORD} to confirm`);
    }
    return this.reset.reset(ResetShop.WORD);
  }
}
