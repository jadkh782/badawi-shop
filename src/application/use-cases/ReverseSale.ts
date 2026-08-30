import { DateRange, DomainError, type SaleRecord, type SoldLine } from '@/domain';
import type { ISaleRepository, RefundLine, RefundResult, VoidResult } from '../ports';

/**
 * Taking a sale back, and finding the one to take back.
 *
 * The two ways out are deliberately different. A void says the sale should never have
 * happened and erases it wherever it appears; a refund says it did happen and some of it is
 * coming back today, which is a dated event of its own. Which one is right is a question
 * about what actually occurred in the shop, so the screen asks it rather than guessing.
 */
export class ReverseSale {
  constructor(private readonly sales: ISaleRepository) {}

  /** The till roll. Defaults to the last week, which is where a mistake gets noticed. */
  async recent(range: DateRange | null = DateRange.lastDays(7), limit = 50): Promise<SaleRecord[]> {
    return this.sales.list(range, limit);
  }

  async lines(saleId: string): Promise<SoldLine[]> {
    return this.sales.lines(saleId);
  }

  async voidSale(saleId: string, reason?: string): Promise<VoidResult> {
    return this.sales.void(saleId, reason?.trim() || null);
  }

  /**
   * Hands part of a sale back.
   *
   * Quantities are checked here for shape and against the shop's own screen, and again in
   * the database against what has already been returned. The second check is the one that
   * counts: it is the only one two devices cannot get past at the same time.
   */
  async refund(
    saleId: string,
    lines: ReadonlyArray<RefundLine>,
    reason?: string,
  ): Promise<RefundResult> {
    const wanted = lines.filter((line) => line.quantity > 0);

    if (wanted.length === 0) {
      throw new DomainError('Choose what is coming back');
    }
    if (wanted.some((line) => !Number.isFinite(line.quantity))) {
      throw new DomainError('A returned quantity must be a number');
    }

    return this.sales.refund(saleId, wanted, reason?.trim() || null);
  }
}
