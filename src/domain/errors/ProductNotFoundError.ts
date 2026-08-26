import { DomainError } from './DomainError';

export class ProductNotFoundError extends DomainError {
  constructor(readonly barcode: string) {
    super(`No product with barcode ${barcode}`);
  }
}
