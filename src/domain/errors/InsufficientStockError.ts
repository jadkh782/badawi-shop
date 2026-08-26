import { DomainError } from './DomainError';

/**
 * Raised when the shelf cannot cover what is being sold.
 *
 * The database raises this too, and its message already names the article, the unit and both
 * amounts. `fromMessage` keeps that wording intact rather than rebuilding a vaguer one.
 */
export class InsufficientStockError extends DomainError {
  constructor(
    readonly productName: string,
    readonly requested: number,
    readonly available: number,
    message?: string,
  ) {
    super(message ?? `Only ${available} of "${productName}" left in stock, ${requested} requested`);
  }

  static fromMessage(message: string): InsufficientStockError {
    return new InsufficientStockError('', 0, 0, message);
  }
}
