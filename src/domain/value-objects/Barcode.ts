import { DomainError } from '../errors/DomainError';

/**
 * A scanned or typed barcode. Normalised so that a code typed by hand and the same code read
 * by the camera compare as equal.
 */
export class Barcode {
  private constructor(readonly value: string) {}

  static create(raw: string): Barcode {
    const normalised = raw.trim().replace(/\s+/g, '');
    if (normalised.length === 0) {
      throw new DomainError('Barcode cannot be empty');
    }
    if (normalised.length > 64) {
      throw new DomainError('Barcode is too long to be genuine');
    }
    return new Barcode(normalised);
  }

  /** Returns null instead of throwing, for optional input such as a loose-goods product. */
  static tryCreate(raw: string | null | undefined): Barcode | null {
    if (raw === null || raw === undefined || raw.trim() === '') return null;
    try {
      return Barcode.create(raw);
    } catch {
      return null;
    }
  }

  equals(other: Barcode): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
