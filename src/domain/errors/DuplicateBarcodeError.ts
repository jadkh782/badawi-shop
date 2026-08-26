import { DomainError } from './DomainError';

export class DuplicateBarcodeError extends DomainError {
  constructor(readonly barcode: string) {
    super(`Barcode ${barcode} is already used by another product`);
  }
}
