import { DomainError, Money } from '@/domain';
import type { IProductWriter, RestockFunding } from '../ports';

export interface RestockInput {
  productId: string;
  /** Positive for a delivery. A correction sets the count instead and never costs anything. */
  delta: number;
  reason: 'restock' | 'adjustment';
  /** What was actually paid. Blank falls back to the article's own cost price. */
  cost?: string;
  funding?: RestockFunding;
  note?: string;
}

/** Adds delivered stock, or corrects a miscount. Returns the new level. */
export class RestockProduct {
  constructor(private readonly products: IProductWriter) {}

  async execute(input: RestockInput): Promise<number> {
    if (!Number.isFinite(input.delta) || input.delta === 0) {
      throw new DomainError('Enter how many to add or remove');
    }

    const isDelivery = input.reason === 'restock' && input.delta > 0;
    const typed = input.cost?.trim();
    // A correction moves the count without money changing hands, so any figure typed into the
    // cost box is ignored rather than quietly charged to the shop.
    const costCents = isDelivery && typed ? Money.fromInput(typed).cents : undefined;

    if (costCents !== undefined && costCents < 0) {
      throw new DomainError('A delivery cannot cost less than nothing');
    }

    return this.products.adjustStock(input.productId, {
      delta: input.delta,
      reason: input.reason,
      note: input.note,
      costCents,
      funding: isDelivery ? (input.funding ?? 'budget') : undefined,
    });
  }
}
