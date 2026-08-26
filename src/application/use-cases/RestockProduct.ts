import { DomainError } from '@/domain';
import type { IProductWriter } from '../ports';

/** Adds delivered stock, or corrects a miscount. Returns the new level. */
export class RestockProduct {
  constructor(private readonly products: IProductWriter) {}

  async execute(
    productId: string,
    delta: number,
    reason: 'restock' | 'adjustment' = 'restock',
    note?: string,
  ): Promise<number> {
    if (!Number.isFinite(delta) || delta === 0) {
      throw new DomainError('Enter how many to add or remove');
    }
    return this.products.adjustStock(productId, delta, reason, note);
  }
}
